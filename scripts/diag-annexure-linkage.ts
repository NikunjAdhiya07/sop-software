/** READ-ONLY: for the pasted list of 110 QA identifiers, check which SOP docs
 *  actually have annexure files linked (sopDocuments[].documentKind==="annexure").
 *  Normalizes zero-padding (QAGE02-8 vs QAGE02-08) and reports match status
 *  separately from annexure-presence so we don't conflate "no SOP found" with
 *  "SOP found but no annexure". Writes nothing.
 *  Run: npx tsx scripts/diag-annexure-linkage.ts */
import fs from "fs";
import mongoose from "mongoose";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const IDENTIFIERS = `QAGE01-11 QAGE02-8 QAGE03-7 QAGE04-12 QAGE06-13 QAGE08-10 QAGE09-11 QAGE10-5
QAGE100-3 QAGE101-6 QAGE102-3 QAGE103-4 QAGE104-9 QAGE105-6 QAGE106-3 QAGE107-2 QAGE108-3
QAGE109-2 QAGE11-5 QAGE110-7 QAGE111-2 QAGE112-3 QAGE113-2 QAGE114-2 QAGE115-3 QAGE116-2
QAGE117-5 QAGE118-2 QAGE119-3 QAGE12-9 QAGE120-2 QAGE121-2 QAGE122-2 QAGE123-2 QAGE124-3
QAGE125-2 QAGE127-3 QAGE128-1 QAGE129-1 QAGE13-5 QAGE130-1 QAGE131-1 QAGE132-1 QAGE133-1
QAGE134-2 QAGE135-0 QAGE136-0 QAGE14-5 QAGE15-11 QAGE16-5 QAGE17-8 QAGE18-5 QAGE19-5
QAGE20-5 QAGE21-5 QAGE22-5 QAGE24-6 QAGE26-6 QAGE28-10 QAGE30-5 QAGE34-5 QAGE35-5 QAGE37-5
QAGE38-5 QAGE40-4 QAGE42-7 QAGE43-7 QAGE46-5 QAGE47-5 QAGE48-5 QAGE49-5 QAGE50-5 QAGE51-7
QAGE52-5 QAGE53-5 QAGE54-6 QAGE55-5 QAGE56-5 QAGE58-9 QAGE60-6 QAGE62-10 QAGE63-5 QAGE64-5
QAGE65-6 QAGE66-5 QAGE67-5 QAGE68-8 QAGE69-5 QAGE70-5 QAGE72-6 QAGE74-3 QAGE75-13 QAGE77-5
QAGE78-5 QAGE79-5 QAGE80-9 QAGE81-5 QAGE82-6 QAGE83-5 QAGE84-5 QAGE85-5 QAGE86-5 QAGE87-5
QAGE88-7 QAGE90-7 QAGE91-3 QAGE94-4 QAGE96-4 QAGE97-4 QAGE98-4`.split(/\s+/).filter(Boolean);

// Build a loose regex per identifier: letters+first-number exact, dash, then the
// version number matched with OPTIONAL leading zero (so "8" matches "08" and "08"
// matches "8"), anchored.
function looseIdRegex(id: string): RegExp {
  const m = id.match(/^([A-Za-z]+\d+)-(\d+)$/);
  if (!m) return new RegExp(`^${id}$`, "i");
  const [, prefix, ver] = m;
  return new RegExp(`^${prefix}-0*${ver}$`, "i");
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI!);
  const sopCol = mongoose.connection.collection("sops");

  let noMatch = 0, withAnnex = 0, withoutAnnex = 0;
  const noMatchList: string[] = [];
  const withAnnexList: string[] = [];
  const withoutAnnexList: string[] = [];

  for (const id of IDENTIFIERS) {
    const re = looseIdRegex(id);
    const docs = await sopCol
      .find({ identifier: re })
      .project({ identifier: 1, sopDocuments: 1 })
      .toArray();
    if (docs.length === 0) {
      noMatch++;
      noMatchList.push(id);
      continue;
    }
    const annexDocs = docs.flatMap((d: any) =>
      (d.sopDocuments ?? []).filter((sd: any) => sd.documentKind === "annexure"),
    );
    if (annexDocs.length > 0) {
      withAnnex++;
      withAnnexList.push(`${id} (matched: ${[...new Set(docs.map((d:any)=>d.identifier))].join(",")}) → ${annexDocs.length} annexure file(s)`);
    } else {
      withoutAnnex++;
      withoutAnnexList.push(`${id} (matched: ${[...new Set(docs.map((d:any)=>d.identifier))].join(",")})`);
    }
  }

  console.log(`Checked ${IDENTIFIERS.length} identifiers (loose zero-padding match).`);
  console.log(`No SOP found at all: ${noMatch}`);
  console.log(`SOP found, WITH annexure file(s): ${withAnnex}`);
  console.log(`SOP found, WITHOUT annexure file(s): ${withoutAnnex}`);

  if (noMatchList.length) console.log(`\n=== NO MATCH ===\n  ` + noMatchList.join("\n  "));
  if (withoutAnnexList.length) console.log(`\n=== SOP found, NO annexure ===\n  ` + withoutAnnexList.join("\n  "));
  if (withAnnexList.length) console.log(`\n=== SOP found, WITH annexure ===\n  ` + withAnnexList.join("\n  "));

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

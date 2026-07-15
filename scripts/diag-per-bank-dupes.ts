/** READ-ONLY: for the 73 confirmed-annexure SOP identifiers, count how many
 *  WITHIN-BANK near-duplicate pairs exist per SOP (English banks only) — i.e.
 *  duplicates that would actually free room in THAT SOP's own bank, as opposed
 *  to cross-SOP similarity which doesn't help free room for that SOP.
 *  Writes nothing. Run: npx tsx scripts/diag-per-bank-dupes.ts */
import fs from "fs";
import mongoose from "mongoose";
import { SIMILARITY_THRESHOLD, normalizeQuestionText } from "../lib/similarity";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const CONFIRMED_73 = `QAGE01-11 QAGE02-8 QAGE03-7 QAGE04-12 QAGE06-13 QAGE08-10 QAGE09-11 QAGE10-5
QAGE100-3 QAGE101-6 QAGE103-4 QAGE104-9 QAGE105-6 QAGE106-3 QAGE107-2 QAGE108-3
QAGE109-2 QAGE11-5 QAGE110-7 QAGE111-2 QAGE112-3 QAGE113-2 QAGE114-2 QAGE115-3 QAGE116-2
QAGE117-5 QAGE118-2 QAGE119-3 QAGE120-2 QAGE121-2 QAGE122-2 QAGE123-2 QAGE124-3
QAGE127-3 QAGE130-1 QAGE131-1 QAGE132-1 QAGE15-11 QAGE17-8 QAGE18-5 QAGE20-5 QAGE21-5
QAGE24-6 QAGE26-6 QAGE28-10 QAGE40-4 QAGE42-7 QAGE47-5 QAGE48-5 QAGE49-5 QAGE51-7
QAGE54-6 QAGE58-9 QAGE60-6 QAGE62-10 QAGE64-5 QAGE65-6 QAGE66-5 QAGE67-5 QAGE68-8
QAGE69-5 QAGE72-6 QAGE74-3 QAGE75-13 QAGE77-5 QAGE80-9 QAGE81-5 QAGE82-6 QAGE83-5
QAGE84-5 QAGE85-5 QAGE88-7 QAGE90-7`.split(/\s+/).filter(Boolean);

function looseIdRegex(id: string): RegExp {
  const m = id.match(/^([A-Za-z]+\d+)-(\d+)$/);
  if (!m) return new RegExp(`^${id}$`, "i");
  const [, prefix, ver] = m;
  return new RegExp(`^${prefix}-0*${ver}$`, "i");
}

function tokenize(q: string): Set<string> {
  return new Set(normalizeQuestionText(q).split(/\s+/).filter((w) => w.length > 2));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (big.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI!);
  const bankCol = mongoose.connection.collection("mcqbanks");

  const results: { id: string; bankId: string; total: number; dupePairs: number; dupeQuestionsInvolved: number }[] = [];

  for (const id of CONFIRMED_73) {
    const re = looseIdRegex(id);
    const banks = await bankCol
      .find({ sopIdentifier: re, language: "English", isObsolete: { $ne: true } })
      .project({ sopIdentifier: 1, mcqs: 1 })
      .toArray();
    for (const b of banks as any[]) {
      const qs = (b.mcqs ?? [])
        .filter((m: any) => m && typeof m.question === "string")
        .map((m: any) => ({ q: m.question, tokens: tokenize(m.question) }));
      let pairs = 0;
      const involved = new Set<number>();
      for (let i = 0; i < qs.length; i++) {
        for (let j = i + 1; j < qs.length; j++) {
          if (jaccard(qs[i].tokens, qs[j].tokens) >= SIMILARITY_THRESHOLD) {
            pairs++; involved.add(i); involved.add(j);
          }
        }
      }
      results.push({ id, bankId: String(b._id), total: qs.length, dupePairs: pairs, dupeQuestionsInvolved: involved.size });
    }
  }

  const zero = results.filter((r) => r.dupePairs === 0).length;
  const under10 = results.filter((r) => r.dupePairs > 0 && r.dupeQuestionsInvolved < 10).length;
  const ge10 = results.filter((r) => r.dupeQuestionsInvolved >= 10).length;

  console.log(`Banks scanned: ${results.length}`);
  console.log(`  0 internal near-dupes:        ${zero}`);
  console.log(`  >0 but <10 questions involved: ${under10}`);
  console.log(`  >=10 questions involved:       ${ge10}`);

  console.log(`\n=== Per-bank detail ===`);
  for (const r of results) {
    console.log(`${r.id.padEnd(12)} q=${r.total}  dupe-pairs=${r.dupePairs}  distinct-Qs-involved=${r.dupeQuestionsInvolved}`);
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

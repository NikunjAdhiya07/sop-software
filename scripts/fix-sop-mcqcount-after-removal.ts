/** Resync SOP.mcqCount (denormalized) with the actual active MCQBank total,
 *  for the two identifiers touched by apply-remove-qa-similar-mcqs.ts.
 *  Also busts the persistent grouped-registry cache signature by touching the
 *  SOP docs' updatedAt (the $set below does that automatically via timestamps).
 *  Run: npx tsx scripts/fix-sop-mcqcount-after-removal.ts [--write] */
import fs from "fs";
import mongoose from "mongoose";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const TARGETS = [
  { identifier: "QAGE74-03", language: "English" },
  { identifier: "QAGE83-05", language: "English" },
];

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection;
  const bankCol = db.collection("mcqbanks");
  const sopCol = db.collection("sops");
  const write = process.argv.includes("--write");

  for (const t of TARGETS) {
    const idRegex = new RegExp(`^${t.identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const banks = await bankCol
      .find({ sopIdentifier: idRegex, language: t.language, isObsolete: { $ne: true } })
      .project({ mcqs: 1 })
      .toArray();
    const bankTotal = banks.reduce((sum, b: any) => sum + (b.mcqs?.length ?? 0), 0);

    const sops = await sopCol.find({ identifier: idRegex }).project({ identifier: 1, language: 1, mcqCount: 1 }).toArray();
    for (const s of sops as any[]) {
      console.log(
        `${write ? "SET" : "WOULD SET"} SOP ${s.identifier} (${s._id})  mcqCount: ${s.mcqCount ?? 0} → ${bankTotal}`,
      );
      if (write) {
        await sopCol.updateOne({ _id: s._id }, { $set: { mcqCount: bankTotal } });
      }
    }
  }

  if (write) {
    // Invalidate the persistent grouped-registry cache signature: cheapest
    // reliable way from a standalone script is to delete the cache doc so the
    // next read rebuilds fresh (mirrors invalidatePersistentGroupedCache()).
    const cacheCol = db.collection("dashboard_grouped_cache");
    const del = await cacheCol.deleteMany({});
    console.log(`\nCleared persistent grouped-registry cache docs: ${del.deletedCount}`);
  } else {
    console.log("\n(Dry run — no writes. Re-run with --write to apply.)");
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

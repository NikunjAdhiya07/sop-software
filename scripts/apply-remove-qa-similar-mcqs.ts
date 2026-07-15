/** APPLY step: remove the 10 confirmed near-duplicate QA questions found by
 *  scripts/diag-qa-similar-mcqs.ts. Each entry is verified against the live
 *  document (bankId + index + exact question text) before any write — if
 *  anything drifted since the dry-run, that entry is skipped and reported
 *  instead of silently removing the wrong question.
 *
 *  Run:  npx tsx scripts/apply-remove-qa-similar-mcqs.ts          (dry check only)
 *        npx tsx scripts/apply-remove-qa-similar-mcqs.ts --write   (actually removes)
 */
import fs from "fs";
import mongoose from "mongoose";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const REMOVALS = [
  { bankId: "69abd1662ad745b52ff05f3a", sopIdentifier: "QAGE74-03", index: 96,
    question: "⭐ According to SOP QAGE74-03, what action is required of the QA designee upon receiving a completed 'Formats / Annexures / Logbook" },
  { bankId: "69abd1662ad745b52ff05f3a", sopIdentifier: "QAGE74-03", index: 77,
    question: "⭐ According to SOP QAGE74-03, what specific information regarding the requester should be included in Annexure-I?" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 84,
    question: "⭐ According to the SOP, what is the purpose of washing hands with Dettol in the ladies change room?" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 74,
    question: "⭐ According to the SOP, what is the immediate action after removing the company dress and placing it in the locker?" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 90,
    question: "⭐ What is the purpose of the bench in the ladies change room, according to the SOP?" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 58,
    question: "⭐ According to the SOP, what is the purpose of the lockers provided in the ladies change room?" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 66,
    question: "⭐ According to the SOP, what is the last action performed inside the ladies change room before exiting?" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 68,
    question: "⭐ According to the SOP, what specific type of footwear protection is required to be removed and disposed of in the designated rece" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 88,
    question: "⭐ According to the SOP, what is the immediate action after washing hands with Dettol?" },
  { bankId: "69abd4f52ad745b52ff05f88", sopIdentifier: "QAGE83-05", index: 71,
    question: "⭐ According to the SOP, what is the immediate action after removing the shoe covers and disposing of them in the dustbin?" },
];

function difficultyDistribution(mcqs: any[]) {
  return {
    easy: mcqs.filter((m) => m.difficulty === "Easy").length,
    medium: mcqs.filter((m) => m.difficulty === "Medium").length,
    hard: mcqs.filter((m) => m.difficulty === "Hard").length,
  };
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI!);
  const bankCol = mongoose.connection.collection("mcqbanks");
  const write = process.argv.includes("--write");

  const byBank = new Map<string, typeof REMOVALS>();
  for (const r of REMOVALS) {
    const arr = byBank.get(r.bankId) ?? [];
    arr.push(r); byBank.set(r.bankId, arr);
  }

  let totalRemoved = 0;
  let totalSkipped = 0;

  for (const [bankId, entries] of byBank) {
    const doc = await bankCol.findOne({ _id: new mongoose.Types.ObjectId(bankId) });
    if (!doc) {
      console.log(`SKIP (bank not found) ${bankId}`);
      totalSkipped += entries.length;
      continue;
    }
    const mcqs: any[] = doc.mcqs ?? [];
    const toRemoveIdx = new Set<number>();
    for (const e of entries) {
      const cur = mcqs[e.index];
      const matches = cur && typeof cur.question === "string" && cur.question.startsWith(e.question.slice(0, 60));
      if (!matches) {
        console.log(
          `SKIP (drift) ${e.sopIdentifier} #${e.index}: expected "${e.question.slice(0, 60)}…" ` +
            `found "${(cur?.question ?? "<missing>").slice(0, 60)}…"`,
        );
        totalSkipped++;
        continue;
      }
      toRemoveIdx.add(e.index);
    }
    if (toRemoveIdx.size === 0) continue;

    const kept = mcqs.filter((_, i) => !toRemoveIdx.has(i));
    console.log(
      `${write ? "REMOVING" : "WOULD REMOVE"} ${toRemoveIdx.size} question(s) from ` +
        `${doc.sopIdentifier} [${doc.language}] (bank ${bankId}): ${mcqs.length} → ${kept.length}`,
    );
    totalRemoved += toRemoveIdx.size;

    if (write) {
      await bankCol.updateOne(
        { _id: doc._id },
        {
          $set: {
            mcqs: kept,
            totalQuestions: kept.length,
            difficultyDistribution: difficultyDistribution(kept),
          },
        },
      );
    }
  }

  console.log(`\n${write ? "Removed" : "Would remove"}: ${totalRemoved}   Skipped (drift/missing): ${totalSkipped}`);
  if (!write) console.log("\n(Verification-only pass — no writes. Re-run with --write to apply.)");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

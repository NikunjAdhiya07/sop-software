/** READ-ONLY: count/list QA questions already flagged isSimilar. Writes nothing.
 *  Run: npx tsx scripts/diag-qa-similar-count.ts */
import fs from "fs";
import mongoose from "mongoose";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI!);
  const bankCol = mongoose.connection.collection("mcqbanks");

  const rows = await bankCol
    .aggregate([
      { $match: { isObsolete: { $ne: true }, department: { $regex: /qa|quality/i } } },
      { $project: { sopIdentifier: 1, language: 1, department: 1, mcqs: 1, totalQuestions: 1 } },
      { $unwind: { path: "$mcqs", includeArrayIndex: "idx" } },
      { $match: { "mcqs.isSimilar": true } },
      {
        $project: {
          sopIdentifier: 1, language: 1, department: 1, idx: 1,
          isReviewed: "$mcqs.isReviewed", isChecked: "$mcqs.isChecked",
          question: "$mcqs.question",
        },
      },
    ])
    .toArray();

  console.log(`\nQA questions flagged isSimilar: ${rows.length}`);
  const byDept: Record<string, number> = {};
  for (const r of rows as any[]) byDept[r.department] = (byDept[r.department] ?? 0) + 1;
  console.log(`By department value: ${JSON.stringify(byDept)}`);

  const trunc = (s: string, n = 120) => (s?.length > n ? s.slice(0, n) + "…" : s);
  console.log(`\n=== First 30 flagged (of ${rows.length}) ===`);
  (rows as any[]).slice(0, 30).forEach((r, i) => {
    console.log(
      `[${i + 1}] ${r.sopIdentifier} #${r.idx} [${r.language}]` +
        `${r.isReviewed ? " reviewed" : ""}${r.isChecked ? " checked" : ""}\n    "${trunc(r.question)}"`,
    );
  });

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

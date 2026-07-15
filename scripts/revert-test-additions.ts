import fs from "fs";
import mongoose from "mongoose";
function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
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
  const id = process.argv[2];
  const n = Number(process.argv[3] ?? 10);
  const bank = await bankCol.findOne({ sopIdentifier: new RegExp(`^${id}$`, "i"), language: "English", isObsolete: { $ne: true } });
  const mcqs = bank.mcqs ?? [];
  const kept = mcqs.slice(0, mcqs.length - n);
  console.log(`${bank.sopIdentifier}: ${mcqs.length} -> ${kept.length} (reverting last ${n})`);
  await bankCol.updateOne({ _id: bank._id }, { $set: { mcqs: kept, totalQuestions: kept.length, difficultyDistribution: difficultyDistribution(kept) } });
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

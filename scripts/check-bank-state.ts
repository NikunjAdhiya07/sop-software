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
  const id = process.argv[2];
  const banks = await bankCol.find({ sopIdentifier: new RegExp(`^${id}$`, "i"), isObsolete: { $ne: true } })
    .project({ sopIdentifier: 1, language: 1, totalQuestions: 1 }).toArray();
  for (const b of banks as any[]) console.log(`${b.sopIdentifier} [${b.language}] totalQuestions=${b.totalQuestions}`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

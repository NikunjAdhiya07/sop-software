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
  const bank = await bankCol.findOne({ sopIdentifier: new RegExp(`^${id}$`, "i"), language: "English", isObsolete: { $ne: true } });
  const mcqs = bank.mcqs ?? [];
  console.log(`Bank ${bank._id}  total=${mcqs.length}`);
  console.log(`\n=== Last 12 questions (most recently appended) ===`);
  mcqs.slice(-12).forEach((m: any, i: number) => {
    console.log(`\n[${mcqs.length - 12 + i}] ref="${m.sopReference}"\n    Q: ${m.question}`);
  });
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

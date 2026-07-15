/** READ-ONLY: show the most recently updated QA SOP docs, to identify which
 *  ones were actually touched by a recent annexure upload. Writes nothing.
 *  Run: npx tsx scripts/diag-recent-sop-updates.ts [N] */
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
  const sopCol = mongoose.connection.collection("sops");
  const n = Number(process.argv[2] ?? 25) || 25;

  const rows = await sopCol
    .find({ department: { $regex: /qa|quality/i } })
    .project({ identifier: 1, name: 1, department: 1, language: 1, updatedAt: 1, createdAt: 1, requiredAnnexures: 1, presentAnnexures: 1 })
    .sort({ updatedAt: -1 })
    .limit(n)
    .toArray();

  console.log(`\n=== ${n} most recently updated QA SOP docs ===`);
  for (const r of rows as any[]) {
    console.log(
      `${r.identifier}  [${r.language ?? "-"}]  updatedAt=${r.updatedAt?.toISOString?.() ?? "-"}  ` +
        `createdAt=${r.createdAt?.toISOString?.() ?? "-"}\n` +
        `  name="${r.name}"  reqAnnex=${JSON.stringify(r.requiredAnnexures ?? null)}  presentAnnex=${JSON.stringify((r.presentAnnexures ?? []).map((a:any)=>a.label ?? a))}`,
    );
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

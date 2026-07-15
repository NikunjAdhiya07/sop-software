/** READ-ONLY smoke test: confirm buildAnnexureSupplement actually returns
 *  non-empty text for a known annexure-linked SOP, proving the new wiring in
 *  lib/mcq-generation.ts will pick up real annexure content. Does NOT run
 *  generation or write anything.
 *  Run: npx tsx scripts/verify-annexure-in-generation.ts QAGE01-11 */
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
  const { default: SOP } = await import("../models/SOP");
  const { buildAnnexureSupplement } = await import("../lib/compliance-sop-content");

  const identifier = process.argv[2] ?? "QAGE01-11";
  const re = new RegExp(`^${identifier}$`, "i");
  const sops = await SOP.find({ identifier: re });
  console.log(`Found ${sops.length} SOP record(s) for ${identifier}`);
  for (const s of sops) {
    console.log(`  ${s.identifier} [${s.language}] content.length=${s.content?.length ?? 0} annexures=${(s.sopDocuments ?? []).filter((d:any)=>d.documentKind==="annexure").length}`);
  }

  const supplement = await buildAnnexureSupplement(sops as any);
  console.log(`\nAnnexure supplement length: ${supplement.length} chars`);
  console.log(`\n--- First 800 chars ---\n${supplement.slice(0, 800)}`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

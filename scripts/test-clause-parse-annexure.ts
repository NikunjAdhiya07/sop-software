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
  const { parseClausesFromText } = await import("../lib/mcq-clauses");

  const identifier = process.argv[2] ?? "QAGE01-11";
  const sops = await SOP.find({ identifier: new RegExp(`^${identifier}$`, "i") });
  const eng = sops.find((s: any) => s.language !== "Gujarati") ?? sops[0];
  const supplement = await buildAnnexureSupplement(sops as any);
  const merged = `${eng.content ?? ""}\n\n${supplement}`;

  const clauses = parseClausesFromText(merged);
  console.log(`Total clauses parsed: ${clauses.length}`);
  const annexureClauses = clauses.filter((c: any) => /annexure/i.test(c.id));
  console.log(`Annexure-labeled clauses: ${annexureClauses.length}`);
  annexureClauses.forEach((c: any) => {
    console.log(`\n[${c.id}] ${c.summary}\n  text(${c.text.length} chars): ${c.text.slice(0, 200)}...`);
  });

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

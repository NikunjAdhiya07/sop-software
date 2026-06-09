/**
 * One-off backfill: re-download each DOCX, re-extract its text *including the
 * page-header table* (SUBJECT / EFF. DATE / REVIEW DT.), then re-derive the
 * record's name, language, and dates using the real lib code.
 *
 * Run:  npx tsx scripts/backfill-reextract.ts --dry --limit 8
 *       npx tsx scripts/backfill-reextract.ts
 */
import fs from "fs";
import mongoose from "mongoose";
import { extractTextFromBuffer } from "@/lib/extractContent";
import { deriveSopRecordName } from "@/lib/sop-utils";
import { resolveSopDatesFromContent, sopDatesToDbFields } from "@/lib/sop-dates";
import { languageFromContentScript } from "@/lib/sop-name-resolution";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const fmt = (d?: Date) => (d ? d.toLocaleDateString("en-GB") : "-");

async function main() {
  loadEnv();
  const DRY = process.argv.includes("--dry");
  const limitArg = process.argv.indexOf("--limit");
  const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 0;

  await mongoose.connect(process.env.MONGODB_URI!);
  const SOP = mongoose.connection.collection("sops");

  const docs = await SOP.find(
    { fileType: "docx", fileUrl: { $exists: true } },
    { projection: { identifier: 1, language: 1, fileUrl: 1, originalFileName: 1, name: 1 } },
  )
    .limit(LIMIT)
    .toArray();

  let updated = 0, failed = 0, i = 0;
  for (const d of docs) {
    i++;
    try {
      const res = await fetch(d.fileUrl);
      if (!res.ok) { failed++; console.log(`[${i}] ${d.identifier} HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const content = await extractTextFromBuffer(buf, "docx");

      const baseLang = d.language === "Gujarati" ? "Gujarati" : "English";
      const language = languageFromContentScript(content, baseLang);
      const derived = deriveSopRecordName({
        identifier: d.identifier,
        language,
        fileType: "docx",
        content,
        originalFileName: d.originalFileName,
      });
      // Never regress a good existing name to the bare identifier fallback.
      const name = derived && derived !== d.identifier ? derived : (d.name ?? derived);
      const dateFields = sopDatesToDbFields(resolveSopDatesFromContent(content));

      if (!DRY) {
        await SOP.updateOne({ _id: d._id }, { $set: { content, name, language, ...dateFields } });
      }
      updated++;
      if (i <= 12 || i % 50 === 0) {
        console.log(`[${i}/${docs.length}] ${d.identifier.padEnd(11)} ${language.slice(0, 3)} "${name}"  exp:${fmt(dateFields.expiryDate)}`);
      }
    } catch (e) {
      failed++;
      console.log(`[${i}] ${d.identifier} FAIL ${(e as Error).message}`);
    }
  }

  console.log(JSON.stringify({ dryRun: DRY, total: docs.length, updated, failed }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

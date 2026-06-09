/**
 * Second pass after backfill-reextract: the docx records now carry the correct
 * name / language / dates, but their non-docx siblings (the PDFs) still hold the
 * old default dates and stale language. Propagate the family's dates to every
 * sibling, and fix any record whose name is clearly Gujarati but is tagged English.
 *
 * Run:  npx tsx scripts/backfill-propagate.ts --dry
 *       npx tsx scripts/backfill-propagate.ts
 */
import fs from "fs";
import mongoose from "mongoose";
import { hasGujaratiScript, isPlaceholderSopName } from "@/lib/sop-name-resolution";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const DRY = process.argv.includes("--dry");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const SOP = mongoose.connection.collection("sops");

  const all = await SOP.find(
    {},
    { projection: { identifier: 1, sopBaseId: 1, versionNum: 1, fileType: 1, language: 1, name: 1, effectiveDate: 1, reviewDate: 1, expiryDate: 1, nextReviewDate: 1, validityPeriod: 1 } },
  ).toArray();

  // Family -> date fields taken from the docx record.
  const familyDates = new Map<string, Record<string, unknown>>();
  for (const r of all) {
    if (r.fileType !== "docx" || !r.expiryDate) continue;
    const key = `${r.sopBaseId ?? r.identifier}::${r.versionNum ?? 0}`;
    familyDates.set(key, {
      effectiveDate: r.effectiveDate,
      reviewDate: r.reviewDate,
      expiryDate: r.expiryDate,
      nextReviewDate: r.nextReviewDate,
      validityPeriod: r.validityPeriod,
    });
  }

  let dateUpdates = 0, langUpdates = 0;
  for (const r of all) {
    const set: Record<string, unknown> = {};

    // Propagate family dates to siblings (mainly the PDFs) that are missing or stale.
    if (r.fileType !== "docx") {
      const key = `${r.sopBaseId ?? r.identifier}::${r.versionNum ?? 0}`;
      const dates = familyDates.get(key);
      if (dates?.expiryDate && (!r.expiryDate || +new Date(r.expiryDate as Date) !== +new Date(dates.expiryDate as Date))) {
        Object.assign(set, dates);
        dateUpdates++;
      }
    }

    // Fix language when the name is unmistakably Gujarati but tagged English.
    if (r.language !== "Gujarati" && r.name && hasGujaratiScript(r.name) && !isPlaceholderSopName(r.name, r.identifier)) {
      set.language = "Gujarati";
      langUpdates++;
    }

    if (Object.keys(set).length && !DRY) {
      await SOP.updateOne({ _id: r._id }, { $set: set });
    }
  }

  console.log(JSON.stringify({ dryRun: DRY, total: all.length, dateUpdates, langUpdates }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Backfill requiredAnnexures on English DOCX SOP records from extracted content.
 * Run: npx tsx scripts/backfill-required-annexures.ts
 */
import fs from "fs";

function loadEnv() {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    console.warn("No .env.local — using process environment");
  }
}

async function main() {
  loadEnv();

  const { connectDB } = await import("@/lib/mongodb");
  const SOP = (await import("@/models/SOP")).default;
  const { parseRequiredAnnexuresFromContent } = await import("@/lib/sop-annexure-requirements");
  const { invalidateDashboardSopsCache } = await import("@/lib/server-cache");

  await connectDB();

  const records = await SOP.find({
    fileType: "docx",
    language: "English",
    isObsolete: { $ne: true },
  })
    .select("_id identifier content requiredAnnexures")
    .lean();

  let updated = 0;
  let withAnnexures = 0;

  for (const record of records) {
    const parsed = parseRequiredAnnexuresFromContent(record.content ?? "");
    if (parsed.length) withAnnexures++;

    const existing = record.requiredAnnexures ?? [];
    const same =
      existing.length === parsed.length &&
      existing.every((v, i) => v === parsed[i]);

    if (same) continue;

    await SOP.updateOne({ _id: record._id }, { $set: { requiredAnnexures: parsed } });
    updated++;
  }

  invalidateDashboardSopsCache();

  console.log(`Scanned ${records.length} English DOCX records`);
  console.log(`SOPs with annexure section: ${withAnnexures}`);
  console.log(`Updated: ${updated}`);

  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

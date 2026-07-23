/**
 * Permanently delete bogus facility-label SOP rows (e.g. WADHWAN-2) that were
 * created when site names were misread as SOP numbers.
 *
 * Usage: npx tsx scripts/delete-wadhwan-false-sop.ts
 */
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

  const { deleteRegistryGroup, sopFamilyIdentifierRegex } = await import("@/lib/sop-utils");
  const { invalidateDashboardSopsCache } = await import("@/lib/server-cache");
  const SOP = (await import("@/models/SOP")).default;
  const SopFilesImportManifest = (await import("@/models/SopFilesImportManifest")).default;

  const groups = await SOP.find({
    $or: [
      { identifier: { $regex: /^WADHWAN(-\d+)?$/i } },
      { sopBaseId: { $regex: /^WADHWAN$/i } },
    ],
  });

  if (!groups.length) {
    console.log("No WADHWAN SOP records found.");
  } else {
    const byFamily = new Map<string, typeof groups>();
    for (const row of groups) {
      const key = String(row.sopBaseId || row.identifier || "").toUpperCase();
      const bucket = byFamily.get(key) ?? [];
      bucket.push(row);
      byFamily.set(key, bucket);
    }
    for (const [key, family] of byFamily) {
      console.log(`Deleting family ${key} (${family.length} record(s)):`, family.map((r) => r.identifier));
      await deleteRegistryGroup(family as never);
    }
    invalidateDashboardSopsCache();
    console.log("Deleted and dashboard cache invalidated.");
  }

  const man = await SopFilesImportManifest.deleteMany({
    $or: [
      { identifier: { $regex: /^WADHWAN/i } },
      { relativePath: { $regex: /WADHWAN-2/i } },
    ],
  });
  console.log(`Manifest cleanup: ${man.deletedCount} entr(y/ies)`);

  // sanity: PEGE22 still present
  const pege = await SOP.countDocuments({ identifier: sopFamilyIdentifierRegex("PEGE22-03") });
  console.log(`PEGE22 family records remaining: ${pege}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

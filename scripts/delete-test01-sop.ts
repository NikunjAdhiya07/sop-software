/**
 * Find + permanently delete TEST01 (or TEST CALIBRATION) SOPs.
 * Usage: npx tsx scripts/delete-test01-sop.ts
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

  const { deleteRegistryGroup } = await import("@/lib/sop-utils");
  const { clearImportStateAfterPermanentDelete } = await import("@/lib/sop-files-import");
  const { invalidateDashboardSopsCache } = await import("@/lib/server-cache");
  const SOP = (await import("@/models/SOP")).default;

  const group = await SOP.find({
    $or: [
      { identifier: /TEST01/i },
      { sopBaseId: /TEST01/i },
      { name: /TEST CALIBRATION/i },
    ],
  });

  if (!group.length) {
    const recentGeneral = await SOP.find({ department: "General" })
      .select("identifier name department language fileType uploadedAt isObsolete")
      .sort({ uploadedAt: -1 })
      .limit(20)
      .lean();
    console.log("No TEST01 / TEST CALIBRATION records found.");
    console.log("Recent General SOPs:", JSON.stringify(recentGeneral, null, 2));
    await mongoose.disconnect();
    return;
  }

  console.log(
    "Deleting:",
    group.map((r) => ({
      id: r.identifier,
      name: r.name,
      dept: r.department,
      lang: r.language,
      type: r.fileType,
    })),
  );

  const identifiers = [...new Set(group.map((r) => r.identifier))];
  const checksums = [
    ...new Set(
      group.flatMap((r) => {
        const docs = Array.isArray(r.sopDocuments) ? r.sopDocuments : [];
        return [r.checksum, ...docs.map((d: { checksum?: string }) => d?.checksum)].filter(
          (c): c is string => Boolean(c),
        );
      }),
    ),
  ];

  const cleanup = await clearImportStateAfterPermanentDelete({ identifiers, checksums });
  await deleteRegistryGroup(group);
  invalidateDashboardSopsCache();

  const left = await SOP.countDocuments({
    $or: [{ identifier: /TEST01/i }, { name: /TEST CALIBRATION/i }],
  });
  console.log("Done.", { deleted: identifiers, cleanup, left });
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

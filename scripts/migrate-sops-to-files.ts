/**
 * Export all SOP documents from MongoDB/Bunny into files/ for bulk-import workflow.
 *
 *   files/QAGE01-11.docx                    ← current SOPs (flat)
 *   files/versions/QAGE01-10.docx           ← prior versions (flat)
 *   files/_obsolete/...                     ← obsolete families
 *
 * Run:  npx tsx scripts/migrate-sops-to-files.ts
 *       npx tsx scripts/migrate-sops-to-files.ts --dry   (preview counts only)
 */
import fs from "fs";

function loadEnv() {
  try {
    const env = fs.readFileSync(".env.local", "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    console.warn("No .env.local found — using process environment");
  }
}

async function main() {
  loadEnv();
  const dry = process.argv.includes("--dry");

  if (dry) {
    const { connectDB } = await import("@/lib/mongodb");
    const SOP = (await import("@/models/SOP")).default;
    await connectDB();
    const count = await SOP.countDocuments({
      fileUrl: { $exists: true, $ne: "" },
      fileType: { $in: ["pdf", "docx"] },
      linkedFromBunny: { $ne: true },
    });
    console.log(`Would export up to ${count} main SOP file records (excluding linkedFromBunny stubs)`);
    process.exit(0);
  }

  const { exportAllSopsToFilesFolder } = await import("@/lib/export-sops-to-files");
  console.log("Exporting SOP documents to files/ (resume: skip existing) …");
  const result = await exportAllSopsToFilesFolder({
    resume: true,
    onProgress: (msg) => console.log(msg),
  });

  console.log("\n=== Export complete ===");
  console.log(`Root: ${result.rootDir}`);
  console.log(`Written: ${result.written}`);
  console.log(`Skipped (unchanged): ${result.skipped}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Current: ${result.currentFiles} slots`);
  console.log(`Prior (versions/): ${result.priorFiles} slots`);
  console.log(`Annexures: ${result.annexureFiles}`);
  console.log(`Obsolete: ${result.obsoleteFiles}`);

  if (result.errors.length) {
    console.log(`\nFirst errors (${Math.min(10, result.errors.length)}):`);
    for (const e of result.errors.slice(0, 10)) console.log(`  - ${e}`);
  }

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

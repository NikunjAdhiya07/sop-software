/**
 * Verify current-version SOPs (ENG + GUJ) exist in files/ root.
 * Run: npx tsx scripts/verify-files-root.ts
 */
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";

function loadEnv() {
  try {
    const env = fsSync.readFileSync(".env.local", "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    console.warn("No .env.local found — using process environment");
  }
}

function parseVersionNum(version: string): number {
  const n = parseInt(String(version).split(".")[0], 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  loadEnv();

  const { connectDB } = await import("@/lib/mongodb");
  const SOP = (await import("@/models/SOP")).default;
  const { exportFileName } = await import("@/lib/export-sops-to-files");
  const { maxVersionInGroup, sopFamilyGroupKey, versionFromIdentifier } = await import("@/lib/sop-utils");
  const { getFilesImportDir } = await import("@/lib/sop-files-import");
  type ISOP = import("@/models/SOP").ISOP;

  function getRecordVersionNum(record: ISOP): number {
    if (record.versionNum != null) return record.versionNum;
    const fromId = versionFromIdentifier(record.identifier);
    return fromId != null ? parseVersionNum(fromId) : 0;
  }

  const rootDir = getFilesImportDir();
  await connectDB();

  const records = await SOP.find({
    fileUrl: { $exists: true, $ne: "" },
    fileType: { $in: ["pdf", "docx"] },
  }).lean<ISOP[]>();

  const families = new Map<string, ISOP[]>();
  for (const record of records) {
    const key = sopFamilyGroupKey(record);
    const list = families.get(key) ?? [];
    list.push(record);
    families.set(key, list);
  }

  const expectedRoot: { fileName: string; identifier: string; language: string; fileType: string }[] = [];

  for (const [, family] of families) {
    const active = family.filter((r) => !r.isObsolete);
    const pool = active.length ? active : family;
    const isObsoleteFamily = active.length === 0;
    if (isObsoleteFamily) continue;

    const currentVersion = maxVersionInGroup(pool);
    const currentNum = parseVersionNum(currentVersion);
    const currentRecords = pool.filter((r) => getRecordVersionNum(r) === currentNum);

    for (const record of currentRecords) {
      expectedRoot.push({
        fileName: exportFileName(record),
        identifier: record.identifier,
        language: record.language ?? "English",
        fileType: record.fileType,
      });
    }
  }

  const rootEntries = await fs.readdir(rootDir, { withFileTypes: true });
  const rootFileList = rootEntries
    .filter((e) => e.isFile() && e.name !== ".gitkeep")
    .map((e) => e.name);
  const rootFiles = new Set(rootFileList);
  const rootLower = new Map(rootFileList.map((f) => [f.toLowerCase(), f]));

  let versionsList: string[] = [];
  try {
    versionsList = await fs.readdir(path.join(rootDir, "versions"));
  } catch {
    /* no versions dir */
  }

  let exact = 0;
  let fuzzyRoot = 0;
  let inVersions = 0;
  const trulyMissing: typeof expectedRoot = [];

  for (const exp of expectedRoot) {
    if (rootFiles.has(exp.fileName)) {
      exact++;
      continue;
    }
    if (rootLower.has(exp.fileName.toLowerCase())) {
      exact++;
      continue;
    }
    const id = exp.identifier.toLowerCase();
    const fuzzyHit = rootFileList.find(
      (f) => f.toLowerCase().includes(id) && f.toLowerCase().endsWith(`.${exp.fileType}`),
    );
    if (fuzzyHit) {
      fuzzyRoot++;
      continue;
    }
    const verHit = versionsList.find(
      (f) => f.toLowerCase().includes(id) && f.toLowerCase().endsWith(`.${exp.fileType}`),
    );
    if (verHit) {
      inVersions++;
      continue;
    }
    trulyMissing.push(exp);
  }

  const missing: typeof expectedRoot = [];
  for (const exp of expectedRoot) {
    if (!rootFiles.has(exp.fileName)) missing.push(exp);
  }

  const expectedNames = new Set(expectedRoot.map((e) => e.fileName));
  const extra = [...rootFiles].filter((n) => !expectedNames.has(n));

  const byLang = (list: typeof expectedRoot) => ({
    English: list.filter((r) => r.language === "English").length,
    Gujarati: list.filter((r) => r.language === "Gujarati").length,
  });

  const byType = (list: typeof expectedRoot) => ({
    pdf: list.filter((r) => r.fileType === "pdf").length,
    docx: list.filter((r) => r.fileType === "docx").length,
  });

  console.log("=== files/ root verification ===\n");
  console.log(`Root dir: ${rootDir}`);
  console.log(`Files on disk (root): ${rootFiles.size}`);
  console.log(`Expected current SOP files: ${expectedRoot.length}`);
  console.log(`  English: ${byLang(expectedRoot).English}  Gujarati: ${byLang(expectedRoot).Gujarati}`);
  console.log(`  PDF: ${byType(expectedRoot).pdf}  DOCX: ${byType(expectedRoot).docx}`);
  console.log(`Missing (exact filename): ${missing.length}`);
  console.log(`Extra in root (not current DB): ${extra.length}`);
  console.log("\n--- By identifier match ---");
  console.log(`Exact filename in root: ${exact}`);
  console.log(`Same SOP id+type in root (different name): ${fuzzyRoot}`);
  console.log(`Current SOP but in versions/: ${inVersions}`);
  console.log(`Truly missing (nowhere): ${trulyMissing.length}`);
  console.log(`  English: ${trulyMissing.filter((m) => m.language === "English").length}`);
  console.log(`  Gujarati: ${trulyMissing.filter((m) => m.language === "Gujarati").length}`);

  if (trulyMissing.length) {
    console.log("\n--- Truly missing (first 20) ---");
    for (const m of trulyMissing.slice(0, 20)) {
      console.log(`  [${m.language}/${m.fileType}] ${m.identifier}`);
    }
    if (trulyMissing.length > 20) console.log(`  … and ${trulyMissing.length - 20} more`);
    const gujMiss = trulyMissing.filter((m) => m.language === "Gujarati");
    if (gujMiss.length) {
      console.log("\n--- Gujarati missing ---");
      for (const m of gujMiss) console.log(`  [${m.fileType}] ${m.identifier}`);
    }
    const missPdf = trulyMissing.filter((m) => m.fileType === "pdf").length;
    const missDocx = trulyMissing.filter((m) => m.fileType === "docx").length;
    console.log(`\nMissing breakdown: ${missPdf} PDF, ${missDocx} DOCX`);
  } else if (missing.length === 0) {
    console.log("\n✓ All current English + Gujarati SOPs are present in files/ root.");
  } else {
    console.log("\n✓ All current SOPs are on disk (some filenames differ from DB export name).");
  }

  if (missing.length && !trulyMissing.length) {
    console.log(`\n(${missing.length} exact-name mismatches — content present under alternate filenames)`);
  } else if (missing.length) {
    console.log("\n--- Missing exact names (first 15) ---");
    for (const m of missing.slice(0, 15)) {
      console.log(`  [${m.language}/${m.fileType}] ${m.identifier}`);
    }
  }

  if (extra.length && extra.length <= 20) {
    console.log("\n--- Extra root files ---");
    for (const n of extra) console.log(`  ${n}`);
  } else if (extra.length > 20) {
    console.log(`\n(${extra.length} extra root files — likely annexures or naming drift)`);
  }

  process.exit(trulyMissing.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

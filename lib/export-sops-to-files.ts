import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { connectDB } from "@/lib/mongodb";
import SOP, { type ISOP } from "@/models/SOP";
import { loadStoredFileBuffer } from "@/lib/loadStoredFileBuffer";
import {
  maxVersionInGroup,
  sopFamilyGroupKey,
  versionFromIdentifier,
} from "@/lib/sop-utils";
import { getFilesImportDir } from "@/lib/sop-files-import";

export type ExportSopsResult = {
  rootDir: string;
  written: number;
  skipped: number;
  failed: number;
  currentFiles: number;
  priorFiles: number;
  annexureFiles: number;
  obsoleteFiles: number;
  errors: string[];
};

export type ExportSopsOptions = {
  rootDir?: string;
  /** Skip download when destination file already exists (resume mode). */
  resume?: boolean;
  onProgress?: (msg: string) => void;
};

function sanitizeFileName(s: string): string {
  const cleaned = s
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const extMatch = cleaned.match(/(\.(pdf|docx))$/i);
  const ext = extMatch?.[1]?.toLowerCase() ?? "";
  const stem = ext ? cleaned.slice(0, -ext.length) : cleaned;
  const maxStem = ext ? 180 - ext.length : 180;
  return stem.slice(0, maxStem) + ext;
}

export function exportFileName(
  record: Pick<ISOP, "identifier" | "originalFileName" | "fileType" | "language">,
): string {
  if (record.originalFileName?.trim()) {
    const name = sanitizeFileName(record.originalFileName.trim());
    if (/\.(pdf|docx)$/i.test(name)) return name;
    return `${name}.${record.fileType}`;
  }
  const langSuffix = record.language === "Gujarati" ? "_GUJ" : "";
  return `${record.identifier}${langSuffix}.${record.fileType}`;
}

function parseVersionNum(version: string): number {
  const n = parseInt(String(version).split(".")[0], 10);
  return Number.isFinite(n) ? n : 0;
}

function getRecordVersionNum(record: ISOP): number {
  if (record.versionNum != null) return record.versionNum;
  const fromId = versionFromIdentifier(record.identifier);
  return fromId != null ? parseVersionNum(fromId) : 0;
}

async function destAlreadyExported(destPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(destPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function writeBuffer(destPath: string, buffer: Buffer): Promise<"written" | "skipped"> {
  const checksum = createHash("sha256").update(buffer).digest("hex");
  try {
    const existing = await fs.readFile(destPath);
    if (createHash("sha256").update(existing).digest("hex") === checksum) {
      return "skipped";
    }
  } catch {
    // new file
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
  return "written";
}

async function exportUrl(
  fileUrl: string,
  destPath: string,
  stats: ExportSopsResult,
  resume: boolean,
): Promise<void> {
  if (resume && (await destAlreadyExported(destPath))) {
    stats.skipped++;
    return;
  }

  const buffer = await loadStoredFileBuffer(fileUrl, { trustedRemote: true });
  if (!buffer?.length) {
    stats.failed++;
    stats.errors.push(`Could not load → ${path.basename(destPath)}`);
    return;
  }
  const outcome = await writeBuffer(destPath, buffer);
  if (outcome === "written") stats.written++;
  else stats.skipped++;
}

/**
 * Export all SOP documents from MongoDB/Bunny into a flat files/ layout:
 * - Current version → files/{filename}
 * - Prior versions → files/versions/{filename}
 * - Obsolete families → files/_obsolete/{filename}
 * - Annexures → files/{filename}
 */
export async function exportAllSopsToFilesFolder(
  opts: ExportSopsOptions = {},
): Promise<ExportSopsResult> {
  const rootDir = opts.rootDir ?? getFilesImportDir();
  const resume = opts.resume !== false;
  const log = opts.onProgress ?? (() => {});

  await connectDB();

  const stats: ExportSopsResult = {
    rootDir,
    written: 0,
    skipped: 0,
    failed: 0,
    currentFiles: 0,
    priorFiles: 0,
    annexureFiles: 0,
    obsoleteFiles: 0,
    errors: [],
  };

  await fs.mkdir(rootDir, { recursive: true });
  await fs.mkdir(path.join(rootDir, "versions"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "_obsolete"), { recursive: true });

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

  let processed = 0;
  const total = records.length;
  log(`Exporting ${total} file records from ${families.size} SOP families…`);

  for (const [, family] of families) {
    const active = family.filter((r) => !r.isObsolete);
    const pool = active.length ? active : family;
    const isObsoleteFamily = active.length === 0;
    const currentVersion = maxVersionInGroup(pool);
    const currentNum = parseVersionNum(currentVersion);

    for (const record of pool) {
      if (!record.fileUrl) continue;
      if (record.fileType !== "pdf" && record.fileType !== "docx") continue;

      const verNum = getRecordVersionNum(record);
      const isCurrent = verNum === currentNum;
      const fileName = exportFileName(record);

      let destDir: string;
      if (isObsoleteFamily) {
        destDir = path.join(rootDir, "_obsolete");
        stats.obsoleteFiles++;
      } else if (isCurrent) {
        destDir = rootDir;
        stats.currentFiles++;
      } else {
        destDir = path.join(rootDir, "versions");
        stats.priorFiles++;
      }

      const destPath = path.join(destDir, fileName);
      await exportUrl(record.fileUrl, destPath, stats, resume);
      processed++;
      if (processed % 25 === 0 || processed === total) {
        log(
          `[${processed}/${total}] written=${stats.written} skipped=${stats.skipped} failed=${stats.failed}`,
        );
      }
    }

    if (!isObsoleteFamily) {
      const currentRecords = pool.filter((r) => getRecordVersionNum(r) === currentNum);
      for (const record of currentRecords) {
        for (const doc of record.sopDocuments ?? []) {
          if (doc.documentKind !== "annexure" || !doc.filePath) continue;
          const annexName = sanitizeFileName(doc.fileName || doc.annexureLabel || "Annexure.docx");
          stats.annexureFiles++;
          await exportUrl(doc.filePath, path.join(rootDir, annexName), stats, resume);
        }
      }
    }
  }

  return stats;
}

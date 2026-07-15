import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import SopFilesImportJob from "@/models/SopFilesImportJob";
import SopFilesImportManifest from "@/models/SopFilesImportManifest";
import {
  extractSopContentMetadata,
  isAnnexureFileName,
  shouldSkipImportFileName,
} from "@/lib/sop-content-metadata";
import { extractRefSopNoFromAnnexure } from "@/lib/annexure-parent-extract";
import { findAnnexureParentSop, linkAnnexureToParent } from "@/lib/sop-annexure";
import { processSopFileInput } from "@/lib/sop-upload";
import { reconcileSopVersions } from "@/lib/reconcile-sop-versions";
import { refreshFamilyPriorHeaderDateFlags } from "@/lib/prior-header-dates";
import { invalidateDashboardSopsCache } from "@/lib/server-cache";
import { sopIdentifierMatchFilter, normalizeSopIdentifierKey, parseRevisionFromSopIdentifier } from "@/lib/sopIdentifierNormalize";
import { extractIdentifierFromFilename, sopFamilyIdentifierRegex } from "@/lib/sop-utils";
import { detectFileType } from "@/lib/upload";
import { extractTextFromBuffer } from "@/lib/extractContent";

const SKIP_DIRS = new Set(["_archive", "_failed", "_obsolete", "_prior-versions"]);

export const IMPORT_SCOPES = ["main", "annexure", "prior"] as const;
export type ImportScope = (typeof IMPORT_SCOPES)[number];

export function parseImportScopes(input: unknown): ImportScope[] | null {
  if (input === undefined || input === null || input === "") {
    return [...IMPORT_SCOPES];
  }
  const raw = Array.isArray(input)
    ? input.map(String)
    : String(input)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const valid = raw.filter((s): s is ImportScope =>
    (IMPORT_SCOPES as readonly string[]).includes(s),
  );
  return valid.length ? [...new Set(valid)] : null;
}

export function classifyImportFile(
  file: Pick<ScannedFile, "fileName" | "relativePath">,
): ImportScope {
  if (isAnnexureFileName(file.fileName)) return "annexure";
  if (isPriorVersionPath(file.relativePath)) return "prior";
  return "main";
}

function fileMatchesImportScope(
  file: Pick<ScannedFile, "fileName" | "relativePath">,
  scopes: ImportScope[],
): boolean {
  return scopes.includes(classifyImportFile(file));
}

export function getFilesImportDir(): string {
  return path.resolve(process.cwd(), process.env.FILES_IMPORT_DIR || "files");
}

export type ScannedFile = {
  absolutePath: string;
  relativePath: string;
  fileName: string;
};

function isPriorVersionPath(relativePath: string): boolean {
  return relativePath.replace(/\\/g, "/").startsWith("versions/");
}

export async function scanFilesFolder(
  rootDir = getFilesImportDir(),
  scopes: ImportScope[] = [...IMPORT_SCOPES],
): Promise<ScannedFile[]> {
  const wantPrior = scopes.includes("prior");
  const results: ScannedFile[] = [];

  async function walk(dir: string, prefix = "", inVersions = false) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (shouldSkipImportFileName(name)) continue;
      const abs = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        const childInVersions = inVersions || (!prefix && name === "versions");
        if (childInVersions && !wantPrior && !inVersions) continue;
        await walk(abs, rel, childInVersions);
      } else if (stat.isFile() && detectFileType(name)) {
        const file: ScannedFile = {
          absolutePath: abs,
          relativePath: rel.replace(/\\/g, "/"),
          fileName: name,
        };
        if (fileMatchesImportScope(file, scopes)) {
          results.push(file);
        }
      }
    }
  }

  if (scopes.length === 1 && scopes[0] === "prior") {
    await walk(path.join(rootDir, "versions"), "versions", true);
  } else {
    await walk(rootDir);
  }

  return results;
}

async function isManifestDuplicate(checksum: string): Promise<boolean> {
  const hit = await SopFilesImportManifest.findOne({ checksum }).lean();
  return Boolean(hit);
}

async function isFamilyObsolete(identifier: string): Promise<boolean> {
  const family = await SOP.find({
    ...sopIdentifierMatchFilter(identifier),
  }).lean();
  return family.length > 0 && family.every((r) => r.isObsolete);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function isWindowsFileLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function moveFile(src: string, dest: string) {
  await ensureDir(path.dirname(dest));

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await fs.rename(src, dest);
      return;
    } catch (renameErr) {
      if (isWindowsFileLockError(renameErr) && attempt < 7) {
        await sleep(250 * (attempt + 1));
        continue;
      }

      try {
        await fs.copyFile(src, dest);
      } catch (copyErr) {
        if (isWindowsFileLockError(copyErr) && attempt < 7) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        throw copyErr;
      }

      // Copy to _archive succeeded — best-effort remove source (often locked on Windows/Word).
      for (let unlinkAttempt = 0; unlinkAttempt < 5; unlinkAttempt++) {
        try {
          await fs.unlink(src);
          return;
        } catch (unlinkErr) {
          if (isWindowsFileLockError(unlinkErr) && unlinkAttempt < 4) {
            await sleep(300 * (unlinkAttempt + 1));
            continue;
          }
          if (isWindowsFileLockError(unlinkErr)) {
            return;
          }
          throw unlinkErr;
        }
      }
      return;
    }
  }
}

/** Move imported file to _archive; returns path or a warning if the DB import already succeeded. */
async function safeArchiveImportedFile(
  rootDir: string,
  scanned: ScannedFile,
): Promise<{ archivedPath?: string; warning?: string }> {
  try {
    const archivedPath = await archiveImportedFile(rootDir, scanned);
    return { archivedPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      warning: `Imported successfully but could not move file to _archive (${message}). Close the file if it is open in Word, then delete or move it manually.`,
    };
  }
}

export async function archiveImportedFile(
  rootDir: string,
  scanned: ScannedFile,
): Promise<string> {
  const dest = path.join(rootDir, "_archive", scanned.relativePath);
  await moveFile(scanned.absolutePath, dest);
  return dest;
}

export async function routeToObsoleteFolder(
  rootDir: string,
  scanned: ScannedFile,
  identifier: string,
): Promise<string> {
  const base = identifier.split("-")[0] ?? identifier;
  const dest = path.join(rootDir, "_obsolete", base, identifier, scanned.fileName);
  await moveFile(scanned.absolutePath, dest);
  return dest;
}

export async function relocateSupersededVersion(
  rootDir: string,
  sopBaseId: string,
  identifier: string,
  archivedPaths: string[],
): Promise<string | null> {
  const destDir = path.join(rootDir, "_prior-versions", sopBaseId, identifier);
  let moved: string | null = null;
  for (const archivedPath of archivedPaths) {
    if (!archivedPath) continue;
    try {
      await fs.access(archivedPath);
      const dest = path.join(destDir, path.basename(archivedPath));
      await moveFile(archivedPath, dest);
      moved = destDir;
    } catch {
      // archived file may already have been moved
    }
  }
  return moved;
}

function sortScannedFiles(files: ScannedFile[]): ScannedFile[] {
  return [...files].sort((a, b) => {
    const aAnnex = isAnnexureFileName(a.fileName) ? 1 : 0;
    const bAnnex = isAnnexureFileName(b.fileName) ? 1 : 0;
    if (aAnnex !== bAnnex) return aAnnex - bAnnex;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

export type ImportPreview = {
  importDir: string;
  scopes: ImportScope[];
  parentIdentifier?: string;
  parentFound?: boolean;
  unresolvedAnnexures: number;
  total: number;
  main: number;
  annexure: number;
  prior: number;
  pending: number;
  pendingMain: number;
  pendingAnnexure: number;
  pendingPrior: number;
  duplicate: number;
  obsolete: number;
};

async function isAlreadyImported(checksum: string): Promise<boolean> {
  if (await isManifestDuplicate(checksum)) return true;
  const existing = await SOP.findOne({ checksum }).lean();
  return Boolean(existing);
}

function normalizeParentIdentifier(input?: string | null): string | undefined {
  const trimmed = input?.trim();
  if (!trimmed) return undefined;
  return normalizeSopIdentifierKey(trimmed);
}

export function resolveAnnexureParentIdentifier(
  meta: { parentIdentifier?: string },
  parentOverride?: string | null,
): string | undefined {
  return meta.parentIdentifier ?? normalizeParentIdentifier(parentOverride);
}

const ANNEXURE_PARENT_HINT =
  "Could not resolve parent SOP — enter parent code below, or place files in files/PARENT-CODE/";

function identifierFromMainFile(file: ScannedFile): string | undefined {
  const meta = extractSopContentMetadata({
    fileName: file.fileName,
    relativePath: file.relativePath,
  });
  if (meta.identifier && /-\d+$/.test(meta.identifier)) {
    return meta.identifier;
  }
  const fromName = extractIdentifierFromFilename(file.fileName);
  if (fromName && /-\d+$/.test(fromName)) return fromName;
  for (const segment of file.relativePath.split(/[/\\]/)) {
    const code = extractIdentifierFromFilename(segment);
    if (code && /-\d+$/.test(code)) return code;
  }
  return undefined;
}

async function parentSopAvailable(
  parentRef: string,
  rootDir: string,
  mainFiles?: ScannedFile[],
): Promise<boolean> {
  if (await findAnnexureParentSop(parentRef)) return true;

  const familyRegex = sopFamilyIdentifierRegex(parentRef);
  const scanned = mainFiles ?? (await scanFilesFolder(rootDir, ["main"]));
  return scanned.some((file) => {
    if (isAnnexureFileName(file.fileName) || isPriorVersionPath(file.relativePath)) return false;
    const id = identifierFromMainFile(file);
    return Boolean(id && familyRegex.test(id) && /-\d+$/.test(id));
  });
}

/** Import the current main SOP for a Ref. SOP family (e.g. QAGE01) from files/ when missing in DB. */
async function tryImportParentSopFromFiles(
  parentRef: string,
  rootDir: string,
  mainFiles?: ScannedFile[],
): Promise<boolean> {
  if (await findAnnexureParentSop(parentRef)) return true;

  const familyRegex = sopFamilyIdentifierRegex(parentRef);
  const scanned = mainFiles ?? (await scanFilesFolder(rootDir, ["main"]));

  const candidates = scanned
    .filter(
      (file) =>
        !isAnnexureFileName(file.fileName) &&
        detectFileType(file.fileName) === "docx" &&
        !isPriorVersionPath(file.relativePath),
    )
    .map((file) => ({ file, identifier: identifierFromMainFile(file) }))
    .filter((c): c is { file: ScannedFile; identifier: string } => {
      if (!c.identifier || !familyRegex.test(c.identifier)) return false;
      return /-\d+$/.test(c.identifier);
    })
    .sort((a, b) => {
      const va = parseRevisionFromSopIdentifier(a.identifier) ?? 0;
      const vb = parseRevisionFromSopIdentifier(b.identifier) ?? 0;
      return vb - va;
    });

  for (const { file } of candidates) {
    const buffer = await fs.readFile(file.absolutePath);
    const result = await processSopFileInput({
      buffer,
      fileName: file.fileName,
      relativePath: file.relativePath,
      skipIfChecksumMatches: true,
    });
    if (result.success || result.skipped) {
      return Boolean(await findAnnexureParentSop(parentRef));
    }
  }

  return false;
}

export async function previewFilesImport(
  rootDir = getFilesImportDir(),
  scopes: ImportScope[] = [...IMPORT_SCOPES],
  parentOverride?: string | null,
): Promise<ImportPreview> {
  await connectDB();
  const parentIdentifier = normalizeParentIdentifier(parentOverride);
  const scanned = sortScannedFiles(await scanFilesFolder(rootDir, scopes));
  let main = 0;
  let annexure = 0;
  let prior = 0;
  let duplicate = 0;
  let obsolete = 0;
  let pendingMain = 0;
  let pendingAnnexure = 0;
  let pendingPrior = 0;
  let unresolvedAnnexures = 0;
  const annexParentRefs = new Set<string>();

  let parentFound: boolean | undefined;
  const mainFilesForParent =
    scopes.includes("annexure") ? await scanFilesFolder(rootDir, ["main"]) : undefined;

  for (const file of scanned) {
    const buffer = await fs.readFile(file.absolutePath);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const isAnnex = isAnnexureFileName(file.fileName);
    const isPrior = isPriorVersionPath(file.relativePath);
    const fileType = detectFileType(file.fileName);

    if (isAnnex) {
      annexure++;
      const annexContent =
        fileType === "docx" ? await extractTextFromBuffer(buffer, fileType) : "";
      const refParent =
        fileType === "docx"
          ? await extractRefSopNoFromAnnexure({ content: annexContent, buffer })
          : undefined;
      const meta = extractSopContentMetadata({
        content: annexContent,
        fileName: file.fileName,
        relativePath: file.relativePath,
      });
      const resolved = resolveAnnexureParentIdentifier(
        { parentIdentifier: refParent ?? meta.parentIdentifier },
        parentIdentifier,
      );
      if (!resolved) unresolvedAnnexures++;
      else annexParentRefs.add(resolved);
    } else if (isPrior) prior++;
    else main++;

    if (await isAlreadyImported(checksum)) {
      duplicate++;
      continue;
    }

    if (isAnnex) pendingAnnexure++;
    else if (isPrior) pendingPrior++;
    else pendingMain++;

    if (!isAnnex && !isPrior) {
      const meta = extractSopContentMetadata({ fileName: file.fileName, relativePath: file.relativePath });
      if (meta.identifier && (await isFamilyObsolete(meta.identifier))) {
        obsolete++;
      }
    }
  }

  const pending = pendingMain + pendingAnnexure + pendingPrior;

  if (scopes.includes("annexure") && mainFilesForParent && annexParentRefs.size) {
    parentFound = (
      await Promise.all(
        [...annexParentRefs].map((ref) => parentSopAvailable(ref, rootDir, mainFilesForParent)),
      )
    ).every(Boolean);
  }

  return {
    importDir: rootDir,
    scopes,
    parentIdentifier,
    parentFound,
    unresolvedAnnexures,
    total: scanned.length,
    main,
    annexure,
    prior,
    pending,
    pendingMain,
    pendingAnnexure,
    pendingPrior,
    duplicate,
    obsolete,
  };
}

export async function runFilesFolderImport(jobId: string): Promise<void> {
  const rootDir = getFilesImportDir();
  await connectDB();

  const job = await SopFilesImportJob.findById(jobId);
  if (!job) return;

  const scopes: ImportScope[] =
    job.scopes?.length ? (job.scopes as ImportScope[]) : [...IMPORT_SCOPES];
  const parentOverride = job.parentIdentifier;

  job.status = "running";
  job.phase = "Scanning files folder…";
  job.percent = 0;
  await job.save();

  const scanned = sortScannedFiles(await scanFilesFolder(rootDir, scopes));
  job.totals.scanned = scanned.length;
  await job.save();

  const mainFilesForParent = scopes.includes("annexure")
    ? await scanFilesFolder(rootDir, ["main"])
    : undefined;
  const ensuredParentRefs = new Set<string>();

  const touchedFamilies = new Set<string>();
  const seenChecksums = new Set<string>();
  const familyMaxVersion = new Map<string, number>();
  const archivedByIdentifier = new Map<string, string[]>();

  for (let i = 0; i < scanned.length; i++) {
    const file = scanned[i];
    job.phase = `Processing ${i + 1}/${scanned.length}: ${file.fileName}`;
    job.percent = Math.round(((i + 1) / Math.max(scanned.length, 1)) * 100);

    try {
      const buffer = await fs.readFile(file.absolutePath);
      const checksum = createHash("sha256").update(buffer).digest("hex");

      if (seenChecksums.has(checksum) || (await isManifestDuplicate(checksum))) {
        job.files.push({
          relativePath: file.relativePath,
          fileName: file.fileName,
          status: "duplicate",
          checksum,
          message: "Already processed",
        });
        job.totals.skipped++;
        await job.save();
        continue;
      }
      seenChecksums.add(checksum);

      if (isAnnexureFileName(file.fileName)) {
        try {
          const fileType = detectFileType(file.fileName);
          const annexContent =
            fileType === "docx" ? await extractTextFromBuffer(buffer, fileType) : "";
          const refParent =
            fileType === "docx"
              ? await extractRefSopNoFromAnnexure({ content: annexContent, buffer })
              : undefined;
          const meta = extractSopContentMetadata({
            content: annexContent,
            fileName: file.fileName,
            relativePath: file.relativePath,
          });
          const parentIdentifier = resolveAnnexureParentIdentifier(
            { parentIdentifier: refParent ?? meta.parentIdentifier },
            parentOverride,
          );
          if (!parentIdentifier) {
            job.files.push({
              relativePath: file.relativePath,
              fileName: file.fileName,
              status: "failed",
              message: ANNEXURE_PARENT_HINT,
            });
            job.totals.failed++;
            await job.save();
            continue;
          }

          const parentHasRevision = /-\d+$/.test(parentIdentifier);

          if (!ensuredParentRefs.has(parentIdentifier)) {
            await tryImportParentSopFromFiles(
              parentIdentifier,
              rootDir,
              mainFilesForParent,
            );
            ensuredParentRefs.add(parentIdentifier);
          }

          const linkResult = await linkAnnexureToParent({
            buffer,
            fileName: file.fileName,
            relativePath: file.relativePath,
            parentIdentifier,
            annexureLabel: meta.annexureLabel,
            versionNum: parentHasRevision ? meta.versionNum : undefined,
            checksum,
            skipIfChecksumMatches: true,
          });

          if (linkResult.skipped) {
            const { warning: archiveWarning } = await safeArchiveImportedFile(rootDir, file);
            job.files.push({
              relativePath: file.relativePath,
              fileName: file.fileName,
              status: "duplicate",
              identifier: linkResult.parentIdentifier ?? parentIdentifier,
              checksum,
              message: archiveWarning,
            });
            job.totals.skipped++;
          } else if (linkResult.success) {
            const { archivedPath, warning } = await safeArchiveImportedFile(rootDir, file);
            if (archivedPath) {
              await SopFilesImportManifest.create({
                relativePath: file.relativePath,
                checksum,
                identifier: linkResult.parentIdentifier ?? parentIdentifier,
                documentKind: "annexure",
                jobId: job._id,
                archivedPath,
              });
            }
            job.files.push({
              relativePath: file.relativePath,
              fileName: file.fileName,
              status: "imported",
              identifier: linkResult.parentIdentifier ?? parentIdentifier,
              checksum,
              message: warning ?? meta.annexureLabel,
            });
            job.totals.annexures++;
            job.totals.imported++;
          } else {
            job.files.push({
              relativePath: file.relativePath,
              fileName: file.fileName,
              status: "failed",
              identifier: parentIdentifier,
              message: linkResult.error,
            });
            job.totals.failed++;
          }
        } catch (err) {
          job.files.push({
            relativePath: file.relativePath,
            fileName: file.fileName,
            status: "failed",
            message: err instanceof Error ? err.message : "Annexure import failed",
          });
          job.totals.failed++;
        }
        await job.save();
        continue;
      }

      const isPrior = isPriorVersionPath(file.relativePath);

      const contentMeta = extractSopContentMetadata({
        fileName: file.fileName,
        relativePath: file.relativePath,
      });

      if (!isPrior && contentMeta.identifier && (await isFamilyObsolete(contentMeta.identifier))) {
        const dest = await routeToObsoleteFolder(rootDir, file, contentMeta.identifier);
        job.files.push({
          relativePath: file.relativePath,
          fileName: file.fileName,
          status: "obsolete_routed",
          identifier: contentMeta.identifier,
          checksum,
          message: dest,
        });
        job.totals.obsoleteRouted++;
        await job.save();
        continue;
      }

      const result = await processSopFileInput({
        buffer,
        fileName: file.fileName,
        relativePath: file.relativePath,
        skipIfChecksumMatches: true,
      });

      if (result.skipped) {
        job.files.push({
          relativePath: file.relativePath,
          fileName: file.fileName,
          status: "duplicate",
          identifier: result.identifier,
          checksum: result.checksum,
        });
        job.totals.skipped++;
        await job.save();
        continue;
      }

      if (!result.success) {
        job.files.push({
          relativePath: file.relativePath,
          fileName: file.fileName,
          status: "failed",
          identifier: result.identifier,
          message: result.error,
        });
        job.totals.failed++;
        await job.save();
        continue;
      }

      const { archivedPath, warning } = await safeArchiveImportedFile(rootDir, file);
      if (archivedPath) {
        await SopFilesImportManifest.create({
          relativePath: file.relativePath,
          checksum: result.checksum!,
          identifier: result.identifier,
          documentKind: "main",
          jobId: job._id,
          archivedPath,
        });
      }

      if (result.sopBaseId) {
        touchedFamilies.add(result.sopBaseId);
        const prevMax = familyMaxVersion.get(result.sopBaseId) ?? -1;
        const newVer = result.versionNum ?? 0;
        if (newVer > prevMax) {
          if (prevMax >= 0) {
            const prevIdentifier = `${result.sopBaseId}-${prevMax}`;
            const paths = archivedByIdentifier.get(prevIdentifier) ?? [];
            const relocated = await relocateSupersededVersion(
              rootDir,
              result.sopBaseId,
              prevIdentifier,
              paths,
            );
            if (relocated) {
              job.files.push({
                relativePath: prevIdentifier,
                fileName: prevIdentifier,
                status: "prior_relocated",
                identifier: prevIdentifier,
                message: relocated,
              });
              job.totals.priorRelocated++;
            }
          }
          familyMaxVersion.set(result.sopBaseId, newVer);
        }
        if (result.identifier && archivedPath) {
          const list = archivedByIdentifier.get(result.identifier) ?? [];
          list.push(archivedPath);
          archivedByIdentifier.set(result.identifier, list);
        }
      }

      job.files.push({
        relativePath: file.relativePath,
        fileName: file.fileName,
        status: "imported",
        identifier: result.identifier,
        checksum: result.checksum,
        message: warning,
      });
      job.totals.imported++;
      await job.save();
    } catch (err) {
      job.files.push({
        relativePath: file.relativePath,
        fileName: file.fileName,
        status: "failed",
        message: err instanceof Error ? err.message : "Import failed",
      });
      job.totals.failed++;
      await job.save();
    }
  }

  job.phase = "Reconciling versions…";
  await job.save();

  try {
    await reconcileSopVersions();
    invalidateDashboardSopsCache();
    for (const sopBaseId of touchedFamilies) {
      const family = await SOP.find({ sopBaseId, isObsolete: { $ne: true } });
      if (family.length) await refreshFamilyPriorHeaderDateFlags(family);
    }
  } catch (e) {
    console.error("[files-import] post-import reconcile error:", e);
  }

  job.status = "completed";
  job.phase = "Done";
  job.percent = 100;
  job.finishedAt = new Date();
  await job.save();
}

export function startFilesImportJob(jobId: string): void {
  runFilesFolderImport(jobId).catch(async (err) => {
    console.error("[files-import] job failed:", err);
    await connectDB();
    await SopFilesImportJob.findByIdAndUpdate(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : "Import failed",
      finishedAt: new Date(),
    });
  });
}

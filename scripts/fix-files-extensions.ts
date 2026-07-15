/**
 * Fix files in files/ that lost .pdf/.docx extensions (truncated export names).
 * Detects type from magic bytes and renames in place.
 *
 * Run: npx tsx scripts/fix-files-extensions.ts
 *      npx tsx scripts/fix-files-extensions.ts --dry
 */
import fs from "fs/promises";
import path from "path";
import { getFilesImportDir } from "@/lib/sop-files-import";

const SKIP_DIRS = new Set(["_archive", "_failed", "_obsolete"]);

async function detectExt(filePath: string): Promise<"pdf" | "docx" | null> {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    if (buf.slice(0, 4).toString("ascii") === "%PDF") return "pdf";
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "docx";
    return null;
  } finally {
    await fh.close();
  }
}

async function walk(dir: string, root: string, out: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === ".gitkeep") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      await walk(abs, root, out);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (ext !== ".pdf" && ext !== ".docx") {
        out.push(abs);
      }
    }
  }
}

async function main() {
  const dry = process.argv.includes("--dry");
  const root = getFilesImportDir();
  const targets: string[] = [];
  await walk(root, root, targets);

  console.log(`Found ${targets.length} file(s) without .pdf/.docx extension`);

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of targets) {
    const kind = await detectExt(filePath);
    if (!kind) {
      console.warn(`SKIP (unknown type): ${path.relative(root, filePath)}`);
      skipped++;
      continue;
    }

    const newPath = `${filePath}.${kind}`;
    try {
      await fs.access(newPath);
      console.warn(`SKIP (target exists): ${path.basename(newPath)}`);
      skipped++;
      continue;
    } catch {
      /* ok */
    }

    if (dry) {
      console.log(`WOULD RENAME → ${path.basename(newPath)}`);
      fixed++;
      continue;
    }

    try {
      await fs.rename(filePath, newPath);
      fixed++;
      if (fixed % 100 === 0) console.log(`Fixed ${fixed}…`);
    } catch (err) {
      console.error(`FAIL: ${path.relative(root, filePath)}`, err);
      failed++;
    }
  }

  console.log(`\nDone: ${fixed} renamed, ${skipped} skipped, ${failed} failed${dry ? " (dry run)" : ""}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

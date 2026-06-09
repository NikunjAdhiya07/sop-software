import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import { invalidateDashboardSopsCache } from "@/lib/cache";
import { baseIdentifierFromIdentifier, extractTitleFromContent } from "@/lib/sop-utils";
import { nameFromFilename } from "@/lib/upload";

/** Returns true when the stored name is just the SOP code (not a real title). */
function nameIsJustCode(name: string, identifier: string): boolean {
  if (!name) return true;
  const base = baseIdentifierFromIdentifier(identifier).toUpperCase();
  const n = name.trim().toUpperCase().replace(/[-_\s]/g, "");
  const b = base.replace(/[-_\s]/g, "");
  const id = identifier.trim().toUpperCase().replace(/[-_\s]/g, "");
  // Matches if the stored name is the full identifier, the base code, or just code-with-spaces.
  // An SOP code is letters followed by at least one digit (e.g. PEGE01, QAGE0205); the trailing
  // digit requirement prevents pure-letter titles ("Medical Check Up" → "MEDICALCHECKUP") from
  // being misclassified as a bare code.
  return n === id || n === b || /^[A-Z]{2,}\d+[A-Z0-9]*$/.test(n);
}

/**
 * For every SOP record whose name is just its SOP code, attempt to derive the
 * real title from the original filename and the stored document content.
 * Records that already have a descriptive name are not touched.
 */
export async function backfillSopNames() {
  await connectDB();

  const records = await SOP.find({});
  let updated = 0;
  let skipped = 0;
  const changes: Array<{ identifier: string; old: string; new: string }> = [];

  for (const record of records) {
    if (!nameIsJustCode(record.name, record.identifier)) {
      skipped++;
      continue;
    }

    // 1. Prefer the stored document content (DOCX only — PDF extraction is
    //    unreliable). The document's own title is the authoritative source.
    const fromContent =
      record.fileType === "docx" && record.content
        ? extractTitleFromContent(record.content, record.identifier)
        : null;

    // 2. Fall back to the original filename (often carries junk revision/
    //    language tokens, so it sits below the content title).
    const fromFile = record.originalFileName
      ? nameFromFilename(record.originalFileName)
      : "";

    const newName = fromContent || fromFile || null;

    if (!newName || nameIsJustCode(newName, record.identifier)) {
      skipped++;
      continue;
    }

    changes.push({ identifier: record.identifier, old: record.name, new: newName });
    await record.updateOne({ name: newName });
    updated++;
  }

  invalidateDashboardSopsCache();

  return { updated, skipped, total: records.length, changes };
}

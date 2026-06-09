/**
 * Pure filename/path helpers safe for client and server bundles.
 * Keep Node-only upload logic in lib/upload.ts.
 */

export function detectLanguageFromFilename(filename: string): "English" | "Gujarati" {
  if (/\b(guj|gujarati|_gu|_guj)\b/i.test(filename)) return "Gujarati";
  return "English";
}

/** Resolve upload language from filename/path hints, falling back to the form default. */
export function resolveUploadLanguage(
  relativePath: string,
  formLanguage: string,
): "English" | "Gujarati" {
  const haystack = relativePath.replace(/\\/g, "/");
  if (/\b(gujarati|guj)\b/i.test(haystack)) return "Gujarati";
  if (/\b(english|eng)\b/i.test(haystack)) return "English";
  const fileName = haystack.split("/").pop() ?? haystack;
  if (detectLanguageFromFilename(fileName) === "Gujarati") return "Gujarati";
  if (/\b(eng|english|_en)\b/i.test(fileName)) return "English";
  return formLanguage === "Gujarati" ? "Gujarati" : "English";
}

/**
 * Extract the SOP title from a filename by removing the SOP code prefix(es).
 * e.g. "PEGE06-05_Procedure_for_Garbage_Disposal.pdf" → "Procedure for Garbage Disposal"
 */
export function nameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");

  const parts = base.split(/[A-Z]{2,}[A-Z0-9]*-\d+/i);

  for (let i = parts.length - 1; i >= 0; i--) {
    const raw = parts[i]
      .replace(/^[-_\s.]+/, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (raw.length >= 3) {
      if (raw === raw.toUpperCase() && /[A-Z]{2}/.test(raw)) {
        return raw
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return raw;
    }
  }

  return "";
}

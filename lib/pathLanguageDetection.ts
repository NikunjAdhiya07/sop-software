/**
 * Utility functions for detecting language from file paths
 * Used across the SOP system to consistently identify Gujarati vs English files
 */

/**
 * Returns true if a file path/URL contains signals that it's a Gujarati language asset.
 * Checks for Gujarati Unicode characters, common directory names, and keywords.
 */
export function pathSuggestsGujarati(rawPath: string): boolean {
  const raw = String(rawPath || '');
  const u = raw
    .toLowerCase()
    .replace(/\\/g, '/');
  if (!u) return false;

  // Gujarati unicode chars in path/name are a strong signal
  if (/[઀-૿]/.test(raw)) return true;

  // Try decoded URL text too (best effort)
  try {
    if (/[઀-૿]/.test(decodeURIComponent(raw))) return true;
  } catch {
    // ignore malformed URI sequence
  }

  // Common keywords and patterns
  if (/\bgujarati\b/.test(u)) return true;
  if (/\bગુજરાતી\b/i.test(raw)) return true;
  if (/\/guj(\/|$|[_.-])/i.test(u)) return true;
  if (/[_-]guj([._/\-]|arati)/i.test(u)) return true;
  if (/gujarati\s+sop/i.test(u)) return true;

  return false;
}

type LangFileSlots = {
  docx?: { en?: string; gu?: string };
  pdf?: { en?: string; gu?: string };
};

/**
 * Resolve English/Gujarati document paths from registry file slots.
 * Prefers the en/gu slot assignment from collectVersionFiles; uses path hints
 * only when a file is clearly Gujarati by filename, or when the gu slot holds
 * the second language file after eng is already filled.
 */
export function resolveEngGujFilePaths(files: LangFileSlots): { eng?: string; guj?: string } {
  const eng: { docx?: string; pdf?: string } = {};
  const guj: { docx?: string; pdf?: string } = {};

  const assign = (
    path: string | undefined,
    slot: 'en' | 'gu',
    kind: 'docx' | 'pdf',
  ) => {
    if (!path) return;
    if (pathSuggestsGujarati(path)) {
      if (!guj[kind]) guj[kind] = path;
      return;
    }
    if (slot === 'en') {
      if (!eng[kind]) eng[kind] = path;
      return;
    }
    // gu slot without Gujarati path markers: mis-tagged English, or genuine GUJ
    // with an ambiguous filename — only assign to GUJ once ENG is already set.
    if (!eng[kind]) eng[kind] = path;
    else if (!guj[kind]) guj[kind] = path;
  };

  assign(files.docx?.en, 'en', 'docx');
  assign(files.docx?.gu, 'gu', 'docx');
  assign(files.pdf?.en, 'en', 'pdf');
  assign(files.pdf?.gu, 'gu', 'pdf');

  const engPath = eng.docx || eng.pdf;
  const gujPath = guj.docx || guj.pdf;
  return {
    ...(engPath ? { eng: engPath } : {}),
    ...(gujPath ? { guj: gujPath } : {}),
  };
}

/**
 * Detect language from document metadata, with path-based fallback.
 * Priority: explicit language field > path hints > default to English
 */
export function detectDocumentLanguage(doc: {
  language?: string;
  filePath?: string;
  fileUrl?: string;
}): 'English' | 'Gujarati' {
  const langField = String(doc?.language || '').trim().toLowerCase();

  // Explicit language field takes priority
  if (langField === 'gujarati' || langField === 'guj') return 'Gujarati';

  // Path-based detection when language field is missing or wrong
  const pathStr = String(doc?.filePath || doc?.fileUrl || '');
  if (pathStr && pathSuggestsGujarati(pathStr)) return 'Gujarati';

  return 'English';
}

/** Map Unicode / Word dash characters to ASCII hyphen so QAQC01–11 (en-dash) matches QAQC01-11. */
export function normalizeUnicodeHyphens(s: string): string {
  return s.replace(/[‐-―−﹘﹣－]/g, '-');
}

function toAsciiHyphens(s: string): string {
  return normalizeUnicodeHyphens(s);
}

/** BOM / zero-width spaces sometimes appear in copied Excel or DB exports */
function stripInvisible(s: string): string {
  return s.replace(/[​-‍﻿]/g, '');
}

/**
 * Normalize spaces that act as separator between the SOP number and revision
 * (e.g. URL-encoded "MAGE20 28" → "MAGE20-28").
 * Only replaces a single space flanked by alphanumeric characters,
 * so multi-word names are not accidentally collapsed.
 */
function normalizeSpaceAsHyphen(s: string): string {
  // Replace space between digit-sequence and digit-sequence (SOP code separator)
  // e.g. "MAGE20 28" → "MAGE20-28"
  return s.replace(/([A-Za-z]\d+)\s+(\d+)(?=[\s_-]|$)/g, '$1-$2');
}

/**
 * Canonical SOP code for matching registry rows to SOPVersionArtifacts.
 * Collapses: QAQC01-11 vs QAQC1-11, QAQC01-010 vs QAQC01-10, QAQC104-08 vs QAQC104-8.
 * Handles en-dashes and other hyphen variants from filenames / Excel.
 */
export function normalizeSopIdentifierKey(id: string): string {
  let raw = stripInvisible((id || '').trim().toUpperCase());
  raw = normalizeSpaceAsHyphen(raw);
  let u = raw.replace(/\s+/g, '');
  u = toAsciiHyphens(u);
  // Convert underscores to hyphens and collapse multiple hyphens
  u = u.replace(/_/g, '-').replace(/-{2,}/g, '-');

  const m = u.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
  if (m) {
    const letters = m[1].toUpperCase();
    const docNum = parseInt(m[2], 10);
    const rev = parseInt(m[3], 10);
    return `${letters}${docNum}-${rev}`;
  }

  // Fallback: last segment = revision number (handles odd separators if main regex fails)
  const lastHyphen = u.lastIndexOf('-');
  if (lastHyphen <= 0) return u;
  let base = u.slice(0, lastHyphen);
  const suffix = u.slice(lastHyphen + 1);
  const rev = parseInt(suffix, 10);
  if (Number.isNaN(rev)) return u;

  base = toAsciiHyphens(base);
  const bm = base.match(/^([A-Z]{2,6})(\d+)$/);
  if (bm) {
    return `${bm[1].toUpperCase()}${parseInt(bm[2], 10)}-${rev}`;
  }
  return `${base}-${rev}`;
}

/**
 * Stable key for joining SOP registry rows to SOPVersionArtifacts regardless of
 * leading zeros (QAGE01-11 vs QAGE1-11) or hyphen Unicode. Prefer this over
 * string equality for artifact maps.
 */
export function versionArtifactsLookupKey(id: string): string {
  const u = stripInvisible((id || '').trim().toUpperCase().replace(/\s+/g, ''));
  const cleaned = toAsciiHyphens(u);
  const m = cleaned.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
  if (m) {
    return `c:${m[1].toUpperCase()}:${parseInt(m[2], 10)}:${parseInt(m[3], 10)}`;
  }
  return `n:${normalizeSopIdentifierKey(id)}`;
}

/**
 * Format an SOP identifier for display with zero-padded section and document numbers.
 * e.g. BSGE1-5 → BSGE01-05, MAGE1-8 → MAGE01-08, MAGE7-4 → MAGE07-04
 * Falls back to the normalized key if the pattern doesn't match.
 */
export function formatSopNoDisplay(id: string): string {
  const nk = normalizeSopIdentifierKey((id || '').trim().toUpperCase());
  const m = nk.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
  if (!m) return nk;
  return `${m[1]}${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`;
}

/**
 * Current approved revision from identifiers like QAGE01-10 → 10 (after normalization).
 * Returns null when there is no numeric `-NN` suffix (e.g. document-only QAGE136).
 */
export function parseRevisionFromSopIdentifier(id: string): number | null {
  const u = normalizeSopIdentifierKey((id || '').trim().toUpperCase());
  const m = u.match(/-(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  /** Include 0 (e.g. QAGE133-0 folders / draft rev) */
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Logical document family: QAGE01-10 and QAGE01-11 both → QAGE:1 (letters + doc index, no revision).
 * Used to show one registry row per SOP with the highest revision only.
 */
export function sopFamilyKeyFromIdentifier(id: string): string | null {
  const u = normalizeSopIdentifierKey((id || '').trim().toUpperCase());
  const m = u.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
  if (!m) return null;
  return `${m[1].toUpperCase()}:${parseInt(m[2], 10)}`;
}

/** Common OCR / typing swaps on the letter prefix (MAGF… vs MAGE… in URLs vs DB). */
const LETTER_PREFIX_TYPO_ALIASES: readonly [string, string][] = [
  ['MAGF', 'MAGE'],
  ['MAGE', 'MAGF'],
];

function addLetterPrefixTypoAliases(set: Set<string>) {
  const snapshot = [...set];
  for (const s of snapshot) {
    for (const [a, b] of LETTER_PREFIX_TYPO_ALIASES) {
      if (s.startsWith(a)) {
        const alt = b + s.slice(a.length);
        set.add(alt);
        set.add(normalizeSopIdentifierKey(alt));
      }
    }
  }
}

/**
 * All identifier strings to try when matching Mongo SOP / library / version artifacts
 * (padding, normalization, common prefix typos).
 */
export function expandSopIdentifierVariants(raw: string): string[] {
  const trimmed = stripInvisible((raw || '').trim());
  if (!trimmed) return [];
  // Treat space between letter+digits and digits as hyphen (e.g. "MAGE20 28" → "MAGE20-28")
  const normalized = normalizeSpaceAsHyphen(trimmed.toUpperCase());
  const u = normalized.replace(/\s+/g, '');
  const out = new Set<string>();
  out.add(u);
  const nk = normalizeSopIdentifierKey(u);
  out.add(nk);

  const m = nk.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
  if (m) {
    const letters = m[1].toUpperCase();
    const doc = parseInt(m[2], 10);
    const rev = parseInt(m[3], 10);
    const docStr = m[2];
    const forms = [
      `${letters}${doc}-${rev}`,
      `${letters}${docStr}-${rev}`,
      `${letters}${String(doc).padStart(2, '0')}-${rev}`,
      `${letters}${String(doc).padStart(3, '0')}-${rev}`,
      `${letters}${doc}-${String(rev).padStart(2, '0')}`,
      `${letters}${doc}-${String(rev).padStart(3, '0')}`,
      /** DB / paths often use zero-padded doc and rev together, e.g. MAGE01-08 vs MAGE1-8 */
      `${letters}${String(doc).padStart(2, '0')}-${String(rev).padStart(2, '0')}`,
      `${letters}${String(doc).padStart(3, '0')}-${String(rev).padStart(2, '0')}`,
      `${letters}${String(doc).padStart(2, '0')}-${String(rev).padStart(3, '0')}`,
      `${letters}${String(doc).padStart(3, '0')}-${String(rev).padStart(3, '0')}`,
    ];
    for (const f of forms) {
      out.add(f);
      out.add(normalizeSopIdentifierKey(f));
    }
  }

  addLetterPrefixTypoAliases(out);
  return [...out].filter(Boolean).slice(0, 64);
}

function escapeMongoRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mongo filter matching any expanded variant of an SOP code (e.g. MAGE12-5 vs MAGE12-05).
 * @param field - `identifier` on SOP / SOPVersionArtifacts; `sopIdentifier` on SOPLibrary.
 */
export function sopIdentifierMatchFilter(
  raw: string,
  field: 'identifier' | 'sopIdentifier' = 'identifier',
): Record<string, unknown> {
  const variants = expandSopIdentifierVariants(raw);
  const uniq = [...new Set(variants.filter(Boolean))];
  if (uniq.length === 0) return { _id: null };
  if (uniq.length === 1) {
    return { [field]: new RegExp(`^${escapeMongoRegex(uniq[0])}$`, 'i') };
  }
  return {
    $or: uniq.map((v) => ({ [field]: new RegExp(`^${escapeMongoRegex(v)}$`, 'i') })),
  };
}

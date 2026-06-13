import path from 'path';
import { normalizePath } from '@/lib/filePathResolver';
import {
  expandSopIdentifierVariants,
  normalizeSopIdentifierKey,
  normalizeUnicodeHyphens,
} from '@/lib/sopIdentifierNormalize';

function looksLikeSopCode(s: string): boolean {
  const u = normalizeUnicodeHyphens((s || '').trim());
  return /^[A-Za-z]{2,6}\d+-\d+$/i.test(u);
}

/** …_1773989092521 → drop trailing Unix-ms style segment */
function stripTrailingNumericTimestamp(stem: string): string {
  const parts = stem.split('_');
  if (parts.length < 2) return stem;
  const last = parts[parts.length - 1] ?? '';
  if (/^\d{10,}$/.test(last)) {
    return parts.slice(0, -1).join('_');
  }
  return stem;
}

/** QAIC28_04 → QAIC28-04 (underscore revision in filenames from batch upload) */
function hyphenateUnderscoreRevision(stem: string): string | null {
  const u = normalizeUnicodeHyphens(stem.trim());
  const m = u.match(/^([A-Za-z]{2,6}\d+)_(\d+)$/i);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * PEGE13-05 - GMP AND ISO….pdf → PEGE13-05; QAIC28-04 Title.docx → QAIC28-04
 * (Code is letters + digits + hyphen + revision, then space / " - " / end / underscore.)
 */
function leadingSopCodeFromLooseStem(stem: string): string | null {
  const u = normalizeUnicodeHyphens((stem || '').trim());
  const m = u.match(/^([A-Za-z]{2,6}\d+-\d+)(?=\s|$|_|[-–—])/i);
  return m ? m[1] : null;
}

function addVariantsForStemProbe(probe: string, out: Set<string>) {
  const loose = leadingSopCodeFromLooseStem(probe);
  if (loose) {
    for (const v of expandSopIdentifierVariants(loose)) out.add(v);
  }
  const head = probe.includes('_') ? probe.split('_')[0] : '';
  if (head && looksLikeSopCode(head)) {
    for (const v of expandSopIdentifierVariants(head)) out.add(v);
  }
  if (looksLikeSopCode(probe)) {
    for (const v of expandSopIdentifierVariants(probe)) out.add(v);
  }
}

/**
 * Derive possible SOP codes from a stored relative path or URL (e.g. MAGE01-08 from …/MAGE01-08_1773989122335.pdf,
 * or QAIC28-04 from …/QAIC28_04_1773989092521.pdf, or PEGE13-05 from …/PEGE13-05 - GMP….pdf).
 */
export function inferSopIdentifiersFromStoredPath(raw: string): string[] {
  const cleaned = (raw || '').trim().split(/[?#]/)[0];
  if (!cleaned) return [];
  const normalized = normalizePath(cleaned).replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  const stem = base.replace(/\.(pdf|docx|doc)$/i, '');
  const out = new Set<string>();

  const core = stripTrailingNumericTimestamp(stem);
  const fromUnderscoreRev = hyphenateUnderscoreRevision(core);
  if (fromUnderscoreRev) {
    for (const v of expandSopIdentifierVariants(fromUnderscoreRev)) out.add(v);
  }

  for (const probe of [stem, core]) {
    addVariantsForStemProbe(probe, out);
  }

  const parent = path.posix.dirname(normalized);
  if (parent && parent !== '.') {
    for (const seg of parent.split('/').filter(Boolean)) {
      const segStem = seg.replace(/\.(pdf|docx|doc)$/i, '');
      addVariantsForStemProbe(segStem, out);
    }
  }

  return [...out].filter(Boolean).slice(0, 48);
}

/**
 * Every `PREFIX##-##` occurrence in the path (folders + filename), e.g. …/PEGE13-05 - Title.pdf
 */
export function extractRawHyphenatedSopCodesFromPath(filePath: string): string[] {
  const cleaned = normalizeUnicodeHyphens(
    normalizePath((filePath || '').trim().split(/[?#]/)[0]).replace(/\\/g, '/'),
  );
  const re = /([A-Za-z]{2,6}\d+-\d+)/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    if (m[1]) found.add(m[1]);
  }
  return [...found];
}

export function collectSopIdentifierCandidates(
  explicitIdentifier: string | null | undefined,
  filePath: string,
): string[] {
  const set = new Set<string>();
  const ex = (explicitIdentifier || '').trim();
  if (ex) {
    for (const v of expandSopIdentifierVariants(ex)) set.add(v);
  }
  for (const raw of extractRawHyphenatedSopCodesFromPath(filePath)) {
    for (const v of expandSopIdentifierVariants(raw)) set.add(v);
  }
  for (const inf of inferSopIdentifiersFromStoredPath(filePath)) {
    set.add(inf);
  }
  /** One Mongo query per canonical SOP code, not per padding variant */
  const byCanon = new Map<string, string>();
  for (const v of set) {
    if (!v) continue;
    const c = normalizeSopIdentifierKey(v);
    if (!byCanon.has(c)) byCanon.set(c, v);
  }
  return [...byCanon.values()].slice(0, 32);
}

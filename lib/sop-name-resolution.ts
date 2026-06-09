import type { ISOP } from "@/models/SOP";

function baseIdentifierFromIdentifier(identifier: string): string {
  const code = identifier.trim().toUpperCase().replace(/_/g, "-");
  if (!code) return code;
  const hyphenated = code.match(/^([A-Z]{2,}[A-Z0-9]*)-\d+$/);
  if (hyphenated) return hyphenated[1];
  const segmented = code.match(/^([A-Z]{2,}-[A-Z]{2,})-\d+$/);
  if (segmented) return segmented[1];
  return code;
}

/** Gujarati Unicode block U+0A80..U+0AFF */
export function hasGujaratiScript(s: string): boolean {
  return /[઀-૿]/.test(s);
}

/**
 * Decide a document's language from the actual script of its extracted text.
 *
 * Filename/path hints are unreliable — a Gujarati SOP is often uploaded with an
 * English-looking code as its filename, which would otherwise tag it "English"
 * and leave its title unresolved. When the body is predominantly Gujarati
 * script, trust the content over the filename guess.
 */
export function languageFromContentScript(
  content: string | undefined | null,
  fallback: "English" | "Gujarati",
): "English" | "Gujarati" {
  if (!content || content.startsWith("[")) return fallback;
  const sample = content.slice(0, 2000);
  const gujarati = (sample.match(/[઀-૿]/g) ?? []).length;
  const latin = (sample.match(/[A-Za-z]/g) ?? []).length;
  // Require a clear Gujarati majority so an English doc with a stray
  // transliterated word isn't misclassified.
  if (gujarati > 20 && gujarati > latin) return "Gujarati";
  return fallback;
}

/** Strip folder paths and leading SOP-code prefixes from a stored name. */
export function cleanSopDisplayName(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";
  if (s.includes("/")) {
    const parts = s
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) s = parts[parts.length - 1];
  }
  s = s.replace(/^[A-Za-z]+\d+(?:[-.]\d+)*[\s_-]*/, "").trim();
  return s;
}

/** True when the stored name is just the SOP code (not a real title). */
export function nameIsJustCode(name: string, identifier: string): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  const base = baseIdentifierFromIdentifier(identifier).toUpperCase();
  const n = trimmed.toUpperCase().replace(/[-_\s]/g, "");
  const b = base.replace(/[-_\s]/g, "");
  const id = identifier.trim().toUpperCase().replace(/[-_\s]/g, "");
  if (n === id || n === b) return true;
  // The code-shaped pattern (LETTERS+DIGITS) must only flag single tokens —
  // a real multi-word title like "Wadhwan-2 Facility" collapses to
  // "WADHWAN2FACILITY" and would otherwise be mistaken for a code.
  return !/\s/.test(trimmed) && /^[A-Z]{2,}\d+[A-Z0-9]*$/.test(n);
}

/** Reject boilerplate / junk names that sometimes land in the DB from bad DOCX parsing. */
export function isPlaceholderSopName(name: string, identifier?: string): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/prior\s*version/i.test(trimmed)) return true;
  if (/^[-–—√✓✗×•·*]+$/.test(trimmed)) return true;
  const collapsed = trimmed.replace(/\s+/g, " ");
  if (/^objective\s*:?\s*$/i.test(collapsed)) return true;
  if (identifier && nameIsJustCode(trimmed, identifier)) return true;
  return false;
}

function nameScore(
  name: string,
  identifier: string,
  preferGujarati: boolean,
  language?: string,
): number {
  const cleaned = cleanSopDisplayName(name);
  if (!cleaned || isPlaceholderSopName(cleaned, identifier)) return -1000;

  const isGuj = hasGujaratiScript(cleaned);
  let score = Math.min(cleaned.length, 300);

  if (preferGujarati) {
    if (isGuj) score += 200;
    else score -= 500;
    if (language === "Gujarati") score += 50;
  } else {
    if (!isGuj) score += 200;
    else score -= 500;
    if (language !== "Gujarati") score += 50;
  }

  return score;
}

/** Pick the best display name from a set of raw SOP records for one family. */
export function pickBestSopName(
  records: ISOP[],
  identifier: string,
  preferGujarati: boolean,
): string | undefined {
  let best: { name: string; score: number } | undefined;

  for (const record of records) {
    const raw = record.name?.trim();
    if (!raw) continue;
    const cleaned = cleanSopDisplayName(raw);
    const score = nameScore(cleaned, identifier, preferGujarati, record.language);
    if (!best || score > best.score) {
      best = { name: cleaned, score };
    }
  }

  return best && best.score > 0 ? best.name : undefined;
}

/** True when a stored name matches the expected script for its language. */
export function nameMatchesLanguage(
  name: string,
  language: "English" | "Gujarati" | undefined,
): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const isGuj = hasGujaratiScript(trimmed);
  if (language === "Gujarati") return isGuj;
  return !isGuj && /[a-zA-Z]{3}/.test(trimmed);
}

/** True when a per-language SOP record should be re-derived from file/content sources. */
export function sopRecordNameNeedsFix(
  name: string,
  identifier: string,
  language: "English" | "Gujarati" | undefined,
): boolean {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || nameIsJustCode(trimmed, identifier)) return true;
  if (isPlaceholderSopName(trimmed, identifier)) return true;
  if (!nameMatchesLanguage(trimmed, language)) return true;
  return false;
}

export type ResolvedSopNames = {
  englishName: string;
  gujaratiName?: string;
  isDualLanguage: boolean;
};

/** Resolve english + gujarati titles for a grouped SOP family. */
export function resolveSopFamilyNames(
  records: ISOP[],
  identifier: string,
  fallbackEnglish?: string,
): ResolvedSopNames {
  const gujaratiCandidate = pickBestSopName(records, identifier, true);

  // Primary display name: a real English title wins, then a provided fallback,
  // then the Gujarati title (so Gujarati-only SOPs show their actual title
  // instead of the bare SOP code), and finally the code itself.
  const englishName =
    pickBestSopName(records, identifier, false) ||
    (fallbackEnglish && !isPlaceholderSopName(fallbackEnglish, identifier)
      ? cleanSopDisplayName(fallbackEnglish)
      : "") ||
    gujaratiCandidate ||
    baseIdentifierFromIdentifier(identifier);

  const gujaratiName =
    gujaratiCandidate && gujaratiCandidate !== englishName ? gujaratiCandidate : undefined;

  const isDualLanguage = Boolean(
    gujaratiName && englishName && !hasGujaratiScript(englishName),
  );

  return { englishName, gujaratiName, isDualLanguage };
}

/** Shared detection of regulatory document chrome (cover pages, gazettes, headers). */

const BOILERPLATE_START_RE =
  /^(?:\d+\s+)?(?:EUROPEAN COMMISSION|EudraLex|Volume\s+\d|The Rules Governing|Brussels|SANCO\/|INTERNATIONAL CONFERENCE ON HARMONISATION|ICH HARMONISED|ICH Harmonised|WHO Library|World Health Organization|PIC\/S|PHARMACEUTICAL INSPECTION)/i;

const BOILERPLATE_SIGNAL_RE = [
  /\bMINISTRY OF HEALTH\b/i,
  /\bMINISTRY OF\b.*\bWELFARE\b/i,
  /\bNOTIFICATION\b/i,
  /\bG\.S\.R\.\s*\d/i,
  /\bNew Delhi\b/i,
  /\bDrugs and Cosmetics Act\b/i,
  /\bDrugs Rules,?\s*1945\b/i,
  /\bWhereas,?\s+a draft\b/i,
  /\bGovernment of India\b/i,
  /\bDepartment of Health\b/i,
  /\bFamily Welfare\b/i,
  /\bvide notification\b/i,
  /\bOfficial Gazette\b/i,
  /\b\d{4}\s+GI\/\d+/i,
  /\bINTERNATIONAL CONFERENCE ON HARMONISATION\b/i,
  /\bICH HARMONISED TRIPARTITE GUIDELINE\b/i,
  /\bICH Harmonised Tripartite Guideline\b/i,
  /\bCurrent Step\s+\d\b/i,
  /\bAt Step\s+\d+\s+of the Process\b/i,
  /\bhas been developed by the appropriate ICH\b/i,
  /\brecommended for adoption to the regulatory bodies\b/i,
  /\bEuropean Union, Japan and USA\b/i,
  /\bThis Guideline has been developed\b/i,
  /\bThis Guide is not intended to define\b/i,
  /\bnot intended to define registration requirements\b/i,
  /\bdoes not affect the ability of the responsible competent authority\b/i,
  /\bmodify pharmacopoeial requirements\b/i,
  /\bRegulatory Members of the ICH Assembly\b/i,
  /\bAdoption by the Regulatory Members\b/i,
  /\bICH Assembly under Step\b/i,
  /\bEditorial corrections approved\b/i,
  /\bapproved by the MC within the core text\b/i,
  /\bunder Step\s+\d+\s+\d+\s+[A-Z]+\b/i,
  /\bsubject to consultation by the regulatory parties\b/i,
  /\bWHO Technical Report Series\b/i,
  /\bWorld Health Organization\b/i,
  /\bCopyright\b/i,
  /\bAll rights reserved\b/i,
  /\bTable of Contents\b/i,
  /\bPage\s+\d+\s+of\s+\d+\b/i,
  /--\s*\d+\s+of\s+\d+\s*--/i,
  /\bDocument History\b/i,
  /\bLegal notice\b/i,
  /\bTABLE OF CONTENTS\b/i,
  /\bLegal basis for publishing\b/i,
  /\bEudraLex\b/i,
  /\bHEALTH AND CONSUMERS\b/i,
  /\bDirectorate-General\b/i,
  /\bMedicinal Product[s]?[–-]\s*quality\b/i,
  /\bEU Guidelines for Good Manufacturing Practice\b/i,
  /\bRules Governing Medicinal Products\b/i,
  /\bVolume\s+4\b/i,
];

const HEADING_ONLY_RE =
  /^(?:SCHEDULE|Schedule|CHAPTER|Chapter|Part|PART|Section|SECTION|Annex|ANNEX|GUIDELINE|Guideline)[\s\-–.:]*[A-Z0-9][\s\-–.:A-Z0-9]*$/i;

export const REQUIREMENT_VERB_RE =
  /\b(shall|must|should|ensure|adequate|required|manufacturer|premises|procedure|validation|documentation|comply|maintain|establish|control|monitoring|hygiene|sanitation|equipment|personnel|appropriate|responsible|defined|implemented|reviewed|approved)\b/i;

function signalCount(text: string): number {
  let n = 0;
  if (BOILERPLATE_START_RE.test(text.trim())) n += 2;
  for (const re of BOILERPLATE_SIGNAL_RE) {
    if (re.test(text)) n++;
  }
  return n;
}

/** Document chrome — not assessable requirement content. */
export function isGuidelineBoilerplate(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 12) return true;
  if (BOILERPLATE_START_RE.test(t)) return true;
  if (signalCount(t) >= 2) return true;
  // Long run-on blocks mixing cover page + chapter header (common in EudraLex PDFs)
  if (t.length > 150 && /\b(EudraLex|EUROPEAN COMMISSION|Volume\s+4)\b/i.test(t)) return true;
  if (/\bLegal basis for publishing\b/i.test(t)) return true;
  for (const re of BOILERPLATE_SIGNAL_RE) {
    if (re.test(t) && t.length < 280) return true;
  }
  if (HEADING_ONLY_RE.test(t) && t.length < 100) return true;
  if (/^Chapter\s+\d/i.test(t) && t.length < 100) return true;
  if (/^Part\s+\d/i.test(t) && t.length < 80) return true;
  if (t.length < 120 && t === t.toUpperCase() && /\b(MINISTRY|NOTIFICATION|ICH|HARMONISED|GUIDELINE|SCHEDULE)\b/.test(t)) {
    return true;
  }
  if (/--\s*\d+\s+of\s+\d+\s*--/.test(t)) return true;
  return false;
}

export function isHeadingOnlyTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (HEADING_ONLY_RE.test(t) && t.length < 100) return true;
  return false;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize whitespace for substring checks. */
export function normalizeGuidelineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** True when `text` appears verbatim inside the stored guideline clause blob. */
export function isTextInGuideline(text: string, clauseText: string): boolean {
  const needle = normalizeGuidelineText(text);
  const hay = normalizeGuidelineText(clauseText);
  if (needle.length < 18 || hay.length < 18) return false;
  if (hay.toLowerCase().includes(needle.toLowerCase())) return true;
  const prefix = needle.slice(0, Math.min(72, needle.length));
  return prefix.length >= 24 && hay.toLowerCase().includes(prefix.toLowerCase());
}

export function substantiveScore(text: string, requirement?: string): number {
  if (isGuidelineBoilerplate(text)) return -1;
  let score = 0;
  if (REQUIREMENT_VERB_RE.test(text)) score += 5;
  if (/\d+\.\d+/.test(text)) score += 2;
  if (text.length >= 50) score += 1;
  if (text.length >= 90) score += 1;
  if (text.length > 320) score -= 4;
  if (requirement) {
    const wordsA = new Set(requirement.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const wordsB = requirement.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    if (wordsA.size && wordsB.length) {
      const overlap = wordsB.filter((w) => wordsA.has(w)).length / wordsA.size;
      score += overlap * 8;
    }
  }
  return score;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "shall", "must", "should",
  "have", "been", "are", "was", "will", "their", "they", "which", "when", "where",
]);

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

/**
 * One concise requirement sentence for display and PDF search — never cover-page chrome.
 */
export function compactRequirementText(text: string, maxLen = 260): string {
  const t = normalizeGuidelineText(text);
  if (!t || isGuidelineBoilerplate(t)) return "";

  const sentences = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [t];

  for (const raw of sentences) {
    const sent = normalizeGuidelineText(raw);
    if (sent.length < 20 || isGuidelineBoilerplate(sent)) continue;
    if (REQUIREMENT_VERB_RE.test(sent) || /\d+\.\d+/.test(sent)) {
      return sent.length <= maxLen ? sent : truncateAtWordBoundary(sent, maxLen);
    }
  }

  for (const raw of sentences) {
    const sent = normalizeGuidelineText(raw);
    if (sent.length >= 20 && !isGuidelineBoilerplate(sent)) {
      return sent.length <= maxLen ? sent : truncateAtWordBoundary(sent, maxLen);
    }
  }

  if (t.length <= maxLen && !isGuidelineBoilerplate(t)) return t;
  return truncateAtWordBoundary(t, maxLen);
}

/** Find where numbered assessable content begins (after cover pages). */
export function findGuidelineContentStart(text: string, clauseNumber?: string): number {
  const num = clauseNumber?.replace(/[^\d.]/g, "") ?? "";
  const candidates: number[] = [];

  if (num) {
    const patterns = [
      new RegExp(`(?:^|\\n)\\s*${escapeRegex(num)}\\.\\d+\\s+[A-Za-z(]`, "m"),
      new RegExp(`(?:^|\\n)\\s*${escapeRegex(num)}\\.\\s+[A-Z][A-Za-z]`, "m"),
      new RegExp(`(?:^|\\n)\\s*${escapeRegex(num)}\\s+[A-Z][A-Za-z]`, "m"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.index !== undefined) candidates.push(m.index);
    }
  }

  const subsection = text.match(/(?:^|\n)\s*\d+\.\d+\s+[A-Za-z(]/m);
  if (subsection?.index !== undefined) candidates.push(subsection.index);

  const afterPageMarker = text.match(/--\s*\d+\s+of\s+\d+\s*--\s*/i);
  if (afterPageMarker?.index !== undefined) {
    candidates.push(afterPageMarker.index + afterPageMarker[0].length);
  }

  const afterLegalBasis = text.match(/\bLegal basis for publishing[^.]*\.\s*/i);
  if (afterLegalBasis?.index !== undefined) {
    candidates.push(afterLegalBasis.index + afterLegalBasis[0].length);
  }

  const partChapter = text.match(/\bPart\s+\d+\s+Chapter\s+\d+[^.]*\.\s*/i);
  if (partChapter?.index !== undefined) {
    candidates.push(partChapter.index + partChapter[0].length);
  }

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].replace(/\s+/g, " ").trim();
    if (s.length >= 30 && substantiveScore(s) >= 5) {
      const idx = text.indexOf(sentences[i]);
      if (idx >= 0) candidates.push(idx);
      break;
    }
  }

  const valid = candidates.filter((i) => i >= 0 && i < text.length);
  return valid.length ? Math.min(...valid) : 0;
}

/** Return clause body with cover pages and gazette preambles removed. */
export function stripGuidelineBoilerplate(clauseText: string, clauseNumber?: string): string {
  const start = findGuidelineContentStart(clauseText, clauseNumber);
  let body = start > 0 ? clauseText.slice(start).trim() : clauseText;

  const paragraphs = body.split(/\n\s*\n+/);
  if (paragraphs.length > 1) {
    let startPara = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const p = normalizeGuidelineText(paragraphs[i]);
      if (!p || isGuidelineBoilerplate(p) || signalCount(p) >= 2) {
        startPara = i + 1;
        continue;
      }
      break;
    }
    if (startPara > 0) {
      const joined = paragraphs.slice(startPara).join("\n\n").trim();
      if (joined.length >= 24) body = joined;
    }
  }

  const lines = body.split("\n");
  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeGuidelineText(lines[i]);
    if (!line) continue;
    if (isGuidelineBoilerplate(line) || (line.length < 40 && HEADING_ONLY_RE.test(line))) {
      lineStart = i + 1;
      continue;
    }
    break;
  }
  body = lines.slice(lineStart).join("\n").trim();

  const sentences = body.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [body];
  for (let i = 0; i < sentences.length; i++) {
    const s = normalizeGuidelineText(sentences[i]);
    if (s.length >= 28 && substantiveScore(s) >= 4) {
      return sentences.slice(i).join(" ").trim();
    }
  }

  return body.length >= 20 ? body : clauseText;
}

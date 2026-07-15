export interface GuidelineSourceLocation {
  sectionNumber: string;
  pageNumber: string | null;
  lineNumber: string | null;
  sourceLine: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

import { isGuidelineBoilerplate } from "@/lib/guidelineBoilerplate";

function isLikelyBoilerplate(line: string): boolean {
  return isGuidelineBoilerplate(line);
}

/** Find character offset of clause text or heading inside a text blob. */
export function findClauseCharOffset(
  text: string,
  clauseText: string,
  clauseNumber: string,
  clauseTitle: string,
): number {
  const trimmedClause = clauseText?.trim() || "";
  for (const len of [240, 160, 120, 80, 50, 30]) {
    if (trimmedClause.length >= len) {
      const needle = trimmedClause.slice(0, len);
      const idx = text.indexOf(needle);
      if (idx >= 0) {
        const { sourceLine } = lineAtOffset(text, idx);
        if (!isLikelyBoilerplate(sourceLine)) return idx;
      }
      const normIdx = normalizeForMatch(text).indexOf(normalizeForMatch(needle));
      if (normIdx >= 0) {
        const ratio = text.length / Math.max(1, normalizeForMatch(text).length);
        const idx2 = Math.max(0, Math.floor(normIdx * ratio));
        const { sourceLine } = lineAtOffset(text, idx2);
        if (!isLikelyBoilerplate(sourceLine)) return idx2;
      }
    }
  }

  if (clauseNumber) {
    const num = escapeRegex(clauseNumber);
    const titleSnippet = clauseTitle ? escapeRegex(clauseTitle.slice(0, 48)) : "";
    const patterns = [
      new RegExp(`(?:^|\\n)\\s*${num}(?:\\s*[.:\\-–]\\s*|\\s+)${titleSnippet}`, "i"),
      new RegExp(`(?:^|\\n)\\s*(?:section|clause|chapter)\\s+${num}\\b`, "i"),
      new RegExp(`\\b${num}\\b\\s*[.:\\-–]\\s*${titleSnippet}`, "i"),
      new RegExp(`\\b${num}\\b`, "i"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.index !== undefined) return m.index;
    }
  }

  if (clauseTitle?.trim()) {
    const titleNeedle = clauseTitle.trim().slice(0, 60);
    if (!/^(?:SCHEDULE|Schedule|CHAPTER|Chapter|Part|PART)\b/i.test(titleNeedle)) {
      const idx = text.toLowerCase().indexOf(titleNeedle.toLowerCase());
      if (idx >= 0) {
        const { sourceLine } = lineAtOffset(text, idx);
        if (!isLikelyBoilerplate(sourceLine)) return idx;
      }
    }
  }

  return -1;
}

function lineAtOffset(text: string, offset: number): { lineNumber: number; sourceLine: string } {
  const before = text.slice(0, Math.max(0, offset));
  const lineNumber = before.split("\n").length;
  const lines = text.split("\n");
  let sourceLine = lines[lineNumber - 1]?.trim() || "";
  if (sourceLine.length < 24 && lines[lineNumber]?.trim()) {
    sourceLine = [sourceLine, lines[lineNumber].trim()].filter(Boolean).join(" ");
  }
  return { lineNumber, sourceLine };
}

function locateInPageTexts(
  pageTexts: string[],
  clauseText: string,
  clauseNumber: string,
  clauseTitle: string,
): GuidelineSourceLocation | null {
  for (let i = 0; i < pageTexts.length; i++) {
    const page = pageTexts[i];
    const offset = findClauseCharOffset(page, clauseText, clauseNumber, clauseTitle);
    if (offset < 0) continue;
    const { lineNumber, sourceLine } = lineAtOffset(page, offset);
    return {
      sectionNumber: clauseNumber || "",
      pageNumber: String(i + 1),
      lineNumber: String(lineNumber),
      sourceLine: sourceLine || clauseText.trim().split("\n")[0]?.slice(0, 400) || "",
    };
  }
  return null;
}

export function locateGuidelineSource(input: {
  rawText: string;
  pageTexts?: string[];
  pageCount?: number;
  clauseText: string;
  clauseNumber: string;
  clauseTitle: string;
}): GuidelineSourceLocation {
  const { rawText, pageTexts, pageCount, clauseText, clauseNumber, clauseTitle } = input;
  const sectionNumber = clauseNumber?.trim() || "";

  if (pageTexts?.length) {
    const inPage = locateInPageTexts(pageTexts, clauseText, clauseNumber, clauseTitle);
    if (inPage) return inPage;
  }

  const offset = findClauseCharOffset(rawText, clauseText, clauseNumber, clauseTitle);
  if (offset >= 0) {
    const { lineNumber, sourceLine } = lineAtOffset(rawText, offset);
    let pageNumber: string | null = null;
    if (pageTexts?.length) {
      let acc = 0;
      for (let i = 0; i < pageTexts.length; i++) {
        const chunk = pageTexts[i] + "\n";
        if (offset < acc + chunk.length) {
          pageNumber = String(i + 1);
          break;
        }
        acc += chunk.length;
      }
    } else if (pageCount && pageCount > 1 && rawText.length > 0) {
      const estimated = Math.ceil(((offset + 1) / rawText.length) * pageCount);
      pageNumber = String(Math.max(1, Math.min(pageCount, estimated)));
    }
    return {
      sectionNumber,
      pageNumber,
      lineNumber: String(lineNumber),
      sourceLine: sourceLine || clauseText.trim().split("\n")[0]?.slice(0, 400) || "",
    };
  }

  const fallbackLine =
    clauseText
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 20 && !isGuidelineBoilerplate(l)) ?? "";

  return {
    sectionNumber,
    pageNumber: null,
    lineNumber: null,
    sourceLine: fallbackLine,
  };
}

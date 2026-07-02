import JSZip from "jszip";
import { extractTextFromBuffer } from "@/lib/extractContent";
import { hashSopContent } from "@/lib/compliance-hashes";

export type DocxPatchResult = {
  success: boolean;
  originalText: string;
  modifiedText: string;
  changeSummary: string;
  buffer?: Buffer;
  error?: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Normalize Unicode dashes, quotes, spaces
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ");
}

/** Extract plain text from all <w:t> nodes inside a block of XML */
function extractWtText(xml: string): string {
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out += decodeXmlEntities(m[1]);
  return out;
}

/** Meaningful words (length > 2, non-stop) for similarity scoring */
function significantWords(text: string): string[] {
  const STOP = new Set(["the","and","for","are","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","its","may","now","use","who","did","let","put","say","she","too","use","via","per"]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Jaccard similarity on word bags */
function jaccardSim(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Replace the first paragraph whose text best matches originalText.
 * Strategy (in order):
 *   1. Exact substring match (normalised)
 *   2. Progressive prefix match (75 %, 50 %, first-3-words)
 *   3. Best Jaccard word-overlap match (≥ 0.20 threshold)
 *
 * Preserves paragraph formatting (<w:pPr>) and the first run's character
 * formatting (<w:rPr>) on the replacement text.
 */
function patchDocumentXml(
  xml: string,
  originalText: string,
  replacementText: string,
): { xml: string; replaced: boolean } {
  const normOrig = normalizeWhitespace(decodeXmlEntities(originalText)).toLowerCase();
  if (normOrig.length < 3) return { xml, replaced: false };

  // Collect all body paragraphs
  const paraRe = /(<w:p\b[^>]*>)([\s\S]*?)(<\/w:p>)/g;
  let pm: RegExpExecArray | null;
  const paras: {
    index: number; full: string; open: string; body: string; close: string; normText: string;
  }[] = [];
  while ((pm = paraRe.exec(xml)) !== null) {
    const body = pm[2];
    const raw = extractWtText(body);
    if (!raw.trim()) continue; // skip empty paragraphs
    paras.push({
      index: pm.index,
      full: pm[0],
      open: pm[1],
      body,
      close: pm[3],
      normText: normalizeWhitespace(raw).toLowerCase(),
    });
  }
  if (paras.length === 0) return { xml, replaced: false };

  // ── Pass 1: exact + prefix substring matches ──────────────────────────
  const origWords = normOrig.split(" ");
  const needles: string[] = [normOrig];
  if (origWords.length > 6)  needles.push(origWords.slice(0, Math.ceil(origWords.length * 0.75)).join(" "));
  if (origWords.length > 4)  needles.push(origWords.slice(0, Math.ceil(origWords.length * 0.5)).join(" "));
  if (origWords.length > 2)  needles.push(origWords.slice(0, 3).join(" "));

  for (const needle of needles) {
    const hit = paras.find((p) => p.normText.includes(needle));
    if (hit) return applyReplace(xml, hit, replacementText);
  }

  // ── Pass 2: fuzzy word-overlap (Jaccard) ─────────────────────────────
  const origSigWords = significantWords(originalText);
  if (origSigWords.length < 2) return { xml, replaced: false };

  let bestScore = 0;
  let bestPara: (typeof paras)[0] | null = null;

  for (const p of paras) {
    const score = jaccardSim(origSigWords, significantWords(p.normText));
    if (score > bestScore) {
      bestScore = score;
      bestPara = p;
    }
  }

  if (bestPara && bestScore >= 0.20) {
    return applyReplace(xml, bestPara, replacementText);
  }

  return { xml, replaced: false };
}

/**
 * Split replacement text into logical paragraphs.
 *
 * We insert a null-byte sentinel before each "clean" section number, then
 * split on those sentinels.  A "clean" position is one that is NOT preceded
 * by another digit or dot — this stops us from splitting inside "4.3.1" at
 * the "3" or "1" sub-parts.
 */
function splitReplacementIntoParas(text: string): string[] {
  // 1. Explicit newlines
  const byNewline = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;

  const SEP = "\x00";

  // 2. Multi-part section numbers like "4.3.1", "4.3.2", "1.2.3.4"
  //    (?<![.\d]) = not preceded by a dot or digit  ← this is the key guard
  const withSec = text.replace(
    /(?<![.\d])(\d+\.\d+\.\d+(?:\.\d+)?\s+(?=[A-Z]))/g,
    SEP + "$1",
  );
  const secParts = withSec.split(SEP).map((s) => s.trim()).filter(Boolean);
  if (secParts.length > 1) return secParts;

  // 3. Two-part section numbers like "4.3", "1.2"
  const withTwo = text.replace(
    /(?<![.\d])(\d+\.\d+\s+(?=[A-Z]))/g,
    SEP + "$1",
  );
  const twoParts = withTwo.split(SEP).map((s) => s.trim()).filter(Boolean);
  if (twoParts.length > 1) return twoParts;

  // 4. Simple numbered list "1. Text 2. Text"
  const withNum = text.replace(
    /(?<![.\d])(\d{1,2}\.\s+(?=[A-Z]))/g,
    SEP + "$1",
  );
  const numParts = withNum.split(SEP).map((s) => s.trim()).filter(Boolean);
  if (numParts.length > 1) return numParts;

  // 5. Lettered list "a) Text b) Text"
  const withLet = text.replace(/(?<=\s)([a-z]\)\s+(?=[A-Z]))/g, SEP + "$1");
  const letParts = withLet.split(SEP).map((s) => s.trim()).filter(Boolean);
  if (letParts.length > 1) return letParts;

  return [text.trim()];
}

function applyReplace(
  xml: string,
  hit: { index: number; full: string; open: string; body: string; close: string },
  replacementText: string,
): { xml: string; replaced: boolean } {
  const pPr = hit.body.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  const firstRPr = hit.body.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0] ?? "";

  const parts = splitReplacementIntoParas(replacementText);

  // Build one <w:p> per logical paragraph, all sharing the same formatting
  const newParas = parts
    .map((part) => {
      const run = `<w:r>${firstRPr}<w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
      return `${hit.open}${pPr}${run}${hit.close}`;
    })
    .join("");

  return {
    xml: xml.slice(0, hit.index) + newParas + xml.slice(hit.index + hit.full.length),
    replaced: true,
  };
}

/**
 * Apply a minimal text fix to a DOCX buffer. Headers, footers, styles, and tables
 * are left untouched — only document body text matching originalText is changed.
 */
export async function applyDocxTextFix(
  docxBuffer: Buffer,
  originalText: string,
  replacementText: string,
): Promise<DocxPatchResult> {
  const originalExtracted = await extractTextFromBuffer(docxBuffer, "docx");

  if (!originalText.trim()) {
    return {
      success: false,
      originalText,
      modifiedText: replacementText,
      changeSummary: "No original text specified",
      error: "originalText is required",
    };
  }

  try {
    const zip = await JSZip.loadAsync(docxBuffer);
    const docPath = "word/document.xml";
    const docFile = zip.file(docPath);
    if (!docFile) {
      return {
        success: false,
        originalText,
        modifiedText: replacementText,
        changeSummary: "document.xml not found",
        error: "Invalid DOCX structure",
      };
    }

    const xml = await docFile.async("string");
    const { xml: patchedXml, replaced } = patchDocumentXml(xml, originalText, replacementText);

    if (!replaced) {
      return {
        success: false,
        originalText,
        modifiedText: replacementText,
        changeSummary: "Could not locate original text in DOCX body",
        error: "Text not found in document.xml",
      };
    }

    zip.file(docPath, patchedXml);
    const outBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const modifiedExtracted = await extractTextFromBuffer(outBuffer, "docx");

    return {
      success: true,
      originalText,
      modifiedText: replacementText,
      changeSummary: `Replaced ${originalText.slice(0, 80)}${originalText.length > 80 ? "…" : ""} in document body`,
      buffer: outBuffer,
    };
  } catch (err) {
    return {
      success: false,
      originalText,
      modifiedText: replacementText,
      changeSummary: "DOCX patch failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Apply fix to plain SOP text content (MongoDB content field). */
export function applyTextContentFix(
  content: string,
  originalText: string,
  replacementText: string,
): { content: string; replaced: boolean } {
  if (!originalText.trim() || !content.includes(originalText)) {
    const idx = content.toLowerCase().indexOf(originalText.toLowerCase());
    if (idx < 0) return { content, replaced: false };
    return {
      content:
        content.slice(0, idx) + replacementText + content.slice(idx + originalText.length),
      replaced: true,
    };
  }
  return { content: content.replace(originalText, replacementText), replaced: true };
}

export function contentHashAfterFix(content: string): string {
  return hashSopContent(content);
}

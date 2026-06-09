import { PDFParse } from "pdf-parse";

// ── Types ──────────────────────────────────────────────────────────────────

export interface OCRResult {
  text: string;
  isScanned: boolean;
  confidence: number;
  pageCount: number;
  processingTimeMs: number;
}

export interface GuidelineClause {
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  keywords: string[];
}

// ── PDF Processing ─────────────────────────────────────────────────────────

export async function processGuidelinePDF(buffer: Buffer): Promise<OCRResult> {
  const t0 = Date.now();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();

  const rawText = result.text ?? "";
  const pageCount = result.total ?? 1;
  const avgCharsPerPage = rawText.length / Math.max(1, pageCount);
  const isScanned = avgCharsPerPage < 50;

  return {
    text: normalizeText(rawText),
    isScanned,
    confidence: isScanned ? 60 : 100,
    pageCount,
    processingTimeMs: Date.now() - t0,
  };
}

// ── Text Normalization ─────────────────────────────────────────────────────

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, "")
    .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (m, a, b) =>
      a.length <= 3 && b.length <= 3 ? "" : m,
    )
    .replace(/\b l \b/g, " 1 ")
    .replace(/\b O \b/g, " 0 ")
    .trim();
}

// ── Guideline Type Detection ───────────────────────────────────────────────

export function identifyGuidelineType(text: string, filename: string): string {
  const t = text.toLowerCase();
  const f = filename.toLowerCase();
  if (t.includes("ich q7") || f.includes("ich-q7") || f.includes("ichq7"))
    return "ICH Q7 - GMP for Active Pharmaceutical Ingredients";
  if (t.includes("ich q10")) return "ICH Q10 - Pharmaceutical Quality System";
  if (t.includes("ich q8")) return "ICH Q8 - Pharmaceutical Development";
  if (t.includes("fda") && t.includes("21 cfr"))
    return "FDA 21 CFR Part 211 - GMP for Finished Pharmaceuticals";
  if (t.includes("who gmp") || (f.includes("who") && t.includes("gmp")))
    return "WHO GMP Guidelines";
  if (t.includes("who") && t.includes("trs")) return "WHO Technical Report Series";
  if (t.includes("iso") && t.includes("9001")) return "ISO 9001 - Quality Management";
  if (t.includes("iso") && t.includes("13485")) return "ISO 13485 - Medical Devices";
  if (t.includes("schedule m")) return "Schedule M - GMP for Pharmaceuticals (India)";
  if (t.includes("eu gmp") || t.includes("eudralex"))
    return "EU GMP - EudraLex Volume 4";
  if (t.includes("pic/s") || t.includes("pics")) return "PIC/S GMP Guide";
  return "Generic Regulatory Guideline";
}

// ── Category Detection ─────────────────────────────────────────────────────

export function categorizeGuideline(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("quality control") || t.includes("testing") || t.includes("laboratory"))
    return "Quality Control";
  if (t.includes("quality assurance")) return "Quality Assurance";
  if (t.includes("manufacturing") || t.includes("production")) return "Manufacturing";
  if (t.includes("documentation") || t.includes("record")) return "Documentation";
  if (t.includes("equipment") || t.includes("calibration") || t.includes("maintenance"))
    return "Equipment & Maintenance";
  if (t.includes("personnel") || t.includes("training")) return "Personnel & Training";
  if (t.includes("storage") || t.includes("material")) return "Storage & Material Handling";
  return "General Compliance";
}

// ── Keyword Extraction ─────────────────────────────────────────────────────

const PHARMA_KEYWORDS = [
  "quality", "manufacturing", "documentation", "validation", "qualification",
  "control", "assurance", "testing", "inspection", "audit", "compliance",
  "procedure", "process", "requirement", "standard", "specification",
  "calibration", "maintenance", "training", "personnel", "equipment", "material",
  "storage", "handling", "contamination", "hygiene", "record", "report",
  "review", "approval", "authorization", "deviation", "corrective", "preventive",
  "investigation", "monitoring",
];

export function extractKeywords(text: string): string[] {
  const t = text.toLowerCase();
  return PHARMA_KEYWORDS.filter((kw) => t.includes(kw));
}

// ── Clause Extraction ──────────────────────────────────────────────────────

const CLAUSE_PATTERNS = [
  /(\d+(?:\.\d+)*)\s+([A-Z][^\n]{3,})/g,
  /Section\s+([A-Z]\.?\d*):?\s*([^\n]+)/gi,
  /Clause\s+(\d+)\s*[-–]\s*([^\n]+)/gi,
  /Article\s+(\d+(?:\.\d+)*)\s+([^\n]+)/gi,
];

export function extractClauses(normalizedText: string, fallbackName: string): GuidelineClause[] {
  for (const pattern of CLAUSE_PATTERNS) {
    const matches: { number: string; title: string; index: number }[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(normalizedText)) !== null) {
      matches.push({ number: m[1], title: m[2].trim().slice(0, 120), index: m.index });
    }
    if (matches.length >= 2) {
      return matches.map((match, i) => {
        const start = match.index + match.number.length + match.title.length + 1;
        const end = i + 1 < matches.length ? matches[i + 1].index : normalizedText.length;
        const clauseText = normalizedText.slice(start, end).trim().slice(0, 5000);
        return {
          clauseNumber: match.number,
          clauseTitle: match.title,
          clauseText,
          keywords: extractKeywords(clauseText),
        };
      });
    }
  }

  // Fallback: single clause with full text
  return [
    {
      clauseNumber: "1",
      clauseTitle: fallbackName,
      clauseText: normalizedText.slice(0, 5000),
      keywords: extractKeywords(normalizedText),
    },
  ];
}

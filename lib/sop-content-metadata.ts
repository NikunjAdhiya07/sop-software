import {
  baseIdentifierFromIdentifier,
  extractIdentifierFromFilename,
  extractSopCodeFromSegment,
  parseUploadPathMetadata,
  sopVersionFields,
  versionFromIdentifier,
} from "@/lib/sop-utils";
import { normalizeSopIdentifierKey } from "@/lib/sopIdentifierNormalize";
import { extractRefSopNoFromText } from "@/lib/annexure-parent-extract";

export type SopDocumentKind = "main" | "annexure" | "unknown";

export type SopContentMetadata = {
  documentKind: SopDocumentKind;
  identifier?: string;
  sopBaseId?: string;
  versionNum?: number;
  version?: string;
  annexureLabel?: string;
  parentIdentifier?: string;
  supersedes?: string;
  title?: string;
};

const ANNEXURE_NAME = /annex(ure)?|appendix/i;
const SKIP_NAME = /cover\s*page|^index$/i;

const SOP_NO_PATTERN =
  /(?:SOP\s*NO\.?|DOCUMENT\s*NO\.?|DOC\.?\s*NO\.?)\s*:?\s*([A-Z]{2,}[A-Z0-9]*-\d+|[A-Z]{2,}-[A-Z]{2,}-\d+)/i;

const SUPERSEDES_PATTERN =
  /SUPERSEDES\s*:?\s*([A-Z]{2,}[A-Z0-9]*-\d+|[A-Z]{2,}-[A-Z]{2,}-\d+)/i;

const ANNEXURE_LABEL_PATTERN = /(annex(ure)?|appendix)\s*[-–]?\s*([IVXLC\d]+)/i;

export function isAnnexureFileName(fileName: string): boolean {
  return ANNEXURE_NAME.test(fileName) && !SKIP_NAME.test(fileName);
}

export function shouldSkipImportFileName(fileName: string): boolean {
  return (
    fileName.startsWith(".") ||
    fileName.startsWith("~$") ||
    SKIP_NAME.test(fileName.replace(/\.[^.]+$/, ""))
  );
}

function extractSopNoFromContent(content: string): string | undefined {
  const match = content.match(SOP_NO_PATTERN);
  if (!match?.[1]) return undefined;
  return normalizeSopIdentifierKey(match[1]);
}

function extractSupersedesFromContent(content: string): string | undefined {
  const match = content.match(SUPERSEDES_PATTERN);
  if (!match?.[1]) return undefined;
  return normalizeSopIdentifierKey(match[1]);
}

function extractAnnexureLabel(fileName: string): string | undefined {
  const base = fileName.replace(/\.[^.]+$/, "");
  const match = base.match(ANNEXURE_LABEL_PATTERN);
  if (match) {
    const roman = match[3]?.trim();
    const prefix = /annex/i.test(match[1]) ? "Annexure" : "Appendix";
    return roman ? `${prefix}-${roman}` : prefix;
  }
  if (ANNEXURE_NAME.test(base)) return base.split(/\s+/)[0] ?? "Annexure";
  return undefined;
}

function parentFromPath(relativePath: string): string | undefined {
  const pathMeta = parseUploadPathMetadata(relativePath);
  if (pathMeta.identifierFromPath) {
    return normalizeSopIdentifierKey(pathMeta.identifierFromPath);
  }
  const segments = relativePath.split(/[/\\]/).filter(Boolean);
  for (let i = segments.length - 2; i >= 0; i--) {
    const code = extractSopCodeFromSegment(segments[i]);
    if (code) return normalizeSopIdentifierKey(code);
  }
  return undefined;
}

function parentIdentifierFromAnnexure(
  fileName: string,
  relativePath: string,
  content?: string,
): string | undefined {
  if (content) {
    const fromRef = extractRefSopNoFromText(content);
    if (fromRef) return fromRef;
    const fromContent = extractSopNoFromContent(content);
    if (fromContent) return fromContent;
  }
  const fromPath = parentFromPath(relativePath);
  if (fromPath) return fromPath;

  const base = fileName.replace(/\.[^.]+$/, "");
  const prefixCode = base.match(/^([A-Z]{2,}[A-Z0-9]*-\d+)\s*[-–_]/i);
  if (prefixCode?.[1]) {
    return normalizeSopIdentifierKey(prefixCode[1]);
  }

  const annexPos = base.search(/annex(?:ure)?|appendix/i);
  const searchIn = annexPos > 0 ? base.slice(0, annexPos) : base;
  const matches = [
    ...searchIn.matchAll(/([A-Z]{2,}[A-Z0-9]*-\d+|[A-Z]{2,}-[A-Z]{2,}-\d+)/gi),
  ];
  if (matches.length) {
    return normalizeSopIdentifierKey(matches[matches.length - 1][1]);
  }
  return undefined;
}

/**
 * Derive document identity from extracted text, filename, and relative path.
 * Content SOP NO. wins over path/filename when present.
 */
export function extractSopContentMetadata(opts: {
  content?: string;
  fileName: string;
  relativePath: string;
}): SopContentMetadata {
  const { content = "", fileName, relativePath } = opts;
  const pathMeta = parseUploadPathMetadata(relativePath);
  const fromFile = normalizeSopIdentifierKey(
    extractIdentifierFromFilename(pathMeta.fileName || fileName),
  );
  const fromContent = content ? extractSopNoFromContent(content) : undefined;
  const fromPath = pathMeta.identifierFromPath
    ? normalizeSopIdentifierKey(pathMeta.identifierFromPath)
    : undefined;

  if (isAnnexureFileName(fileName)) {
    const parentIdentifier = parentIdentifierFromAnnexure(fileName, relativePath, content);
    return {
      documentKind: "annexure",
      annexureLabel: extractAnnexureLabel(fileName),
      parentIdentifier,
      identifier: parentIdentifier,
      sopBaseId: parentIdentifier ? baseIdentifierFromIdentifier(parentIdentifier) : undefined,
      versionNum: parentIdentifier
        ? sopVersionFields(parentIdentifier).versionNum
        : undefined,
    };
  }

  const identifier = fromContent || fromPath || fromFile;
  const version =
    pathMeta.versionFromPath ||
    versionFromIdentifier(identifier) ||
    undefined;
  const { sopBaseId, versionNum, version: resolvedVersion } = sopVersionFields(
    identifier,
    version,
    pathMeta.versionFromPath,
  );

  const subjectMatch = content.match(
    /(?:SUBJECT|વિષય)\s*:?\s*(.+?)\s*(?:EFF\.?\s*DATE|REVIEW\s*DT\.?|SUPERSEDES|PAGE\s*NO\.?|SOP\s*NO\.?|$)/i,
  );
  const title = subjectMatch?.[1]?.replace(/\s+/g, " ").trim();

  return {
    documentKind: "main",
    identifier,
    sopBaseId,
    versionNum,
    version: resolvedVersion,
    supersedes: content ? extractSupersedesFromContent(content) : undefined,
    title: title && title.length >= 3 ? title : pathMeta.titleFromPath ?? undefined,
  };
}

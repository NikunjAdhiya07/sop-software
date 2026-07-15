import { normalizeSopTextForMcq } from "@/lib/mcq-source-text";

export interface SopClause {
  id: string;
  summary: string;
  text: string;
}

const CLAUSE_HEADING =
  /^(\d+(?:\.\d+){0,5})(?:\s+|[.)]\s*)(.+)$/;

// Matches the "--- Annexure-I ---" block markers buildAnnexureSupplement()
// (lib/compliance-sop-content.ts) inserts when annexure file text is folded
// into the generation source. Each marker starts its own addressable clause
// keyed by the annexure label, so clause-wise generation can target annexure
// content directly instead of it being silently absorbed into whichever
// numbered clause happened to precede it.
const ANNEXURE_BLOCK_MARKER = /^-{2,}\s*(.+?)\s*-{2,}$/;

const MAX_CLAUSE_TEXT = 900;
const MAX_CLAUSES = 120;

/** Regex-first clause split — no API cost. Falls back to paragraph chunks. */
export function parseClausesFromText(raw: string): SopClause[] {
  const text = normalizeSopTextForMcq(raw);
  if (!text) return [];

  const lines = text.split("\n");
  const clauses: SopClause[] = [];
  let current: SopClause | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const annexureMarker = trimmed.match(ANNEXURE_BLOCK_MARKER);
    const m = trimmed.match(CLAUSE_HEADING);
    if (annexureMarker) {
      if (current) clauses.push(trimClause(current));
      current = {
        id: annexureMarker[1].slice(0, 40),
        summary: annexureMarker[1].slice(0, 100),
        text: "",
      };
    } else if (m && m[1].length <= 12) {
      if (current) clauses.push(trimClause(current));
      current = {
        id: m[1],
        summary: m[2].slice(0, 100),
        text: trimmed,
      };
    } else if (current) {
      const next = current.text ? `${current.text}\n${trimmed}` : trimmed;
      current.text = next.length > MAX_CLAUSE_TEXT ? next.slice(0, MAX_CLAUSE_TEXT) : next;
    }
  }
  if (current) clauses.push(trimClause(current));

  if (clauses.length >= 5) return clauses.slice(0, MAX_CLAUSES);
  return parseParagraphClauses(text);
}

function trimClause(c: SopClause): SopClause {
  return {
    id: c.id,
    summary: c.summary,
    text: c.text.length > MAX_CLAUSE_TEXT ? c.text.slice(0, MAX_CLAUSE_TEXT) : c.text,
  };
}

function parseParagraphClauses(text: string): SopClause[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 50);
  return paras.slice(0, MAX_CLAUSES).map((p, i) => {
    const first = p.split("\n")[0]?.trim() ?? "";
    return {
      id: `§${i + 1}`,
      summary: first.slice(0, 100),
      text: p.slice(0, MAX_CLAUSE_TEXT),
    };
  });
}

export function normalizeClauseId(id: string): string {
  return normalizeMcqClauseRef(id);
}

/** Canonical clause key — aligns bank sopReference with parsed clause ids. */
export function normalizeMcqClauseRef(ref?: string | null): string {
  if (!ref?.trim()) return "";
  let s = ref.trim().toLowerCase().replace(/\s+/g, "").replace(/^§/, "s");
  s = s.replace(/^\[+|\]+$/g, "");
  const numbered = s.match(/(?:^s)?(\d+(?:\.\d+){0,5})(?:$|[^0-9.])/);
  if (numbered?.[1]) return numbered[1];
  if (/^s?\d+(?:\.\d+)*$/.test(s)) return s.replace(/^s(?=\d)/, "") || s;
  if (/^s\d+$/.test(s)) return s;
  return s;
}

export function clauseRefsMatch(a: string, b: string): boolean {
  const na = normalizeMcqClauseRef(a);
  const nb = normalizeMcqClauseRef(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Strict match for coverage — avoids "1" falsely covering clause "1.2". */
export function clauseRefsMatchExact(a: string, b: string): boolean {
  const na = normalizeMcqClauseRef(a);
  const nb = normalizeMcqClauseRef(b);
  return !!na && !!nb && na === nb;
}

export function isClauseCovered(clauseId: string, coveredRefs: Set<string> | Iterable<string>): boolean {
  for (const ref of coveredRefs) {
    if (clauseRefsMatchExact(clauseId, ref)) return true;
  }
  return false;
}

/** Clauses not yet represented in the bank (by sopReference). */
export function filterUncoveredClauses(
  clauses: SopClause[],
  coveredRefs: Set<string>,
): SopClause[] {
  return clauses.filter((c) => !isClauseCovered(c.id, coveredRefs));
}

export function batchClauses(clauses: SopClause[], size: number): SopClause[][] {
  const batches: SopClause[][] = [];
  for (let i = 0; i < clauses.length; i += size) {
    batches.push(clauses.slice(i, i + size));
  }
  return batches;
}

/** Compact prompt block — one clause per MCQ, no full SOP resend. */
export function formatClauseBatchForPrompt(clauses: SopClause[]): string {
  return clauses
    .map((c) => `[${c.id}] ${c.summary}\n${c.text}`)
    .join("\n\n");
}

/** User prompt for clause-wise MCQ batch — includes ids + a concrete JSON example. */
export function buildClauseMcqUserPrompt(
  language: string,
  sopIdentifier: string,
  clauses: SopClause[],
): string {
  const ids = clauses.map((c) => c.id);
  const exampleId = ids[0] ?? "1";
  return `${language} · ${sopIdentifier}
Generate exactly ${clauses.length} MCQ(s) — one per clause below.
sopReference MUST be the clause id exactly as shown in brackets (e.g. "${exampleId}").

Required clause ids (${clauses.length}): ${ids.join(", ")}

Example (one question — procedural, not metadata):
{"questions":[{"question":"What must the operator do immediately after a temperature excursion is detected?","optionA":"Record only","optionB":"Notify supervisor and follow deviation steps","optionC":"Discard product at once","optionD":"Restart equipment","correctAnswer":"B","difficulty":"medium","sopReference":"${exampleId}"}]}

Test procedure execution — NOT document number, dates, revision, page count, or section location.

Clauses:
${formatClauseBatchForPrompt(clauses)}`;
}

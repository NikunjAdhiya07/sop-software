import { generateJson } from "@/lib/gemini";
import type { ComplianceFinding, ComplianceAnalysisResult } from "@/lib/complianceEngine";
import { getScoreLabel } from "@/lib/complianceEngine";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GuidelineClauseInput {
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  guidelineName: string;
  folderName: string;
  pdfName?: string;
  guidelineId?: string;
}

// ── Department Intelligence ────────────────────────────────────────────────

const DEPT_KEYWORD_MAP: Record<string, string[]> = {
  store:        ["storage", "handling", "distribution", "packaging", "labeling", "temperature", "humidity", "expiry", "dispatch", "receipt", "warehouse", "inventory", "shelf life", "cool", "cold chain", "finished goods"],
  distribution: ["distribution", "transport", "delivery", "dispatch", "logistics", "chain of custody", "cold chain", "vehicle", "shipment"],
  manufacturing:["manufacture", "production", "batch", "process", "equipment", "validation", "in-process", "yield", "blending", "filling", "tabletting"],
  quality_ctrl: ["testing", "analysis", "specification", "sampling", "method", "instrument", "calibration", "out-of-specification", "oos", "laboratory", "qc"],
  quality_assu: ["audit", "review", "approval", "deviation", "capa", "change control", "validation", "self-inspection", "complaint", "recall", "qa"],
  documentation:["document", "record", "sop", "form", "revision", "controlled", "archive", "retention", "version"],
  hr_training:  ["training", "personnel", "qualification", "hygiene", "health", "gown", "gmp training", "competency"],
  equipment:    ["equipment", "maintenance", "calibration", "qualification", "cleaning", "preventive maintenance", "breakdown", "iq", "oq", "pq"],
  microbiology: ["microbiology", "sterility", "endotoxin", "bioburden", "environmental monitoring", "cleanroom"],
};

function buildContextKeywords(department: string, sopName: string, sopContent: string): Set<string> {
  const haystack = `${department} ${sopName} ${sopContent.slice(0, 3000)}`.toLowerCase();
  const matched = new Set<string>();

  for (const keywords of Object.values(DEPT_KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (haystack.includes(kw)) matched.add(kw);
    }
  }

  // Always include universal pharma compliance keywords
  const universal = ["gmp", "gdp", "gcp", "ich", "who", "fda", "eu gmp", "schedule m", "cGMP", "compliance", "regulatory", "quality"];
  for (const kw of universal) {
    if (haystack.includes(kw.toLowerCase())) matched.add(kw.toLowerCase());
  }

  return matched;
}

function scoreClauseRelevance(clause: GuidelineClauseInput, keywords: Set<string>): number {
  const text = `${clause.clauseTitle} ${clause.clauseText}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    const occurrences = (text.split(kw).length - 1);
    if (occurrences > 0) score += Math.min(occurrences, 3); // cap per-keyword boost at 3
  }
  return score;
}

// ── Clause Selection ───────────────────────────────────────────────────────

const MAX_CLAUSES_PER_BATCH = 60;

function selectAndPrioritizeClauses(
  allClauses: GuidelineClauseInput[],
  keywords: Set<string>,
  maxTotal: number,
): GuidelineClauseInput[] {
  const scored = allClauses.map((c) => ({
    clause: c,
    score: scoreClauseRelevance(c, keywords),
  }));

  // Sort by relevance descending; break ties by original order (stable)
  scored.sort((a, b) => b.score - a.score);

  // Take top maxTotal, but ensure we include at least some from each guideline folder
  const selected: GuidelineClauseInput[] = [];
  const folderSeen = new Map<string, number>();

  // First pass: take top clauses ensuring max 15 per folder for diversity
  for (const { clause } of scored) {
    if (selected.length >= maxTotal) break;
    const count = folderSeen.get(clause.folderName) ?? 0;
    if (count < 15) {
      selected.push(clause);
      folderSeen.set(clause.folderName, count + 1);
    }
  }

  // If still under quota, fill from any remaining
  if (selected.length < maxTotal) {
    for (const { clause } of scored) {
      if (selected.length >= maxTotal) break;
      if (!selected.includes(clause)) selected.push(clause);
    }
  }

  return selected;
}

// ── Gemini Analysis ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior pharmaceutical regulatory compliance auditor specializing in GMP, GDP, ICH, WHO, FDA, and EU guidelines.

Your task: Analyze the SOP against EACH guideline clause provided and return one finding per clause.

CRITICAL OUTPUT RULES:
1. Return EXACTLY one finding object per clause in the input — do NOT skip any clause.
2. Use tiered verbosity to stay within token limits:
   - "compliant": only clauseNumber, clauseTitle, complianceLevel, matchConfidence, issueSeverity:"informational", sopSectionAffected
   - "not-applicable": clauseNumber, clauseTitle, complianceLevel, matchConfidence, issueSeverity:"informational", mismatchExplanation (≤15 words why N/A)
   - "partial": all fields, keep each text field ≤ 25 words
   - "non-compliant": all fields, keep each text field ≤ 40 words
3. Return ONLY valid, complete JSON — absolutely no markdown fences, no truncation.
4. For compliant/N/A clauses, omit empty optional fields entirely to save tokens.

JSON structure:
{
  "findings": [
    {
      "clauseNumber": "string",
      "clauseTitle": "string",
      "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable",
      "matchConfidence": number (0-100),
      "issueSeverity": "critical" | "major" | "minor" | "informational",
      "sopSectionAffected": "string",
      "mismatchExplanation": "string (partial/non-compliant only)",
      "guidelineRequirement": "string (partial/non-compliant only)",
      "suggestedAction": "string (partial/non-compliant only)",
      "sopTextSnippet": "string (partial/non-compliant only, ≤30 words from SOP)",
      "suggestedText": "string (non-compliant only, proposed rewrite ≤40 words)",
      "estimatedEffort": "low" | "medium" | "high"
    }
  ],
  "overallScore": number (0-10),
  "complianceStatus": "Fully Compliant" | "Partially Compliant" | "Non-Compliant"
}`;

async function analyzeBatch(
  sopIdentifier: string,
  sopName: string,
  department: string,
  sopContent: string,
  batch: GuidelineClauseInput[],
  batchLabel: string,
): Promise<{
  findings: ComplianceFinding[];
  overallScore: number;
  error?: string;
}> {
  const clausesBlock = batch
    .map(
      (c) =>
        `[${c.clauseNumber}] ${c.guidelineName} — ${c.clauseTitle}\n${(c.clauseText ?? "").slice(0, 400)}`,
    )
    .join("\n\n");

  const userPrompt = `DEPARTMENT: ${department}
SOP: ${sopIdentifier} — ${sopName}
BATCH: ${batchLabel} | ${batch.length} clauses to analyze

=== GUIDELINE CLAUSES ===
${clausesBlock}

=== SOP CONTENT ===
${sopContent.slice(0, 35000)}

Analyze EVERY clause above against the SOP. Return one finding per clause.`;

  console.log(`[complianceV3] batch ${batchLabel}: sending ${batch.length} clauses to Gemini`);

  const parsed = await generateJson<{
    findings: ComplianceFinding[];
    overallScore: number;
    complianceStatus: string;
  }>(SYSTEM_PROMPT, userPrompt);

  if (!Array.isArray(parsed.findings)) {
    throw new Error(`Batch ${batchLabel}: Gemini returned invalid findings (not an array)`);
  }

  console.log(`[complianceV3] batch ${batchLabel}: received ${parsed.findings.length} findings`);

  const enriched: ComplianceFinding[] = parsed.findings.map((f) => {
    const matched = batch.find((c) => c.clauseNumber === f.clauseNumber);
    return {
      clauseNumber: f.clauseNumber ?? "",
      clauseTitle: f.clauseTitle ?? matched?.clauseTitle ?? "",
      complianceLevel: f.complianceLevel ?? "analysis-failed",
      matchConfidence: f.matchConfidence ?? 0,
      issueSeverity: f.issueSeverity ?? "informational",
      sopSectionAffected: f.sopSectionAffected ?? "",
      mismatchExplanation: f.mismatchExplanation ?? "",
      sopTextSnippet: f.sopTextSnippet ?? "",
      guidelineRequirement: f.guidelineRequirement ?? "",
      suggestedAction: f.suggestedAction ?? "",
      suggestedText: f.suggestedText ?? "",
      estimatedEffort: f.estimatedEffort ?? "medium",
      guidelineName: matched?.guidelineName ?? "",
      folderName: matched?.folderName ?? "",
      guidelineId: matched?.guidelineId,
    };
  });

  return { findings: enriched, overallScore: parsed.overallScore ?? 0 };
}

// ── Main Export ────────────────────────────────────────────────────────────

export async function analyzeSOPComplianceV3(request: {
  sopIdentifier: string;
  sopName: string;
  department: string;
  sopContent: string;
  guidelineClauses: GuidelineClauseInput[];
  maxClauses?: number;
}): Promise<ComplianceAnalysisResult & { cached?: boolean }> {
  const startTime = Date.now();

  console.log(`[complianceV3] starting analysis — SOP: ${request.sopIdentifier}, total clauses available: ${request.guidelineClauses.length}`);

  if (!request.sopContent || request.sopContent.trim().length < 50) {
    console.warn("[complianceV3] SOP content too short, returning empty result");
    return {
      findings: [],
      overallScore: 0,
      complianceStatus: "Non-Compliant",
      compliantCount: 0,
      partialCount: 0,
      nonCompliantCount: 0,
      totalGuidelinesChecked: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // ── Step 1: Build context keywords from department + SOP ──────────────────
  const contextKeywords = buildContextKeywords(
    request.department,
    request.sopName,
    request.sopContent,
  );
  console.log(`[complianceV3] department intelligence: ${contextKeywords.size} context keywords identified`);

  // ── Step 2: Select & prioritize most relevant clauses ─────────────────────
  const maxTotal = request.maxClauses ?? 120;
  const selectedClauses = selectAndPrioritizeClauses(
    request.guidelineClauses,
    contextKeywords,
    maxTotal,
  );
  console.log(`[complianceV3] selected ${selectedClauses.length} most relevant clauses from ${request.guidelineClauses.length} total`);

  // ── Step 3: Split into batches ────────────────────────────────────────────
  const batches: GuidelineClauseInput[][] = [];
  for (let i = 0; i < selectedClauses.length; i += MAX_CLAUSES_PER_BATCH) {
    batches.push(selectedClauses.slice(i, i + MAX_CLAUSES_PER_BATCH));
  }
  console.log(`[complianceV3] split into ${batches.length} batch(es) of ≤${MAX_CLAUSES_PER_BATCH} clauses`);

  // ── Step 4: Analyze each batch — fail loudly on errors ────────────────────
  const allFindings: ComplianceFinding[] = [];
  let batchScoreSum = 0;

  for (let i = 0; i < batches.length; i++) {
    const label = `${i + 1}/${batches.length}`;
    try {
      const batchResult = await analyzeBatch(
        request.sopIdentifier,
        request.sopName,
        request.department,
        request.sopContent,
        batches[i],
        label,
      );
      allFindings.push(...batchResult.findings);
      batchScoreSum += batchResult.overallScore;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[complianceV3] batch ${label} FAILED: ${msg}`);
      // Mark unanalyzed clauses as analysis-failed instead of silently skipping
      for (const clause of batches[i]) {
        allFindings.push({
          clauseNumber: clause.clauseNumber,
          clauseTitle: clause.clauseTitle,
          complianceLevel: "analysis-failed",
          matchConfidence: 0,
          issueSeverity: "informational",
          sopSectionAffected: "",
          mismatchExplanation: `Analysis batch failed: ${msg.slice(0, 100)}`,
          sopTextSnippet: "",
          guidelineRequirement: "",
          suggestedAction: "",
          suggestedText: "",
          estimatedEffort: "medium",
          guidelineName: clause.guidelineName,
          folderName: clause.folderName,
          guidelineId: clause.guidelineId,
        });
      }
      // Rethrow if FIRST batch fails (indicates API/config problem)
      if (i === 0) throw new Error(`Compliance analysis failed: ${msg}`);
    }
  }

  // ── Step 5: Compute final scores ──────────────────────────────────────────
  const compliantCount = allFindings.filter((f) => f.complianceLevel === "compliant").length;
  const partialCount = allFindings.filter((f) => f.complianceLevel === "partial").length;
  const nonCompliantCount = allFindings.filter((f) => f.complianceLevel === "non-compliant").length;
  const failedCount = allFindings.filter((f) => f.complianceLevel === "analysis-failed").length;
  const checkedCount = allFindings.length - failedCount;

  // Average the per-batch scores (weighted equally)
  const avgBatchScore = batches.length > 0 ? batchScoreSum / batches.length : 0;

  // Cross-validate: recalculate from finding counts as a sanity check
  const calcScore =
    checkedCount > 0
      ? Math.max(0, 10 - ((nonCompliantCount + partialCount * 0.4) / checkedCount) * 10)
      : 0;

  // Blend AI score with calculated score for reliability
  const finalScore = batches.length > 0
    ? Math.round(((avgBatchScore * 0.6 + calcScore * 0.4)) * 10) / 10
    : 0;
  const score = Math.min(10, Math.max(0, finalScore));

  console.log(
    `[complianceV3] complete — findings: ${allFindings.length} (✓${compliantCount} ~${partialCount} ✗${nonCompliantCount} ⚠${failedCount}), score: ${score}/10, time: ${Date.now() - startTime}ms`,
  );

  return {
    findings: allFindings,
    overallScore: score,
    complianceStatus: getScoreLabel(score),
    compliantCount,
    partialCount,
    nonCompliantCount,
    totalGuidelinesChecked: selectedClauses.length,
    processingTimeMs: Date.now() - startTime,
  };
}

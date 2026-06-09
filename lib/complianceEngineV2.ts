import { generateJson } from "@/lib/gemini";
import type { ComplianceFinding, ComplianceAnalysisResult } from "@/lib/complianceEngine";
import { getScoreLabel } from "@/lib/complianceEngine";

const BATCH_SIZE = 10;

export async function analyzeSOPComplianceV2(request: {
  sopIdentifier: string;
  sopName: string;
  department: string;
  sopContent: string;
  guidelineClauses: {
    clauseNumber: string;
    clauseTitle: string;
    clauseText: string;
    guidelineName: string;
    folderName: string;
    guidelineId?: string;
  }[];
}): Promise<ComplianceAnalysisResult> {
  const startTime = Date.now();
  const allFindings: ComplianceFinding[] = [];

  const batches: typeof request.guidelineClauses[] = [];
  for (let i = 0; i < request.guidelineClauses.length; i += BATCH_SIZE) {
    batches.push(request.guidelineClauses.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const clausesText = batch
      .map((c) => `Clause ${c.clauseNumber} [${c.guidelineName}]: ${c.clauseTitle}\n${c.clauseText.slice(0, 600)}`)
      .join("\n\n---\n\n");

    const system = `You are a pharmaceutical regulatory compliance auditor. Analyze each clause against the SOP and return ONLY valid JSON:
{"findings":[{"clauseNumber":"string","clauseTitle":"string","complianceLevel":"compliant"|"partial"|"non-compliant"|"not-applicable","matchConfidence":0-100,"issueType":"missing-clause"|"partial-coverage"|"incorrect-implementation"|"outdated-practice"|"ambiguous-wording"|"no-issue"|"not-applicable","issueSeverity":"critical"|"major"|"minor"|"informational","sopSectionAffected":"string","mismatchExplanation":"string","highlightedIssue":"string","sopTextSnippet":"string","guidelineRequirement":"string","suggestedAction":"string","suggestedText":"string","estimatedEffort":"low"|"medium"|"high","priority":1-5}]}`;

    const user = `SOP: ${request.sopIdentifier} - ${request.sopName} (${request.department})

CLAUSES:
${clausesText}

SOP CONTENT:
${request.sopContent.slice(0, 30000)}`;

    try {
      const parsed = await generateJson<{ findings: ComplianceFinding[] }>(system, user);
      const batchFindings = (parsed.findings ?? []).map((f, i) => ({
        ...f,
        guidelineName: batch[i]?.guidelineName ?? "",
        folderName: batch[i]?.folderName ?? "",
        guidelineId: batch[i]?.guidelineId,
      }));
      allFindings.push(...batchFindings);
    } catch {
      batch.forEach((c) =>
        allFindings.push({
          clauseNumber: c.clauseNumber,
          clauseTitle: c.clauseTitle,
          complianceLevel: "analysis-failed",
          matchConfidence: 0,
          issueType: "missing-clause",
          issueSeverity: "informational",
          sopSectionAffected: "",
          mismatchExplanation: "Analysis failed for this clause",
          highlightedIssue: "",
          sopTextSnippet: "",
          guidelineRequirement: c.clauseText.slice(0, 200),
          suggestedAction: "Manual review required",
          suggestedText: "",
          estimatedEffort: "medium",
          priority: 3,
          guidelineName: c.guidelineName,
          folderName: c.folderName,
          guidelineId: c.guidelineId,
        }),
      );
    }
  }

  const compliantCount = allFindings.filter((f) => f.complianceLevel === "compliant").length;
  const partialCount = allFindings.filter((f) => f.complianceLevel === "partial").length;
  const nonCompliantCount = allFindings.filter((f) => f.complianceLevel === "non-compliant").length;
  const total = allFindings.length;

  const scoreNumerator = compliantCount * 10 + partialCount * 5;
  const scoreDenominator = total > 0 ? total * 10 : 1;
  const score = Math.round((scoreNumerator / scoreDenominator) * 10 * 10) / 10;

  return {
    findings: allFindings,
    overallScore: score,
    complianceStatus: getScoreLabel(score),
    compliantCount,
    partialCount,
    nonCompliantCount,
    totalGuidelinesChecked: total,
    processingTimeMs: Date.now() - startTime,
  };
}

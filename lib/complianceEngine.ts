import { generateJson } from "@/lib/gemini";
import { buildComplianceSystemPrompt, buildComplianceUserPrompt } from "@/lib/compliancePrompts";

export interface ComplianceFinding {
  clauseNumber: string;
  clauseTitle: string;
  complianceLevel: "compliant" | "partial" | "non-compliant" | "not-applicable" | "analysis-failed";
  matchConfidence: number;
  issueSeverity: "critical" | "major" | "minor" | "informational";
  sopSectionAffected: string;
  mismatchExplanation: string;
  sopTextSnippet: string;
  guidelineRequirement: string;
  suggestedAction: string;
  suggestedText: string;
  estimatedEffort: "low" | "medium" | "high";
  guidelineName?: string;
  folderName?: string;
  guidelineId?: string;
}

export interface ComplianceAnalysisResult {
  findings: ComplianceFinding[];
  overallScore: number;
  complianceStatus: "Fully Compliant" | "Partially Compliant" | "Non-Compliant";
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  totalGuidelinesChecked: number;
  processingTimeMs: number;
  summary?: string;
}

export function getScoreLabel(score: number): "Fully Compliant" | "Partially Compliant" | "Non-Compliant" {
  if (score >= 8) return "Fully Compliant";
  if (score >= 5) return "Partially Compliant";
  return "Non-Compliant";
}

export async function analyzeSOPCompliance(request: {
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

  const systemPrompt = buildComplianceSystemPrompt();
  const userPrompt = buildComplianceUserPrompt(
    request.sopIdentifier,
    request.sopName,
    request.department,
    request.sopContent,
    request.guidelineClauses,
  );

  const parsed = await generateJson<{
    findings: ComplianceFinding[];
    overallScore: number;
    complianceStatus: "Fully Compliant" | "Partially Compliant" | "Non-Compliant";
    summary?: string;
  }>(systemPrompt, userPrompt);

  const findings: ComplianceFinding[] = (parsed.findings ?? []).map((f, i) => ({
    ...f,
    guidelineName: request.guidelineClauses[i]?.guidelineName ?? "",
    folderName: request.guidelineClauses[i]?.folderName ?? "",
    guidelineId: request.guidelineClauses[i]?.guidelineId,
  }));

  const compliantCount = findings.filter((f) => f.complianceLevel === "compliant").length;
  const partialCount = findings.filter((f) => f.complianceLevel === "partial").length;
  const nonCompliantCount = findings.filter((f) => f.complianceLevel === "non-compliant").length;

  const score = Math.min(10, Math.max(0, parsed.overallScore ?? 0));

  return {
    findings,
    overallScore: score,
    complianceStatus: getScoreLabel(score),
    compliantCount,
    partialCount,
    nonCompliantCount,
    totalGuidelinesChecked: findings.length,
    processingTimeMs: Date.now() - startTime,
    summary: parsed.summary,
  };
}

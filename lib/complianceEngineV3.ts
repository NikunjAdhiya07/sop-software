import { generateJson } from "@/lib/gemini";
import type { ComplianceFinding, ComplianceAnalysisResult } from "@/lib/complianceEngine";
import { getScoreLabel } from "@/lib/complianceEngine";

export async function analyzeSOPComplianceV3(request: {
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
    pdfName?: string;
    guidelineId?: string;
  }[];
  maxClauses?: number;
}): Promise<ComplianceAnalysisResult & { cached?: boolean }> {
  const startTime = Date.now();
  const maxClauses = request.maxClauses ?? 500;
  const clauses = request.guidelineClauses.slice(0, maxClauses);

  if (!request.sopContent || request.sopContent.trim().length < 100) {
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

  const clausesText = clauses
    .map((c) => `[${c.clauseNumber}] ${c.guidelineName} - ${c.clauseTitle}\n${c.clauseText.slice(0, 500)}`)
    .join("\n\n");

  const system = `You are a precise pharmaceutical regulatory compliance auditor.
Analyze the SOP against the listed guideline clauses. Return ONLY valid JSON:
{
  "findings": [
    {
      "clauseNumber": "string",
      "clauseTitle": "string",
      "complianceLevel": "compliant"|"partial"|"non-compliant"|"not-applicable",
      "matchConfidence": number,
      "issueType": "missing-clause"|"partial-coverage"|"incorrect-implementation"|"outdated-practice"|"ambiguous-wording"|"no-issue"|"not-applicable",
      "issueSeverity": "critical"|"major"|"minor"|"informational",
      "sopSectionAffected": "string",
      "mismatchExplanation": "string",
      "highlightedIssue": "string",
      "sopTextSnippet": "string",
      "guidelineRequirement": "string",
      "suggestedAction": "string",
      "suggestedText": "string",
      "estimatedEffort": "low"|"medium"|"high",
      "priority": number
    }
  ],
  "overallScore": number,
  "complianceStatus": "Fully Compliant"|"Partially Compliant"|"Non-Compliant"
}

Be specific. Reference actual SOP section numbers. Only flag genuine regulatory gaps.`;

  const user = `DEPARTMENT: ${request.department}
SOP: ${request.sopIdentifier} - ${request.sopName}

REGULATORY CLAUSES (${clauses.length} total):
${clausesText}

SOP CONTENT:
${request.sopContent.slice(0, 45000)}`;

  const parsed = await generateJson<{
    findings: ComplianceFinding[];
    overallScore: number;
    complianceStatus: "Fully Compliant" | "Partially Compliant" | "Non-Compliant";
  }>(system, user);

  const findings: ComplianceFinding[] = (parsed.findings ?? []).map((f) => {
    const matchedClause = clauses.find((c) => c.clauseNumber === f.clauseNumber);
    return {
      ...f,
      guidelineName: matchedClause?.guidelineName ?? "",
      folderName: matchedClause?.folderName ?? "",
      pdfName: matchedClause?.pdfName ?? "",
      guidelineId: matchedClause?.guidelineId,
    };
  });

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
  };
}

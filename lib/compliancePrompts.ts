export function buildComplianceSystemPrompt(): string {
  return `You are a pharmaceutical regulatory compliance auditor specializing in GMP, ICH, WHO, and FDA guidelines.

Analyze the provided SOP against each guideline clause and return ONLY valid JSON matching this exact structure:
{
  "findings": [
    {
      "clauseNumber": "string",
      "clauseTitle": "string",
      "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable",
      "matchConfidence": number (0-100),
      "issueType": "missing-clause" | "partial-coverage" | "incorrect-implementation" | "outdated-practice" | "ambiguous-wording" | "no-issue" | "not-applicable",
      "issueSeverity": "critical" | "major" | "minor" | "informational",
      "sopSectionAffected": "string (e.g. Section 4.2)",
      "mismatchExplanation": "string",
      "highlightedIssue": "string",
      "sopTextSnippet": "string (relevant excerpt from SOP)",
      "guidelineRequirement": "string (what the guideline requires)",
      "suggestedAction": "string (actionable fix)",
      "suggestedText": "string (exact proposed SOP text)",
      "estimatedEffort": "low" | "medium" | "high",
      "priority": number (1-5, 1=highest)
    }
  ],
  "overallScore": number (0-10),
  "complianceStatus": "Fully Compliant" | "Partially Compliant" | "Non-Compliant",
  "summary": "string"
}

Rules:
- Be precise and evidence-based
- Only flag genuine gaps, not style preferences
- For not-applicable clauses, explain why they don't apply
- Suggest specific, implementable fixes
- Match section numbers from the SOP when referencing sopSectionAffected`;
}

export function buildComplianceUserPrompt(
  sopIdentifier: string,
  sopName: string,
  department: string,
  sopContent: string,
  clauses: { clauseNumber: string; clauseTitle: string; clauseText: string; guidelineName: string }[],
): string {
  const clausesText = clauses
    .map((c) => `Clause ${c.clauseNumber} [${c.guidelineName}]: ${c.clauseTitle}\n${c.clauseText}`)
    .join("\n\n---\n\n");

  return `SOP DETAILS:
Identifier: ${sopIdentifier}
Name: ${sopName}
Department: ${department}

GUIDELINE CLAUSES TO CHECK:
${clausesText}

SOP CONTENT:
${sopContent.slice(0, 50000)}

Analyze each clause against the SOP content and return the JSON findings.`;
}

export function buildBatchCompliancePrompt(
  sopIdentifier: string,
  sopName: string,
  sopContent: string,
  clauses: { clauseNumber: string; clauseTitle: string; clauseText: string; guidelineName: string }[],
): string {
  const clausesText = clauses
    .map((c, i) => `[${i + 1}] Clause ${c.clauseNumber} (${c.guidelineName}): ${c.clauseTitle}\n${c.clauseText.slice(0, 500)}`)
    .join("\n\n");

  return `Analyze this SOP against the regulatory clauses below.

SOP: ${sopIdentifier} - ${sopName}
CLAUSES:
${clausesText}

SOP CONTENT (first 40000 chars):
${sopContent.slice(0, 40000)}`;
}

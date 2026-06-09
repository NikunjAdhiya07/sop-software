import { generateJson } from "@/lib/gemini";
import type { ComplianceFinding } from "@/lib/complianceEngine";

export interface AutoFixResult {
  findingId: string;
  clauseNumber: string;
  originalIssue: string;
  proposedFix: string;
  sectionReference: string;
  confidence: number;
}

export async function generateAutoFix(
  sopContent: string,
  finding: ComplianceFinding & { findingId?: string },
): Promise<AutoFixResult> {
  const system = `You are a pharmaceutical SOP writer. Generate precise, compliant text to fix the identified gap.
Return ONLY valid JSON:
{
  "proposedFix": "string (exact SOP text to add or modify)",
  "sectionReference": "string (which section to modify)",
  "confidence": number (0-100)
}`;

  const user = `SOP CONTENT (excerpt):
${sopContent.slice(0, 20000)}

COMPLIANCE GAP:
Clause: ${finding.clauseNumber} - ${finding.clauseTitle}
Issue: ${finding.mismatchExplanation}
Guideline Requirement: ${finding.guidelineRequirement}
Section Affected: ${finding.sopSectionAffected}

Generate the exact SOP text to fix this gap.`;

  try {
    const result = await generateJson<{
      proposedFix: string;
      sectionReference: string;
      confidence: number;
    }>(system, user);

    return {
      findingId: finding.findingId ?? finding.clauseNumber,
      clauseNumber: finding.clauseNumber,
      originalIssue: finding.mismatchExplanation,
      proposedFix: result.proposedFix ?? finding.suggestedText,
      sectionReference: result.sectionReference ?? finding.sopSectionAffected,
      confidence: result.confidence ?? 70,
    };
  } catch {
    return {
      findingId: finding.findingId ?? finding.clauseNumber,
      clauseNumber: finding.clauseNumber,
      originalIssue: finding.mismatchExplanation,
      proposedFix: finding.suggestedText || finding.suggestedAction,
      sectionReference: finding.sopSectionAffected,
      confidence: 50,
    };
  }
}

export async function generateBulkAutoFixes(
  sopContent: string,
  findings: (ComplianceFinding & { findingId?: string })[],
): Promise<AutoFixResult[]> {
  const actionable = findings.filter(
    (f) => f.complianceLevel === "non-compliant" || f.complianceLevel === "partial",
  );
  return Promise.all(actionable.map((f) => generateAutoFix(sopContent, f)));
}

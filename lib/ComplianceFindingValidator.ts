import type { ComplianceFinding } from "@/lib/complianceEngine";

const VALID_COMPLIANCE_LEVELS = new Set(["compliant", "partial", "non-compliant", "not-applicable", "analysis-failed"]);
const VALID_SEVERITIES = new Set(["critical", "major", "minor", "informational"]);
const VALID_EFFORTS = new Set(["low", "medium", "high"]);

const PLACEHOLDER_RE = /\b(n\/a|not\s+determined|unable\s+to\s+determine|not\s+specified|not\s+found|not\s+addressed|manual\s+review\s+required|review\s+required)\b/i;

export function validateFinding(f: Partial<ComplianceFinding>): f is ComplianceFinding {
  if (!f.clauseNumber || !f.clauseTitle) return false;
  if (!VALID_COMPLIANCE_LEVELS.has(f.complianceLevel ?? "")) return false;
  if (!VALID_SEVERITIES.has(f.issueSeverity ?? "")) return false;
  return true;
}

export function sanitizeFinding(f: Partial<ComplianceFinding>): ComplianceFinding {
  return {
    clauseNumber: f.clauseNumber ?? "unknown",
    clauseTitle: f.clauseTitle ?? "Unknown Clause",
    complianceLevel: VALID_COMPLIANCE_LEVELS.has(f.complianceLevel ?? "")
      ? (f.complianceLevel as ComplianceFinding["complianceLevel"])
      : "analysis-failed",
    matchConfidence: Math.min(100, Math.max(0, f.matchConfidence ?? 0)),
    issueSeverity: VALID_SEVERITIES.has(f.issueSeverity ?? "")
      ? (f.issueSeverity as ComplianceFinding["issueSeverity"])
      : "informational",
    sopSectionAffected: filterPlaceholder(f.sopSectionAffected ?? ""),
    mismatchExplanation: filterPlaceholder(f.mismatchExplanation ?? ""),
    sopTextSnippet: filterPlaceholder(f.sopTextSnippet ?? ""),
    guidelineRequirement: filterPlaceholder(f.guidelineRequirement ?? ""),
    suggestedAction: filterPlaceholder(f.suggestedAction ?? ""),
    suggestedText: filterPlaceholder(f.suggestedText ?? ""),
    estimatedEffort: VALID_EFFORTS.has(f.estimatedEffort ?? "")
      ? (f.estimatedEffort as ComplianceFinding["estimatedEffort"])
      : "medium",
  };
}

function filterPlaceholder(text: string): string {
  if (PLACEHOLDER_RE.test(text)) return "";
  return text;
}

export function sanitizeFindings(findings: Partial<ComplianceFinding>[]): ComplianceFinding[] {
  return findings.map(sanitizeFinding);
}

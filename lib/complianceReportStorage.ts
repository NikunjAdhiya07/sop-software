import ComplianceReport from "@/models/ComplianceReport";
import type { ComplianceFinding } from "@/lib/complianceEngine";
import mongoose from "mongoose";

export async function saveComplianceReport(data: {
  sopId: string;
  sopIdentifier: string;
  sopName: string;
  sopVersion?: string;
  department: string;
  findings: (ComplianceFinding & { guidelineId?: string; folderName?: string })[];
  overallScore: number;
  complianceStatus: string;
  // accepted but not stored — callers may still pass these
  sopContentLength?: number;
  processingTimeMs?: number;
  guidelinesUsed?: unknown;
}) {
  const compliantCount = data.findings.filter((f) => f.complianceLevel === "compliant").length;
  const partialCount = data.findings.filter((f) => f.complianceLevel === "partial").length;
  const nonCompliantCount = data.findings.filter((f) => f.complianceLevel === "non-compliant").length;
  const notApplicableCount = data.findings.filter((f) => f.complianceLevel === "not-applicable").length;
  const total = data.findings.length;

  const reportData = {
    sopId: new mongoose.Types.ObjectId(data.sopId),
    sopIdentifier: data.sopIdentifier,
    sopName: data.sopName,
    sopVersion: data.sopVersion ?? "1.0",
    department: data.department,
    analysisStatus: "completed" as const,
    analysisCompletedAt: new Date(),
    overallScore: data.overallScore,
    complianceStatus: data.complianceStatus as never,
    totalGuidelinesChecked: total,
    compliantCount,
    partialCount,
    nonCompliantCount,
    notApplicableCount,
    findings: data.findings.map((f) => ({
      guidelineId: f.guidelineId ? new mongoose.Types.ObjectId(f.guidelineId) : undefined,
      guidelineName: f.guidelineName ?? "",
      folderName: f.folderName ?? "",
      clauseNumber: f.clauseNumber,
      clauseTitle: f.clauseTitle,
      complianceLevel: f.complianceLevel,
      matchConfidence: f.matchConfidence,
      issueSeverity: f.issueSeverity,
      sopSectionAffected: f.sopSectionAffected,
      mismatchExplanation: f.mismatchExplanation,
      sopTextSnippet: f.sopTextSnippet,
      guidelineRequirement: f.guidelineRequirement,
      suggestedAction: f.suggestedAction,
      suggestedText: f.suggestedText,
      estimatedEffort: f.estimatedEffort,
    })),
    analyzedAt: new Date(),
  };

  return ComplianceReport.findOneAndUpdate(
    { sopId: new mongoose.Types.ObjectId(data.sopId) },
    { $set: reportData },
    { upsert: true, new: true },
  );
}

export async function getComplianceReport(sopId: string) {
  return ComplianceReport.findOne({ sopId: new mongoose.Types.ObjectId(sopId) }).lean();
}

export async function getAllComplianceReports(limit = 100) {
  return ComplianceReport.find({})
    .sort({ analyzedAt: -1 })
    .limit(limit)
    .select("-findings")
    .lean();
}

export async function deleteComplianceReport(reportId: string) {
  return ComplianceReport.findByIdAndDelete(reportId);
}

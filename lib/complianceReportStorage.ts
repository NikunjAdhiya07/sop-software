import ComplianceReport from "@/models/ComplianceReport";
import type { ComplianceFinding } from "@/lib/complianceEngine";
import mongoose from "mongoose";
import { calculateCompliancePercentage } from "@/lib/complianceFormatter";

export async function saveComplianceReport(data: {
  sopId: string;
  sopIdentifier: string;
  sopName: string;
  sopVersion?: string;
  department: string;
  sopContentLength: number;
  findings: (ComplianceFinding & { guidelineId?: string; folderName?: string })[];
  overallScore: number;
  complianceStatus: string;
  processingTimeMs: number;
  guidelinesUsed?: { guidelineId: string; guidelineName: string; folderName: string; totalClauses: number; clausesChecked: number }[];
}) {
  const compliantCount = data.findings.filter((f) => f.complianceLevel === "compliant").length;
  const partialCount = data.findings.filter((f) => f.complianceLevel === "partial").length;
  const nonCompliantCount = data.findings.filter((f) => f.complianceLevel === "non-compliant").length;
  const notApplicableCount = data.findings.filter((f) => f.complianceLevel === "not-applicable").length;
  const total = data.findings.length;

  const compliancePercentage = calculateCompliancePercentage(compliantCount, partialCount, total);

  const reportData = {
    sopId: new mongoose.Types.ObjectId(data.sopId),
    sopIdentifier: data.sopIdentifier,
    sopName: data.sopName,
    sopVersion: data.sopVersion ?? "1.0",
    department: data.department,
    sopContentLength: data.sopContentLength,
    analysisStatus: "completed" as const,
    analysisStartedAt: new Date(Date.now() - data.processingTimeMs),
    analysisCompletedAt: new Date(),
    analysisEngine: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    processingTimeMs: data.processingTimeMs,
    guidelinesUsed: (data.guidelinesUsed ?? []).map((g) => ({
      ...g,
      guidelineId: new mongoose.Types.ObjectId(g.guidelineId),
    })),
    overallScore: data.overallScore,
    complianceStatus: data.complianceStatus as never,
    compliancePercentage,
    scoreBreakdown: {
      totalChecks: total,
      compliantCount,
      partialCount,
      nonCompliantCount,
      notApplicableCount,
      skippedCount: 0,
    },
    findings: data.findings.map((f) => ({
      ...f,
      guidelineId: f.guidelineId ? new mongoose.Types.ObjectId(f.guidelineId) : undefined,
      folderName: f.folderName ?? "",
      pdfName: f.guidelineName ?? "",
      analyzedAt: new Date(),
      aiModelUsed: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    })),
    totalGuidelinesChecked: total,
    compliantCount,
    partialCount,
    nonCompliantCount,
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

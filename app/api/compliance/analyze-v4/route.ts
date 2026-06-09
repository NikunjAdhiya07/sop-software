import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import Guideline from "@/models/Guideline";
import ComplianceReport from "@/models/ComplianceReport";
import { analyzeSOPComplianceV3 } from "@/lib/complianceEngineV3";
import { saveComplianceReport } from "@/lib/complianceReportStorage";
import { requireAuth } from "@/lib/withAuth";

export const maxDuration = 300;

// V4 — same as V3 but with caching: skips re-analysis if a recent report exists
export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const body = await request.json();
    const { sopId, forceRefresh = false, maxClauses = 500 } = body;

    if (!sopId) {
      return NextResponse.json({ success: false, error: "sopId is required" }, { status: 400 });
    }

    const sop = await SOP.findById(sopId).lean();
    if (!sop) return NextResponse.json({ success: false, error: "SOP not found" }, { status: 404 });

    if (!forceRefresh) {
      const existing = await ComplianceReport.findOne({
        sopId,
        analysisStatus: "completed",
      })
        .sort({ analyzedAt: -1 })
        .lean();

      if (existing) {
        return NextResponse.json({
          success: true,
          cached: true,
          sopIdentifier: existing.sopIdentifier,
          sopName: existing.sopName,
          overallScore: existing.overallScore,
          complianceStatus: existing.complianceStatus,
          compliantCount: existing.compliantCount,
          partialCount: existing.partialCount,
          nonCompliantCount: existing.nonCompliantCount,
          totalGuidelinesChecked: existing.totalGuidelinesChecked,
          analyzedAt: existing.analyzedAt,
        });
      }
    }

    const guidelines = await Guideline.find({}).lean();
    if (!guidelines.length) return NextResponse.json({ success: false, error: "No guidelines" }, { status: 404 });

    const guidelineClauses = guidelines.flatMap((g) =>
      g.clauses.map((c) => ({
        clauseNumber: c.number,
        clauseTitle: c.title,
        clauseText: c.text,
        guidelineName: g.name,
        folderName: g.folder,
        guidelineId: g._id.toString(),
      })),
    );

    const result = await analyzeSOPComplianceV3({
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      department: sop.department,
      sopContent: sop.content,
      guidelineClauses,
      maxClauses,
    });

    await saveComplianceReport({
      sopId: sop._id.toString(),
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      sopVersion: sop.version ?? "1.0",
      department: sop.department,
      sopContentLength: sop.content.length,
      findings: result.findings,
      overallScore: result.overallScore,
      complianceStatus: result.complianceStatus,
      processingTimeMs: result.processingTimeMs,
      guidelinesUsed: guidelines.map((g) => ({
        guidelineId: g._id.toString(),
        guidelineName: g.name,
        folderName: g.folder,
        totalClauses: g.clauses.length,
        clausesChecked: g.clauses.length,
      })),
    });

    return NextResponse.json({
      success: true,
      cached: false,
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      overallScore: result.overallScore,
      complianceStatus: result.complianceStatus,
      compliantCount: result.compliantCount,
      partialCount: result.partialCount,
      nonCompliantCount: result.nonCompliantCount,
      totalGuidelinesChecked: result.totalGuidelinesChecked,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 },
    );
  }
}

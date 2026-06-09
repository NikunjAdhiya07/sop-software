import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import SOPGuideline from "@/models/SOPGuideline";
import { analyzeSOPComplianceV3 } from "@/lib/complianceEngineV3";
import { saveComplianceReport } from "@/lib/complianceReportStorage";
import { requireAuth } from "@/lib/withAuth";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const body = await request.json();
    const { sopId, config } = body;

    if (!sopId) {
      return NextResponse.json({ success: false, error: "sopId is required" }, { status: 400 });
    }

    const sop = await SOP.findById(sopId).lean();
    if (!sop) {
      return NextResponse.json({ success: false, error: "SOP not found" }, { status: 404 });
    }

    const guidelines = await SOPGuideline.find({ ocrStatus: "completed" }).lean();
    if (!guidelines.length) {
      return NextResponse.json(
        { success: false, error: "No guidelines found. Upload guideline PDFs in Step 2 first." },
        { status: 404 },
      );
    }

    const guidelineClauses = guidelines.flatMap((g) =>
      g.clauses.map((c) => ({
        clauseNumber: c.clauseNumber,
        clauseTitle: c.clauseTitle,
        clauseText: c.clauseText.slice(0, 3000),
        guidelineName: g.name,
        folderName: g.folderName,
        pdfName: g.pdfName,
        guidelineId: g._id.toString(),
      })),
    );

    const result = await analyzeSOPComplianceV3({
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      department: sop.department,
      sopContent: sop.content,
      guidelineClauses,
      maxClauses: config?.maxClausesToAnalyze ?? 500,
    });

    const guidelinesUsed = guidelines.map((g) => ({
      guidelineId: g._id.toString(),
      guidelineName: g.name,
      folderName: g.folderName,
      pdfName: g.pdfName,
      totalClauses: g.clauses.length,
      clausesChecked: g.clauses.length,
    }));

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
      guidelinesUsed,
    });

    await SOP.updateMany(
      { identifier: sop.identifier },
      {
        complianceStatus:
          result.overallScore >= 8
            ? "compliant"
            : result.overallScore >= 5
              ? "partial"
              : "non-compliant",
      },
    );

    return NextResponse.json({
      success: true,
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

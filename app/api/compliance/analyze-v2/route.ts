import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import Guideline from "@/models/Guideline";
import { analyzeSOPComplianceV2 } from "@/lib/complianceEngineV2";
import { saveComplianceReport } from "@/lib/complianceReportStorage";
import { requireAuth } from "@/lib/withAuth";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const body = await request.json();
    const { sopId } = body;

    if (!sopId) {
      return NextResponse.json({ success: false, error: "sopId is required" }, { status: 400 });
    }

    const sop = await SOP.findById(sopId).lean();
    if (!sop) return NextResponse.json({ success: false, error: "SOP not found" }, { status: 404 });

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

    const result = await analyzeSOPComplianceV2({
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      department: sop.department,
      sopContent: sop.content,
      guidelineClauses,
    });

    const guidelinesUsed = guidelines.map((g) => ({
      guidelineId: g._id.toString(),
      guidelineName: g.name,
      folderName: g.folder,
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

    return NextResponse.json({
      success: true,
      sopIdentifier: sop.identifier,
      overallScore: result.overallScore,
      complianceStatus: result.complianceStatus,
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

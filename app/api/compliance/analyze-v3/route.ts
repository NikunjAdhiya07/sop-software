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

  const t0 = Date.now();

  try {
    // ── 1. Database connection ─────────────────────────────────────────────
    await connectDB();
    const body = await request.json();
    const { sopId, config } = body;

    if (!sopId) {
      return NextResponse.json({ success: false, error: "sopId is required" }, { status: 400 });
    }

    // ── 2. Fetch SOP ───────────────────────────────────────────────────────
    const sop = await SOP.findById(sopId).lean();
    if (!sop) {
      return NextResponse.json({ success: false, error: "SOP not found" }, { status: 404 });
    }
    console.log(`[analyze-v3] SOP loaded: ${sop.identifier} | dept: ${sop.department} | content: ${sop.content?.length ?? 0} chars`);

    if (!sop.content || sop.content.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: `SOP "${sop.identifier}" has no parseable content. Re-upload the PDF.` },
        { status: 422 },
      );
    }

    // ── 3. Fetch guidelines ────────────────────────────────────────────────
    const guidelines = await SOPGuideline.find({ ocrStatus: "completed" })
      .select("name folderName pdfName clauses.clauseNumber clauses.clauseTitle clauses.clauseText")
      .lean();

    if (!guidelines.length) {
      return NextResponse.json(
        { success: false, error: "No guidelines found. Upload guideline PDFs in Step 2 first." },
        { status: 404 },
      );
    }
    console.log(`[analyze-v3] loaded ${guidelines.length} guidelines`);

    // ── 4. Prerequisite validation ─────────────────────────────────────────
    const invalidGuidelines = guidelines.filter((g) => !g.clauses?.length);
    if (invalidGuidelines.length) {
      console.warn(`[analyze-v3] ${invalidGuidelines.length} guidelines have no clauses:`, invalidGuidelines.map((g) => g.name));
    }

    const allClauses = guidelines.flatMap((g) =>
      (g.clauses ?? [])
        .filter((c) => c.clauseNumber && c.clauseTitle)
        .map((c) => ({
          clauseNumber: c.clauseNumber,
          clauseTitle: c.clauseTitle,
          clauseText: (c.clauseText ?? "").slice(0, 3000),
          guidelineName: g.name,
          folderName: g.folderName,
          pdfName: g.pdfName,
          guidelineId: g._id.toString(),
        })),
    );

    if (!allClauses.length) {
      return NextResponse.json(
        { success: false, error: "Guidelines have no valid clauses. Re-upload the guideline PDFs." },
        { status: 422 },
      );
    }
    console.log(`[analyze-v3] prerequisite validation passed — ${allClauses.length} valid clauses across ${guidelines.length} guidelines`);

    // ── 5. AI Compliance Analysis (with dept intelligence) ─────────────────
    const maxClauses = config?.maxClausesToAnalyze ?? 120;
    console.log(`[analyze-v3] launching V3 analysis — maxClauses: ${maxClauses}`);

    const result = await analyzeSOPComplianceV3({
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      department: sop.department,
      sopContent: sop.content,
      guidelineClauses: allClauses,
      maxClauses,
    });

    console.log(`[analyze-v3] analysis done — score: ${result.overallScore}/10 | status: ${result.complianceStatus} | findings: ${result.findings.length} (✓${result.compliantCount} ~${result.partialCount} ✗${result.nonCompliantCount}) | ${result.processingTimeMs}ms`);

    // ── 6. Save results ────────────────────────────────────────────────────
    await saveComplianceReport({
      sopId: sop._id.toString(),
      sopIdentifier: sop.identifier,
      sopName: sop.name,
      sopVersion: sop.version ?? "1.0",
      department: sop.department,
      findings: result.findings,
      overallScore: result.overallScore,
      complianceStatus: result.complianceStatus,
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

    console.log(`[analyze-v3] saved — total wall time: ${Date.now() - t0}ms`);

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
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[analyze-v3] FATAL — ${msg}`, error instanceof Error ? error.stack?.split("\n").slice(0, 5).join(" | ") : "");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

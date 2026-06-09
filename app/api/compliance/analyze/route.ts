import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import Guideline from "@/models/Guideline";
import ComplianceAnalysis from "@/models/ComplianceAnalysis";
import ComplianceReport from "@/models/ComplianceReport";
import { streamComplianceAnalysis } from "@/lib/gemini";
import {
  complianceStatusFromScore,
  getPipelineProgress,
} from "@/lib/pipeline";
import { invalidateDashboardSopsCache } from "@/lib/cache";
import { requireAuth } from "@/lib/withAuth";
import type { IComplianceFinding } from "@/models/ComplianceAnalysis";
import mongoose from "mongoose";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const reportId = request.nextUrl.searchParams.get("reportId");

    if (reportId) {
      const report = await ComplianceReport.findById(reportId).lean();
      if (!report) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
      return NextResponse.json({ success: true, report });
    }

    const reports = await ComplianceReport.find({})
      .sort({ analyzedAt: -1 })
      .limit(200)
      .select("-findings")
      .lean();

    return NextResponse.json({ success: true, reports });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch reports" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const reportId = request.nextUrl.searchParams.get("reportId");
    if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
      return NextResponse.json({ success: false, error: "Valid reportId required" }, { status: 400 });
    }
    await ComplianceReport.findByIdAndDelete(reportId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete report" },
      { status: 500 },
    );
  }
}

function emitLine(controller: ReadableStreamDefaultController, data: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(data)}\n`));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const body = await request.json();
    const sopIdentifier = body.sopIdentifier?.trim();
    const guidelineId = body.guidelineId?.trim();

    if (!sopIdentifier || !guidelineId) {
      return NextResponse.json(
        { error: "sopIdentifier and guidelineId are required" },
        { status: 400 },
      );
    }

    const sops = await SOP.find({ identifier: new RegExp(`^${sopIdentifier}$`, "i") });
    const sop = sops.find((s) => s.language !== "Gujarati") ?? sops[0];
    if (!sop) {
      return NextResponse.json({ error: "SOP not found" }, { status: 404 });
    }

    const guideline = await Guideline.findById(guidelineId);
    if (!guideline) {
      return NextResponse.json({ error: "Guideline not found" }, { status: 404 });
    }

    const systemPrompt = `You are a pharmaceutical regulatory compliance auditor.
Review the SOP against each guideline clause. Return ONLY valid JSON:
{
  "score": number (0-10),
  "findings": [
    {
      "clause": "clause number",
      "title": "clause title",
      "status": "compliant"|"partial"|"non-compliant"|"not-applicable",
      "severity": "critical"|"major"|"minor"|"informational",
      "description": "...",
      "recommendation": "...",
      "confidence": number (0-1)
    }
  ]
}`;

    const clausesText = guideline.clauses
      .map((c) => `Clause ${c.number}: ${c.title}\n${c.text}`)
      .join("\n\n");

    const userPrompt = `Guideline: ${guideline.name} (${guideline.folder})
SOP Identifier: ${sop.identifier}
SOP Name: ${sop.name}

GUIDELINE CLAUSES:
${clausesText}

SOP CONTENT:
${sop.content.slice(0, 60000)}`;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          emitLine(controller, {
            type: "log",
            message: `[${new Date().toISOString()}] Starting compliance analysis for ${sop.identifier}...`,
          });
          emitLine(controller, {
            type: "log",
            message: `[${new Date().toISOString()}] Loaded ${guideline.clauses.length} clauses from ${guideline.name}`,
          });

          let accumulated = "";
          for await (const chunk of streamComplianceAnalysis(systemPrompt, userPrompt)) {
            accumulated += chunk;
            emitLine(controller, {
              type: "log",
              message: `[${new Date().toISOString()}] Receiving analysis stream... (${accumulated.length} chars)`,
            });
          }

          const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("Failed to parse compliance JSON from model");

          const parsed = JSON.parse(jsonMatch[0]) as {
            score: number;
            findings: IComplianceFinding[];
          };

          for (const finding of parsed.findings ?? []) {
            emitLine(controller, { type: "finding", finding });
          }

          const score = Math.min(10, Math.max(0, parsed.score ?? 0));
          const complianceStatus = complianceStatusFromScore(score);

          const analysis = await ComplianceAnalysis.create({
            sopId: sop._id,
            sopIdentifier: sop.identifier,
            guidelineId: guideline._id,
            guidelineName: guideline.name,
            score,
            findings: parsed.findings ?? [],
            clauseCount: guideline.clauses.length,
            analyzedAt: new Date(),
          });

          await SOP.updateMany(
            { identifier: sop.identifier },
            { complianceStatus, pipelineStatus: "approved" },
          );

          invalidateDashboardSopsCache();

          emitLine(controller, {
            type: "complete",
            score,
            findingsCount: parsed.findings?.length ?? 0,
            analysisId: analysis._id.toString(),
            complianceStatus,
            progress: getPipelineProgress("approved"),
          });
        } catch (err) {
          emitLine(controller, {
            type: "error",
            message: err instanceof Error ? err.message : "Analysis failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 },
    );
  }
}

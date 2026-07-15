import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { connectDB } from "@/lib/mongodb";
import SOP, { type ISOP } from "@/models/SOP";
import ComplianceReport from "@/models/ComplianceReport";
import { requireAuth } from "@/lib/withAuth";
import { detectFileType, saveUploadedBuffer } from "@/lib/upload";
import { extractTextFromBuffer } from "@/lib/extractContent";
import { processGuidelinePDF } from "@/lib/ocrProcessor";
import { generateComplianceJson } from "@/lib/llm";
import { invalidateDashboardSopsCache } from "@/lib/server-cache";
import RecheckRun from "@/models/RecheckRun";
import { computeRecheckScore } from "@/lib/recheckScore";
import {
  buildAnnexureSupplementDetailed,
  LINKED_ANNEXURES_MARKER,
  windowSopContentForAudit,
  type AnnexureIncludeInfo,
} from "@/lib/compliance-sop-content";
import { sopIdentifierMatchFilter } from "@/lib/sopIdentifierNormalize";

export const maxDuration = 300;

// Cap the revised SOP (+ annexures) text sent to the model to stay within context limits.
const MAX_SOP_CHARS = 48_000;

interface PriorPoint {
  clauseNumber: string;
  clauseTitle: string;
  guidelineName: string;
  requirement: string;
  gap: string;
  suggestedAction: string;
}

interface PointCheck {
  index: number;
  status: "resolved" | "open";
  evidence: string;
  note: string;
  revisedExcerpt: string;
}

interface NewIssue {
  clauseNumber: string;
  clauseTitle?: string;
  guidelineName?: string;
  title?: string;
  issue: string;
  severity: "low" | "medium" | "high";
  suggestion: string;
}

interface RecheckModelResult {
  pointChecks: PointCheck[];
  newIssues: NewIssue[];
}

function buildSystemPrompt(): string {
  return [
    "You are a senior pharmaceutical GMP compliance auditor.",
    "You are given the full text of a REVISED SOP (which may include LINKED ANNEXURES — forms, logs, and record templates) and a list of compliance gaps that were previously identified against regulatory guidelines (ICH, EU-GMP, WHO, PIC/S).",
    "Do TWO things:",
    "1. For EACH prior gap, decide whether the revised SOP / annexures now ADDRESSES it. status='resolved' if the revised text clearly satisfies the requirement, otherwise status='open'. Quote the supporting sentence from the revised SOP or annexure in 'evidence' when resolved; when open, briefly say what is still missing in 'note'.",
    "1b. For EACH prior gap, ALSO return 'revisedExcerpt': the exact sentence(s) from the REVISED SOP or LINKED ANNEXURE that are most relevant to this requirement — the section that now covers it (whether fully, partially, or not at all). This must always be populated with the closest matching revised text, even when status is 'open'.",
    "1c. Gaps about data not being tracked, missing forms, logs, or record templates MUST be marked resolved when a linked annexure provides that tracking/form evidence.",
    "2. Scan the revised SOP for NEW issues, but be CONSERVATIVE: only raise a new issue when it is a clear, material violation of a SPECIFIC regulatory guideline requirement (name the guideline/clause). Do NOT invent, pad, or force new points. Do NOT raise stylistic, speculative, or minor issues. If nothing material is found, return an empty newIssues array.",
    "Be strict and evidence-based. Do not mark a point resolved unless the revised text genuinely covers it.",
    "Respond with ONLY valid JSON in exactly this shape:",
    '{"pointChecks":[{"index":0,"status":"resolved"|"open","evidence":"string","note":"string","revisedExcerpt":"string"}],"newIssues":[{"clauseNumber":"string","clauseTitle":"string","guidelineName":"string","issue":"string","severity":"low"|"medium"|"high","suggestion":"string"}]}',
    "The 'index' in each pointCheck MUST match the index of the prior gap in the provided list. Return one pointCheck per prior gap.",
  ].join("\n");
}

function buildUserPrompt(priorPoints: PriorPoint[], revisedText: string): string {
  const priorList = priorPoints
    .map((p, i) =>
      [
        `#${i} [${p.guidelineName} ${p.clauseNumber} ${p.clauseTitle}]`,
        `Requirement: ${p.requirement || "(n/a)"}`,
        `Prior gap: ${p.gap || "(n/a)"}`,
        `Suggested action: ${p.suggestedAction || "(n/a)"}`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "PRIOR COMPLIANCE GAPS (index → gap):",
    priorList || "(none)",
    "",
    "REVISED SOP TEXT (may include linked annexures):",
    windowSopContentForAudit(revisedText, MAX_SOP_CHARS),
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const formData = await request.formData();
    const reportId = (formData.get("reportId") as string | null)?.trim();
    const file = formData.get("file") as File | null;

    if (!reportId || !file) {
      return NextResponse.json(
        { success: false, error: "reportId and file are required" },
        { status: 400 },
      );
    }

    const report = await ComplianceReport.findById(reportId);
    if (!report) {
      return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const fileType = detectFileType(file.name);
    if (!fileType) {
      return NextResponse.json(
        { success: false, error: "Unsupported file type — upload a PDF or DOCX" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let revisedText = "";
    if (fileType === "docx") {
      revisedText = await extractTextFromBuffer(buffer, "docx");
    } else {
      const ocr = await processGuidelinePDF(buffer);
      revisedText = ocr.text ?? "";
    }

    if (!revisedText || revisedText.trim().length < 50) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not extract readable text from the uploaded SOP. Upload a DOCX for best results.",
        },
        { status: 422 },
      );
    }

    // Text for LLM audit may include annexures; stored SOP content stays the uploaded procedure only.
    const mainRevisedText = revisedText;
    let auditText = revisedText;
    let annexuresIncluded: AnnexureIncludeInfo[] = [];
    let annexuresSkipped: { label: string; fileName: string; reason: string }[] = [];
    let annexureChars = 0;

    // Fold in linked annexures (forms/logs) so record-tracking gaps can resolve on recheck.
    if (report.sopId) {
      try {
        const primary = (await SOP.findById(report.sopId).lean()) as ISOP | null;
        if (primary) {
          const family = (await SOP.find({
            ...sopIdentifierMatchFilter(primary.identifier),
            isObsolete: { $ne: true },
          }).lean()) as ISOP[];
          const annexureResult = await buildAnnexureSupplementDetailed(
            family.length ? family : [primary],
          );
          annexuresIncluded = annexureResult.included;
          annexuresSkipped = annexureResult.skipped;
          annexureChars = annexureResult.text.length;
          if (annexureResult.text) {
            auditText = [
              `=== MAIN SOP PROCEDURE ===\n${mainRevisedText}`,
              `${LINKED_ANNEXURES_MARKER}\n${annexureResult.text}`,
            ].join("\n\n");
            console.log(
              `[recheck] ${report.sopIdentifier}: merged ${annexureChars} chars from ${annexuresIncluded.length} linked annexure(s): ${annexuresIncluded.map((a) => a.label).join(", ")}`,
            );
          } else {
            console.log(
              `[recheck] ${report.sopIdentifier}: no readable linked annexures (${annexuresSkipped.length} skipped)`,
            );
          }
        }
      } catch (err) {
        console.warn(
          "[recheck] could not load linked annexures:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Prior actionable gaps to re-verify.
    const priorFindings = (report.findings ?? []).filter(
      (f) => f.complianceLevel === "partial" || f.complianceLevel === "non-compliant",
    );
    const priorPoints: PriorPoint[] = priorFindings.map((f) => ({
      clauseNumber: f.clauseNumber ?? "",
      clauseTitle: f.clauseTitle ?? "",
      guidelineName: f.guidelineName ?? "",
      requirement: f.guidelineRequirement ?? "",
      gap: f.mismatchExplanation ?? "",
      suggestedAction: f.suggestedText?.trim() || f.suggestedAction || "",
    }));

    // Targeted per-point check + new-issue scan in one structured call.
    let modelResult: RecheckModelResult = { pointChecks: [], newIssues: [] };
    try {
      modelResult = await generateComplianceJson<RecheckModelResult>(
        buildSystemPrompt(),
        buildUserPrompt(priorPoints, auditText),
        "codex",
      );
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error:
            err instanceof Error
              ? `AI re-check failed: ${err.message}`
              : "AI re-check failed",
        },
        { status: 502 },
      );
    }

    const pointChecks = Array.isArray(modelResult.pointChecks) ? modelResult.pointChecks : [];
    const rawIssues = Array.isArray(modelResult.newIssues) ? modelResult.newIssues : [];

    // Merge model verdicts onto the prior findings; keep the FULL finding snapshot
    // so the client renders each point with the exact same card/data as the report.
    const checkByIndex = new Map<number, PointCheck>();
    for (const c of pointChecks) {
      if (typeof c.index === "number") checkByIndex.set(c.index, c);
    }
    const results = priorFindings.map((f, i) => {
      const c = checkByIndex.get(i);
      const status: "addressed" | "open" = c?.status === "resolved" ? "addressed" : "open";
      return {
        finding: JSON.parse(JSON.stringify(f)) as Record<string, unknown>,
        status,
        evidence: c?.evidence ?? "",
        note: c?.note ?? "",
        revisedExcerpt: c?.revisedExcerpt ?? "",
        ignored: false,
      };
    });

    const newIssues = rawIssues.map((n) => ({
      clauseNumber: n.clauseNumber ?? "",
      clauseTitle: n.clauseTitle ?? n.title ?? "",
      guidelineName: n.guidelineName ?? "",
      issue: n.issue ?? "",
      severity: (["low", "medium", "high"].includes(n.severity) ? n.severity : "medium") as
        | "low"
        | "medium"
        | "high",
      suggestion: n.suggestion ?? "",
      ignored: false,
    }));

    const { score, verdict, resolvedCount, openCount } = computeRecheckScore(results, newIssues);
    const isCompliant = verdict === "compliant";

    // Store the exact uploaded document once, reused for both history + SOP record.
    let uploadedUrl = "";
    try {
      const uniqueName = `recheck-${Date.now()}-${file.name}`;
      const { fileUrl } = await saveUploadedBuffer(
        buffer,
        uniqueName,
        report.department || "General",
        report.sopIdentifier || "SOP",
        "English",
      );
      uploadedUrl = fileUrl;
    } catch {
      /* storage not configured — history keeps no openable link */
    }

    // Replace the SOP's stored content with the revised text (versioning the SOP).
    let sopUpdated = false;
    if (report.sopId) {
      const sop = await SOP.findById(report.sopId);
      if (sop) {
        sop.content = mainRevisedText;
        sop.checksum = createHash("sha256").update(buffer).digest("hex");
        sop.lastReviewedAt = new Date();
        sop.processedAt = new Date();
        if (typeof sop.versionNum === "number") sop.versionNum = sop.versionNum + 1;
        if (uploadedUrl) {
          sop.fileUrl = uploadedUrl;
          sop.fileType = fileType;
        }
        await sop.save();
        sopUpdated = true;
      }
    }

    // Persist progress: addressed prior gaps are marked implemented on the report.
    if (resolvedCount > 0) {
      const addressedKeys = new Set(
        results
          .filter((r) => r.status === "addressed")
          .map((r) => `${(r.finding.guidelineName as string) ?? ""}|${(r.finding.clauseNumber as string) ?? ""}`),
      );
      report.findings = report.findings.map((f) => {
        if (
          (f.complianceLevel === "partial" || f.complianceLevel === "non-compliant") &&
          addressedKeys.has(`${f.guidelineName ?? ""}|${f.clauseNumber ?? ""}`)
        ) {
          f.reviewStatus = "implemented";
          f.resolved = true;
        }
        return f;
      });
      await report.save();
    }

    if (sopUpdated) invalidateDashboardSopsCache();

    // Persist this run as history.
    const run = await RecheckRun.create({
      reportId: report._id,
      sopId: report.sopId,
      sopIdentifier: report.sopIdentifier,
      sopName: report.sopName,
      department: report.department,
      fileName: file.name,
      fileUrl: uploadedUrl,
      verdict,
      score,
      resolvedCount,
      openCount,
      results,
      newIssues,
      annexuresIncluded,
      annexuresSkipped,
      annexureChars,
      annexuresRead: annexuresIncluded.length > 0,
    });

    return NextResponse.json({
      success: true,
      runId: String(run._id),
      verdict,
      score,
      summary: isCompliant
        ? "This SOP looks compliant as per AI."
        : `${resolvedCount} of ${results.length} prior point(s) addressed${newIssues.length ? `, ${newIssues.length} new issue(s) found` : ""}.`,
      resolvedCount,
      openCount,
      fileName: file.name,
      fileUrl: uploadedUrl,
      results,
      newIssues,
      sopUpdated,
      annexuresIncluded,
      annexuresSkipped,
      annexureChars,
      annexuresRead: annexuresIncluded.length > 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Re-check failed",
      },
      { status: 500 },
    );
  }
}

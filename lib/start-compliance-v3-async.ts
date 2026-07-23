import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import SOPGuideline from "@/models/SOPGuideline";
import { analyzeSOPComplianceV3 } from "@/lib/complianceEngineV3";
import { saveComplianceReport } from "@/lib/complianceReportStorage";
import { resolveComplianceSopContent } from "@/lib/compliance-sop-content";
import { extractClauses } from "@/lib/ocrProcessor";
import {
  beginComplianceRun,
  endComplianceRun,
  isComplianceAnalysisCancelledError,
  isComplianceRunActiveInProcess,
} from "@/lib/compliance-run-control";
import { checkCodexCliHealth } from "@/lib/llm";
import { getComplianceCodexModel } from "@/lib/codex-cli";
import type { LlmProvider } from "@/lib/llm";
import { sopIdentifierMatchFilter } from "@/lib/sopIdentifierNormalize";

const MAX_CLAUSE_TEXT = 4000;

type StoredClause = { clauseNumber?: string; clauseTitle?: string; clauseText?: string };

function clausesLookUnsplit(stored: StoredClause[] | undefined): boolean {
  if (!stored || stored.length === 0) return true;
  if (stored.length === 1) return true;
  const realNumbers = stored.filter((c) => c.clauseNumber && c.clauseNumber !== "1").length;
  return realNumbers === 0;
}

function resolveClauses(g: {
  name: string;
  clauses?: StoredClause[];
  rawText?: string;
}): StoredClause[] {
  const stored = g.clauses ?? [];
  if (clausesLookUnsplit(stored) && g.rawText && g.rawText.trim().length > 500) {
    const re = extractClauses(g.rawText, g.name);
    if (re.length > stored.length) {
      return re.map((c) => ({
        clauseNumber: c.clauseNumber,
        clauseTitle: c.clauseTitle,
        clauseText: c.clauseText,
      }));
    }
  }
  return stored;
}

/**
 * Run a full V3 compliance audit (same engine as /api/compliance/analyze-v3) in the background.
 * Returns immediately after kickoff; errors are logged.
 */
export function triggerComplianceV3Async(opts: {
  sopId: string;
  provider?: LlmProvider;
  model?: string;
  includeAnnexures?: boolean;
  maxClauses?: number;
}): void {
  void runComplianceV3Job(opts).catch((err) => {
    console.error(`[compliance-v3-async] failed for ${opts.sopId}:`, err);
  });
}

export async function runComplianceV3Job(opts: {
  sopId: string;
  provider?: LlmProvider;
  model?: string;
  includeAnnexures?: boolean;
  maxClauses?: number;
}): Promise<void> {
  const sopId = opts.sopId;
  const provider: LlmProvider = opts.provider ?? "codex";
  const model = opts.model ?? (provider === "codex" ? getComplianceCodexModel() : undefined);
  const includeAnnexures = opts.includeAnnexures !== false;
  const maxClauses = opts.maxClauses && opts.maxClauses > 0 ? opts.maxClauses : 200;

  await connectDB();

  if (provider === "codex") {
    const health = await checkCodexCliHealth();
    if (!health.ok || !health.loggedIn) {
      throw new Error(health.error ?? "Codex CLI is not logged in");
    }
  }

  if (isComplianceRunActiveInProcess(sopId)) {
    console.warn(`[compliance-v3-async] skip ${sopId} — already running`);
    return;
  }

  const sopRow = await SOP.findById(sopId).lean();
  if (!sopRow) throw new Error("SOP not found");

  const resolved = await resolveComplianceSopContent(sopId, { includeAnnexures });
  if (!resolved) {
    throw new Error(
      `SOP "${sopRow.identifier}" has no parseable content. Upload a DOCX version or re-link from storage.`,
    );
  }

  const guidelines = await SOPGuideline.find({ ocrStatus: "completed" })
    .select("name folderName pdfName rawText clauses.clauseNumber clauses.clauseTitle clauses.clauseText")
    .lean();
  if (!guidelines.length) {
    throw new Error("No guidelines found. Upload guideline PDFs first.");
  }

  const guidelineClauses = guidelines.flatMap((g) =>
    resolveClauses(g).map((c) => ({
      clauseNumber: c.clauseNumber ?? "",
      clauseTitle: c.clauseTitle ?? "",
      clauseText: (c.clauseText ?? "").slice(0, MAX_CLAUSE_TEXT),
      guidelineName: g.name,
      folderName: g.folderName,
      pdfName: g.pdfName,
      guidelineId: g._id.toString(),
    })),
  );

  const { runEpoch } = beginComplianceRun(sopId);
  try {
    console.log(
      `[compliance-v3-async] ${resolved.record.identifier}: ${guidelineClauses.length} clauses / ${guidelines.length} guidelines via ${provider}`,
    );

    const result = await analyzeSOPComplianceV3({
      sopIdentifier: resolved.record.identifier,
      sopName: resolved.record.name,
      department: resolved.record.department || "General",
      sopContent: resolved.content,
      guidelineClauses,
      maxClauses,
      provider,
      model,
    });

    void runEpoch;

    await saveComplianceReport({
      sopId,
      sopIdentifier: resolved.record.identifier,
      sopName: resolved.record.name,
      sopVersion: resolved.record.version ?? "1.0",
      department: resolved.record.department || "General",
      findings: result.findings,
      overallScore: result.overallScore,
      complianceStatus: result.complianceStatus,
      analysisEngineVersion: "v3",
      processingTimeMs: result.processingTimeMs,
      annexuresChecked: resolved.annexureStatus === "checked",
      annexureStatus: resolved.annexureStatus,
      linkedAnnexureCount: resolved.linkedAnnexureCount,
      annexureChars: resolved.annexureSupplementChars,
      annexuresIncluded: resolved.annexuresIncluded,
      annexuresSkipped: resolved.annexuresSkipped,
    });

    await SOP.updateMany(
      { identifier: resolved.record.identifier },
      {
        complianceStatus:
          result.overallScore >= 8
            ? "compliant"
            : result.overallScore >= 5
              ? "partial"
              : "non-compliant",
      },
    );

    console.log(
      `[compliance-v3-async] ${resolved.record.identifier}: done score=${result.overallScore} (${result.processingTimeMs}ms)`,
    );
  } catch (error) {
    if (isComplianceAnalysisCancelledError(error)) {
      console.log(`[compliance-v3-async] ${sopId}: cancelled`);
      return;
    }
    throw error;
  } finally {
    endComplianceRun(sopId);
  }
}

/** Resolve Mongo ids for SOP identifiers (current non-obsolete preferred). */
export async function resolveSopIdsForIdentifiers(
  identifiers: string[],
): Promise<Array<{ identifier: string; sopId: string }>> {
  await connectDB();
  const out: Array<{ identifier: string; sopId: string }> = [];
  for (const raw of identifiers) {
    const identifier = raw.trim();
    if (!identifier) continue;
    const row =
      (await SOP.findOne({ ...sopIdentifierMatchFilter(identifier), isObsolete: { $ne: true } })
        .select("_id identifier")
        .lean()) ??
      (await SOP.findOne(sopIdentifierMatchFilter(identifier)).select("_id identifier").lean());
    if (row?._id) {
      out.push({ identifier: row.identifier, sopId: (row._id as mongoose.Types.ObjectId).toString() });
    }
  }
  return out;
}

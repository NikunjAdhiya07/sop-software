import { NextRequest, NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import { requireAuth } from "@/lib/withAuth";

const SUBCAT_TO_DEPT: Record<string, string> = {
  QAGE: "QA", ANNE: "QA",
  QCGE: "QC", QAIC: "QC", QAIO: "QC",
  QAMI: "Microbiology", QCMI: "Microbiology",
  PRAA: "Production", PRCL: "Production", PRED: "Production",
  PREO: "Production", PREP: "Production", PRGE: "Production",
  PRMA: "Production", PRPA: "Production",
  BSGE: "Store", STCL: "Store", STGE: "Store",
  STOP: "Store", STPA: "Store", STRM: "Store",
  MAGE: "Engineering", PREG: "Engineering",
  PEGE: "Personnel",
};

function deptFromIdentifier(id?: string | null): string {
  if (!id) return "Other";
  const up = id.toUpperCase().trim();
  const m = up.match(/^([A-Z]{2,6})\d/);
  if (m && SUBCAT_TO_DEPT[m[1]]) return SUBCAT_TO_DEPT[m[1]];
  for (let len = 6; len >= 2; len--) {
    if (SUBCAT_TO_DEPT[up.slice(0, len)]) return SUBCAT_TO_DEPT[up.slice(0, len)];
  }
  return "Other";
}

function normalizeDept(raw?: string | null): string {
  if (!raw) return "Other";
  const l = raw.toLowerCase().trim();
  if (l === "qa" || l.includes("quality assurance")) return "QA";
  if (l === "qc" || l.includes("quality control")) return "QC";
  if (l.includes("micro")) return "Microbiology";
  if (/engineer|maint/.test(l)) return "Engineering";
  if (l.includes("person") || l.includes("hr")) return "Personnel";
  if (l.includes("store")) return "Store";
  if (l.includes("prod")) return "Production";
  return raw.trim();
}

function resolveDept(identifier: string, stored?: string | null): string {
  const fromId = deptFromIdentifier(identifier);
  if (fromId !== "Other") return fromId;
  return normalizeDept(stored);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database not connected");

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const difficulty = searchParams.get("difficulty") ?? "all";
    const languageFilter = searchParams.get("language") ?? "all";
    const deptFilter = searchParams.get("dept") ?? "all";
    const sortBy = searchParams.get("sortBy") ?? "identifier";
    const sortDir = searchParams.get("sortDir") ?? "asc";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(200, Math.max(10, parseInt(searchParams.get("limit") ?? "50")));

    const mcqBankCol = db.collection("mcqbanks");

    // ── Build aggregation pipeline ────────────────────────────────────────
    const matchStage: Record<string, unknown> = { isObsolete: { $ne: true } };
    if (languageFilter !== "all") {
      matchStage.language = languageFilter === "ENG" ? "English" : "Gujarati";
    }

    const pipeline: PipelineStage[] = [
      { $match: matchStage } as PipelineStage,
      {
        $project: {
          sopIdentifier: 1,
          sopName: 1,
          department: 1,
          language: 1,
          updatedAt: 1,
          totalQuestions: { $size: { $ifNull: ["$mcqs", []] } },
          checkedCount: {
            $size: {
              $filter: { input: { $ifNull: ["$mcqs", []] }, as: "q", cond: { $eq: ["$$q.isChecked", true] } },
            },
          },
          reviewedCount: {
            $size: {
              $filter: { input: { $ifNull: ["$mcqs", []] }, as: "q", cond: { $eq: ["$$q.isReviewed", true] } },
            },
          },
          similarCount: {
            $size: {
              $filter: { input: { $ifNull: ["$mcqs", []] }, as: "q", cond: { $eq: ["$$q.isSimilar", true] } },
            },
          },
          // Difficulty breakdown (only if filter requested)
          ...(difficulty !== "all"
            ? {
                filteredCount: {
                  $size: {
                    $filter: {
                      input: { $ifNull: ["$mcqs", []] },
                      as: "q",
                      cond: { $eq: ["$$q.difficulty", difficulty.charAt(0).toUpperCase() + difficulty.slice(1)] },
                    },
                  },
                },
              }
            : {}),
        },
      } as PipelineStage,
    ];

    const rawBanks = await mcqBankCol.aggregate(pipeline).toArray() as {
      _id: unknown; sopIdentifier: string; sopName: string; department: string; language: string;
      totalQuestions: number; checkedCount: number; reviewedCount: number; similarCount: number;
      filteredCount?: number; updatedAt?: Date;
    }[];

    // ── Enrich with resolved dept + filter ───────────────────────────────
    type RegistryEntry = {
      id: string;
      identifier: string;
      sopName: string;
      department: string;
      language: string;
      langCode: string;
      totalMcqs: number;
      remaining: number;
      approved: number;
      partial: number;
      similar: number;
      lastUpdated: Date | null;
    };

    const entries: RegistryEntry[] = [];

    for (const b of rawBanks) {
      const rawId = (b.sopIdentifier ?? "").trim().toUpperCase();
      const dept = resolveDept(rawId, b.department);

      // Apply search filter
      if (search) {
        const lc = search.toLowerCase();
        if (
          !rawId.toLowerCase().includes(lc) &&
          !(b.sopName ?? "").toLowerCase().includes(lc)
        ) continue;
      }

      // Apply dept filter
      if (deptFilter !== "all" && dept !== deptFilter) continue;

      // Apply difficulty filter: skip bank if it has 0 questions of that difficulty
      if (difficulty !== "all" && (b.filteredCount ?? 0) === 0) continue;

      entries.push({
        id: String(b._id),
        identifier: b.sopIdentifier ?? rawId,
        sopName: b.sopName ?? "",
        department: dept,
        language: b.language ?? "English",
        langCode: (b.language ?? "").toLowerCase() === "gujarati" ? "GUJ" : "ENG",
        totalMcqs: b.totalQuestions,
        remaining: Math.max(0, b.totalQuestions - b.checkedCount),
        approved: b.checkedCount,
        partial: b.reviewedCount,
        similar: b.similarCount,
        lastUpdated: b.updatedAt ?? null,
      });
    }

    // ── Include SOPs with no MCQ bank at all (zero rows) ─────────────────
    if (difficulty === "all") {
      const bankedIds = new Set(
        rawBanks.map((b) => `${(b.sopIdentifier ?? "").trim().toUpperCase()}||${(b.language ?? "English")}`)
      );

      const sopQuery: Record<string, unknown> = { isObsolete: { $ne: true } };
      if (languageFilter !== "all") {
        sopQuery.language = languageFilter === "ENG" ? "English" : "Gujarati";
      }
      if (search) {
        sopQuery.$or = [
          { name: { $regex: search, $options: "i" } },
          { identifier: { $regex: search, $options: "i" } },
        ];
      }

      const allSops = await SOP.find(sopQuery)
        .select("identifier name department language")
        .lean();

      // Deduplicate SOPs by identifier+language
      const seen = new Set<string>();
      for (const s of allSops) {
        const lang = s.language ?? "English";
        const key = `${s.identifier.trim().toUpperCase()}||${lang}`;
        if (bankedIds.has(key) || seen.has(key)) continue;
        seen.add(key);

        const dept = resolveDept(s.identifier, s.department);
        if (deptFilter !== "all" && dept !== deptFilter) continue;

        entries.push({
          id: "",
          identifier: s.identifier,
          sopName: s.name,
          department: dept,
          language: lang,
          langCode: lang === "Gujarati" ? "GUJ" : "ENG",
          totalMcqs: 0,
          remaining: 0,
          approved: 0,
          partial: 0,
          similar: 0,
          lastUpdated: null,
        });
      }
    }

    // ── Sort ─────────────────────────────────────────────────────────────
    entries.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "identifier") cmp = a.identifier.localeCompare(b.identifier);
      else if (sortBy === "name") cmp = a.sopName.localeCompare(b.sopName);
      else if (sortBy === "questions") cmp = b.totalMcqs - a.totalMcqs;
      else if (sortBy === "date") {
        const da = a.lastUpdated?.getTime() ?? 0;
        const db2 = b.lastUpdated?.getTime() ?? 0;
        cmp = db2 - da;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    const total = entries.length;
    const paginated = entries.slice((page - 1) * limit, page * limit);

    return NextResponse.json({ items: paginated, total, page, limit });
  } catch (error) {
    console.error("[mcq-bank/registry] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch registry" },
      { status: 500 },
    );
  }
}

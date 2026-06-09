import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import User from "@/models/User";
import { requireAuth } from "@/lib/withAuth";
import { baseIdentifierFromIdentifier } from "@/lib/sop-utils";

// ── Subcategory prefix → canonical department (aligned with canonDept() in TM overview) ──
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

const DEPARTMENT_ORDER = [
  "QA", "QC", "Microbiology", "Production",
  "Store", "Engineering", "Personnel",
];

function deptFromIdentifier(id?: string | null): string {
  if (!id) return "Other";
  const up = id.toUpperCase().trim();
  const m = up.match(/^([A-Z]{2,6})\d/);
  if (m && SUBCAT_TO_DEPT[m[1]]) return SUBCAT_TO_DEPT[m[1]];
  for (let len = 6; len >= 2; len--) {
    const pfx = up.slice(0, len);
    if (SUBCAT_TO_DEPT[pfx]) return SUBCAT_TO_DEPT[pfx];
  }
  return "Other";
}

// Mirrors canonDept() from training-matrix/overview so dept names stay aligned
function normalizeDeptName(raw?: string | null): string {
  if (!raw) return "Other";
  const lower = raw.toLowerCase().trim();
  if (/\bqa\b|quality.?assur/.test(lower)) return "QA";
  if (/\bqc\b|quality.?cont/.test(lower)) return "QC";
  if (/micro/.test(lower)) return "Microbiology";
  if (/engineer|maint/.test(lower)) return "Engineering";
  if (/person|\bhr\b/.test(lower)) return "Personnel";
  if (/store/.test(lower)) return "Store";
  if (/prod/.test(lower)) return "Production";
  return "Other";
}

function resolveDept(identifier: string, storedDept?: string | null): string {
  const fromId = deptFromIdentifier(identifier);
  if (fromId !== "Other") return fromId;
  return normalizeDeptName(storedDept);
}

export async function GET() {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database not connected");

    const mcqBankCol = db.collection("mcqbanks");

    // ── 1. All non-obsolete SOPs → per-dept SOP counts ────────────────────
    const sops = await SOP.find({ isObsolete: { $ne: true } })
      .select("identifier name department language processArea")
      .lean();

    // Unique SOP families per dept — collapse version suffixes so "QAGE001-1"
    // and "QAGE001-2" count as one family, matching Training Matrix's approach.
    const sopFamilyMap = new Map<string, { dept: string; languages: Set<string>; processAreas: Set<string>; name: string }>();
    for (const s of sops) {
      const baseId = baseIdentifierFromIdentifier(s.identifier); // collapse versions
      const dept = resolveDept(baseId, s.department);
      if (dept === "Other") continue;
      if (!sopFamilyMap.has(baseId)) {
        sopFamilyMap.set(baseId, { dept, languages: new Set(), processAreas: new Set(), name: s.name });
      }
      const e = sopFamilyMap.get(baseId)!;
      if (s.language) e.languages.add(s.language);
      if (s.processArea) e.processAreas.add(s.processArea);
    }

    // ── 2. Aggregate MCQBank data ─────────────────────────────────────────
    const bankAgg = await mcqBankCol.aggregate([
      { $match: { isObsolete: { $ne: true } } },
      {
        $project: {
          sopIdentifier: 1,
          department: 1,
          language: 1,
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
          updatedAt: 1,
        },
      },
    ]).toArray() as {
      sopIdentifier: string; department: string; language: string;
      totalQuestions: number; checkedCount: number; reviewedCount: number; similarCount: number; updatedAt?: Date;
    }[];

    // Bank lookup: base identifier → aggregated stats
    // Use baseIdentifierFromIdentifier() so "QAGE001-1" and "QAGE001-2" collapse
    // to the same family "QAGE001", matching Training Matrix's counting method.
    const bankByIdentifier = new Map<string, {
      dept: string;
      totalQ: number; checkedQ: number; reviewedQ: number; similarQ: number;
      hasEn: boolean; hasGu: boolean;
    }>();

    for (const b of bankAgg) {
      const rawId = (b.sopIdentifier ?? "").trim().toUpperCase();
      const id = baseIdentifierFromIdentifier(rawId); // collapse version suffix
      const dept = resolveDept(id, b.department);
      if (!bankByIdentifier.has(id)) {
        bankByIdentifier.set(id, { dept, totalQ: 0, checkedQ: 0, reviewedQ: 0, similarQ: 0, hasEn: false, hasGu: false });
      }
      const e = bankByIdentifier.get(id)!;
      e.totalQ += b.totalQuestions;
      e.checkedQ += b.checkedCount;
      e.reviewedQ += b.reviewedCount;
      e.similarQ += b.similarCount;
      if ((b.language ?? "").toLowerCase() === "gujarati") e.hasGu = true;
      else e.hasEn = true;
    }

    // ── 3. Trainer lookup ─────────────────────────────────────────────────
    const trainers = await User.find({ role: "trainer" }).select("name department").lean();
    const trainerByDept = new Map<string, string>();
    for (const t of trainers) {
      if (t.department && !trainerByDept.has(t.department)) trainerByDept.set(t.department, t.name);
    }

    // ── 4. Compute per-dept stats ─────────────────────────────────────────
    interface DeptAcc {
      identifiers: Set<string>;
      processAreas: Set<string>;
      totalSopEng: number; totalSopGuj: number;
      sopWithMcqs: number;
      approvedSops: number; partialSops: number; pendingSops: number; similarSops: number;
      totalQ: number; checkedQ: number; reviewedQ: number; similarQ: number;
      sopEng: number; sopGuj: number;
      remainingEng: number; remainingGuj: number;
    }
    const deptMap = new Map<string, DeptAcc>();

    const initAcc = (): DeptAcc => ({
      identifiers: new Set(), processAreas: new Set(),
      totalSopEng: 0, totalSopGuj: 0,
      sopWithMcqs: 0,
      approvedSops: 0, partialSops: 0, pendingSops: 0, similarSops: 0,
      totalQ: 0, checkedQ: 0, reviewedQ: 0, similarQ: 0,
      sopEng: 0, sopGuj: 0,
      remainingEng: 0, remainingGuj: 0,
    });

    // Tally SOPs per dept
    for (const [identifier, sopData] of sopFamilyMap) {
      const dept = sopData.dept;
      if (!deptMap.has(dept)) deptMap.set(dept, initAcc());
      const d = deptMap.get(dept)!;
      d.identifiers.add(identifier);
      for (const pa of sopData.processAreas) d.processAreas.add(pa);
      if (sopData.languages.has("English")) d.totalSopEng++;
      if (sopData.languages.has("Gujarati")) d.totalSopGuj++;
    }

    // Tally MCQBank stats per dept
    for (const [identifier, bank] of bankByIdentifier) {
      const dept = bank.dept;
      if (!deptMap.has(dept)) deptMap.set(dept, initAcc());
      const d = deptMap.get(dept)!;

      d.sopWithMcqs++;
      d.totalQ += bank.totalQ;
      d.checkedQ += bank.checkedQ;
      d.reviewedQ += bank.reviewedQ;
      d.similarQ += bank.similarQ;
      if (bank.hasEn) { d.sopEng++; }
      if (bank.hasGu) { d.sopGuj++; }

      // SOP-level approval status
      if (bank.totalQ > 0 && bank.checkedQ >= bank.totalQ) {
        d.approvedSops++;
      } else if (bank.similarQ > 0) {
        d.similarSops++;
      } else if (bank.totalQ > 0 && bank.checkedQ > 0) {
        d.partialSops++;
      } else if (bank.totalQ > 0) {
        d.pendingSops++;
      }
    }

    // Compute remaining (SOPs that have SOP records but no MCQ bank)
    for (const [, d] of deptMap) {
      d.remainingEng = Math.max(0, d.totalSopEng - d.sopEng);
      d.remainingGuj = Math.max(0, d.totalSopGuj - d.sopGuj);
    }

    // ── 5. Build department result array ──────────────────────────────────
    const departments = DEPARTMENT_ORDER.map((deptName) => {
      const d = deptMap.get(deptName) ?? initAcc();
      const sopCount = d.identifiers.size;
      return {
        department: deptName,
        sopCount,
        subcategories: d.processAreas.size || 1,
        totalQuestions: d.totalQ,
        checkedQuestions: d.checkedQ,   // "approved"
        reviewedQuestions: d.reviewedQ, // "partial"
        similarQuestions: d.similarQ,
        remainingQuestions: Math.max(0, d.totalQ - d.checkedQ), // not yet checked
        mcqCoverage: d.totalQ > 0 ? Math.round((d.checkedQ / d.totalQ) * 100) : 0,
        withEnglish: d.sopEng,
        withGujarati: d.sopGuj,
        totalSopEng: d.totalSopEng,
        totalSopGuj: d.totalSopGuj,
        approvedSops: d.approvedSops,
        partialSops: d.partialSops,
        pendingSops: d.pendingSops,
        similarSops: d.similarSops,
        sopWithMcqs: d.sopWithMcqs,
        sopWithoutMcqs: Math.max(0, sopCount - d.sopWithMcqs),
        enRemaining: d.remainingEng,
        guRemaining: d.remainingGuj,
        trainer: trainerByDept.get(deptName) ?? null,
      };
    });

    // Also include any "Other" departments from actual data
    for (const [deptName, d] of deptMap) {
      if (DEPARTMENT_ORDER.includes(deptName)) continue;
      const sopCount = d.identifiers.size;
      departments.push({
        department: deptName,
        sopCount,
        subcategories: d.processAreas.size || 1,
        totalQuestions: d.totalQ,
        checkedQuestions: d.checkedQ,
        reviewedQuestions: d.reviewedQ,
        similarQuestions: d.similarQ,
        remainingQuestions: Math.max(0, d.totalQ - d.checkedQ),
        mcqCoverage: d.totalQ > 0 ? Math.round((d.checkedQ / d.totalQ) * 100) : 0,
        withEnglish: d.sopEng,
        withGujarati: d.sopGuj,
        totalSopEng: d.totalSopEng,
        totalSopGuj: d.totalSopGuj,
        approvedSops: d.approvedSops,
        partialSops: d.partialSops,
        pendingSops: d.pendingSops,
        similarSops: d.similarSops,
        sopWithMcqs: d.sopWithMcqs,
        sopWithoutMcqs: Math.max(0, sopCount - d.sopWithMcqs),
        enRemaining: d.remainingEng,
        guRemaining: d.remainingGuj,
        trainer: trainerByDept.get(deptName) ?? null,
      });
    }

    // ── 6. Overall totals ─────────────────────────────────────────────────
    const overall = departments.reduce(
      (acc, d) => {
        acc.totalUniqueSops += d.sopCount;
        acc.mcqFound += d.sopWithMcqs;
        acc.notFound += d.sopWithoutMcqs;
        acc.withEnglish += d.withEnglish;
        acc.withGujarati += d.withGujarati;
        acc.approvedSops += d.approvedSops;
        acc.partialSops += d.partialSops;
        acc.pendingSops += d.pendingSops;
        acc.similarSops += d.similarSops;
        acc.totalQuestions += d.totalQuestions;
        acc.checkedQuestions += d.checkedQuestions;
        acc.reviewedQuestions += d.reviewedQuestions;
        acc.similarQuestions += d.similarQuestions;
        acc.remainingQuestions += d.remainingQuestions;
        acc.enRemaining += d.enRemaining;
        acc.guRemaining += d.guRemaining;
        return acc;
      },
      {
        totalUniqueSops: 0, totalVersions: sops.length, totalMcqBanks: bankAgg.length,
        mcqFound: 0, notFound: 0,
        withEnglish: 0, withGujarati: 0,
        approvedSops: 0, partialSops: 0, pendingSops: 0, similarSops: 0,
        totalQuestions: 0, checkedQuestions: 0, reviewedQuestions: 0,
        similarQuestions: 0, remainingQuestions: 0,
        enRemaining: 0, guRemaining: 0,
      },
    );

    return NextResponse.json({ ...overall, departments });
  } catch (error) {
    console.error("[mcq-bank/stats] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch MCQ stats" },
      { status: 500 },
    );
  }
}

import { connectDB } from "@/lib/mongodb";
import MatrixSOPAssignment from "@/models/MatrixSOPAssignment";
import TrainingMatrixRecord from "@/models/TrainingMatrixRecord";
import TrainingMatrixUpload from "@/models/TrainingMatrixUpload";
import Employee from "@/models/Employee";
import { getDashboardSopsCache } from "@/lib/dashboardSopsCache";
import {
  getDashboardRegistryPayload,
  getGroupedRegistryRows,
} from "@/lib/dashboardRegistrySource";
import {
  getTrainingMatrixCached as getTrainingMatrixOverviewCached,
  invalidateTrainingMatrixCache,
} from "@/lib/trainingMatrixCache";
import { invalidateInductionTrainingMatrixCache } from "@/lib/inductionTrainingMatrixCache";
import {
  getManageSopViewCacheEntry,
  getManageSopViewMemoryEntry,
  invalidateManageSopViewCache,
  runManageSopViewRebuildSingleflight,
  setManageSopViewCached,
} from "@/lib/manageSopViewCache";
import { filterPrimaryRegistryRowsUniqueByFamily } from "@/lib/registryPrimaryRows";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_DEPARTMENTS = [
  "QA",
  "QC",
  "Microbiology",
  "Production",
  "Store",
  "Engineering",
  "Personnel",
];
const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MANAGE_SOP_API_LOG = "[manage-sop][api]";

function nowMs(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

function elapsedMs(startMs: number): number {
  return Number((nowMs() - startMs).toFixed(1));
}

// Same revision stripping as training-matrix/overview (dbSopCount universe).
function stripVersion(code: string): string {
  return String(code || "")
    .toUpperCase()
    .replace(/-\d+$/, "")
    .trim();
}

function resolveActiveMatrixYear(
  uploads: Array<{ year?: number }>,
): number {
  const fallback = new Date().getFullYear();
  let max = fallback;
  for (const up of uploads) {
    const y = Number(up?.year);
    if (Number.isInteger(y) && y >= 2000 && y <= fallback + 1) {
      max = Math.max(max, y);
    }
  }
  return max;
}

function buildRecordMatch(
  yearAll: boolean,
  year: number,
  activeYear: number,
): Record<string, unknown> {
  const match: Record<string, unknown> = { status: { $ne: "na" } };
  // year=all scopes to the active matrix year — scanning every historical row
  // is too slow on remote MongoDB and is not what the live matrix UI reflects.
  match.year = yearAll ? activeYear : year;
  return match;
}

// Keep designation matching resilient across historical data formats:
// - full names: "Sr Executive"
// - short codes: "SE"
// - packed strings: "SE, EX, CH"
function desigAbbr(designation: string): string {
  const cleaned = String(designation || "")
    .replace(/[^a-zA-Z ]/g, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function normalizeDesignationToken(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface SOPViewDesignationStat {
  designation: string;
  isAssigned: boolean;
  count: number;
}

export interface SOPViewDeptStat {
  department: string;
  isAssigned: boolean;
  designations: SOPViewDesignationStat[];
  monthlyCounts: Record<number, number>;
  total: number;
  // Schedule data: which month (1–12) this SOP runs in for this dept, per
  // TrainingMatrixUpload.snapshot.sopMonthMap. null when not scheduled.
  scheduledMonth: number | null;
  isScheduled: boolean;
}

export interface SOPViewRow {
  sopCode: string;
  sopName: string;
  gujaratiName?: string;
  isDualLanguage?: boolean;
  primaryDepartment: string;
  deptStats: SOPViewDeptStat[];
  grandTotal: number;
}

export interface ManageSOPViewResponse {
  sops: SOPViewRow[];
  departments: string[];
  designationsByDept: Record<string, string[]>;
  employeeCountsByDeptDesig: Record<string, Record<string, number>>;
  // Resolved employee roster per department — name + designation, sorted by name.
  // Used by the page's Employees view to render names in place of designation abbreviations.
  employeesByDept: Record<string, Array<{ name: string; designation: string }>>;
  stats: { total: number; assigned: number; unassigned: number };
  // sopCountsByDeptMonth[dept][month1to12] = number of SOPs scheduled in that (dept, month)
  // Pre-computed server-side so the client can render the per-row month cells without
  // recomputing on every checkbox click.
  sopCountsByDeptMonth: Record<string, Record<number, number>>;
  // sopCountsByMonth[month1to12] = number of SOPs scheduled in any dept in that month
  sopCountsByMonth: Record<number, number>;
  // sopCountsByDept[dept] = number of SOPs scheduled in that dept (any month)
  sopCountsByDept: Record<string, number>;
  // Base SOP codes that the main training-matrix page counts as "missing from Excel"
  // (i.e. the canonical unassigned list — sourced from the overview API). Used by the
  // Manage SOP page so the unassigned card and its filter use the same set the main
  // page counts.
  unassignedSopCodes: string[];
  // Cells the user has explicitly allocated through this page (records inserted with
  // sourceFile='manage-sop-manual'). Shape: { sopCode: { dept: [month1, month2, ...] } }.
  // Used by the UI to keep ONLY the user-allocated cells highlighted after a refresh —
  // unrelated historical training records do NOT trigger the highlight.
  manualAllocations: Record<string, Record<string, number[]>>;
  // Designations the user explicitly assigned per (sopCode, dept) when allocating
  // a manual training record. Lets the UI tick the matching designation checkboxes
  // after a refresh — the MatrixSOPAssignment fallback alone misses these because
  // manual allocations don't write to MatrixSOPAssignment.
  manualDesignations: Record<string, Record<string, string[]>>;
  year: number | "all";
}

export const dynamic = "force-dynamic";

// Snapshot is considered fresh for this long. Older-but-present snapshots are
// still served instantly while a background recompute refreshes them (SWR), so
// users never block on the heavy rebuild.
const MANAGE_SOP_FRESH_TTL_MS = 10 * 60 * 1000;

async function revalidateManageSopViewInBackground(
  request: NextRequest,
  ctx: {
    cacheYear: number | "all";
    search: string;
    yearAll: boolean;
    year: number;
    reqStartMs: number;
  },
): Promise<void> {
  try {
    await runManageSopViewRebuildSingleflight(ctx.cacheYear, ctx.search, () =>
      buildManageSopViewResponse(request, ctx),
    );
  } catch (err) {
    console.error(
      `${MANAGE_SOP_API_LOG} background revalidate FAILED year=${ctx.cacheYear} search="${ctx.search}"`,
      err,
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const reqStartMs = nowMs();
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get("year");
    const forceFresh = searchParams.get("refresh") === "1";
    // year=all (or omitted) → count training across every year, matching the source-of-truth
    // "main training matrix" view. A numeric year still scopes to that one year.
    const yearAll = !yearParam || yearParam === "all";
    const year = yearAll ? 0 : parseInt(yearParam) || new Date().getFullYear();
    const search = searchParams.get("search")?.toLowerCase() || "";
    const cacheYear: number | "all" = yearAll ? "all" : year;
    const ctx = { cacheYear, search, yearAll, year, reqStartMs };

    // Explicit refresh: recompute synchronously (single-flight dedups concurrent).
    if (forceFresh) {
      const response = await runManageSopViewRebuildSingleflight(cacheYear, search, () =>
        buildManageSopViewResponse(request, ctx),
      );
      return NextResponse.json(response, { status: 200 });
    }

    // Fast path: fresh memory hit, no DB round-trip.
    const mem = getManageSopViewMemoryEntry(cacheYear, search);
    if (mem && Date.now() - mem.computedAt <= MANAGE_SOP_FRESH_TTL_MS) {
      console.info(
        `${MANAGE_SOP_API_LOG} GET cache=HIT(mem,fresh) year=${cacheYear} search="${search}" totalMs=${elapsedMs(reqStartMs)}`,
      );
      return NextResponse.json(mem.payload, { status: 200 });
    }

    // Connect so the durable (Mongo) snapshot fallback is reachable.
    await connectDB();
    const entry = mem || (await getManageSopViewCacheEntry(cacheYear, search));
    if (entry) {
      // Serve immediately. If stale, refresh in the background — the user never waits.
      const age = Date.now() - (entry.computedAt || 0);
      if (age > MANAGE_SOP_FRESH_TTL_MS) {
        void revalidateManageSopViewInBackground(request, ctx);
      }
      console.info(
        `${MANAGE_SOP_API_LOG} GET cache=HIT(${age > MANAGE_SOP_FRESH_TTL_MS ? "stale,revalidating" : "fresh"}) year=${cacheYear} search="${search}" totalMs=${elapsedMs(reqStartMs)}`,
      );
      return NextResponse.json(entry.payload, { status: 200 });
    }

    // Nothing cached anywhere: compute now (single-flight dedups concurrent cold loads).
    const response = await runManageSopViewRebuildSingleflight(cacheYear, search, async () => {
      const warm = await getManageSopViewCacheEntry(cacheYear, search);
      if (warm) return warm.payload;
      return buildManageSopViewResponse(request, ctx);
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(
      `${MANAGE_SOP_API_LOG} GET /api/training-matrix/manage-sop-view source=manage-sop FAILED totalMs=${elapsedMs(reqStartMs)}`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch SOP view data" },
      { status: 500 },
    );
  }
}

async function buildManageSopViewResponse(
  request: NextRequest,
  ctx: {
    cacheYear: number | "all";
    search: string;
    yearAll: boolean;
    year: number;
    reqStartMs: number;
  },
): Promise<ManageSOPViewResponse> {
    const { cacheYear, search, yearAll, year, reqStartMs } = ctx;
    const dbConnectStartMs = nowMs();
    await connectDB();
    const dbConnectMs = elapsedMs(dbConnectStartMs);

    const dataFetchStartMs = nowMs();
    // Light queries first — derive the active matrix year, then scope the heavy
    // TrainingMatrixRecord aggregation to that year only (year=all is not a
    // full-history scan; it matches the current upload snapshot year).
    const [
      assignments,
      employees,
      scheduleUploads,
      dashboardCached,
      overviewCached,
    ] = await Promise.all([
      MatrixSOPAssignment.find({ isActive: true })
        .select("sopCode sopName department designationApplicability")
        .lean(),
      Employee.find({ isActive: true })
        .select("department designation name")
        .lean(),
      TrainingMatrixUpload.find({ "snapshot.sopMonthMap": { $exists: true } })
        .select("department snapshot.sopMonthMap uploadedAt year")
        .sort({ uploadedAt: -1 })
        .lean(),
      getDashboardSopsCache(),
      getTrainingMatrixOverviewCached(),
    ]);

    const activeYear = resolveActiveMatrixYear(
      scheduleUploads as Array<{ year?: number }>,
    );
    const recordMatch = buildRecordMatch(yearAll, year, activeYear);

    const [trainingAgg, manualRecords] = await Promise.all([
      TrainingMatrixRecord.aggregate([
        { $match: recordMatch },
        {
          $group: {
            _id: {
              sopCode: "$sopCode",
              department: "$department",
              designation: "$designation",
              month: "$month",
            },
            count: { $sum: 1 },
          },
        },
      ]),
      TrainingMatrixRecord.find({
        ...recordMatch,
        sourceFile: "manage-sop-manual",
      })
        .select("sopCode department month designation")
        .lean(),
    ]);
    const dataFetchMs = elapsedMs(dataFetchStartMs);

    // Build dept → baseSopCode → monthNum (1..12) schedule map.
    // Multiple uploads per dept are merged; the most recent upload wins per (dept, sopCode).
    const scheduleMap = new Map<string, Map<string, number>>();
    for (const dept of DEFAULT_DEPARTMENTS) scheduleMap.set(dept, new Map());

    const normalizeDept = (raw: string | undefined | null): string | null => {
      if (!raw) return null;
      const u = String(raw).trim().toUpperCase();
      if (!u) return null;
      if (u === "QA") return "QA";
      if (u === "QC") return "QC";
      if (u.startsWith("MICRO")) return "Microbiology";
      if (u.startsWith("PROD")) return "Production";
      if (u.startsWith("STORE") || u === "STOR") return "Store";
      if (u.startsWith("ENG")) return "Engineering";
      if (u.startsWith("PERSON") || u === "HR") return "Personnel";
      const direct = DEFAULT_DEPARTMENTS.find((d) => d.toUpperCase() === u);
      return direct || null;
    };

    const monthNameToNum = (name: string): number | null => {
      if (!name) return null;
      const idx = MONTH_NAMES.findIndex(
        (m) => m && m.toLowerCase() === String(name).trim().toLowerCase(),
      );
      return idx > 0 ? idx : null;
    };

    for (const upload of scheduleUploads as any[]) {
      const dept = normalizeDept(upload?.department);
      if (!dept) continue;
      const deptSched = scheduleMap.get(dept)!;
      const sopMonthMap = upload?.snapshot?.sopMonthMap;
      if (!sopMonthMap) continue;
      for (const [rawKey, monthName] of Object.entries(sopMonthMap)) {
        const base = stripVersion(String(rawKey)).toUpperCase();
        if (!base) continue;
        if (deptSched.has(base)) continue; // latest upload wins
        const monthNum = monthNameToNum(String(monthName));
        if (!monthNum) continue;
        deptSched.set(base, monthNum);
      }
    }

    // Pull the resolved registry rows from the dashboard payload.
    // Prefer cache, but fall back to on-demand compute if cache is cold so the
    // canonical SOP universe (427) is still correct (especially on refresh=1).
    let registryRows: any[] = [];
    try {
      let dashboard = (dashboardCached?.payload || null) as {
        success?: boolean;
        data?: any[];
      } | null;
      if (
        !dashboard ||
        !Array.isArray(dashboard?.data) ||
        dashboard.data.length === 0
      ) {
        dashboard = await getDashboardRegistryPayload();
      }
      registryRows = Array.isArray(dashboard?.data) ? dashboard.data : [];
    } catch {
      registryRows = [];
    }

    let groupedRegistryRows: Awaited<ReturnType<typeof getGroupedRegistryRows>> =
      [];
    if (registryRows.length === 0) {
      groupedRegistryRows = await getGroupedRegistryRows();
    }

    // Hydrate overview once up-front (needed for dbSop universe + unassigned counts).
    let overviewData: any = overviewCached;
    if (!overviewData?.totalCard?.dbSopsByDept) {
      try {
        const overviewRes = await fetch(
          `${request.nextUrl.origin}/api/training-matrix/overview`,
          { cache: "no-store" },
        );
        if (overviewRes.ok) overviewData = await overviewRes.json();
      } catch {
        // Non-fatal; fallbacks below still apply.
      }
    }

    // Canonical SOP universe — same family-unique filter the Training Matrix
    // overview applies to get `dbSopCount`. Without this, codes that exist only
    // in TrainingMatrixRecord / MatrixSOPAssignment / snapshots / SOPLibrary /
    // MasterSOPRepository but were rejected by the dashboard filter (artifact-
    // only placeholders, non-standard IDs, or other-revision dupes) inflate the
    // total above Training Matrix's number.
    // Why: total in this modal MUST equal dbSopCount on the main page.
    // How to apply: restrict `sops` below to bases in this set.
    const canonicalRows = filterPrimaryRegistryRowsUniqueByFamily(registryRows);
    const canonicalBaseSet = new Set<string>();
    for (const row of canonicalRows as any[]) {
      const id = String(row?.sopNo || row?.identifier || "").trim();
      if (!id) continue;
      const base = stripVersion(id);
      if (base) canonicalBaseSet.add(base);
    }

    // Exact DB SOP universe from Training Matrix overview (dbSopCount, e.g. 427).
    const overviewDbSopCodes = new Map<string, string>();
    const overviewByDept = (
      overviewData as {
        totalCard?: {
          dbSopsByDept?: Record<
            string,
            Array<{ sopCode?: string; title?: string }>
          >;
        };
      } | null
    )?.totalCard?.dbSopsByDept;
    if (overviewByDept) {
      for (const list of Object.values(overviewByDept)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          const base = stripVersion(String(item?.sopCode || ""));
          if (!base || overviewDbSopCodes.has(base)) continue;
          overviewDbSopCodes.set(base, String(item?.title || "").trim());
        }
      }
    }

    // Build designation set per department AND count employees per dept per designation,
    // plus the resolved roster (name + designation) used by the Employees view.
    const designationsByDept = new Map<string, Set<string>>();
    const empCountMap = new Map<string, Map<string, number>>();
    const empRoster = new Map<
      string,
      Array<{ name: string; designation: string }>
    >();
    for (const dept of DEFAULT_DEPARTMENTS) {
      designationsByDept.set(dept, new Set<string>());
      empCountMap.set(dept, new Map<string, number>());
      empRoster.set(dept, []);
    }
    for (const emp of employees as any[]) {
      if (!emp.department || !emp.designation) continue;
      const set = designationsByDept.get(emp.department);
      if (set) set.add(emp.designation as string);
      const deptMap = empCountMap.get(emp.department);
      if (deptMap)
        deptMap.set(
          emp.designation as string,
          (deptMap.get(emp.designation as string) ?? 0) + 1,
        );
      const roster = empRoster.get(emp.department);
      const name = String((emp as any).name || "").trim();
      if (roster && name)
        roster.push({ name, designation: emp.designation as string });
    }
    for (const list of empRoster.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Build training data map: sopCode → dept → designation → month → count
    const trainingMap = new Map<
      string,
      Map<string, Map<string, Map<number, number>>>
    >();
    for (const record of trainingAgg) {
      const id = record._id as any;
      const stripCode = stripVersion(id.sopCode || "");
      if (!trainingMap.has(stripCode)) {
        trainingMap.set(stripCode, new Map());
      }
      const deptMap = trainingMap.get(stripCode)!;
      if (!deptMap.has(id.department)) {
        deptMap.set(id.department, new Map());
      }
      const designationMap = deptMap.get(id.department)!;
      if (!designationMap.has(id.designation)) {
        designationMap.set(id.designation, new Map());
      }
      const monthMap = designationMap.get(id.designation)!;
      // Multiple SOP versions (e.g. ABC01-01, ABC01-02) collapse to the same base code
      // after stripVersion — accumulate, don't overwrite, or counts get silently dropped.
      const month = id.month as number;
      const inc = (record.count as number) || 0;
      monthMap.set(month, (monthMap.get(month) || 0) + inc);
    }

    // Build assignment map: sopCode → dept → { designationApplicability, isAssigned }
    const assignmentMap = new Map<string, Map<string, string[]>>();
    for (const assignment of assignments) {
      const stripCode = stripVersion(assignment.sopCode);
      if (!assignmentMap.has(stripCode)) {
        assignmentMap.set(stripCode, new Map());
      }
      const deptMap = assignmentMap.get(stripCode)!;
      deptMap.set(
        assignment.department,
        assignment.designationApplicability || [],
      );
    }

    // Clean a name string by taking the last path segment and stripping any leading "CODE-VV"
    // prefix. Handles values stored as folder paths like:
    //   "5. STORE/BSGE - BSR---/BSGE01-05/BSGE01-05_HANDLING AND DISTRIBUTION OF FINISHED GOODS"
    const cleanName = (raw: string | undefined | null): string => {
      if (!raw) return "";
      let s = String(raw).trim();
      if (!s) return "";
      // If a path, take the last meaningful segment
      if (s.includes("/")) {
        const parts = s
          .split("/")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length) s = parts[parts.length - 1];
      }
      // Strip leading code prefix: "BSGE01-05_", "BSGE01-05 - ", "MAGE02-06 "
      s = s.replace(/^[A-Za-z]+\d+(?:[-.]\d+)*[\s_-]*/, "").trim();
      return s;
    };

    // Map normalized DB department values back to the canonical names used by the UI
    // (MasterSOPRepository stores them uppercase, sometimes with extra words).
    const normalizeDeptValue = (
      raw: string | undefined | null,
    ): string | null => {
      if (!raw) return null;
      const u = String(raw).trim().toUpperCase();
      if (!u) return null;
      if (u === "QA") return "QA";
      if (u === "QC") return "QC";
      if (u.startsWith("MICRO")) return "Microbiology";
      if (u.startsWith("PROD")) return "Production";
      if (u.startsWith("STORE") || u === "BS" || u === "STOR") return "Store";
      if (u.startsWith("ENG")) return "Engineering";
      if (u.startsWith("PERSON") || u.startsWith("HR")) return "Personnel";
      // Direct match against the canonical list (rare)
      const direct = DEFAULT_DEPARTMENTS.find((d) => d.toUpperCase() === u);
      return direct || null;
    };

    // Build sopCode → primaryDepartment map from dashboard registry + SOP collection.
    const primaryDeptMap = new Map<string, string>();
    for (const row of registryRows) {
      const id = row?.sopNo || row?.identifier;
      if (!id) continue;
      const base = stripVersion(String(id)).toUpperCase();
      if (!base || primaryDeptMap.has(base)) continue;
      const dept = normalizeDeptValue(row?.department);
      if (dept) primaryDeptMap.set(base, dept);
    }
    for (const sop of groupedRegistryRows) {
      if (!sop?.identifier) continue;
      const base = stripVersion(String(sop.identifier)).toUpperCase();
      if (!base || primaryDeptMap.has(base)) continue;
      const dept = normalizeDeptValue(sop.department);
      if (dept) primaryDeptMap.set(base, dept);
    }

    // Build per-language SOP name map. Priority: dashboard registry > MasterSOPRepository >
    // SOPLibrary > SOP collection. Skip placeholder names like "<CODE> - Prior Version".
    type NameInfo = { englishName?: string; gujaratiName?: string };
    const nameMap = new Map<string, NameInfo>();

    const isPlaceholderName = (name: string): boolean => {
      if (!name) return true;
      const trimmed = name.trim();
      if (!trimmed) return true;
      if (/prior\s*version/i.test(trimmed)) return true;
      if (/^[-–—√✓✗×•·*]+$/.test(trimmed)) return true;
      return false;
    };

    // Gujarati script lives in Unicode block U+0A80..U+0AFF. Whenever a name actually
    // contains Gujarati characters, treat it as Gujarati regardless of the upstream
    // language label — some sources (training records, master repo) store Gujarati
    // text under language='English' or with no language at all, which previously caused
    // the same string to land in both fields and render duplicated.
    const hasGujaratiScript = (s: string): boolean => /[઀-૿]/.test(s);

    const recordName = (
      rawIdentifier: string,
      language: string | undefined,
      name: string | undefined,
    ) => {
      if (!rawIdentifier || !name) return;
      const cleaned = cleanName(name);
      if (!cleaned || isPlaceholderName(cleaned)) return;
      const base = stripVersion(String(rawIdentifier)).toUpperCase();
      if (!base) return;
      if (!nameMap.has(base)) nameMap.set(base, {});
      const entry = nameMap.get(base)!;
      const labelLang = String(language || "English").toLowerCase();
      const isGujaratiText = hasGujaratiScript(cleaned);
      // Script wins over label
      const lang = isGujaratiText
        ? "gujarati"
        : labelLang === "gujarati"
          ? "english"
          : labelLang;
      if (lang === "gujarati") {
        if (!entry.gujaratiName) entry.gujaratiName = cleaned;
      } else {
        if (!entry.englishName) entry.englishName = cleaned;
      }
    };

    const recordEnglish = (rawIdentifier: string, name: string | undefined) =>
      recordName(rawIdentifier, "English", name);
    const recordGujarati = (rawIdentifier: string, name: string | undefined) =>
      recordName(rawIdentifier, "Gujarati", name);

    // 1. Dashboard registry — highest priority (already resolves clean english/gujarati names)
    for (const row of registryRows) {
      const id = row?.sopNo || row?.identifier || row?.sopIdentifier;
      if (!id) continue;
      recordEnglish(id, row?.englishName || row?.sopName || row?.name);
      recordGujarati(id, row?.gujaratiName);
    }
    // 2. Grouped SOP registry
    for (const sop of groupedRegistryRows) {
      const lang =
        sop.language === "GUJ" ? "Gujarati" : sop.language === "ENG-GUJ" ? "English" : "English";
      recordName(sop.identifier, lang, sop.name);
      if (sop.nameGujarati) recordGujarati(sop.identifier, sop.nameGujarati);
    }

    const lookupName = (
      base: string,
    ): {
      englishName: string;
      gujaratiName: string;
      isDualLanguage: boolean;
    } => {
      const upper = base.toUpperCase();
      const info = nameMap.get(upper) || {};
      const englishName = info.englishName || "";
      const gujaratiName = info.gujaratiName || "";
      return {
        englishName,
        gujaratiName,
        isDualLanguage: !!(englishName && gujaratiName),
      };
    };

    // Legacy map kept for compatibility paths below — prefers english
    const sopNameMap = new Map<string, string>();
    for (const [base, info] of nameMap) {
      if (info.englishName) sopNameMap.set(base, info.englishName);
    }

    // Collect all unique SOPs from training matrix records and assignments
    const sopSet = new Map<string, string>(); // sopCode → sopName

    // Helper to check if code/name is valid
    const isValidSopCode = (code: string): boolean => {
      if (!code || code.trim() === "") return false;
      const trimmed = code.trim();
      // Filter out placeholder/invalid entries (dashes, checkmarks, etc.)
      if (/^[-–—√✓✗×•·*]+$/.test(trimmed)) return false;
      return true;
    };

    const isValidSopName = (name: string): boolean => {
      if (!name || name.trim() === "") return false;
      const trimmed = name.trim();
      // Filter out placeholder/invalid entries
      if (/^[-–—√✓✗×•·*]+$/.test(trimmed)) return false;
      return true;
    };

    // Pick the best english name for an SOP. Always strip path/code prefixes and reject placeholders.
    const resolveName = (stripCode: string, recordName?: string): string => {
      const resolved = sopNameMap.get(stripCode.toUpperCase());
      if (resolved) return resolved;
      const cleaned = cleanName(recordName);
      if (cleaned && !isPlaceholderName(cleaned)) return cleaned;
      return stripCode;
    };

    // Add SOPs from aggregated training records (actual matrix data)
    // using grouped keys, which avoids a second full collection scan.
    for (const row of trainingAgg as Array<{ _id: { sopCode?: string } }>) {
      const stripCode = stripVersion(String(row?._id?.sopCode || ""));
      const sopName = resolveName(stripCode);
      if (isValidSopCode(stripCode) && isValidSopName(sopName)) {
        sopSet.set(stripCode, sopName);
      }
    }

    // Add SOPs from assignments (in case they have no training records yet)
    for (const assignment of assignments) {
      const stripCode = stripVersion(assignment.sopCode);
      if (!sopSet.has(stripCode)) {
        const sopName = resolveName(stripCode, assignment.sopName);
        if (isValidSopCode(stripCode) && isValidSopName(sopName)) {
          sopSet.set(stripCode, sopName);
        }
      }
    }

    // Add SOPs from the schedule (sopMonthMap) — these are the planned-training SOPs even
    // if they have no records or assignments yet.
    for (const [, deptSched] of scheduleMap) {
      for (const base of deptSched.keys()) {
        if (sopSet.has(base)) continue;
        const sopName = resolveName(base);
        if (isValidSopCode(base) && isValidSopName(sopName)) {
          sopSet.set(base, sopName);
        }
      }
    }

    // Build rows from the same universe as Training Matrix dbSopCount (427), not from
    // sopSet (training/schedule/library extras can inflate to 436+).
    let canonicalEntries: Array<[string, string]>;
    if (overviewDbSopCodes.size > 0) {
      canonicalEntries = [];
      for (const [code, titleFromOverview] of overviewDbSopCodes) {
        const sopName = resolveName(code, titleFromOverview);
        if (!isValidSopCode(code) || !isValidSopName(sopName)) continue;
        canonicalEntries.push([code, sopName]);
      }
    } else if (canonicalRows.length > 0) {
      // Mirror overview `dbBaseSet`: one row per stripVersion(base), not per registry row.
      canonicalEntries = [];
      const seenBases = new Set<string>();
      for (const row of canonicalRows as any[]) {
        const sopNo = String(row?.sopNo || row?.identifier || "").trim();
        const code = stripVersion(sopNo);
        if (!code || seenBases.has(code)) continue;
        seenBases.add(code);
        const sopName = resolveName(
          code,
          row?.englishName || row?.sopName || row?.name,
        );
        if (!isValidSopCode(code) || !isValidSopName(sopName)) continue;
        canonicalEntries.push([code, sopName]);
      }
    } else {
      canonicalEntries = Array.from(sopSet.entries());
    }

    // Apply search filter
    const filteredSOPs = canonicalEntries.filter(([code, name]) => {
      if (!search) return true;
      return (
        code.toLowerCase().includes(search) ||
        name.toLowerCase().includes(search)
      );
    });

    // Build response rows
    const sops: SOPViewRow[] = filteredSOPs.map(([sopCode, sopName]) => {
      const deptStats: SOPViewDeptStat[] = DEFAULT_DEPARTMENTS.map((dept) => {
        const deptAssignmentsRaw = assignmentMap.get(sopCode)?.get(dept) || [];
        const deptAssignments = deptAssignmentsRaw
          .flatMap((v) => String(v || "").split(/[;,/|]/))
          .map((v) => v.trim())
          .filter(Boolean);
        const isAssigned = deptAssignments.length > 0;
        const assignedTokens = new Set(
          deptAssignments.map(normalizeDesignationToken),
        );

        const designationTraining =
          trainingMap.get(sopCode)?.get(dept) ||
          new Map<string, Map<number, number>>();
        const designations: SOPViewDesignationStat[] = Array.from(
          designationsByDept.get(dept) || new Set<string>(),
        ).map((designation: string): SOPViewDesignationStat => {
          const monthCounts =
            designationTraining.get(designation) || new Map<number, number>();
          const count: number = Array.from(monthCounts.values()).reduce(
            (a: number, b: number) => a + b,
            0,
          );
          const designationToken = normalizeDesignationToken(designation);
          const designationAbbrToken = normalizeDesignationToken(
            desigAbbr(designation),
          );
          return {
            designation,
            isAssigned:
              assignedTokens.has(designationToken) ||
              assignedTokens.has(designationAbbrToken),
            count,
          };
        });

        const monthlyCounts: Record<number, number> = {};
        for (let m = 1; m <= 12; m++) {
          let monthTotal = 0;
          for (const designationMap of designationTraining.values()) {
            monthTotal += designationMap.get(m) || 0;
          }
          monthlyCounts[m] = monthTotal;
        }

        const total = Object.values(monthlyCounts).reduce((a, b) => a + b, 0);

        // Schedule:
        //   1) Prefer the explicit schedule from TrainingMatrixUpload.snapshot.sopMonthMap
        //   2) Otherwise, treat the earliest month with records as the scheduled month
        // An SOP counts as scheduled for a dept if any of the following are true:
        //   - It appears in that dept's schedule snapshot
        //   - It has training records in that dept (total > 0)
        //   - It is assigned to that dept via MatrixSOPAssignment
        let scheduledMonth: number | null =
          scheduleMap.get(dept)?.get(sopCode.toUpperCase()) || null;
        if (!scheduledMonth) {
          for (let m = 1; m <= 12; m++) {
            if (monthlyCounts[m] && monthlyCounts[m] > 0) {
              scheduledMonth = m;
              break;
            }
          }
        }
        const isScheduled = !!scheduledMonth || isAssigned || total > 0;

        return {
          department: dept,
          isAssigned,
          designations,
          monthlyCounts,
          total,
          scheduledMonth,
          isScheduled,
        };
      });

      const grandTotal = deptStats.reduce((sum, ds) => sum + ds.total, 0);
      const nameInfo = lookupName(sopCode);
      // Always prefer the resolved english name; fall back to whatever resolveName returned (already cleaned).
      const finalEnglish =
        nameInfo.englishName || cleanName(sopName) || sopCode;
      // Only attach gujarati when we have a real english name + a real gujarati name (no gujarati-only rows).
      const gujarati =
        nameInfo.englishName && nameInfo.gujaratiName
          ? nameInfo.gujaratiName
          : undefined;

      // Primary department: from MasterSOPRepository / SOPLibrary if known,
      // otherwise from assignments — the dept with the most assigned designations.
      let primaryDepartment = primaryDeptMap.get(sopCode.toUpperCase()) || "";
      if (!primaryDepartment) {
        let bestDept = "";
        let bestScore = -1;
        for (const ds of deptStats) {
          const score = ds.designations.filter((d) => d.isAssigned).length;
          if (score > bestScore) {
            bestScore = score;
            bestDept = ds.department;
          }
        }
        if (bestScore > 0) primaryDepartment = bestDept;
      }

      return {
        sopCode,
        sopName: finalEnglish,
        gujaratiName: gujarati,
        isDualLanguage: !!gujarati,
        primaryDepartment,
        deptStats,
        grandTotal,
      };
    });

    const overviewDbSopCount = (
      overviewData as { totalCard?: { dbSopCount?: number } } | null
    )?.totalCard?.dbSopCount;
    const totalSOPs =
      typeof overviewDbSopCount === "number" && overviewDbSopCount > 0
        ? overviewDbSopCount
        : overviewDbSopCodes.size > 0
          ? overviewDbSopCodes.size
          : canonicalBaseSet.size > 0
            ? canonicalBaseSet.size
            : canonicalEntries.length;
    let overviewUnassignedCount = 0;
    const unassignedSopCodes = new Set<string>();
    try {
      const overviewJson = (overviewData || null) as {
        totalCard?: {
          missingFromExcelList?: Array<{ sopCode?: string }>;
          missingSopCount?: number;
        };
      } | null;
      // Unassigned = DB SOPs absent from EVERY Excel upload (global), exactly the
      // set the main Training Matrix "Unassigned / Missing" red count uses. Summing
      // each dept's own-Excel misses double-counts SOPs assigned in another dept's
      // Excel, which inflated this number (e.g. 43 instead of 9).
      const totalCard = overviewJson?.totalCard;
      const globalMissingList = Array.isArray(totalCard?.missingFromExcelList)
        ? totalCard!.missingFromExcelList!
        : [];
      for (const item of globalMissingList) {
        const code = stripVersion(String(item?.sopCode || "")).toUpperCase();
        if (code) unassignedSopCodes.add(code);
      }
      overviewUnassignedCount =
        Number(totalCard?.missingSopCount) || globalMissingList.length;
    } catch {
      // Overview unavailable — fall back to 0 rather than diverging numbers.
      overviewUnassignedCount = 0;
    }
    // Prefer the actual missing-code list size (same set the filter uses).
    const unassignedSOPs =
      unassignedSopCodes.size > 0 ? unassignedSopCodes.size : overviewUnassignedCount;

    // Convert designationsByDept to plain object
    const designationsByDeptObj: Record<string, string[]> = {};
    for (const [dept, set] of designationsByDept) {
      designationsByDeptObj[dept] = Array.from(set).sort();
    }

    // Convert employeeCountsByDeptDesig to plain object
    const employeeCountsByDeptDesigObj: Record<
      string,
      Record<string, number>
    > = {};
    for (const [dept, dMap] of empCountMap) {
      employeeCountsByDeptDesigObj[dept] = Object.fromEntries(dMap);
    }

    const employeesByDeptObj: Record<
      string,
      Array<{ name: string; designation: string }>
    > = {};
    for (const [dept, list] of empRoster) {
      employeesByDeptObj[dept] = list;
    }

    // Custom department order: QA → QC → Microbiology → Production → Store → Engineering → Personnel.
    // Within each department, sort by sopCode. SOPs with no resolvable primary dept go last.
    const deptOrder = new Map<string, number>(
      DEFAULT_DEPARTMENTS.map((d, i) => [d, i]),
    );
    const deptRank = (sop: SOPViewRow): number => {
      // Prefer the SOP's registry-based primary department; otherwise the first dept it counts for.
      if (sop.primaryDepartment && deptOrder.has(sop.primaryDepartment)) {
        return deptOrder.get(sop.primaryDepartment)!;
      }
      for (const ds of sop.deptStats) {
        if (ds.isScheduled || ds.isAssigned || (ds.total || 0) > 0) {
          const idx = deptOrder.get(ds.department);
          if (idx !== undefined) return idx;
        }
      }
      return DEFAULT_DEPARTMENTS.length; // unknown → last
    };

    // Pre-compute schedule SOP counts per (dept, month) DIRECTLY from the snapshot
    // upload data — same source-of-truth used by /api/training-matrix/overview. This
    // ensures the per-dept totals here match the main training-matrix card sums (702),
    // not 704 (which leaks SOPs picked up via training-record fallback).
    const sopCountsByDeptMonth: Record<string, Record<number, number>> = {};
    const sopCountsByMonth: Record<number, number> = {};
    const sopCountsByDept: Record<string, number> = {};
    for (const dept of DEFAULT_DEPARTMENTS) {
      sopCountsByDeptMonth[dept] = {};
      for (let m = 1; m <= 12; m++) sopCountsByDeptMonth[dept][m] = 0;
      sopCountsByDept[dept] = 0;
    }
    for (let m = 1; m <= 12; m++) sopCountsByMonth[m] = 0;
    const monthSopSeen = new Map<number, Set<string>>();
    for (let m = 1; m <= 12; m++) monthSopSeen.set(m, new Set());

    for (const dept of DEFAULT_DEPARTMENTS) {
      const sched = scheduleMap.get(dept);
      if (!sched) continue;
      for (const [, monthNum] of sched) {
        if (!monthNum) continue;
        sopCountsByDeptMonth[dept][monthNum] =
          (sopCountsByDeptMonth[dept][monthNum] || 0) + 1;
        sopCountsByDept[dept] = (sopCountsByDept[dept] || 0) + 1;
      }
    }
    // Distinct SOPs per month across all depts (for the Σ row)
    for (const [, sched] of scheduleMap) {
      const localSeen = new Map<number, Set<string>>();
      for (const [base, monthNum] of sched) {
        if (!monthNum) continue;
        if (!localSeen.has(monthNum)) localSeen.set(monthNum, new Set());
        localSeen.get(monthNum)!.add(base);
      }
      for (const [m, codes] of localSeen) {
        const seen = monthSopSeen.get(m)!;
        for (const c of codes) {
          if (!seen.has(c)) {
            seen.add(c);
            sopCountsByMonth[m] += 1;
          }
        }
      }
    }

    // Assigned = sum of all (sop, dept) scheduled entries = sum of dept totals (e.g. 702)
    const assignedCount = Object.values(sopCountsByDept).reduce(
      (a, b) => a + b,
      0,
    );

    // Build manual-allocation map from records inserted via the Manage SOP page.
    // Key by the SAME base sop code the UI uses (stripVersion + uppercase).
    const manualAllocations: Record<string, Record<string, number[]>> = {};
    const manualDesigSets: Record<string, Record<string, Set<string>>> = {};
    for (const r of manualRecords as Array<{
      sopCode?: string;
      department?: string;
      month?: number;
      designation?: string;
    }>) {
      const code = stripVersion(String(r.sopCode || "")).toUpperCase();
      const dept = r.department;
      const month = r.month;
      const designation = (r.designation || "").trim();
      if (!code || !dept || !Number.isInteger(month)) continue;
      if (!manualAllocations[code]) manualAllocations[code] = {};
      if (!manualAllocations[code][dept]) manualAllocations[code][dept] = [];
      if (!manualAllocations[code][dept].includes(month as number)) {
        manualAllocations[code][dept].push(month as number);
      }
      if (designation) {
        if (!manualDesigSets[code]) manualDesigSets[code] = {};
        if (!manualDesigSets[code][dept])
          manualDesigSets[code][dept] = new Set();
        manualDesigSets[code][dept].add(designation);
      }
    }
    const manualDesignations: Record<string, Record<string, string[]>> = {};
    for (const [code, byDept] of Object.entries(manualDesigSets)) {
      manualDesignations[code] = {};
      for (const [dept, set] of Object.entries(byDept)) {
        manualDesignations[code][dept] = Array.from(set);
      }
    }

    const responseBuildStartMs = nowMs();
    const response: ManageSOPViewResponse = {
      sops: sops.sort((a: SOPViewRow, b: SOPViewRow) => {
        const ra = deptRank(a);
        const rb = deptRank(b);
        if (ra !== rb) return ra - rb;
        return a.sopCode.localeCompare(b.sopCode);
      }),
      departments: DEFAULT_DEPARTMENTS,
      designationsByDept: designationsByDeptObj,
      employeeCountsByDeptDesig: employeeCountsByDeptDesigObj,
      employeesByDept: employeesByDeptObj,
      stats: {
        total: totalSOPs,
        assigned: assignedCount,
        unassigned: unassignedSOPs,
      },
      sopCountsByDeptMonth,
      sopCountsByMonth,
      sopCountsByDept,
      unassignedSopCodes: Array.from(unassignedSopCodes),
      manualAllocations,
      manualDesignations,
      year: yearAll ? "all" : year,
    };
    const responseBuildMs = elapsedMs(responseBuildStartMs);

    const cacheStoreStartMs = nowMs();
    await setManageSopViewCached(cacheYear, search, response);
    const cacheStoreMs = elapsedMs(cacheStoreStartMs);

    console.info(
      `${MANAGE_SOP_API_LOG} GET /api/training-matrix/manage-sop-view source=manage-sop cache=MISS year=${cacheYear} search="${search}" dbConnectMs=${dbConnectMs} dataFetchMs=${dataFetchMs} buildMs=${responseBuildMs} cacheStoreMs=${cacheStoreMs} dashboardCache=${dashboardCached ? "HIT" : "MISS"} overviewCache=${overviewCached ? "HIT" : "MISS"} totalMs=${elapsedMs(reqStartMs)}`,
    );

    return response;
}

// ─── POST: persist manual edits into TrainingMatrixRecord ───────────────────────
// The Manage SOP page lets users toggle designations + months for a given SOP/dept.
// Each entry expands into one TrainingMatrixRecord per (employee in dept+designation,
// sopCode, month, year), upserted to be idempotent against the unique index
// { employeeName, sopCode, month, year, department }.

export interface ManageSOPApplyEntry {
  sopCode: string;
  sopName?: string;
  department: string;
  designations: string[]; // resolved designation names (not abbreviations)
  months: number[];
  year?: number;
}

export interface ManageSOPRemoveEntry {
  sopCode: string;
  sopName?: string;
  department: string;
  // When omitted/empty with removeAllDesignations=true, remove all designations.
  designations?: string[];
  months: number[];
  year?: number;
  removeAllDesignations?: boolean;
}

export interface ManageSOPApplyRequest {
  entries?: ManageSOPApplyEntry[];
  removals?: ManageSOPRemoveEntry[];
}

async function getOrCreateManualUploadId(
  dept: string,
  year: number,
  month: number,
): Promise<any> {
  const filter = {
    department: dept,
    year,
    month,
    fileType: "addendum" as const,
    fileName: "manage-sop-manual",
  };
  const existing = await TrainingMatrixUpload.findOne(filter).lean();
  if (existing && (existing as any)._id) return (existing as any)._id;
  const created = await TrainingMatrixUpload.create({
    ...filter,
    monthName: MONTH_NAMES[month] || `Month ${month}`,
    uploadedBy: "manage-sop",
  });
  return created._id;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const reqStartMs = nowMs();
  try {
    const dbConnectStartMs = nowMs();
    await connectDB();
    const dbConnectMs = elapsedMs(dbConnectStartMs);
    const body = (await request.json()) as ManageSOPApplyRequest;
    const upsertEntries = Array.isArray(body?.entries) ? body.entries : [];
    const removalEntries = Array.isArray(body?.removals) ? body.removals : [];
    if (!body || (upsertEntries.length === 0 && removalEntries.length === 0)) {
      console.info(
        `${MANAGE_SOP_API_LOG} POST /api/training-matrix/manage-sop-view source=manage-sop empty_payload dbConnectMs=${dbConnectMs} totalMs=${elapsedMs(reqStartMs)}`,
      );
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 },
      );
    }

    const fallbackYear = new Date().getFullYear();
    let totalInserted = 0;
    let totalMatched = 0;
    let totalUnchanged = 0;
    let totalRemoved = 0;
    const warnings: string[] = [];

    for (const removal of removalEntries) {
      const sopCode = (removal.sopCode || "").trim();
      const department = (removal.department || "").trim();
      const months = (removal.months || []).filter(
        (m) => Number.isInteger(m) && m >= 1 && m <= 12,
      );
      const designations = (removal.designations || [])
        .map((d) => (d || "").trim())
        .filter(Boolean);
      const removeAllDesignations = removal.removeAllDesignations === true;
      const year =
        removal.year && Number.isInteger(removal.year)
          ? removal.year
          : fallbackYear;

      if (!sopCode || !department || months.length === 0) continue;
      if (!removeAllDesignations && designations.length === 0) continue;

      const filter: Record<string, any> = {
        sopCode,
        department,
        year,
        month: { $in: months },
        sourceFile: "manage-sop-manual",
      };
      if (!removeAllDesignations) {
        filter.designation = { $in: designations };
      }

      const del = await TrainingMatrixRecord.deleteMany(filter);
      totalRemoved += del.deletedCount || 0;
    }

    for (const entry of upsertEntries) {
      const sopCode = (entry.sopCode || "").trim();
      const department = (entry.department || "").trim();
      const designations = (entry.designations || [])
        .map((d) => (d || "").trim())
        .filter(Boolean);
      const months = (entry.months || []).filter(
        (m) => Number.isInteger(m) && m >= 1 && m <= 12,
      );
      const year =
        entry.year && Number.isInteger(entry.year) ? entry.year : fallbackYear;

      if (
        !sopCode ||
        !department ||
        designations.length === 0 ||
        months.length === 0
      ) {
        continue;
      }

      // All employees in (dept, designation ∈ list) — one record per employee per month
      const employees = await Employee.find({
        isActive: true,
        department,
        designation: { $in: designations },
      })
        .select("name designation")
        .lean();

      if (employees.length === 0) {
        warnings.push(
          `No active employees found in ${department} for designations: ${designations.join(", ")}`,
        );
        continue;
      }

      // Cache uploadId per (dept, year, month) — one per month
      const uploadIdCache = new Map<number, any>();
      const ops: any[] = [];
      for (const month of months) {
        let uploadId = uploadIdCache.get(month);
        if (!uploadId) {
          uploadId = await getOrCreateManualUploadId(department, year, month);
          uploadIdCache.set(month, uploadId);
        }
        const monthName = MONTH_NAMES[month] || `Month ${month}`;
        for (const emp of employees as any[]) {
          const employeeName = String(emp.name || "").trim();
          const designation = String(emp.designation || "").trim();
          if (!employeeName) continue;
          ops.push({
            updateOne: {
              filter: { employeeName, sopCode, month, year, department },
              update: {
                $setOnInsert: {
                  uploadId,
                  department,
                  employeeName,
                  designation,
                  sopCode,
                  sopName: entry.sopName || sopCode,
                  month,
                  year,
                  monthName,
                  rawSymbol: "✓",
                  sourceFile: "manage-sop-manual",
                  isAddendum: true,
                },
                // Always normalize status to 'completed' on apply — the user is asserting
                // these trainings happened.
                $set: { status: "completed" },
              },
              upsert: true,
            },
          });
        }
      }

      if (ops.length === 0) continue;
      const result = await TrainingMatrixRecord.bulkWrite(ops, {
        ordered: false,
      });
      const inserted = (result as any).upsertedCount || 0;
      const matched = (result as any).matchedCount || 0;
      const modified = (result as any).modifiedCount || 0;
      totalInserted += inserted;
      totalMatched += matched;
      totalUnchanged += matched - modified;

      // Sync the assigned/unassigned counts shown on the main Training Matrix page.
      // The overview endpoint computes those from the dept's latest `fileType: 'main'`
      // upload (`snapshot.sopCodes` for "in Excel" and `snapshot.sopMonthMap` for the
      // scheduled month). Without this update, the SOP would still appear in the
      // "missing from Excel" red bucket after the user clicked Update, so the cards
      // wouldn't move from 43 → 42 / 702 → 703.
      try {
        const mainUpload: any = await TrainingMatrixUpload.findOne({
          department,
          fileType: "main",
          snapshot: { $exists: true, $ne: null },
        })
          .sort({ uploadedAt: -1 })
          .lean();
        if (mainUpload?._id) {
          const snapshotCodes: string[] = Array.isArray(
            mainUpload?.snapshot?.sopCodes,
          )
            ? mainUpload.snapshot.sopCodes
            : [];
          const base = stripVersion(sopCode);
          const alreadyInCodes = snapshotCodes.some(
            (c) => stripVersion(String(c)) === base,
          );
          const firstMonth = months[0];
          const monthName = MONTH_NAMES[firstMonth] || `Month ${firstMonth}`;
          const update: any = {
            $set: { [`snapshot.sopMonthMap.${sopCode}`]: monthName },
          };
          if (!alreadyInCodes) {
            update.$addToSet = { "snapshot.sopCodes": sopCode };
          }

          // Mark the SOP as completed in the per-employee training map so the
          // Training Matrix employee × SOP detail grid (rendered from
          // snapshot.employees[].training) also reflects the new assignment.
          const snapshotEmployees: Array<{
            name?: string;
            designation?: string;
            training?: Record<string, boolean>;
          }> = Array.isArray(mainUpload?.snapshot?.employees)
            ? mainUpload.snapshot.employees
            : [];
          const desigSet = new Set(designations.map((d) => d.toLowerCase()));
          snapshotEmployees.forEach((emp, idx) => {
            const desig = String(emp?.designation || "").toLowerCase();
            if (!desigSet.has(desig)) return;
            update.$set[`snapshot.employees.${idx}.training.${sopCode}`] = true;
          });

          await TrainingMatrixUpload.updateOne({ _id: mainUpload._id }, update);
        } else {
          warnings.push(
            `No main Training Matrix upload found for ${department} — count cards will not refresh until an Excel is uploaded for this dept.`,
          );
        }
      } catch (e) {
        warnings.push(
          `Failed to sync ${department} snapshot for ${sopCode}: ${(e as Error).message}`,
        );
      }
    }

    // Drop all related caches so the next GET after "Update" reflects DB writes immediately.
    try {
      await Promise.all([
        invalidateTrainingMatrixCache(),
        invalidateInductionTrainingMatrixCache(),
        invalidateManageSopViewCache(),
      ]);
    } catch {
      // Cache invalidation is best-effort; not fatal.
    }

    console.info(
      `${MANAGE_SOP_API_LOG} POST /api/training-matrix/manage-sop-view source=manage-sop dbConnectMs=${dbConnectMs} upsertEntries=${upsertEntries.length} removalEntries=${removalEntries.length} inserted=${totalInserted} removed=${totalRemoved} updated=${totalMatched} unchanged=${totalUnchanged} warnings=${warnings.length} totalMs=${elapsedMs(reqStartMs)}`,
    );

    return NextResponse.json(
      {
        success: true,
        inserted: totalInserted,
        removed: totalRemoved,
        updated: totalMatched,
        unchanged: totalUnchanged,
        warnings,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      `${MANAGE_SOP_API_LOG} POST /api/training-matrix/manage-sop-view source=manage-sop FAILED totalMs=${elapsedMs(reqStartMs)}`,
      error,
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to apply changes",
      },
      { status: 500 },
    );
  }
}

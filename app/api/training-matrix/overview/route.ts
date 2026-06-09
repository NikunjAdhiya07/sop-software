import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import DepartmentTrainer from '@/models/DepartmentTrainer';
import { groupSOPRecords, baseIdentifierFromIdentifier } from '@/lib/sop-utils';
import { getServerGroupedCache, setServerGroupedCache, invalidateDashboardSopsCache } from '@/lib/cache';
import { getTrainingMatrixCached, setTrainingMatrixCached } from '@/lib/trainingMatrixCache';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Training Matrix overview — backed by the same SOP registry the Dashboard uses
// (SOP collection → groupSOPRecords) plus MCQ stats from the MCQ collection.
//
// The UI labels MCQ "created" as "≥100 per required language", so we keep that
// threshold. If your SOPs use fewer MCQs, lower MCQ_CREATED_THRESHOLD below.
// ─────────────────────────────────────────────────────────────────────────────

const MCQ_CREATED_THRESHOLD = 100;

const DEFAULT_DEPARTMENTS = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'];

type LangKey = 'ENG' | 'GUJ';

/** Map any stored department string onto the canonical Training Matrix set. */
function canonDept(raw: string): string {
  const t = String(raw || '').toLowerCase();
  if (/micro/.test(t)) return 'Microbiology';
  if (/engineer|maint/.test(t)) return 'Engineering';
  if (/person|\bhr\b/.test(t)) return 'Personnel';
  if (/\bqa\b|quality.?assur/.test(t)) return 'QA';
  if (/\bqc\b|quality.?cont/.test(t)) return 'QC';
  if (/store/.test(t)) return 'Store';
  if (/prod/.test(t)) return 'Production';
  return String(raw || '').trim();
}

function isValidDept(d: string): boolean {
  return Boolean(d) && !/^(unknown|general)$/i.test(d);
}

// ── MCQ buckets (ported from the reference overview) ─────────────────────────
type LangStat = { totalQuestions: number; approvedCount: number };

function buildEmptyMcqBuckets() {
  return {
    mcqCreatedCount: 0, mcqNotCreatedCount: 0,
    mcqCreatedList: [] as string[], mcqNotCreatedList: [] as string[],
    mcqEngOnlyCreatedCount: 0, mcqEngOnlyNotCreatedCount: 0,
    mcqEngOnlyCreatedList: [] as string[], mcqEngOnlyNotCreatedList: [] as string[],
    mcqDualEngCreatedCount: 0, mcqDualEngNotCreatedCount: 0,
    mcqDualEngCreatedList: [] as string[], mcqDualEngNotCreatedList: [] as string[],
    mcqDualGujCreatedCount: 0, mcqDualGujNotCreatedCount: 0,
    mcqDualGujCreatedList: [] as string[], mcqDualGujNotCreatedList: [] as string[],
    mcqDualBothCreatedCount: 0, mcqDualEitherIncompleteCount: 0,
    mcqDualBothCreatedList: [] as string[], mcqDualEitherIncompleteList: [] as string[],
    mcqDualSopCount: 0,
    mcqEngCreatedCount: 0, mcqEngNotCreatedCount: 0,
    mcqEngCreatedList: [] as string[], mcqEngNotCreatedList: [] as string[],
    mcqGujCreatedCount: 0, mcqGujNotCreatedCount: 0,
    mcqGujCreatedList: [] as string[], mcqGujNotCreatedList: [] as string[],
    mcqAllApprovedCount: 0, mcqPartiallyApprovedCount: 0, mcqNotApprovedCount: 0,
    mcqAllApprovedList: [] as string[], mcqPartiallyApprovedList: [] as string[], mcqNotApprovedList: [] as string[],
    mcqApprovedNonDualCount: 0, mcqApprovalPartialNonDualCount: 0, mcqApprovalMissingNonDualCount: 0,
    mcqApprovedNonDualList: [] as string[], mcqApprovalPartialNonDualList: [] as string[], mcqApprovalMissingNonDualList: [] as string[],
    mcqApprovedDualCount: 0, mcqApprovalPartialDualCount: 0, mcqApprovalMissingDualCount: 0,
    mcqApprovedDualList: [] as string[], mcqApprovalPartialDualList: [] as string[], mcqApprovalMissingDualList: [] as string[],
    mcqDualSlotEngAllApprovedCount: 0, mcqDualSlotEngPartiallyApprovedCount: 0, mcqDualSlotEngNotApprovedCount: 0,
    mcqDualSlotEngAllApprovedList: [] as string[], mcqDualSlotEngPartiallyApprovedList: [] as string[], mcqDualSlotEngNotApprovedList: [] as string[],
    mcqDualSlotGujAllApprovedCount: 0, mcqDualSlotGujPartiallyApprovedCount: 0, mcqDualSlotGujNotApprovedCount: 0,
    mcqDualSlotGujAllApprovedList: [] as string[], mcqDualSlotGujPartiallyApprovedList: [] as string[], mcqDualSlotGujNotApprovedList: [] as string[],
    mcqEngAllApprovedCount: 0, mcqEngPartiallyApprovedCount: 0, mcqEngNotApprovedCount: 0,
    mcqEngAllApprovedList: [] as string[], mcqEngPartiallyApprovedList: [] as string[], mcqEngNotApprovedList: [] as string[],
    mcqGujAllApprovedCount: 0, mcqGujPartiallyApprovedCount: 0, mcqGujNotApprovedCount: 0,
    mcqGujAllApprovedList: [] as string[], mcqGujPartiallyApprovedList: [] as string[], mcqGujNotApprovedList: [] as string[],
  };
}
type McqBuckets = ReturnType<typeof buildEmptyMcqBuckets>;

function computeMcqBuckets(
  sopCodes: Iterable<string>,
  dbBaseLangs: Map<string, Set<LangKey>>,
  mcqLangStatMap: Map<string, { eng: LangStat; guj: LangStat }>,
): McqBuckets {
  const b = buildEmptyMcqBuckets();
  const T = MCQ_CREATED_THRESHOLD;
  for (const code of sopCodes) {
    const langSet = dbBaseLangs.get(code) || new Set<LangKey>(['ENG']);
    const isDual = langSet.has('GUJ');
    const langStat = mcqLangStatMap.get(code);
    const engTq = langStat?.eng.totalQuestions ?? 0;
    const engApproved = langStat?.eng.approvedCount ?? 0;
    const gujTq = langStat?.guj.totalQuestions ?? 0;
    const gujApproved = langStat?.guj.approvedCount ?? 0;
    const engOk = engTq >= T;
    const gujOk = gujTq >= T;
    const sopOk = isDual ? (engOk && gujOk) : engOk;

    if (sopOk) { b.mcqCreatedCount++; b.mcqCreatedList.push(code); }
    else { b.mcqNotCreatedCount++; b.mcqNotCreatedList.push(code); }

    if (!isDual) {
      if (engOk) { b.mcqEngOnlyCreatedCount++; b.mcqEngOnlyCreatedList.push(code); }
      else { b.mcqEngOnlyNotCreatedCount++; b.mcqEngOnlyNotCreatedList.push(code); }
    } else {
      b.mcqDualSopCount++;
      if (engOk) { b.mcqDualEngCreatedCount++; b.mcqDualEngCreatedList.push(code); }
      else { b.mcqDualEngNotCreatedCount++; b.mcqDualEngNotCreatedList.push(code); }
      if (gujOk) { b.mcqDualGujCreatedCount++; b.mcqDualGujCreatedList.push(code); }
      else { b.mcqDualGujNotCreatedCount++; b.mcqDualGujNotCreatedList.push(code); }
      if (engOk && gujOk) { b.mcqDualBothCreatedCount++; b.mcqDualBothCreatedList.push(code); }
      else { b.mcqDualEitherIncompleteCount++; b.mcqDualEitherIncompleteList.push(code); }
    }

    if (engOk) { b.mcqEngCreatedCount++; b.mcqEngCreatedList.push(code); }
    else { b.mcqEngNotCreatedCount++; b.mcqEngNotCreatedList.push(code); }
    if (isDual) {
      if (gujOk) { b.mcqGujCreatedCount++; b.mcqGujCreatedList.push(code); }
      else { b.mcqGujNotCreatedCount++; b.mcqGujNotCreatedList.push(code); }
    }

    if (sopOk) {
      if (!isDual) {
        if (engTq > 0 && engApproved >= engTq) {
          b.mcqAllApprovedCount++; b.mcqAllApprovedList.push(code);
          b.mcqApprovedNonDualCount++; b.mcqApprovedNonDualList.push(code);
        } else if (engApproved > 0) {
          b.mcqPartiallyApprovedCount++; b.mcqPartiallyApprovedList.push(code);
          b.mcqApprovalPartialNonDualCount++; b.mcqApprovalPartialNonDualList.push(code);
        } else {
          b.mcqNotApprovedCount++; b.mcqNotApprovedList.push(code);
          b.mcqApprovalMissingNonDualCount++; b.mcqApprovalMissingNonDualList.push(code);
        }
      } else {
        const engFull = engTq > 0 && engApproved >= engTq;
        const gujFull = gujTq > 0 && gujApproved >= gujTq;
        const engNone = engApproved === 0;
        const gujNone = gujApproved === 0;
        if (engFull && gujFull) {
          b.mcqAllApprovedCount++; b.mcqAllApprovedList.push(code);
          b.mcqApprovedDualCount++; b.mcqApprovedDualList.push(code);
        } else if (engNone || gujNone) {
          b.mcqNotApprovedCount++; b.mcqNotApprovedList.push(code);
          b.mcqApprovalMissingDualCount++; b.mcqApprovalMissingDualList.push(code);
        } else {
          b.mcqPartiallyApprovedCount++; b.mcqPartiallyApprovedList.push(code);
          b.mcqApprovalPartialDualCount++; b.mcqApprovalPartialDualList.push(code);
        }
        if (engTq > 0 && engApproved >= engTq) { b.mcqDualSlotEngAllApprovedCount++; b.mcqDualSlotEngAllApprovedList.push(code); }
        else if (engApproved > 0) { b.mcqDualSlotEngPartiallyApprovedCount++; b.mcqDualSlotEngPartiallyApprovedList.push(code); }
        else { b.mcqDualSlotEngNotApprovedCount++; b.mcqDualSlotEngNotApprovedList.push(code); }
        if (gujTq > 0 && gujApproved >= gujTq) { b.mcqDualSlotGujAllApprovedCount++; b.mcqDualSlotGujAllApprovedList.push(code); }
        else if (gujApproved > 0) { b.mcqDualSlotGujPartiallyApprovedCount++; b.mcqDualSlotGujPartiallyApprovedList.push(code); }
        else { b.mcqDualSlotGujNotApprovedCount++; b.mcqDualSlotGujNotApprovedList.push(code); }
      }
    }

    if (engTq > 0) {
      if (engApproved >= engTq) { b.mcqEngAllApprovedCount++; b.mcqEngAllApprovedList.push(code); }
      else if (engApproved > 0) { b.mcqEngPartiallyApprovedCount++; b.mcqEngPartiallyApprovedList.push(code); }
      else { b.mcqEngNotApprovedCount++; b.mcqEngNotApprovedList.push(code); }
    } else { b.mcqEngNotApprovedCount++; b.mcqEngNotApprovedList.push(code); }
    if (isDual) {
      if (gujTq > 0) {
        if (gujApproved >= gujTq) { b.mcqGujAllApprovedCount++; b.mcqGujAllApprovedList.push(code); }
        else if (gujApproved > 0) { b.mcqGujPartiallyApprovedCount++; b.mcqGujPartiallyApprovedList.push(code); }
        else { b.mcqGujNotApprovedCount++; b.mcqGujNotApprovedList.push(code); }
      } else { b.mcqGujNotApprovedCount++; b.mcqGujNotApprovedList.push(code); }
    }
  }
  return b;
}

export async function GET(request: NextRequest) {
  try {
    const forceFresh = request.nextUrl.searchParams.get('refresh') === '1';
    if (!forceFresh) {
      const cached = await getTrainingMatrixCached();
      if (cached) return NextResponse.json(cached);
    }

    await connectDB();

    if (forceFresh) invalidateDashboardSopsCache();

    // 1. Same SOP source as the Dashboard: collapse versions into one row per family.
    let registry = getServerGroupedCache();
    if (!registry) {
      const records = await SOP.find({}).lean();
      registry = groupSOPRecords(records as never[]);
      setServerGroupedCache(registry);
    }
    const active = registry.filter((r) => !r.isObsolete);

    // 2. MCQ stats from the `mcqbanks` collection — one doc per SOP + language.
    //    totalQuestions = the doc's count (fallback to mcqs.length);
    //    approvedCount  = number of mcqs flagged isChecked === true.
    const mcqAgg = await MCQBank.aggregate([
      { $match: { isObsolete: { $ne: true } } },
      {
        $project: {
          sopIdentifier: 1,
          language: 1,
          totalQuestions: { $ifNull: ['$totalQuestions', { $size: { $ifNull: ['$mcqs', []] } }] },
          approvedCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$mcqs', []] },
                as: 'm',
                cond: { $eq: ['$$m.isChecked', true] },
              },
            },
          },
        },
      },
    ]);

    const mcqLangStatMap = new Map<string, { eng: LangStat; guj: LangStat }>();
    const mcqStatMap = new Map<string, LangStat>();
    for (const row of mcqAgg as Array<{ sopIdentifier: string; language: string | null; totalQuestions: number; approvedCount: number }>) {
      const base = baseIdentifierFromIdentifier(String(row.sopIdentifier || ''));
      if (!base) continue;
      const isGuj = String(row.language || '') === 'Gujarati';
      const total = row.totalQuestions || 0;
      const approved = row.approvedCount || 0;
      if (!mcqLangStatMap.has(base)) mcqLangStatMap.set(base, { eng: { totalQuestions: 0, approvedCount: 0 }, guj: { totalQuestions: 0, approvedCount: 0 } });
      const entry = mcqLangStatMap.get(base)!;
      const slot = isGuj ? entry.guj : entry.eng;
      slot.totalQuestions += total;
      slot.approvedCount += approved;
      const combined = mcqStatMap.get(base) || { totalQuestions: 0, approvedCount: 0 };
      combined.totalQuestions += total;
      combined.approvedCount += approved;
      mcqStatMap.set(base, combined);
    }

    // 3. Per-family metadata, languages, department.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

    const dbBaseSet = new Set<string>();
    const dbBaseLangs = new Map<string, Set<LangKey>>();
    const dbBaseMeta = new Map<string, {
      title: string;
      gujaratiName?: string;
      isDualLanguage: boolean;
      dept: string;
      expired: boolean;
      targetDate: string | null;
      dueSoon: boolean;
    }>();
    const dbDocPathsByCode: Record<string, { eng?: string; guj?: string; id?: string }> = {};
    const deptSet = new Set<string>(DEFAULT_DEPARTMENTS);

    for (const row of active) {
      const base = baseIdentifierFromIdentifier(row.identifier);
      if (!base || dbBaseSet.has(base)) continue;
      dbBaseSet.add(base);

      const langs = new Set<LangKey>();
      if (row.language === 'ENG' || row.language === 'ENG-GUJ') langs.add('ENG');
      if (row.language === 'GUJ' || row.language === 'ENG-GUJ') langs.add('GUJ');
      if (langs.size === 0) langs.add('ENG');
      dbBaseLangs.set(base, langs);

      const dept = canonDept(row.department);
      if (isValidDept(dept)) deptSet.add(dept);

      const expired = row.expiryTier === 'expired';
      const targetDate = row.expiryDate || null;
      let dueSoon = false;
      if (targetDate && !expired) {
        const t = new Date(targetDate).getTime();
        if (!Number.isNaN(t) && t - today.getTime() <= THIRTY_DAYS) dueSoon = true;
      }
      dbBaseMeta.set(base, {
        title: row.name || '',
        gujaratiName: row.nameGujarati,
        isDualLanguage: row.language === 'ENG-GUJ' || !!(row.name && row.nameGujarati),
        dept: isValidDept(dept) ? dept : 'General',
        expired,
        targetDate,
        dueSoon,
      });

      // Document paths for the in-app DOCX viewer (prefer DOCX, fall back to PDF).
      const engPath = row.files?.docx?.en || row.files?.pdf?.en;
      const gujPath = row.files?.docx?.gu || row.files?.pdf?.gu;
      if (engPath || gujPath) {
        dbDocPathsByCode[base] = {
          ...(engPath ? { eng: engPath } : {}),
          ...(gujPath ? { guj: gujPath } : {}),
          id: row.identifier,
        };
      }
    }

    // Augment language slots from Gujarati titles and MCQ banks — many SOPs store
    // Gujarati text under language="English" but still have Gujarati MCQ banks.
    for (const base of dbBaseSet) {
      const langs = dbBaseLangs.get(base) || new Set<LangKey>(['ENG']);
      const meta = dbBaseMeta.get(base)!;
      const ls = mcqLangStatMap.get(base);
      if ((ls?.eng.totalQuestions ?? 0) > 0) langs.add('ENG');
      if ((ls?.guj.totalQuestions ?? 0) > 0) langs.add('GUJ');
      if (meta.gujaratiName) langs.add('GUJ');
      if (meta.title) langs.add('ENG');
      dbBaseLangs.set(base, langs);
      meta.isDualLanguage = langs.has('ENG') && langs.has('GUJ');
    }

    const departments = [
      ...DEFAULT_DEPARTMENTS,
      ...[...deptSet].filter((d) => !DEFAULT_DEPARTMENTS.includes(d)).sort((a, b) => a.localeCompare(b)),
    ];

    // 4. Department → base codes.
    const codesByDept: Record<string, string[]> = {};
    for (const d of departments) codesByDept[d] = [];
    for (const base of dbBaseSet) {
      const d = dbBaseMeta.get(base)!.dept;
      if (!codesByDept[d]) codesByDept[d] = [];
      codesByDept[d].push(base);
    }
    for (const d of Object.keys(codesByDept)) codesByDept[d].sort((a, b) => a.localeCompare(b));

    // 5. sopStatusByCode (used by the table + detail panels).
    const sopStatusByCode: Record<string, {
      expired: boolean; targetDate: string | null; totalQuestions: number; approvedCount: number;
      engTotalQuestions: number; engApprovedCount: number; gujTotalQuestions: number; gujApprovedCount: number;
      title: string; gujaratiName?: string; isDualLanguage: boolean;
    }> = {};
    for (const base of dbBaseSet) {
      const meta = dbBaseMeta.get(base)!;
      const ls = mcqLangStatMap.get(base);
      const combined = mcqStatMap.get(base) || { totalQuestions: 0, approvedCount: 0 };
      sopStatusByCode[base] = {
        expired: meta.expired,
        targetDate: meta.targetDate,
        totalQuestions: combined.totalQuestions,
        approvedCount: combined.approvedCount,
        engTotalQuestions: ls?.eng.totalQuestions ?? 0,
        engApprovedCount: ls?.eng.approvedCount ?? 0,
        gujTotalQuestions: ls?.guj.totalQuestions ?? 0,
        gujApprovedCount: ls?.guj.approvedCount ?? 0,
        title: meta.title,
        gujaratiName: meta.gujaratiName,
        isDualLanguage: meta.isDualLanguage,
      };
    }

    // 5b. Trainers (from the migrated `departmenttrainers` collection) and
    //     uploads/snapshots (from `trainingmatricesupload`).
    const [trainerDocs, uploads] = await Promise.all([
      DepartmentTrainer.find({}).select('departmentName sopIdentifier trainerName').lean(),
      TrainingMatrixUpload.find({ snapshot: { $exists: true, $ne: null } })
        .sort({ uploadedAt: -1 })
        .select('department uploadedAt fileUrl fileName snapshot')
        .lean(),
    ]);

    // base SOP code → trainer names (SOP-specific), and dept → trainer names (dept-level).
    const sopTrainerMap = new Map<string, Set<string>>();
    const deptTrainerMap = new Map<string, Set<string>>();
    for (const t of trainerDocs as Array<{ departmentName?: string; sopIdentifier?: string; trainerName?: string }>) {
      const name = String(t.trainerName || '').trim();
      if (!name) continue;
      if (t.sopIdentifier) {
        const base = baseIdentifierFromIdentifier(String(t.sopIdentifier));
        if (base) {
          if (!sopTrainerMap.has(base)) sopTrainerMap.set(base, new Set());
          sopTrainerMap.get(base)!.add(name);
        }
      } else if (t.departmentName) {
        const d = canonDept(String(t.departmentName));
        if (!deptTrainerMap.has(d)) deptTrainerMap.set(d, new Set());
        deptTrainerMap.get(d)!.add(name);
      }
    }
    // Resolve per-SOP trainer: SOP-specific first, then dept-level.
    const baseTrainerCount = new Map<string, number>();
    const baseTrainerName = new Map<string, string>();
    for (const base of dbBaseSet) {
      const ownerDept = dbBaseMeta.get(base)!.dept;
      let names: Set<string> | undefined;
      if (sopTrainerMap.has(base) && sopTrainerMap.get(base)!.size) names = sopTrainerMap.get(base)!;
      else if (deptTrainerMap.has(ownerDept) && deptTrainerMap.get(ownerDept)!.size) names = deptTrainerMap.get(ownerDept)!;
      baseTrainerCount.set(base, names ? names.size : 0);
      if (names) baseTrainerName.set(base, [...names].join(', '));
    }

    // Latest snapshot per canonical department.
    const stripVer = (c: string) => String(c || '').toUpperCase().replace(/-\d+$/, '').trim();
    const normalizeTraining = (training: Record<string, boolean> | undefined) => {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(training || {})) {
        const b = stripVer(k);
        if (!b) continue;
        out[b] = out[b] || !!v;
      }
      return out;
    };
    type SnapEmp = { name: string; designation: string; department: string; training: Record<string, boolean> };
    type DeptExcel = {
      uploaded: boolean; fileUrl: string | null; uploadedAt: string | null; fileName?: string;
      excelCodes: Set<string>; employees: SnapEmp[]; monthCounts: Record<string, number>; sopMonthMap: Record<string, string>;
    };
    const excelByDept = new Map<string, DeptExcel>();
    for (const up of uploads as Array<{ department: string; uploadedAt?: Date; fileUrl?: string; fileName?: string; snapshot?: { sopCodes?: string[]; monthCounts?: Record<string, number>; sopMonthMap?: Record<string, string>; employees?: SnapEmp[] } }>) {
      const dept = canonDept(up.department);
      if (excelByDept.has(dept)) continue; // uploads are sorted desc — keep newest
      const snap = up.snapshot || {};
      const excelCodes = new Set<string>((snap.sopCodes || []).map(stripVer).filter(Boolean));
      const sopMonthMap: Record<string, string> = {};
      for (const [k, m] of Object.entries(snap.sopMonthMap || {})) { const b = stripVer(k); if (b && m) sopMonthMap[b] = m; }
      const employees = (snap.employees || []).map((e) => ({
        name: e.name, designation: e.designation, department: dept, training: normalizeTraining(e.training),
      }));
      excelByDept.set(dept, {
        uploaded: true,
        fileUrl: up.fileUrl || null,
        uploadedAt: up.uploadedAt ? new Date(up.uploadedAt).toISOString() : null,
        fileName: up.fileName,
        excelCodes, employees, monthCounts: snap.monthCounts || {}, sopMonthMap,
      });
    }

    // How many distinct departments contain each SOP code in Excel (repetition).
    const sopCodeToDeptCount = new Map<string, number>();
    for (const { excelCodes } of excelByDept.values()) {
      for (const c of excelCodes) sopCodeToDeptCount.set(c, (sopCodeToDeptCount.get(c) || 0) + 1);
    }

    const allExcelEmployees: SnapEmp[] = [];

    // 6. Card builder shared by Total + per-dept.
    const buildCard = (codes: string[], deptName: string, excel: DeptExcel | null) => {
      const expiredCount = codes.filter((c) => dbBaseMeta.get(c)!.expired).length;
      const okayCount = codes.length - expiredCount;
      const dueSoon30List = codes.filter((c) => dbBaseMeta.get(c)!.dueSoon);
      const engNeeded = codes.filter((c) => (dbBaseLangs.get(c) || new Set(['ENG'])).has('ENG')).length;
      const gujNeeded = codes.filter((c) => (dbBaseLangs.get(c) || new Set(['ENG'])).has('GUJ')).length;
      const langBreakdown = [
        { key: 'ENG', label: 'ENG', found: engNeeded, missing: 0 },
        ...(gujNeeded > 0 ? [{ key: 'GUJ', label: 'GUJ', found: gujNeeded, missing: 0 }] : []),
      ];
      const mcq = computeMcqBuckets(codes, dbBaseLangs, mcqLangStatMap);

      // SOP-wise trainer buckets (scope = this card's DB SOP codes).
      const sop0TrainerList = codes.filter((c) => (baseTrainerCount.get(c) ?? 0) === 0);
      const sop1TrainerList = codes.filter((c) => (baseTrainerCount.get(c) ?? 0) === 1);
      const sop2PlusTrainerList = codes.filter((c) => (baseTrainerCount.get(c) ?? 0) >= 2);
      const sopTrainersAssigned = codes.filter((c) => (baseTrainerCount.get(c) ?? 0) > 0).length;
      const sopTrainersMissingList = codes
        .filter((c) => (baseTrainerCount.get(c) ?? 0) === 0)
        .map((c) => ({ sopCode: c, title: dbBaseMeta.get(c)!.title, department: deptName }));

      // Excel / training-matrix enrichment from the upload snapshot.
      const excelCodes = excel?.excelCodes ?? new Set<string>();
      const employees = excel?.employees ?? [];
      const foundInDb = codes.filter((c) => excelCodes.has(c));
      const missingFromExcelCodes = codes.filter((c) => !excelCodes.has(c));
      const missingFromExcelList = missingFromExcelCodes.map((c) => ({ sopCode: c, title: dbBaseMeta.get(c)!.title, department: deptName }));
      const fullyTrained = employees.filter((e) => {
        const vals = Object.values(e.training || {});
        return vals.length > 0 && vals.every(Boolean);
      }).length;

      // Trainer rows scoped to Excel-found SOPs (matches the reference "trainers" capsule).
      const trainersAssigned = foundInDb.filter((c) => (baseTrainerCount.get(c) ?? 0) > 0).length;
      const trainersMissingList = foundInDb
        .filter((c) => (baseTrainerCount.get(c) ?? 0) === 0)
        .map((c) => ({ sopCode: c, month: excel?.sopMonthMap?.[c] || '', department: deptName }));

      // Repetition buckets (how many departments share each SOP in Excel).
      const repeat3PlusList: Array<{ sopCode: string; title: string; department: string; count: number }> = [];
      const repeat2List: typeof repeat3PlusList = [];
      const repeat1List: typeof repeat3PlusList = [];
      for (const c of foundInDb) {
        const count = sopCodeToDeptCount.get(c) || 1;
        const item = { sopCode: c, title: dbBaseMeta.get(c)!.title, department: deptName, count };
        if (count >= 3) repeat3PlusList.push(item);
        else if (count === 2) repeat2List.push(item);
        else repeat1List.push(item);
      }

      return {
        ...mcq,
        sopCount: excelCodes.size,
        foundInDb: foundInDb.length,
        langBreakdown,
        okayCount,
        expiredCount,
        dueSoon30Count: dueSoon30List.length,
        dueSoon30List,
        trainersAssigned,
        trainersMissing: trainersMissingList.length,
        sopTrainersAssigned,
        sopTrainersMissing: sopTrainersMissingList.length,
        sopTrainersMissingList,
        sop0TrainerCount: sop0TrainerList.length,
        sop1TrainerCount: sop1TrainerList.length,
        sop2PlusTrainerCount: sop2PlusTrainerList.length,
        sop0TrainerList,
        sop1TrainerList,
        sop2PlusTrainerList,
        missingFromExcel: missingFromExcelCodes.length,
        missingFromExcelList,
        trainersMissingList,
        trainerBySopCode: Object.fromEntries(codes.map((c) => [c, baseTrainerName.get(c) || '']).filter(([, v]) => v)),
        repeat3PlusCount: repeat3PlusList.length,
        repeat2Count: repeat2List.length,
        repeat1Count: repeat1List.length,
        repeat3PlusList,
        repeat2List,
        repeat1List,
        sopCodes: [...excelCodes].sort((a, b) => a.localeCompare(b)),
        employeeCount: employees.length,
        fullyTrained,
        incomplete: employees.length - fullyTrained,
        monthCounts: excel?.monthCounts ?? {},
        employees,
      };
    };

    // 7. Per-department cards.
    const perDept: Record<string, ReturnType<typeof buildCard> & { uploaded: boolean; fileUrl: null; uploadedAt: null }> = {};
    const sopCodesByDept: Record<string, string[]> = {};
    const sopMonthMapByDept: Record<string, Record<string, string>> = {};
    const monthCountsByDept: Record<string, Record<string, number>> = {};
    for (const dept of departments) {
      const codes = codesByDept[dept] || [];
      const excel = excelByDept.get(dept) || null;
      const card = buildCard(codes, dept, excel);
      perDept[dept] = {
        ...card,
        uploaded: excel?.uploaded ?? false,
        fileUrl: (excel?.fileUrl ?? null) as null,
        uploadedAt: (excel?.uploadedAt ?? null) as null,
        ...(excel?.fileName ? { fileName: excel.fileName } : {}),
      };
      for (const e of card.employees) allExcelEmployees.push(e);
      sopCodesByDept[dept] = card.sopCodes;
      sopMonthMapByDept[dept] = excel?.sopMonthMap ?? {};
      monthCountsByDept[dept] = excel?.monthCounts ?? {};
    }

    // 8. Total card — aggregate Excel data across all departments.
    const allCodes = [...dbBaseSet].sort((a, b) => a.localeCompare(b));
    const totalExcel: DeptExcel = {
      uploaded: excelByDept.size > 0,
      fileUrl: null, uploadedAt: null,
      excelCodes: new Set<string>(),
      employees: allExcelEmployees,
      monthCounts: {},
      sopMonthMap: {},
    };
    for (const ex of excelByDept.values()) {
      for (const c of ex.excelCodes) totalExcel.excelCodes.add(c);
      for (const [m, n] of Object.entries(ex.monthCounts)) totalExcel.monthCounts[m] = (totalExcel.monthCounts[m] || 0) + n;
      Object.assign(totalExcel.sopMonthMap, ex.sopMonthMap);
    }
    const totalBase = buildCard(allCodes, 'Total', totalExcel);
    const dbSopsByDept: Record<string, Array<{
      sopCode: string;
      title: string;
      gujaratiName?: string;
      isDualLanguage: boolean;
    }>> = {};
    const dbSopCountsByDept: Record<string, number> = {};
    for (const dept of departments) {
      const codes = codesByDept[dept] || [];
      dbSopsByDept[dept] = codes.map((c) => {
        const meta = dbBaseMeta.get(c)!;
        return {
          sopCode: c,
          title: meta.title,
          gujaratiName: meta.gujaratiName,
          isDualLanguage: meta.isDualLanguage,
        };
      });
      dbSopCountsByDept[dept] = codes.length;
    }
    const departmentCount = departments.filter((d) => (codesByDept[d] || []).length > 0).length;

    const totalCard = {
      ...totalBase,
      dbSopCount: dbBaseSet.size,
      dbSopsByDept,
      dbSopCountsByDept,
      excelSopCount: totalExcel.excelCodes.size,
      missingSopCount: totalBase.missingFromExcel,
      departmentCount,
      totalDepartments: departments.length,
    };

    const payload = {
      success: true,
      departments,
      perDept,
      totalCard,
      employees: allExcelEmployees,
      sopCodesByDept,
      sopMonthMapByDept,
      monthCountsByDept,
      sopStatusByCode,
      dbDocPathsByCode,
    };
    await setTrainingMatrixCached(payload);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load overview' },
      { status: 500 },
    );
  }
}

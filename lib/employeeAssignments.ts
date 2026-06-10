import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import SOP, { type ISOP } from '@/models/SOP';
import { resolveSopFamilyNames, isPlaceholderSopName } from '@/lib/sop-name-resolution';

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface EmployeeSopAssignment {
  sopCode: string;
  sopName?: string;
  month: number;
  monthName: string;
  year: number;
  trainingType: 'induction' | 'training';
  status?: string;
}

function empKey(department: string, name: string): string {
  return `${department}||${name}`.trim().toLowerCase();
}

// Each SOP counts once per employee — the same SOP scheduled across several
// months (or surfaced by both the records and the snapshot sources) must not
// inflate the assigned-SOP count. Dedup on the SOP code alone.
function assignmentKey(a: Pick<EmployeeSopAssignment, 'sopCode'>): string {
  return String(a.sopCode || '').toUpperCase().trim();
}

// Earlier = smaller (year, month). Used to keep the first scheduled occurrence.
function isEarlier(
  a: Pick<EmployeeSopAssignment, 'month' | 'year'>,
  b: Pick<EmployeeSopAssignment, 'month' | 'year'>,
): boolean {
  if (a.year !== b.year) return a.year < b.year;
  return a.month < b.month;
}

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

function monthNameToNum(name: string): number | null {
  const idx = MONTH_NAMES.findIndex(
    (m) => m && m.toLowerCase() === String(name || '').trim().toLowerCase(),
  );
  return idx > 0 ? idx : null;
}

export function inferTrainingType(rawSymbol: string): 'induction' | 'training' {
  const s = String(rawSymbol || '').trim();
  if (!s) return 'training';
  const lower = s.toLowerCase();
  if (lower === 'i' || lower === 'ind' || lower.includes('induction')) return 'induction';
  return 'training';
}

/** Build a base-SOP-code → display-name map from the SOP collection. */
async function buildSopNameMap(): Promise<Map<string, string>> {
  const sops = await SOP.find({ isObsolete: { $ne: true } })
    .select('name identifier sopBaseId language')
    .lean();

  const families = new Map<string, ISOP[]>();
  for (const s of sops as unknown as ISOP[]) {
    const base = String(s.sopBaseId || stripVersion(s.identifier)).toUpperCase();
    if (!base) continue;
    if (!families.has(base)) families.set(base, []);
    families.get(base)!.push(s);
  }

  const map = new Map<string, string>();
  for (const [base, records] of families) {
    const { englishName } = resolveSopFamilyNames(records, base);
    if (englishName && englishName.toUpperCase() !== base) {
      map.set(base, englishName);
    }
  }
  return map;
}

export async function getEmployeeAssignmentsMap(): Promise<Map<string, EmployeeSopAssignment[]>> {
  // empKey → (sopCode → kept assignment). One entry per SOP per employee.
  const byEmp = new Map<string, Map<string, EmployeeSopAssignment>>();
  const nameByBase = await buildSopNameMap();

  const add = (department: string, name: string, assignment: EmployeeSopAssignment) => {
    const key = empKey(department, name);
    if (!byEmp.has(key)) byEmp.set(key, new Map());
    const bySop = byEmp.get(key)!;
    const dedupeKey = assignmentKey(assignment);
    const existing = bySop.get(dedupeKey);
    // Keep the earliest-scheduled occurrence of each SOP.
    if (!existing || isEarlier(assignment, existing)) bySop.set(dedupeKey, assignment);
  };

  const records = await TrainingMatrixRecord.find({ status: { $ne: 'na' } })
    .select('employeeName department sopCode sopName month monthName year rawSymbol status')
    .sort({ year: -1, month: 1, sopCode: 1 })
    .lean();

  for (const r of records as Array<{
    employeeName: string;
    department: string;
    sopCode: string;
    sopName?: string;
    month: number;
    monthName: string;
    year: number;
    rawSymbol?: string;
    status?: string;
  }>) {
    const name = String(r.employeeName || '').trim();
    const department = String(r.department || '').trim();
    if (!name || !department || !r.sopCode) continue;
    add(department, name, {
      sopCode: r.sopCode,
      sopName: r.sopName,
      month: r.month,
      monthName: r.monthName || MONTH_NAMES[r.month] || `Month ${r.month}`,
      year: r.year,
      trainingType: inferTrainingType(r.rawSymbol || ''),
      status: r.status,
    });
  }

  const uploads = await TrainingMatrixUpload.find({
    fileType: 'main',
    'snapshot.employees': { $exists: true },
  })
    .sort({ uploadedAt: -1 })
    .lean();

  const latestByDept = new Map<string, {
    year: number;
    snapshot: {
      sopMonthMap?: Record<string, string>;
      employees?: Array<{ name?: string; training?: Record<string, boolean> }>;
    };
  }>();

  for (const up of uploads as Array<{
    department?: string;
    year?: number;
    snapshot?: {
      sopMonthMap?: Record<string, string>;
      employees?: Array<{ name?: string; training?: Record<string, boolean> }>;
    };
  }>) {
    const dept = String(up.department || '').trim();
    if (!dept || latestByDept.has(dept)) continue;
    if (!up.snapshot?.employees?.length || !up.snapshot?.sopMonthMap) continue;
    latestByDept.set(dept, { year: up.year ?? new Date().getFullYear(), snapshot: up.snapshot });
  }

  for (const [dept, { year, snapshot }] of latestByDept) {
    const baseToSchedule = new Map<string, { month: number; monthName: string; rawCode: string }>();
    for (const [rawKey, monthName] of Object.entries(snapshot.sopMonthMap || {})) {
      const base = stripVersion(rawKey);
      const month = monthNameToNum(monthName);
      if (!base || !month) continue;
      if (!baseToSchedule.has(base)) {
        baseToSchedule.set(base, { month, monthName, rawCode: rawKey });
      }
    }

    for (const emp of snapshot.employees || []) {
      const name = String(emp.name || '').trim();
      if (!name || !emp.training) continue;
      for (const [sopCode, assigned] of Object.entries(emp.training)) {
        if (!assigned) continue;
        const sched = baseToSchedule.get(stripVersion(sopCode));
        if (!sched) continue;
        add(dept, name, {
          sopCode,
          month: sched.month,
          monthName: sched.monthName,
          year,
          trainingType: 'training',
        });
      }
    }
  }

  // Materialize the deduped per-employee maps into the array shape callers expect.
  const map = new Map<string, EmployeeSopAssignment[]>();
  for (const [key, bySop] of byEmp) map.set(key, [...bySop.values()]);

  for (const list of map.values()) {
    // Fill in / improve display names from the SOP collection.
    for (const a of list) {
      const resolved = nameByBase.get(stripVersion(a.sopCode));
      if (!a.sopName || isPlaceholderSopName(a.sopName, a.sopCode)) {
        if (resolved) a.sopName = resolved;
      }
    }
    list.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return a.month - b.month;
      return a.sopCode.localeCompare(b.sopCode);
    });
  }

  return map;
}

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';

export const dynamic = 'force-dynamic';

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_NAME_TO_NUM: Record<string, number> = Object.fromEntries(
  MONTH_NAMES.map((m, i) => [m.toLowerCase(), i + 1]),
);

// GET /api/training-matrix/monthly-schedule?sopCode=QAGE01-10
//
// Returns the month-wise employee count for a given SOP derived from
// TrainingMatrixUpload snapshots.
//
// Each department has one active upload snapshot. snapshot.sopMonthMap maps each
// raw SOP code (as it appears in the Excel column, possibly versioned) to its
// scheduled month name. snapshot.employees records per-employee training booleans
// keyed by those same raw codes.
//
// We strip versions on both the query param and the snapshot keys before comparing
// so that "QAGE01-10" in the snapshot matches a query for "QAGE01".
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const sopCode = req.nextUrl.searchParams.get('sopCode');
    if (!sopCode) {
      return NextResponse.json({ error: 'sopCode is required' }, { status: 400 });
    }

    const base = stripVersion(sopCode);

    // Load all department upload snapshots (at most one active snapshot per department)
    const uploads = await TrainingMatrixUpload.find(
      { 'snapshot.sopMonthMap': { $exists: true } },
      { department: 1, year: 1, snapshot: 1 },
    ).lean();

    // Accumulate employee counts per (month, year) across all departments
    const byMonthYear = new Map<
      string,
      { month: number; year: number; monthName: string; count: number }
    >();

    for (const upload of uploads) {
      const snap = (upload as any).snapshot as {
        sopMonthMap?: Record<string, string>;
        employees?: Array<{ training?: Record<string, boolean> }>;
      } | undefined;

      if (!snap?.sopMonthMap || !snap?.employees) continue;

      // Build a base-code → month-name map by stripping versions from all snapshot keys.
      // This handles Excel codes like "QAGE01-10" matching a query for "QAGE01".
      const baseToMonth: Record<string, string> = {};
      const baseToRawKeys: Record<string, string[]> = {};
      for (const [rawKey, monthName] of Object.entries(snap.sopMonthMap)) {
        const b = stripVersion(rawKey);
        baseToMonth[b] = monthName;
        if (!baseToRawKeys[b]) baseToRawKeys[b] = [];
        baseToRawKeys[b].push(rawKey);
      }

      const monthName = baseToMonth[base];
      if (!monthName) continue;

      const monthNum = MONTH_NAME_TO_NUM[monthName.toLowerCase()];
      if (!monthNum) continue;

      const year: number = (upload as any).year ?? new Date().getFullYear();
      const key = `${monthNum}-${year}`;

      // The training keys in snapshot.employees use the same raw codes as sopMonthMap,
      // so collect all raw keys that map to our base code.
      const rawKeys = new Set<string>(baseToRawKeys[base] ?? []);
      rawKeys.add(base); // also check the base code directly

      const empCount = snap.employees.filter((e) => {
        if (!e.training) return false;
        for (const rk of rawKeys) {
          if (e.training[rk] === true) return true;
        }
        return false;
      }).length;

      const existing = byMonthYear.get(key);
      if (existing) {
        existing.count += empCount;
      } else {
        byMonthYear.set(key, { month: monthNum, year, monthName, count: empCount });
      }
    }

    const schedule = [...byMonthYear.values()].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month,
    );

    return NextResponse.json({ sopCode: base, schedule });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

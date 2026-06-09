import { connectDB } from '@/lib/mongodb';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const MANAGE_SOP_API_LOG = '[manage-sop][api]';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface ManageSOPLogEntry {
  sopCode: string;
  sopName: string;
  department: string;
  month: number;
  monthName: string;
  year: number;
  designations: string[];
  employees: string[];
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManageSOPLogsResponse {
  logs: ManageSOPLogEntry[];
}

// Returns one entry per (sopCode, department, month, year) that has at least one
// TrainingMatrixRecord tagged with sourceFile='manage-sop-manual' — i.e. allocations
// the user made through the Manage SOP page. Sorted by latest update first.
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const reqStartMs = Date.now();
  try {
    await connectDB();

    const rows = await TrainingMatrixRecord.find({ sourceFile: 'manage-sop-manual' })
      .select('sopCode sopName department designation employeeName month year monthName createdAt updatedAt')
      .lean();

    type Agg = {
      sopCode: string;
      sopName: string;
      department: string;
      month: number;
      monthName: string;
      year: number;
      designations: Set<string>;
      employees: Set<string>;
      createdAt: Date;
      updatedAt: Date;
    };

    const map = new Map<string, Agg>();
    for (const r of rows as any[]) {
      const key = `${r.sopCode}|${r.department}|${r.month}|${r.year}`;
      const existing = map.get(key);
      if (existing) {
        if (r.designation) existing.designations.add(r.designation);
        if (r.employeeName) existing.employees.add(r.employeeName);
        if (r.createdAt && new Date(r.createdAt) < existing.createdAt) existing.createdAt = new Date(r.createdAt);
        if (r.updatedAt && new Date(r.updatedAt) > existing.updatedAt) existing.updatedAt = new Date(r.updatedAt);
        if (r.sopName && !existing.sopName) existing.sopName = r.sopName;
      } else {
        map.set(key, {
          sopCode: r.sopCode,
          sopName: r.sopName || '',
          department: r.department,
          month: r.month,
          monthName: r.monthName || MONTH_NAMES[r.month] || '',
          year: r.year,
          designations: new Set(r.designation ? [r.designation] : []),
          employees: new Set(r.employeeName ? [r.employeeName] : []),
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
        });
      }
    }

    const logs: ManageSOPLogEntry[] = Array.from(map.values())
      .map(a => ({
        sopCode: a.sopCode,
        sopName: a.sopName,
        department: a.department,
        month: a.month,
        monthName: a.monthName,
        year: a.year,
        designations: Array.from(a.designations).sort(),
        employees: Array.from(a.employees).sort(),
        employeeCount: a.employees.size,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))
      .sort((x, y) => (y.updatedAt > x.updatedAt ? 1 : y.updatedAt < x.updatedAt ? -1 : 0));

    console.info(
      `${MANAGE_SOP_API_LOG} GET /api/training-matrix/manage-sop-view/logs source=manage-sop rows=${rows.length} groups=${logs.length} totalMs=${Date.now() - reqStartMs}`,
    );
    return NextResponse.json({ logs } as ManageSOPLogsResponse, { status: 200 });
  } catch (error) {
    console.error(
      `${MANAGE_SOP_API_LOG} GET /api/training-matrix/manage-sop-view/logs source=manage-sop FAILED totalMs=${Date.now() - reqStartMs}`,
      error,
    );
    return NextResponse.json({ error: 'Failed to fetch manage-sop logs' }, { status: 500 });
  }
}

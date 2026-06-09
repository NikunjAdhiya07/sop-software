import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import Employee from '@/models/Employee';

export const dynamic = 'force-dynamic';

// POST /api/employees/sync-from-matrix
// Seeds the Employee collection from the latest TrainingMatrixUpload snapshots.
export async function POST() {
  try {
    await connectDB();

    const uploads = await TrainingMatrixUpload.find({
      fileType: 'main',
      'snapshot.employees': { $exists: true, $not: { $size: 0 } },
    })
      .sort({ uploadedAt: -1 })
      .lean();

    // Keep only the latest upload per department
    const latestByDept = new Map<string, any>();
    for (const up of uploads as any[]) {
      const dept = String(up.department || '').trim();
      if (dept && !latestByDept.has(dept)) latestByDept.set(dept, up);
    }

    if (latestByDept.size === 0) {
      return NextResponse.json({ success: false, error: 'No training matrix snapshots found. Please upload training matrix files first.' }, { status: 404 });
    }

    const ops: any[] = [];
    for (const [dept, up] of latestByDept.entries()) {
      const employees: Array<{ name: string; designation?: string }> = up.snapshot?.employees || [];
      for (const emp of employees) {
        const name = String(emp.name || '').trim();
        if (!name) continue;
        ops.push({
          updateOne: {
            filter: { name, department: dept },
            update: {
              $set:         { designation: String(emp.designation || '').trim(), isActive: true },
              $setOnInsert: { name, department: dept },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length === 0) {
      return NextResponse.json({ success: false, error: 'Snapshots found but contain no employee rows.' }, { status: 404 });
    }

    const result = await Employee.bulkWrite(ops, { ordered: false });
    const upserted = (result.upsertedCount || 0) + (result.modifiedCount || 0);

    return NextResponse.json({
      success: true,
      upserted,
      departments: latestByDept.size,
      inserted: result.upsertedCount,
      updated: result.modifiedCount,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

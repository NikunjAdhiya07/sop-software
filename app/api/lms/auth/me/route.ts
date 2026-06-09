import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/mongodb';
import { getEmployeeAssignmentsMap } from '@/lib/employeeAssignments';
import { verifyLmsToken, LMS_COOKIE } from '@/lib/lms-session';
import Employee from '@/models/Employee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/lms/auth/me — current learner + their assigned SOPs.
export async function GET() {
  const jar = await cookies();
  const payload = verifyLmsToken(jar.get(LMS_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await connectDB();
    const employee = await Employee.findById(payload.sub).lean<{
      _id: unknown; name: string; designation: string; department: string; isActive: boolean;
    }>();
    if (!employee || !employee.isActive) {
      return NextResponse.json({ error: 'Account not found or inactive' }, { status: 401 });
    }

    const assignmentsMap = await getEmployeeAssignmentsMap();
    const key = `${employee.department}||${employee.name}`.trim().toLowerCase();

    return NextResponse.json({
      employee: {
        id: String(employee._id),
        name: employee.name,
        designation: employee.designation,
        department: employee.department,
      },
      assignments: assignmentsMap.get(key) || [],
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

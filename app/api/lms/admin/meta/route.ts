import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Employee from '@/models/Employee';

export const dynamic = 'force-dynamic';

// GET /api/lms/admin/meta
// Returns distinct departments, designations, and employee list for dropdown population.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await connectDB();

    const employees = await Employee.find({ isActive: true })
      .select('_id name department designation')
      .sort({ name: 1 })
      .lean<{ _id: unknown; name: string; department: string; designation: string }[]>();

    const departments  = [...new Set(employees.map((e) => e.department).filter(Boolean))].sort();
    const designations = [...new Set(employees.map((e) => e.designation).filter(Boolean))].sort();

    return NextResponse.json({
      departments,
      designations,
      employees: employees.map((e) => ({
        id:          String(e._id),
        name:        e.name,
        department:  e.department,
        designation: e.designation,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

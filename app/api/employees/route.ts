import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Employee from '@/models/Employee';

export const dynamic = 'force-dynamic';

// GET /api/employees?department=QA&search=John&includeInactive=1
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const department      = searchParams.get('department');
    const search          = searchParams.get('search') || '';
    const includeInactive = searchParams.get('includeInactive') === '1';

    const filter: Record<string, unknown> = {};
    if (department)       filter.department = { $regex: new RegExp(`^${department}$`, 'i') };
    if (!includeInactive) filter.isActive   = true;
    if (search)           filter.$or = [
      { name:        { $regex: search, $options: 'i' } },
      { designation: { $regex: search, $options: 'i' } },
      { employeeId:  { $regex: search, $options: 'i' } },
    ];

    const employees = await Employee.find(filter)
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ employees });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// POST /api/employees — create a new employee
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { name, designation, department, employeeId } = body;

    if (!name?.trim() || !designation?.trim() || !department?.trim()) {
      return NextResponse.json({ error: 'name, designation, and department are required' }, { status: 400 });
    }

    const employee = await Employee.create({ name: name.trim(), designation: designation.trim(), department: department.trim(), employeeId: employeeId?.trim() || undefined });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key') || msg.includes('E11000')) {
      return NextResponse.json({ error: 'An employee with this name already exists in this department' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

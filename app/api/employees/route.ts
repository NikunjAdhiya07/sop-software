import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import { getEmployeeAssignmentsMap } from '@/lib/employeeAssignments';
import { generateUniqueLmsUsername } from '@/lib/lms-credentials';
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
    const includeAssignments = searchParams.get('includeAssignments') === '1';

    const filter: Record<string, unknown> = {};
    if (department)       filter.department = { $regex: new RegExp(`^${department}$`, 'i') };
    if (!includeInactive) filter.isActive   = true;
    if (search)           filter.$or = [
      { name:        { $regex: search, $options: 'i' } },
      { designation: { $regex: search, $options: 'i' } },
      { employeeId:  { $regex: search, $options: 'i' } },
    ];

    const employees = await Employee.find(filter)
      .select('+lmsPasswordHash')
      .sort({ name: 1 })
      .lean();

    // Replace the raw hash with a boolean so the client knows whether a
    // learning-module password is set without the hash ever leaving the server.
    const safe = employees.map((emp) => {
      const { lmsPasswordHash, ...rest } = emp as typeof emp & { lmsPasswordHash?: string };
      return { ...rest, hasLmsPassword: !!lmsPasswordHash };
    });

    if (!includeAssignments) {
      return NextResponse.json({ employees: safe });
    }

    const assignmentsMap = await getEmployeeAssignmentsMap();
    const enriched = safe.map((emp) => {
      const key = `${emp.department}||${emp.name}`.trim().toLowerCase();
      return {
        ...emp,
        assignments: assignmentsMap.get(key) || [],
      };
    });

    return NextResponse.json({ employees: enriched });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// POST /api/employees — create a new employee
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { name, designation, department, employeeId, password } = body;

    if (!name?.trim() || !designation?.trim() || !department?.trim()) {
      return NextResponse.json({ error: 'name, designation, and department are required' }, { status: 400 });
    }

    let lmsPasswordHash: string | undefined;
    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 4) {
        return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
      }
      lmsPasswordHash = await bcrypt.hash(password, 12);
    }

    const lmsUsername = await generateUniqueLmsUsername(name);
    const created = await Employee.create({
      name: name.trim(),
      designation: designation.trim(),
      department: department.trim(),
      employeeId: employeeId?.trim() || undefined,
      lmsUsername,
      lmsPasswordHash,
    });

    const employee = created.toObject();
    delete employee.lmsPasswordHash;
    return NextResponse.json({ employee: { ...employee, hasLmsPassword: !!lmsPasswordHash } }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key') || msg.includes('E11000')) {
      return NextResponse.json({ error: 'An employee with this name already exists in this department' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

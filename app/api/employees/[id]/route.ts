import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Employee from '@/models/Employee';

export const dynamic = 'force-dynamic';

// PATCH /api/employees/[id] — update name, designation, department, employeeId, isActive
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const allowed = ['name', 'designation', 'department', 'employeeId', 'isActive'];
    const update: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) update[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
    }

    const employee = await Employee.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    return NextResponse.json({ employee });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// DELETE /api/employees/[id] — hard delete (employees can also be deactivated via PATCH isActive=false)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const employee = await Employee.findByIdAndDelete(id);
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    return NextResponse.json({ message: `Employee ${employee.name} deleted` });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

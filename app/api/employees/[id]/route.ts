import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import { generateUniqueLmsUsername } from '@/lib/lms-credentials';
import Employee from '@/models/Employee';

export const dynamic = 'force-dynamic';

// PATCH /api/employees/[id] — update profile fields and/or the learning-module password.
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

    // Optional learning-module password set/reset.
    if (typeof body.password === 'string' && body.password.length > 0) {
      if (body.password.length < 4) {
        return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
      }
      update.lmsPasswordHash = await bcrypt.hash(body.password, 12);
    }

    const existing = await Employee.findById(id).select('+lmsPasswordHash');
    if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    // Ensure every employee has a login handle (covers records created before
    // credentials existed, and any whose name changed without one).
    if (!existing.lmsUsername) {
      update.lmsUsername = await generateUniqueLmsUsername(
        (update.name as string) || existing.name,
        id,
      );
    }

    const employee = await Employee.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    // Never leak the hash; report whether a password is set instead.
    const out = employee.toObject();
    delete out.lmsPasswordHash;
    const hasLmsPassword = !!update.lmsPasswordHash || !!existing.lmsPasswordHash;
    return NextResponse.json({ employee: { ...out, hasLmsPassword } });
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

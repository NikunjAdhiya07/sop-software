import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { generateUniqueLmsUsername } from '@/lib/lms-credentials';
import Employee from '@/models/Employee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/lms/admin/credentials/generate
// Backfill an lmsUsername for every employee that doesn't have one yet.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    const missing = await Employee.find({
      $or: [{ lmsUsername: { $exists: false } }, { lmsUsername: null }, { lmsUsername: '' }],
    }).select('_id name');

    let generated = 0;
    for (const emp of missing) {
      const username = await generateUniqueLmsUsername(emp.name, emp._id.toString());
      emp.lmsUsername = username;
      await emp.save();
      generated += 1;
    }

    return NextResponse.json({ generated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

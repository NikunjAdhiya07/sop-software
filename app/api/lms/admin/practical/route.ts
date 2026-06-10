import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import PracticalAssessment from '@/models/lms/PracticalAssessment';

export const dynamic = 'force-dynamic';

// GET /api/lms/admin/practical?status=pending&department=QA
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status     = searchParams.get('status') || 'pending';
  const department = searchParams.get('department') || '';

  try {
    await connectDB();

    const filter: Record<string, unknown> = { status };
    if (department) filter.department = department;

    const assessments = await PracticalAssessment.find(filter)
      .sort({ requestedAt: -1 })
      .lean();

    return NextResponse.json({ assessments });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

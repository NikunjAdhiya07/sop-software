import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/mongodb';
import { verifyLmsToken, LMS_COOKIE } from '@/lib/lms-session';
import LearningProgress from '@/models/lms/LearningProgress';

export const dynamic = 'force-dynamic';

// GET /api/lms/progress — all progress records for the current learner
export async function GET() {
  const jar = await cookies();
  const payload = verifyLmsToken(jar.get(LMS_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await connectDB();
    const records = await LearningProgress.find({ employeeId: payload.sub })
      .sort({ lastAccessedAt: -1 })
      .lean();

    return NextResponse.json({ progress: records });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/mongodb';
import { verifyLmsToken, LMS_COOKIE } from '@/lib/lms-session';
import ExamSettings from '@/models/lms/ExamSettings';

export const dynamic = 'force-dynamic';

// GET /api/lms/quiz/settings — read-only settings for the learner
export async function GET() {
  const jar = await cookies();
  const payload = verifyLmsToken(jar.get(LMS_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await connectDB();
    const settings = await ExamSettings.findOneAndUpdate(
      { settingsKey: 'global' },
      { $setOnInsert: { settingsKey: 'global' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return NextResponse.json({ settings });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import ExamSettings from '@/models/lms/ExamSettings';

export const dynamic = 'force-dynamic';

// GET /api/lms/admin/exam-settings
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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

// PATCH /api/lms/admin/exam-settings
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json() as Record<string, unknown>;

    const allowed = [
      'examQuestionCount', 'trialQuestionCount', 'passingScore',
      'timeLimitMinutes', 'shuffleQuestions', 'shuffleOptions',
      'showAnswersAfterTrial', 'allowRetakeAfterPass', 'maxAttempts',
      'passingScoreRules',
    ];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    const settings = await ExamSettings.findOneAndUpdate(
      { settingsKey: 'global' },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return NextResponse.json({ settings });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

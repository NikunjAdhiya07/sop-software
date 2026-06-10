import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/mongodb';
import { verifyLmsToken, LMS_COOKIE } from '@/lib/lms-session';
import Certificate from '@/models/lms/Certificate';

export const dynamic = 'force-dynamic';

// GET /api/lms/certificates — all certificates earned by the current learner
export async function GET() {
  const jar = await cookies();
  const payload = verifyLmsToken(jar.get(LMS_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await connectDB();
    const certificates = await Certificate.find({ employeeId: payload.sub })
      .sort({ issuedAt: -1 })
      .select('certificateNumber sopCode sopName completedAt quizScore hasPractical practicalScore issuedAt')
      .lean();

    return NextResponse.json({ certificates });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

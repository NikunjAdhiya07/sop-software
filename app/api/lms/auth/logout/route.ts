import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LMS_COOKIE } from '@/lib/lms-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/lms/auth/logout — clear the learning-module session cookie.
export async function POST() {
  const jar = await cookies();
  jar.set(LMS_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return NextResponse.json({ ok: true });
}

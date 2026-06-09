import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// STUB: Excel upload that replaces the matrix. Not wired to a database yet.
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Training Matrix upload is not wired up yet (stub endpoint).' },
    { status: 501 },
  );
}

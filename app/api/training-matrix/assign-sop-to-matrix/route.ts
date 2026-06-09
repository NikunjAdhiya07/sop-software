import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// STUB: bulk-assign a SOP into a department matrix for all employees.
export async function POST() {
  return NextResponse.json(
    { error: 'Assigning a SOP to the matrix is not wired up yet (stub endpoint).' },
    { status: 501 },
  );
}

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// STUB: SOPs present in DB but not yet in the uploaded matrix.
export async function GET(req: NextRequest) {
  const department = req.nextUrl.searchParams.get('department');
  if (!department) {
    return NextResponse.json({ error: 'department is required' }, { status: 400 });
  }
  return NextResponse.json({
    unassigned: [],
    totalUnassigned: 0,
    uploadContext: null,
    existingEmployees: [],
  });
}

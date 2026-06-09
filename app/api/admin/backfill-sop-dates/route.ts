import { NextResponse } from "next/server";
import { backfillSopDates } from "@/lib/backfill-sop-dates";
import { requireAuth } from "@/lib/withAuth";

export async function POST() {
  const auth = await requireAuth(["admin"]);
  if (auth.error) return auth.error;

  try {
    const result = await backfillSopDates();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Date backfill failed" },
      { status: 500 },
    );
  }
}

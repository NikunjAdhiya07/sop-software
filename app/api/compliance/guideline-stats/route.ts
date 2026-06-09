import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getGuidelineStats } from "@/lib/guidelineSopReview";
import { requireAuth } from "@/lib/withAuth";

export async function GET() {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const stats = await getGuidelineStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 },
    );
  }
}

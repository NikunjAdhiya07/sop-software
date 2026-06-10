import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import { buildDashboardStats, groupSOPRecords } from "@/lib/sop-utils";
import {
  getServerGroupedCache,
  setServerGroupedCache,
} from "@/lib/cache";
import { requireAuth } from "@/lib/withAuth";

export async function GET() {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    let registry = getServerGroupedCache();
    if (!registry) {
      await connectDB();
      const records = await SOP.find({}).select("-content").lean();
      registry = groupSOPRecords(records as never[]);
      setServerGroupedCache(registry);
    }
    const stats = buildDashboardStats(registry);
    const departments = [
      ...new Set(registry.filter((r) => !r.isObsolete).map((r) => r.department)),
    ].sort();

    return NextResponse.json({ ...stats, departmentList: departments });
  } catch (error) {
    console.error("GET /api/sops/stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 },
    );
  }
}

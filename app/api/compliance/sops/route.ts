import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import { requireAuth } from "@/lib/withAuth";

// 4-char sub-code lookup (takes priority over broad 2-char prefix rules).
// Matches the same mapping used in the MCQ bank registry.
const SUBCODE_DEPT: Record<string, string> = {
  QAGE: "QA",  ANNE: "QA",
  QCGE: "QC",  QAIC: "QC",  QAIO: "QC",
  QAMI: "Microbiology", QCMI: "Microbiology",
  PRAA: "Production", PRCL: "Production", PRED: "Production",
  PREO: "Production", PREP: "Production", PRGE: "Production",
  PRMA: "Production", PRPA: "Production",
  BSGE: "Store", STCL: "Store", STGE: "Store",
  STOP: "Store", STPA: "Store", STRM: "Store",
  MAGE: "Engineering and Maintenance", PREG: "Engineering and Maintenance",
  PEGE: "Personnel",
};

function resolveDept(identifier: string, storedDept?: string | null): string {
  const code = identifier.trim().toUpperCase();

  // Try 4-char sub-code first (most specific)
  const m4 = code.match(/^([A-Z]{4})\d/);
  if (m4 && SUBCODE_DEPT[m4[1]]) return SUBCODE_DEPT[m4[1]];

  // Try 2–3 char prefix fallbacks
  if (/^QC[A-Z0-9]/.test(code)) return "QC";
  if (/^QA[A-Z0-9]/.test(code)) return "QA";
  if (/^MIC[A-Z0-9]/.test(code)) return "Microbiology";
  if (/^(PROD|PRD|PD)[A-Z0-9]/.test(code)) return "Production";
  if (/^(STR|STOR|BS)[A-Z0-9]/.test(code)) return "Store";
  if (/^(ENG|EM|MA)[A-Z0-9]/.test(code)) return "Engineering and Maintenance";
  if (/^(PER|PE)[A-Z0-9]/.test(code)) return "Personnel";

  return storedDept?.trim() || "General";
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "500");
    const department = request.nextUrl.searchParams.get("department");

    const rawSops = await SOP.find({ isObsolete: { $ne: true } })
      .sort({ identifier: 1 })
      .limit(limit * 3) // fetch more since we dedupe + filter after resolution
      .select("identifier name department version language location")
      .lean();

    const seen = new Set<string>();
    const allSops = rawSops
      .filter((s) => {
        if (seen.has(s.identifier)) return false;
        seen.add(s.identifier);
        return true;
      })
      .map((s) => {
        const resolvedDept = resolveDept(s.identifier, s.department);
        return {
          _id: s._id.toString(),
          identifier: s.identifier,
          name: s.name,
          department: resolvedDept,
          version: s.version ?? "1.0",
          language: s.language ?? "English",
          location: s.location ?? "",
        };
      });

    const sops = department
      ? allSops.filter((s) => s.department === department).slice(0, limit)
      : allSops.slice(0, limit);

    const departments = [...new Set(allSops.map((s) => s.department).filter(Boolean))].sort();

    return NextResponse.json({ success: true, sops, departments, total: sops.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch SOPs" },
      { status: 500 },
    );
  }
}

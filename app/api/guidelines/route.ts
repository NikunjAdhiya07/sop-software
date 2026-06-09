import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOPGuideline from "@/models/SOPGuideline";
import { requireAuth } from "@/lib/withAuth";

export async function GET() {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const docs = await SOPGuideline.find({ ocrStatus: "completed" })
      .select("name folderName pdfName guidelineType category clauses.clauseNumber clauses.clauseTitle clauses.clauseText")
      .sort({ folderName: 1, name: 1 })
      .lean();

    // Normalize for compliance page which still reads g.folder
    const guidelines = docs.map((g) => ({
      ...g,
      folder: g.folderName, // backward compat alias
      clauses: (g.clauses ?? []).map((c) => ({
        number: c.clauseNumber,
        title: c.clauseTitle,
        text: c.clauseText,
        // also keep canonical names
        clauseNumber: c.clauseNumber,
        clauseTitle: c.clauseTitle,
        clauseText: c.clauseText,
      })),
    }));

    return NextResponse.json({ success: true, guidelines });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch guidelines" },
      { status: 500 },
    );
  }
}

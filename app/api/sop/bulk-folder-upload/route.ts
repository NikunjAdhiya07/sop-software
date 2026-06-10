import { NextRequest, NextResponse } from "next/server";
import { processSopUpload } from "@/lib/sop-upload";
import { requireAuth } from "@/lib/withAuth";

export const maxDuration = 300;

const SKIP_PATTERN = /annexure|appendix|cover\s*page|index/i;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer"]);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const paths = formData.getAll("paths").map(String);

    // Build aligned (file, path) pairs so filtering never shifts indices.
    const pairs: Array<{ file: File; path: string }> = files.map((f, i) => ({
      file: f,
      path: paths[i] ?? f.name,
    }));
    const filtered = pairs.filter((p) => !SKIP_PATTERN.test(p.file.name));

    const nextForm = new FormData();
    // Copy non-file/non-path scalar fields (language, department, generateMcq, …)
    for (const [key, value] of formData.entries()) {
      if (key !== "files" && key !== "paths") nextForm.append(key, value);
    }
    // Re-append files and their matching paths together to keep indices aligned.
    for (const { file, path } of filtered) {
      nextForm.append("files", file);
      nextForm.append("paths", path);
    }

    return processSopUpload(nextForm);
  } catch (error) {
    console.error("bulk-folder-upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}

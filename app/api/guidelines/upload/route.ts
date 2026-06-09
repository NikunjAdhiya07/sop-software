import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { connectDB } from "@/lib/mongodb";
import SOPGuideline from "@/models/SOPGuideline";
import { requireAuth } from "@/lib/withAuth";
import {
  processGuidelinePDF,
  extractClauses,
  identifyGuidelineType,
  categorizeGuideline,
} from "@/lib/ocrProcessor";

export const maxDuration = 120;

// ── In-memory summary cache (5-minute TTL) ─────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
let summaryCache: { data: unknown; timestamp: number } | null = null;
function getCachedSummary() {
  if (!summaryCache) return null;
  if (Date.now() - summaryCache.timestamp > CACHE_TTL_MS) { summaryCache = null; return null; }
  return summaryCache.data;
}
function setCachedSummary(data: unknown) { summaryCache = { data, timestamp: Date.now() }; }
function clearCache() { summaryCache = null; }

// ── POST — Upload PDFs ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer"]);
  if (auth.error) return auth.error;
  const userId = (auth.session?.user as { id?: string })?.id ?? "system";

  try {
    await connectDB();
    const formData = await request.formData();
    const folderName = (formData.get("folder") as string | null)?.trim() ||
                       (formData.get("folderName") as string | null)?.trim();
    const files = formData.getAll("files") as File[];

    if (!folderName) {
      return NextResponse.json({ success: false, error: "Folder / Category name is required" }, { status: 400 });
    }
    if (!files.length) {
      return NextResponse.json({ success: false, error: "At least one PDF is required" }, { status: 400 });
    }

    const results: {
      name: string; clauses: number; status: "created" | "updated" | "failed";
      folder?: string; error?: string;
    }[] = [];

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        results.push({ name: file.name, clauses: 0, status: "failed", error: "Only PDF files are supported" });
        continue;
      }

      const t0 = Date.now();
      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Save to disk
        const tempDir = path.join(process.cwd(), "temp", "guidelines", folderName);
        fs.mkdirSync(tempDir, { recursive: true });
        const filePath = path.join(tempDir, file.name);
        fs.writeFileSync(filePath, buffer);

        // OCR / text extraction
        const ocr = await processGuidelinePDF(buffer);

        if (!ocr.text.trim()) {
          results.push({ name: file.name, clauses: 0, status: "failed", error: "No text extracted (may be image-only scan)" });
          continue;
        }

        // Parse clauses and detect metadata
        const baseName = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
        const clauses = extractClauses(ocr.text, baseName);
        const guidelineType = identifyGuidelineType(ocr.text, file.name);
        const category = categorizeGuideline(ocr.text);

        const docFields = {
          folderName,
          filePath,
          pdfName: file.name,
          isScanned: ocr.isScanned,
          ocrStatus: "completed" as const,
          rawText: ocr.text.slice(0, 200_000),
          clauses,
          guidelineType,
          category,
          uploadedBy: userId,
        };

        // Upsert by name + folderName
        const existing = await SOPGuideline.findOne({ name: baseName, folderName });
        if (existing) {
          Object.assign(existing, docFields);
          await existing.save();
          results.push({ name: baseName, clauses: clauses.length, status: "updated", folder: folderName });
        } else {
          await SOPGuideline.create({ name: baseName, ...docFields });
          results.push({ name: baseName, clauses: clauses.length, status: "created", folder: folderName });
        }
      } catch (err) {
        results.push({
          name: file.name, clauses: 0, status: "failed", folder: folderName,
          error: err instanceof Error ? err.message.slice(0, 150) : "Processing failed",
        });
      }
      void t0; // processingTimeMs tracked internally by ocrProcessor
    }

    clearCache();
    const succeeded = results.filter((r) => r.status !== "failed").length;
    return NextResponse.json({
      success: succeeded > 0,
      results,
      message: `${succeeded}/${files.length} file(s) processed successfully`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}

// ── GET — List / Fetch single / Serve PDF ─────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer", "viewer"]);
  if (auth.error) return auth.error;

  await connectDB();
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  const serve = searchParams.get("serve");
  const summary = searchParams.get("summary");
  const folderName = searchParams.get("folderName");
  const category = searchParams.get("category");

  // Serve PDF file from disk
  if (serve) {
    try {
      const doc = await SOPGuideline.findById(serve).select("filePath pdfName").lean();
      if (!doc) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });
      if (!fs.existsSync(doc.filePath))
        return NextResponse.json({ error: "Guideline file not found on disk" }, { status: 404 });
      const fileBuffer = fs.readFileSync(doc.filePath);
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${doc.pdfName}"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Fetch single guideline with full clauses
  if (id) {
    try {
      const doc = await SOPGuideline.findById(id)
        .select("name folderName pdfName guidelineType category createdAt clauses.clauseNumber clauses.clauseTitle clauses.clauseText")
        .maxTimeMS(25000)
        .lean();
      if (!doc) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });
      return NextResponse.json({ success: true, guideline: doc });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Summary list (lightweight — no clause text)
  if (summary) {
    const cached = getCachedSummary();
    if (cached && !folderName && !category) {
      return NextResponse.json(cached, {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    }
    try {
      const filter: Record<string, string> = {};
      if (folderName) filter.folderName = folderName;
      if (category) filter.category = category;
      const guidelines = await SOPGuideline.find(filter)
        .select("name folderName pdfName guidelineType category createdAt")
        .limit(2000)
        .sort({ folderName: 1, name: 1 })
        .lean();
      const resp = { success: true, guidelines, totalClauses: 0, summary: true };
      if (!folderName && !category) setCachedSummary(resp);
      return NextResponse.json(resp);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // Default detailed list
  try {
    const filter: Record<string, string> = {};
    if (folderName) filter.folderName = folderName;
    if (category) filter.category = category;
    const guidelines = await SOPGuideline.find(filter)
      .select("name folderName pdfName guidelineType category createdAt clauses.clauseNumber clauses.clauseTitle")
      .limit(50)
      .sort({ folderName: 1, name: 1 })
      .lean();

    const totalClauses = guidelines.reduce((s, g) => s + (g.clauses?.length ?? 0), 0);
    return NextResponse.json({ success: true, guidelines, totalClauses });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// ── DELETE — Remove single guideline ──────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer"]);
  if (auth.error) return auth.error;

  await connectDB();
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const doc = await SOPGuideline.findById(id).lean();
    if (!doc) return NextResponse.json({ error: "Guideline not found" }, { status: 404 });
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try { fs.unlinkSync(doc.filePath); } catch { /* ignore unlink failure */ }
    }
    await SOPGuideline.findByIdAndDelete(id);
    clearCache();
    return NextResponse.json({ success: true, message: "Guideline deleted", id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

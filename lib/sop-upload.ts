import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import {
  resolveSopDatesFromContent,
  sopDatesToDbFields,
} from "@/lib/sop-dates";
import {
  defaultExpiryDate,
  deriveSopRecordName,
  extractIdentifierFromFilename,
  parseUploadPathMetadata,
  resolveDepartmentFromUpload,
  sopVersionFields,
  versionFromIdentifier,
} from "@/lib/sop-utils";
import { resolveUploadLanguage } from "@/lib/sop-filename";
import {
  contentScriptMismatch,
  languageFromContentScript,
} from "@/lib/sop-name-resolution";
import {
  detectFileType,
  resetBunnyUploadCircuit,
  saveUploadedFile,
} from "@/lib/upload";
import { extractTextFromBuffer } from "@/lib/extractContent";
import { triggerMcqGenerationAsync } from "@/lib/mcq-generation";
import { invalidateDashboardSopsCache } from "@/lib/cache";
import { requireAuth } from "@/lib/withAuth";

export async function processSopUpload(formData: FormData) {
  resetBunnyUploadCircuit();
  await connectDB();

  const batchDepartment = (formData.get("department") as string)?.trim() || undefined;
  const language = (formData.get("language") as string) || "English";
  const identifierInput = (formData.get("identifier") as string)?.trim();
  const nameInput = (formData.get("name") as string)?.trim();
  const versionInput = (formData.get("version") as string)?.trim();
  const location = (formData.get("location") as string)?.trim();
  const generateMcq = formData.get("generateMcq") === "true";
  const files = formData.getAll("files") as File[];
  const paths = formData.getAll("paths").map((value) => String(value));

  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: Array<{ file: string; success: boolean; error?: string; id?: string; identifier?: string }> = [];
  const mcqIdentifiers = new Set<string>();

  for (const [index, file] of files.entries()) {
    try {
      const fileType = detectFileType(file.name);
      if (!fileType) {
        results.push({ file: file.name, success: false, error: "Unsupported file type" });
        continue;
      }
      if (file.name.startsWith(".") || file.name.startsWith("~$")) {
        results.push({ file: file.name, success: false, error: "System file skipped" });
        continue;
      }

      const relativePath = paths[index] || file.name;
      const pathMeta = parseUploadPathMetadata(relativePath);
      const identifier =
        identifierInput ||
        pathMeta.identifierFromPath ||
        extractIdentifierFromFilename(pathMeta.fileName || file.name);

      const version =
        versionInput ||
        pathMeta.versionFromPath ||
        versionFromIdentifier(identifier) ||
        "1.0";
      const { sopBaseId, versionNum, version: resolvedVersion } = sopVersionFields(
        identifier,
        version,
        pathMeta.versionFromPath,
      );
      const department = resolveDepartmentFromUpload({
        batchOverride: batchDepartment,
        relativePath,
        identifier,
      });
      const buffer = Buffer.from(await file.arrayBuffer());
      const content = await extractTextFromBuffer(buffer, fileType);

      // Filename hints first, then correct against the document's actual script
      // (a Gujarati doc with an English-looking filename must not stay "English").
      const lang = languageFromContentScript(content, resolveUploadLanguage(relativePath, language));

      // Language-aware name: English docs → English title, Gujarati docs → Gujarati title.
      const name = deriveSopRecordName({
        identifier,
        language: lang,
        fileType,
        content,
        originalFileName: pathMeta.fileName || file.name,
        titleFromPath: pathMeta.titleFromPath,
        explicitName: nameInput,
      });

      const { fileUrl, checksum, fileSize } = await saveUploadedFile(
        file,
        department,
        identifier,
        lang,
      );

      const docEntry = {
        fileName: file.name,
        filePath: fileUrl,
        fileType,
        language: lang,
      };

      let existing = await SOP.findOne({
        sopBaseId,
        versionNum,
        language: lang,
        fileType,
      });

      if (!existing) {
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        existing = await SOP.findOne({
          identifier: new RegExp(`^${escaped}$`, "i"),
          language: lang,
          fileType,
        });
      }

      // A matched record whose stored text is clearly the other script was
      // mislabelled when it was uploaded. Overwriting it would destroy the only
      // copy of that language — retag it instead and save this file as a new
      // record, so the pair surfaces as a dual-language SOP.
      if (existing && fileType === "docx" && contentScriptMismatch(existing.content, lang)) {
        const actualLang = lang === "English" ? "Gujarati" : "English";
        await existing.updateOne({ language: actualLang });
        existing = null;
      }

      const dateFields =
        fileType === "docx"
          ? sopDatesToDbFields(resolveSopDatesFromContent(content))
          : {};

      const sharedFields = {
        name,
        identifier,
        department,
        language: lang,
        fileUrl,
        fileType,
        content,
        checksum,
        version: resolvedVersion,
        sopBaseId,
        versionNum,
        location,
        folderPath: pathMeta.folderPath,
        parentFolder: pathMeta.parentFolder,
        subfolderLevel: pathMeta.folderPath ? pathMeta.folderPath.split("/").length : 0,
        originalFileName: file.name,
        metadata: { fileSize },
        sopDocuments: [docEntry],
        ...dateFields,
      };

      let sop = existing;
      if (existing) {
        sop = await SOP.findByIdAndUpdate(
          existing._id,
          {
            ...sharedFields,
            uploadedAt: new Date(),
            pipelineStatus: generateMcq ? "mcq_generating" : existing.pipelineStatus,
          },
          { new: true },
        );
      } else {
        sop = await SOP.create({
          ...sharedFields,
          expiryDate: dateFields.expiryDate ?? defaultExpiryDate(24),
          effectiveDate: dateFields.effectiveDate ?? new Date(),
          status: "uploaded",
          pipelineStatus: generateMcq ? "mcq_generating" : "idle",
        });
      }

      if (fileType === "docx" && dateFields.expiryDate) {
        await SOP.updateMany(
          { sopBaseId, versionNum, isObsolete: { $ne: true } },
          { $set: dateFields },
        );
      }

      if (!sop) {
        results.push({ file: file.name, success: false, error: "Failed to save SOP record" });
        continue;
      }

      if (generateMcq) mcqIdentifiers.add(identifier);
      results.push({
        file: file.name,
        success: true,
        id: sop._id.toString(),
        identifier,
      });
    } catch (err) {
      results.push({
        file: file.name,
        success: false,
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  for (const identifier of mcqIdentifiers) {
    triggerMcqGenerationAsync(identifier);
  }

  invalidateDashboardSopsCache();
  return NextResponse.json({ results });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(["admin", "trainer"]);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    return processSopUpload(formData);
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}

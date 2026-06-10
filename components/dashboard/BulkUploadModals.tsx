"use client";

import { useCallback, useState } from "react";
import {
  CloudUpload,
  FileText,
  FolderUp,
  ImageIcon,
  Languages,
  MapPin,
  Presentation,
  Video,
} from "lucide-react";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { appendFilesWithPaths } from "@/lib/upload-form";
import { MediaFilePicker } from "./MediaFilePicker";
import {
  BulkUploadDropZone,
  BulkUploadResults,
  BulkUploadShell,
  ExpectedStructureBox,
  HiddenBulkInputs,
  HowItWorksBox,
  useBulkFileSelection,
  type UploadProgress,
} from "./BulkUploadShell";

type UploadResult = { file: string; success: boolean; error?: string };

const SKIP_PATTERN = /annexure|appendix|cover\s*page|index/i;

function isSystemFile(f: File) {
  return f.name.startsWith(".") || f.name.startsWith("~$");
}

function filterSopFiles(files: File[]) {
  return files.filter(
    (f) => /\.(pdf|docx)$/i.test(f.name) && !isSystemFile(f) && !SKIP_PATTERN.test(f.name),
  );
}

function filterPdfFiles(files: File[]) {
  return files.filter(
    (f) => /\.pdf$/i.test(f.name) && !isSystemFile(f) && !SKIP_PATTERN.test(f.name),
  );
}

function filterLocationFiles(files: File[]) {
  return files.filter((f) => /\.(xlsx|xls|csv|txt|tsv)$/i.test(f.name));
}

function filterMediaFiles(files: File[]) {
  return files.filter((f) =>
    /\.(mp4|mov|webm|pdf|jpg|jpeg|png|webp|gif)$/i.test(f.name),
  );
}

const SOP_UPLOAD_BATCH_SIZE = 4;
const MEDIA_UPLOAD_BATCH_SIZE = 5;

function initialProgress(total: number): UploadProgress {
  return { completed: 0, total };
}

function isNetworkError(error: string | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("failed to fetch") || lower.includes("network") || lower.includes("load failed");
}

async function uploadSopBatchOnce(
  files: File[],
  language: string,
  department: string,
  generateMcq: boolean,
): Promise<UploadResult[]> {
  const formData = new FormData();
  formData.append("language", language);
  if (department.trim()) formData.append("department", department.trim());
  formData.append("generateMcq", String(generateMcq));
  appendFilesWithPaths(formData, files);

  let res: Response;
  try {
    res = await fetch("/api/sop/bulk-folder-upload", { method: "POST", body: formData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return files.map((f) => ({ file: f.name, success: false, error: msg }));
  }

  let data: { results?: UploadResult[]; error?: string };
  try {
    data = await res.json();
  } catch {
    return files.map((f) => ({ file: f.name, success: false, error: `HTTP ${res.status} (non-JSON response)` }));
  }

  if (!res.ok) {
    return [{ file: "Server", success: false, error: data.error ?? `HTTP ${res.status}` }];
  }
  return data.results ?? [];
}

// When a whole batch drops (connection reset / timeout), retry each file
// one-at-a-time so a single large file cannot drag down the others.
async function uploadSopBatchWithFallback(
  files: File[],
  language: string,
  department: string,
  generateMcq: boolean,
): Promise<UploadResult[]> {
  if (files.length === 1) {
    // Single-file: one retry before giving up.
    const [first] = await uploadSopBatchOnce(files, language, department, generateMcq);
    if (first.success || !isNetworkError(first.error)) return [first];
    return uploadSopBatchOnce(files, language, department, generateMcq);
  }

  const results = await uploadSopBatchOnce(files, language, department, generateMcq);

  // If every result is a network failure the whole request was dropped — fall
  // back to one file at a time so the others can still succeed.
  const allNetworkFailed = results.every((r) => !r.success && isNetworkError(r.error));
  if (!allNetworkFailed) return results;

  const retried: UploadResult[] = [];
  for (const file of files) {
    const [result] = await uploadSopBatchOnce([file], language, department, generateMcq);
    // One extra attempt for individual network errors.
    if (!result.success && isNetworkError(result.error)) {
      const [retry] = await uploadSopBatchOnce([file], language, department, generateMcq);
      retried.push(retry);
    } else {
      retried.push(result);
    }
  }
  return retried;
}

async function uploadSopBatch(
  files: File[],
  language: string,
  department: string,
  generateMcq: boolean,
  onProgress?: (completed: number, total: number) => void,
): Promise<UploadResult[]> {
  const allResults: UploadResult[] = [];
  const total = files.length;

  for (let start = 0; start < total; start += SOP_UPLOAD_BATCH_SIZE) {
    const batch = files.slice(start, start + SOP_UPLOAD_BATCH_SIZE);
    const batchResults = await uploadSopBatchWithFallback(batch, language, department, generateMcq);
    allResults.push(...batchResults);
    onProgress?.(Math.min(start + batch.length, total), total);
  }

  return allResults;
}

/* ─── SOP folder upload ─────────────────────────────────────────────── */

export function SopFolderUploadModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useDashboardStore();
  const { files, addFiles, clearFiles, fileInputRef, folderInputRef, handleFileChange } =
    useBulkFileSelection(filterSopFiles);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [department, setDepartment] = useState("");
  const [generateMcq, setGenerateMcq] = useState(false);

  const reset = () => {
    clearFiles();
    setResults([]);
    setUploadProgress(null);
    setDepartment("");
    setGenerateMcq(false);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleUpload = async () => {
    if (!files.length || uploading) return;
    setUploading(true);
    setResults([]);
    setUploadProgress(initialProgress(files.length));
    try {
      const uploadResults = await uploadSopBatch(
        files,
        "English",
        department,
        generateMcq,
        (completed, total) => setUploadProgress({ completed, total }),
      );
      setResults(uploadResults);
      const count = uploadResults.filter((r) => r.success).length;
      if (count > 0) {
        showToast(`Uploaded ${count} file(s) successfully`);
        clearFiles();
        onSuccess();
        if (uploadResults.every((r) => r.success)) handleClose();
      } else {
        showToast("All files failed — see details below");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleRescan = async () => {
    try {
      const [deptRes, versionRes] = await Promise.all([
        fetch("/api/admin/reconcile-departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onlyGeneral: true }),
        }),
        fetch("/api/admin/reconcile-sop-versions", { method: "POST" }),
      ]);
      const deptData = await deptRes.json();
      const versionData = await versionRes.json();
      if (!deptRes.ok) throw new Error(deptData.error ?? "Rescan failed");
      if (!versionRes.ok) throw new Error(versionData.error ?? "Version rescan failed");

      const messages: string[] = [];
      if (deptData.updated > 0) {
        messages.push(`Updated department for ${deptData.updated} record(s)`);
      }
      if (versionData.updated > 0 || versionData.cleaned > 0) {
        messages.push(
          `Fixed version mapping for ${versionData.updated} record(s)` +
            (versionData.cleaned > 0 ? `, cleaned ${versionData.cleaned} prior file link(s)` : ""),
        );
      }
      showToast(messages.length ? messages.join(". ") : "No changes needed");
      onSuccess();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Rescan failed");
    }
  };

  return (
    <BulkUploadShell
      open={open}
      title="SOP folder upload"
      icon={<FolderUp className="h-4 w-4 text-violet-600" />}
      accent="violet"
      wide
      uploading={uploading}
      uploadProgress={uploadProgress}
      fileCount={files.length}
      uploadLabel="Upload"
      onClose={handleClose}
      onUpload={handleUpload}
      footerLeft={
        <button
          type="button"
          onClick={handleRescan}
          disabled={uploading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Rescan Prior Dates
        </button>
      }
    >
      <ExpectedStructureBox />
      <BulkUploadDropZone
        accent="violet"
        files={files}
        uploading={uploading}
        accept={{
          "application/pdf": [".pdf"],
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
        }}
        primaryLabel="Select files"
        secondaryLabel="Select folder"
        hint="Drag department folders here, or"
        tip="Use Personnel/ (or department override). Version-as-folder: PEGE11-09/, PEGE11-10/. Or SOP folder + V8/: PEGE11-10 - Title/V8/. Only .docx/.pdf are imported."
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onFilesAdded={addFiles}
      />
      <HiddenBulkInputs
        accept=".pdf,.docx"
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onChange={handleFileChange}
        uploading={uploading}
      />
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Department override (optional)
        <input
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
          placeholder="e.g. QA, QC"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={generateMcq}
          onChange={(e) => setGenerateMcq(e.target.checked)}
          className="h-3.5 w-3.5 accent-violet-600"
        />
        Auto-generate MCQs after upload
      </label>
      <BulkUploadResults results={results} />
    </BulkUploadShell>
  );
}

/* ─── Gujarati folder upload ────────────────────────────────────────── */

export function GujaratiFolderUploadModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useDashboardStore();
  const { files, addFiles, clearFiles, fileInputRef, folderInputRef, handleFileChange } =
    useBulkFileSelection(filterSopFiles);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleClose = () => {
    if (uploading) return;
    clearFiles();
    setResults([]);
    setUploadProgress(null);
    onClose();
  };

  const handleUpload = async () => {
    if (!files.length || uploading) return;
    setUploading(true);
    setResults([]);
    setUploadProgress(initialProgress(files.length));
    try {
      const uploadResults = await uploadSopBatch(
        files,
        "Gujarati",
        "",
        false,
        (completed, total) => setUploadProgress({ completed, total }),
      );
      setResults(uploadResults);
      const count = uploadResults.filter((r) => r.success).length;
      if (count > 0) {
        showToast(`Uploaded ${count} Gujarati file(s) successfully`);
        clearFiles();
        onSuccess();
        if (uploadResults.every((r) => r.success)) handleClose();
      } else {
        showToast("All files failed — see details below");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <BulkUploadShell
      open={open}
      title="Gujarati folder upload"
      icon={<Languages className="h-4 w-4 text-violet-600" />}
      accent="violet"
      wide
      uploading={uploading}
      uploadProgress={uploadProgress}
      fileCount={files.length}
      uploadLabel="Upload"
      onClose={handleClose}
      onUpload={handleUpload}
    >
      <HowItWorksBox>
        <p>
          Upload Gujarati SOP folders with the same structure as English batches. Files are tagged
          as <strong>Gujarati</strong> automatically.
        </p>
        <p>
          Folder names should include the SOP code (e.g. <strong>QAGE01-10</strong>). Use
          department parent folders (QA, QC, Store, etc.) so metadata is detected correctly.
        </p>
        <p>Annexure and appendix files are skipped during selection.</p>
      </HowItWorksBox>
      <ExpectedStructureBox />
      <BulkUploadDropZone
        accent="violet"
        files={files}
        uploading={uploading}
        accept={{
          "application/pdf": [".pdf"],
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
        }}
        primaryLabel="Select files"
        secondaryLabel="Select folder"
        hint="Drag Gujarati department folders here, or"
        tip="Each sub-folder is treated as one department batch."
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onFilesAdded={addFiles}
      />
      <HiddenBulkInputs
        accept=".pdf,.docx"
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onChange={handleFileChange}
        uploading={uploading}
      />
      <BulkUploadResults results={results} />
    </BulkUploadShell>
  );
}

/* ─── Bulk PDF upload ───────────────────────────────────────────────── */

export function BulkPdfUploadModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useDashboardStore();
  const { files, addFiles, clearFiles, fileInputRef, folderInputRef, handleFileChange } =
    useBulkFileSelection(filterPdfFiles);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleClose = () => {
    if (uploading) return;
    clearFiles();
    setResults([]);
    setUploadProgress(null);
    onClose();
  };

  const handleUpload = async () => {
    if (!files.length || uploading) return;
    setUploading(true);
    setResults([]);
    setUploadProgress(initialProgress(files.length));
    try {
      const uploadResults = await uploadSopBatch(
        files,
        "English",
        "",
        false,
        (completed, total) => setUploadProgress({ completed, total }),
      );
      setResults(uploadResults);
      const count = uploadResults.filter((r) => r.success).length;
      if (count > 0) {
        showToast(`Uploaded ${count} PDF(s) successfully`);
        clearFiles();
        onSuccess();
        if (uploadResults.every((r) => r.success)) handleClose();
      } else {
        showToast("All files failed — see details below");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <BulkUploadShell
      open={open}
      title="Bulk Upload PDF (for SOP Registry)"
      icon={<FileText className="h-4 w-4 text-red-600" />}
      accent="red"
      uploading={uploading}
      uploadProgress={uploadProgress}
      fileCount={files.length}
      uploadLabel="Upload PDFs"
      onClose={handleClose}
      onUpload={handleUpload}
    >
      <HowItWorksBox>
        <p>
          Filenames must contain the SOP code (e.g. <strong>QAGE08-09</strong>) so each PDF is
          auto-matched to the correct SOP in the registry.
        </p>
        <p>
          Drag and drop multiple folders at once — each folder can contain PDFs for different
          departments. Only <strong>PDF</strong> files are imported; existing{" "}
          <strong>DOCX</strong> links are not replaced.
        </p>
        <p>Annexure/appendix files are skipped automatically.</p>
      </HowItWorksBox>
      <BulkUploadDropZone
        accent="red"
        files={files}
        uploading={uploading}
        accept={{ "application/pdf": [".pdf"] }}
        primaryLabel="Select PDFs"
        secondaryLabel="Select folder"
        hint="Drag all department folders here at once (supports multiple), or"
        tip="Tip: Select the parent folder that contains QA, QC, Store, etc."
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onFilesAdded={addFiles}
      />
      <HiddenBulkInputs
        accept=".pdf"
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onChange={handleFileChange}
        uploading={uploading}
      />
      <BulkUploadResults results={results} />
    </BulkUploadShell>
  );
}

/* ─── Location upload ───────────────────────────────────────────────── */

export function BulkLocationUploadModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useDashboardStore();
  const { files, addFiles, clearFiles, fileInputRef, folderInputRef, handleFileChange } =
    useBulkFileSelection(filterLocationFiles);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleClose = () => {
    if (uploading) return;
    clearFiles();
    setResults([]);
    setUploadProgress(null);
    onClose();
  };

  const handleUpload = async () => {
    if (!files[0] || uploading) return;
    setUploading(true);
    setResults([]);
    setUploadProgress({ completed: 0, total: 1 });
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      const res = await fetch("/api/sop/bulk-locations", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      const mapped: UploadResult[] = (data.results ?? []).map(
        (r: { identifier: string; success: boolean; error?: string }) => ({
          file: r.identifier,
          success: r.success,
          error: r.error,
        }),
      );
      setUploadProgress({ completed: 1, total: 1 });
      setResults(mapped);
      const count = mapped.filter((r) => r.success).length;
      if (count > 0) {
        showToast(`Updated locations for ${count} SOP(s)`);
        clearFiles();
        onSuccess();
        handleClose();
      } else {
        showToast("No locations were updated");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <BulkUploadShell
      open={open}
      title="Upload locations"
      icon={<MapPin className="h-4 w-4 text-sky-600" />}
      accent="sky"
      uploading={uploading}
      uploadProgress={uploadProgress}
      fileCount={files.length}
      uploadLabel="Import locations"
      disableUpload={!files.length || uploading}
      onClose={handleClose}
      onUpload={handleUpload}
    >
      <HowItWorksBox>
        <p>
          Upload the standard location <strong>Excel (.xlsx)</strong> file. The sheet must have:
        </p>
        <p>
          <strong>Col B</strong> — DP No. (physical location, e.g. <code className="rounded bg-sky-100 px-1">NDP-3 (Secondary PM Store)</code>)<br />
          <strong>Col C</strong> — SOP No. / Annexure No. (e.g. <code className="rounded bg-sky-100 px-1">STGE08-02</code>)
        </p>
        <p>
          The DP No. carries forward across merged rows. Section headers and <strong>NA</strong>{" "}
          entries are skipped automatically.
        </p>
        <p>
          A simple <strong>CSV/TSV</strong> with columns <em>identifier</em> and{" "}
          <em>location</em> is also accepted as a fallback format.
        </p>
      </HowItWorksBox>
      <BulkUploadDropZone
        accent="sky"
        files={files}
        uploading={uploading}
        accept={{
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
          "application/vnd.ms-excel": [".xls"],
          "text/csv": [".csv"],
          "text/plain": [".txt", ".tsv"],
        }}
        primaryLabel="Select file"
        hint="Drag an Excel or CSV file here, or"
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onFilesAdded={(incoming) => addFiles(incoming.slice(0, 1))}
        showFolderButton={false}
      />
      <HiddenBulkInputs
        accept=".xlsx,.xls,.csv,.txt,.tsv"
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onChange={handleFileChange}
        uploading={uploading}
        showFolder={false}
      />
      <BulkUploadResults results={results} />
    </BulkUploadShell>
  );
}

/* ─── Videos & slides bulk upload ───────────────────────────────────── */

export function BulkVideosSlidesModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useDashboardStore();
  const { files, addFiles, clearFiles, fileInputRef, folderInputRef, handleFileChange } =
    useBulkFileSelection(filterMediaFiles);
  const [videos, setVideos] = useState<File[]>([]);
  const [slides, setSlides] = useState<File[]>([]);
  const [thumbnail, setThumbnail] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);

  const totalCount = files.length + videos.length + slides.length + thumbnail.length;

  const reset = () => {
    clearFiles();
    setVideos([]);
    setSlides([]);
    setThumbnail([]);
    setResults([]);
    setUploadProgress(null);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const uploadMediaBatch = useCallback(async (batch: File[]) => {
    const formData = new FormData();
    for (const file of batch) {
      const kind = file.name.match(/\.(pdf)$/i)
        ? "slides"
        : file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)
          ? "thumbnail"
          : "videos";
      if (kind === "thumbnail") formData.append("thumbnail", file);
      else formData.append(kind, file);
    }
    const res = await fetch("/api/sop/media-upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return (data.results ?? []) as UploadResult[];
  }, []);

  const handleUpload = async () => {
    if (!totalCount || uploading) return;
    setUploading(true);
    setResults([]);
    setUploadProgress(initialProgress(totalCount));
    let completed = 0;
    try {
      const allResults: UploadResult[] = [];

      if (files.length) {
        for (let start = 0; start < files.length; start += MEDIA_UPLOAD_BATCH_SIZE) {
          const batch = files.slice(start, start + MEDIA_UPLOAD_BATCH_SIZE);
          allResults.push(...(await uploadMediaBatch(batch)));
          completed += batch.length;
          setUploadProgress({ completed, total: totalCount });
        }
      }

      const pickerFiles = [...videos, ...slides, ...thumbnail];
      if (pickerFiles.length) {
        const formData = new FormData();
        videos.forEach((f) => formData.append("videos", f));
        slides.forEach((f) => formData.append("slides", f));
        if (thumbnail[0]) formData.append("thumbnail", thumbnail[0]);
        const res = await fetch("/api/sop/media-upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        allResults.push(...(data.results ?? []));
        completed = totalCount;
        setUploadProgress({ completed, total: totalCount });
      }

      setResults(allResults);
      const count = allResults.filter((r) => r.success).length;
      if (count > 0) {
        showToast(`Uploaded ${count} media file(s) successfully`);
        reset();
        onSuccess();
        handleClose();
      } else {
        showToast("No files uploaded — ensure filenames contain SOP codes");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <BulkUploadShell
      open={open}
      title="Upload Training Videos & Slides"
      icon={<Video className="h-4 w-4 text-violet-600" />}
      accent="violet"
      wide
      uploading={uploading}
      uploadProgress={uploadProgress}
      fileCount={totalCount}
      uploadLabel="Upload"
      disableUpload={!totalCount || uploading}
      onClose={handleClose}
      onUpload={handleUpload}
    >
      <HowItWorksBox>
        <p>
          Filenames must include the SOP code (e.g. <strong>BSGE01-05-brief.mp4</strong>) to
          auto-link media to the correct SOP.
        </p>
        <p>
          Drop a folder of videos/slides, or pick files individually below. Multiple videos per
          SOP are supported (e.g. Brief + Explainer).
        </p>
      </HowItWorksBox>

      <BulkUploadDropZone
        accent="violet"
        files={files}
        uploading={uploading}
        accept={{
          "video/mp4": [".mp4"],
          "video/quicktime": [".mov"],
          "video/webm": [".webm"],
          "application/pdf": [".pdf"],
          "image/jpeg": [".jpg", ".jpeg"],
          "image/png": [".png"],
          "image/webp": [".webp"],
        }}
        primaryLabel="Select files"
        secondaryLabel="Select folder"
        hint="Drag video/slide folders here, or"
        tip="Videos: MP4 / MOV / WEBM. Slides: PDF. Thumbnail: JPG / PNG."
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onFilesAdded={addFiles}
      />
      <HiddenBulkInputs
        accept=".mp4,.mov,.webm,.pdf,.jpg,.jpeg,.png,.webp,.gif"
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onChange={handleFileChange}
        uploading={uploading}
      />

      <div className="space-y-4 border-t border-slate-100 pt-4">
        <MediaFilePicker
          label="Video files"
          hint="MP4 / MOV / WEBM — select multiple, e.g. Brief + Explainer"
          buttonLabel="Choose videos"
          icon={Video}
          files={videos}
          onFilesChange={setVideos}
          accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
          emptyLabel="No videos selected"
          disabled={uploading}
        />
        <MediaFilePicker
          label="Slide files"
          hint="PDF — select multiple"
          buttonLabel="Choose slides"
          icon={Presentation}
          files={slides}
          onFilesChange={setSlides}
          accept=".pdf,application/pdf"
          emptyLabel="No slides selected"
          disabled={uploading}
        />
        <MediaFilePicker
          label="Video thumbnail image"
          hint="Optional — shared across all videos in this batch"
          buttonLabel="Choose image"
          icon={ImageIcon}
          files={thumbnail}
          onFilesChange={setThumbnail}
          accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
          multiple={false}
          emptyLabel="No thumbnail"
          disabled={uploading}
        />
      </div>

      <BulkUploadResults results={results} />
    </BulkUploadShell>
  );
}

/* ─── Migrate to Bunny ──────────────────────────────────────────────── */

export function MigrateBunnyModal({
  open,
  onClose,
  onSuccess,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAdmin: boolean;
}) {
  const { showToast } = useDashboardStore();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const handleClose = () => {
    if (running) return;
    setMessage("");
    onClose();
  };

  const handleMigrate = async () => {
    if (!isAdmin) {
      showToast("Admin access required");
      return;
    }
    setRunning(true);
    setMessage("Migrating local files to Bunny CDN…");
    try {
      const res = await fetch("/api/admin/bunny-sop-cleanup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Migration failed");
      const summary = `Done: ${data.migrated} migrated, ${data.failed} failed, ${data.skipped} skipped`;
      setMessage(summary);
      showToast(summary);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Migration failed";
      setMessage(msg);
      showToast(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <BulkUploadShell
      open={open}
      title="Migrate to Bunny"
      icon={<CloudUpload className="h-4 w-4 text-orange-600" />}
      accent="orange"
      uploading={running}
      progressIndeterminate={running}
      fileCount={0}
      uploadLabel="Start migration"
      hideCount
      disableUpload={running || !isAdmin}
      onClose={handleClose}
      onUpload={handleMigrate}
    >
      <HowItWorksBox>
        <p>
          Scans all SOP records and uploads any files still stored locally to{" "}
          <strong>Bunny CDN</strong>.
        </p>
        <p>Files already on Bunny are skipped. Requires Bunny CDN credentials in environment.</p>
        <p>Admin role required. Dashboard file links refresh after migration completes.</p>
      </HowItWorksBox>
      {message ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {message}
        </p>
      ) : null}
      {!isAdmin ? (
        <p className="text-xs text-amber-700">You need admin access to run this migration.</p>
      ) : null}
    </BulkUploadShell>
  );
}

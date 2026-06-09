"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { appendFilesWithPaths } from "@/lib/upload-form";
import { BulkUploadProgressBar, type UploadProgress } from "./BulkUploadShell";
import { Btn, Modal } from "./ui";

const UPLOAD_BATCH_SIZE = 8;

const DEPARTMENTS = [
  "QA",
  "QC",
  "Microbiology",
  "Production",
  "Store",
  "Engineering and Maintenance",
  "Personnel",
];

interface UploadSOPModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  departmentList: string[];
}

export function UploadSOPModal({
  open,
  onClose,
  onSuccess,
  departmentList,
}: UploadSOPModalProps) {
  const [language, setLanguage] = useState<"English" | "Gujarati">("English");
  const [department, setDepartment] = useState("QA");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0");
  const [location, setLocation] = useState("");
  const [generateMcq, setGenerateMcq] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [results, setResults] = useState<
    Array<{ file: string; success: boolean; error?: string }>
  >([]);
  const { addPipelineJob, showToast } = useDashboardStore();

  const allDepts = [...new Set([...DEPARTMENTS, ...departmentList])];

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;
      setUploading(true);
      setUploadProgress({ completed: 0, total: acceptedFiles.length });
      setResults([]);

      try {
        const allResults: Array<{ file: string; success: boolean; error?: string; identifier?: string }> = [];

        for (let start = 0; start < acceptedFiles.length; start += UPLOAD_BATCH_SIZE) {
          const batch = acceptedFiles.slice(start, start + UPLOAD_BATCH_SIZE);
          const formData = new FormData();
          formData.append("department", department);
          formData.append("language", language);
          formData.append("version", version);
          if (identifier) formData.append("identifier", identifier);
          if (name) formData.append("name", name);
          if (location) formData.append("location", location);
          formData.append("generateMcq", String(generateMcq));
          appendFilesWithPaths(formData, batch);

          const res = await fetch("/api/sop/upload-batch", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          allResults.push(...(data.results ?? []));
          setUploadProgress({
            completed: Math.min(start + batch.length, acceptedFiles.length),
            total: acceptedFiles.length,
          });
        }

        setResults(allResults);

        if (generateMcq) {
          for (const r of allResults) {
            if (r.success && r.identifier) {
              addPipelineJob({
                identifier: r.identifier,
                language: language === "Gujarati" ? "GUJ" : "ENG",
                stage: "mcq_generating",
                status: "running",
                progress: 20,
              });
            }
          }
        }

        const successCount = allResults.filter((r) => r.success).length;
        if (successCount > 0) {
          showToast(`Uploaded ${successCount} file(s) successfully`);
          onSuccess();
        }
      } catch (err) {
        setResults([
          {
            file: "Upload",
            success: false,
            error: err instanceof Error ? err.message : "Network error",
          },
        ]);
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [
      department,
      language,
      identifier,
      name,
      version,
      location,
      generateMcq,
      addPipelineJob,
      showToast,
      onSuccess,
    ],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    disabled: uploading,
  });

  return (
    <Modal open={open} onClose={onClose} title="Upload SOP" wide>
      <div className="mb-3 flex gap-1">
        {(["English", "Gujarati"] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            className={`rounded px-3 py-1 text-xs font-medium ${
              language === lang
                ? "bg-sky-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {lang}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="text-[10px]">
          Department
          <select
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {allDepts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px]">
          Version
          <input
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
        <label className="text-[10px]">
          SOP No (optional)
          <input
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Auto-detect from filename"
          />
        </label>
        <label className="text-[10px]">
          Location
          <input
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label className="col-span-2 text-[10px]">
          SOP Name (optional)
          <input
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <label className="mb-3 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={generateMcq}
          onChange={(e) => setGenerateMcq(e.target.checked)}
        />
        Auto-generate MCQs after upload
      </label>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive
            ? "border-sky-400 bg-sky-50"
            : "border-slate-300 bg-slate-50 hover:border-sky-300"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        <p className="text-sm text-slate-600">
          Drag &amp; drop DOCX or PDF files here, or click to browse
        </p>
      </div>

      {uploading ? (
        <div className="mt-3">
          <BulkUploadProgressBar accent="sky" progress={uploadProgress} />
        </div>
      ) : null}

      {results.length > 0 && (
        <div className="mt-3 space-y-1">
          {results.map((r) => (
            <div
              key={r.file}
              className={`rounded px-2 py-1 text-xs ${
                r.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
              }`}
            >
              {r.file}: {r.success ? "Success" : r.error}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

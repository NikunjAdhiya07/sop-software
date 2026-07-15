"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, FolderInput, Loader2, Paperclip, History } from "lucide-react";
import { Btn, Modal } from "./ui";
import { useDashboardStore } from "@/lib/store/dashboard-store";

type ImportScope = "main" | "annexure" | "prior";

type ImportPreview = {
  importDir: string;
  scopes: ImportScope[];
  parentIdentifier?: string;
  parentFound?: boolean;
  unresolvedAnnexures: number;
  total: number;
  main: number;
  annexure: number;
  prior: number;
  pending: number;
  pendingMain: number;
  pendingAnnexure: number;
  pendingPrior: number;
  duplicate: number;
  obsolete: number;
};

type ImportJob = {
  status: string;
  phase: string;
  percent: number;
  totals: Record<string, number>;
  files?: Array<{ relativePath: string; fileName: string; status: string; message?: string }>;
  error?: string;
};

type ModalPhase = "select" | "scanning" | "preview" | "importing" | "done" | "error";

const SCOPE_OPTIONS: Array<{
  id: ImportScope;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    id: "main",
    label: "New SOPs",
    hint: "Current-version documents at files/ root (not annexures, not versions/)",
    icon: <FileText className="h-4 w-4 text-sky-600" />,
  },
  {
    id: "annexure",
    label: "Annexures",
    hint: "Reads Ref. SOP No. from each annexure header, or use files/PARENT-CODE/ folder",
    icon: <Paperclip className="h-4 w-4 text-violet-600" />,
  },
  {
    id: "prior",
    label: "Prior versions",
    hint: "Older revisions under files/versions/",
    icon: <History className="h-4 w-4 text-amber-600" />,
  },
];

function scopeQuery(scopes: ImportScope[]): string {
  return scopes.join(",");
}

function scopeLabel(scopes: ImportScope[]): string {
  const labels: Record<ImportScope, string> = {
    main: "SOPs",
    annexure: "annexures",
    prior: "prior versions",
  };
  return scopes.map((s) => labels[s]).join(", ");
}

function previewUrl(scopes: ImportScope[], parentSop: string): string {
  const params = new URLSearchParams({ scopes: scopeQuery(scopes) });
  const parent = parentSop.trim();
  if (parent) params.set("parent", parent);
  return `/api/sop/files-import/preview?${params}`;
}

export function FilesFolderImportButton({ onComplete }: { onComplete?: () => void }) {
  const { showToast } = useDashboardStore();
  const [open, setOpen] = useState(false);
  const [modalPhase, setModalPhase] = useState<ModalPhase>("select");
  const [selectedScopes, setSelectedScopes] = useState<ImportScope[]>([]);
  const [parentSop, setParentSop] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [scanError, setScanError] = useState("");
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);

  const toggleScope = (scope: ImportScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const loadPreview = useCallback(
    async (scopes: ImportScope[], parent: string, opts?: { silent?: boolean }) => {
      if (!scopes.length) return;
      if (!opts?.silent) {
        setModalPhase("scanning");
        setScanError("");
        setPreview(null);
      }
      try {
        const res = await fetch(previewUrl(scopes, parent));
        const data = await res.json();
        if (!res.ok) {
          if (!opts?.silent) {
            setScanError(data.error ?? "Could not scan files folder");
            setModalPhase("error");
          }
          return;
        }
        setPreview(data);
        if (!opts?.silent) setModalPhase("preview");
      } catch {
        if (!opts?.silent) {
          setScanError("Could not scan files folder");
          setModalPhase("error");
        }
      }
    },
    [],
  );

  const annexureScope = selectedScopes.includes("annexure");
  const needsParent =
    annexureScope && (preview?.unresolvedAnnexures ?? 0) > 0 && !parentSop.trim();
  const parentMissing =
    annexureScope && parentSop.trim() && preview?.parentFound === false;
  const canImport =
    (preview?.pending ?? 0) > 0 && !needsParent && !parentMissing;

  const closeModal = () => {
    if (running) return;
    setOpen(false);
    setModalPhase("select");
    setSelectedScopes([]);
    setParentSop("");
    setPreview(null);
    setScanError("");
    setJob(null);
    setJobId(null);
  };

  const openModal = () => {
    setOpen(true);
    setModalPhase("select");
    setSelectedScopes([]);
    setParentSop("");
    setPreview(null);
    setJob(null);
    setJobId(null);
    setScanError("");
  };

  const startScan = () => {
    if (!selectedScopes.length) return;
    setScanError("");
    void loadPreview(selectedScopes, parentSop);
  };

  useEffect(() => {
    if (!jobId || !running) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/sop/files-import/status?jobId=${jobId}`);
        const data = await res.json();
        if (!res.ok || !data.job) return;
        setJob(data.job);
        if (data.job.status === "completed" || data.job.status === "failed") {
          setRunning(false);
          setJobId(null);
          setModalPhase(data.job.status === "failed" ? "error" : "done");
          if (selectedScopes.length) void loadPreview(selectedScopes, parentSop, { silent: true });
          onComplete?.();
          if (data.job.status === "failed") {
            setScanError(data.job.error ?? "Import failed");
          } else {
            const t = data.job.totals;
            showToast(
              `Imported ${t.imported} file(s): ${t.annexures ?? 0} annexures, ` +
                `${t.skipped ?? 0} skipped, ${t.failed ?? 0} failed`,
            );
          }
        }
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(() => void poll(), 2000);
    void poll();
    return () => clearInterval(id);
  }, [jobId, running, loadPreview, onComplete, showToast, selectedScopes, parentSop]);

  const runImport = async () => {
    if (running || !canImport || !selectedScopes.length) return;
    setRunning(true);
    setModalPhase("importing");
    setScanError("");
    try {
      const body: { scopes: ImportScope[]; parentIdentifier?: string } = {
        scopes: selectedScopes,
      };
      const parent = parentSop.trim();
      if (parent) body.parentIdentifier = parent;

      const res = await fetch("/api/sop/files-import/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunning(false);
        setModalPhase("error");
        setScanError(data.error ?? "Import failed to start");
        return;
      }
      setJobId(data.jobId);
    } catch {
      setRunning(false);
      setModalPhase("error");
      setScanError("Import failed to start");
    }
  };

  const recentFiles = job?.files?.slice(-12).reverse() ?? [];
  const failedFiles = job?.files?.filter((f) => f.status === "failed") ?? [];

  return (
    <>
      <Btn
        size="sm"
        className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
        onClick={openModal}
        disabled={running}
        title="Import new files from the files/ folder"
      >
        {running ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <FolderInput className="h-3 w-3" />
        )}
        {running ? "Importing…" : "Import from files/"}
      </Btn>

      <Modal open={open} onClose={closeModal} title="Import from files/" wide>
        <div className="space-y-4 text-xs text-slate-700">
          {modalPhase === "select" && (
            <>
              <p className="text-[10px] leading-snug text-slate-600">
                What did you add to <span className="font-mono font-semibold">files/</span>? Only
                that category is scanned — much faster than checking everything.
              </p>
              <div className="space-y-2">
                {SCOPE_OPTIONS.map((opt) => {
                  const checked = selectedScopes.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 transition-colors ${
                        checked
                          ? "border-emerald-300 bg-emerald-50/80"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => toggleScope(opt.id)}
                      />
                      <span className="mt-0.5 shrink-0">{opt.icon}</span>
                      <span>
                        <span className="font-semibold text-slate-800">{opt.label}</span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {annexureScope && (
                <div className="rounded border border-violet-200 bg-violet-50/60 px-3 py-2">
                  <label className="block text-[10px] font-semibold text-violet-900">
                    Parent SOP code <span className="font-normal text-violet-700">(optional override)</span>
                  </label>
                  <input
                    className="mt-1 w-full rounded border border-violet-300 bg-white px-2 py-1.5 font-mono text-xs uppercase focus:border-violet-500 focus:outline-none"
                    placeholder="Auto from Ref. SOP No. in annexure"
                    value={parentSop}
                    onChange={(e) => setParentSop(e.target.value.toUpperCase())}
                  />
                  <p className="mt-1 text-[10px] text-violet-800">
                    Normally detected from the annexure header <strong>Ref. SOP No.</strong> field (or
                    Format No. like QAGE01/F01-00). Only needed if that field is blank.
                  </p>
                </div>
              )}
              {scanError && modalPhase === "select" && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
                  {scanError}
                </div>
              )}
            </>
          )}

          {modalPhase === "scanning" && (
            <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-4">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
              <div>
                <p className="font-semibold text-slate-800">
                  Scanning {scopeLabel(selectedScopes)}…
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Checking only the selected categories against the database.
                </p>
              </div>
            </div>
          )}

          {modalPhase === "preview" && preview && (
            <>
              <p className="text-[10px] leading-snug text-slate-600">
                Folder: <span className="font-mono font-semibold">{preview.importDir}</span>
                {" · "}
                Scanning: <span className="font-semibold">{scopeLabel(preview.scopes)}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Files checked" value={preview.total} />
                <Stat label="Pending import" value={preview.pending} highlight />
                <Stat label="Duplicates" value={preview.duplicate} />
                <Stat label="Obsolete" value={preview.obsolete} />
              </div>
              <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[10px] text-emerald-900">
                {preview.scopes.includes("main") && (
                  <>
                    <span className="font-semibold">{preview.pendingMain}</span> SOPs
                  </>
                )}
                {preview.scopes.includes("main") && preview.scopes.includes("annexure") && ", "}
                {preview.scopes.includes("annexure") && (
                  <>
                    <span className="font-semibold">{preview.pendingAnnexure}</span> annexures
                  </>
                )}
                {(preview.scopes.includes("main") || preview.scopes.includes("annexure")) &&
                  preview.scopes.includes("prior") &&
                  ", "}
                {preview.scopes.includes("prior") && (
                  <>
                    <span className="font-semibold">{preview.pendingPrior}</span> prior versions
                  </>
                )}{" "}
                ready to import
                {preview.pending === 0 && " — nothing new in this selection."}
              </div>
              {needsParent && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
                  {preview.unresolvedAnnexures} annexure(s) have no parent — enter parent SOP code
                  and rescan, or move files into <span className="font-mono">files/PARENT-CODE/</span>
                  .
                </div>
              )}
              {parentMissing && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-800">
                  Parent SOP <span className="font-mono">{parentSop}</span> was not found — import
                  the main SOP first.
                </div>
              )}
            </>
          )}

          {modalPhase === "importing" && job && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-slate-800">{job.phase}</span>
                  <span className="text-slate-500">{job.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${job.percent}%` }}
                  />
                </div>
              </div>
              {job.totals && (
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <Badge>Imported: {job.totals.imported ?? 0}</Badge>
                  <Badge>Skipped: {job.totals.skipped ?? 0}</Badge>
                  <Badge>Failed: {job.totals.failed ?? 0}</Badge>
                  <Badge>Annexures: {job.totals.annexures ?? 0}</Badge>
                </div>
              )}
              {recentFiles.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded border border-slate-200">
                  <table className="w-full text-left text-[10px]">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-2 py-1 font-bold">File</th>
                        <th className="px-2 py-1 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFiles.map((f) => (
                        <tr key={f.relativePath} className="border-t border-slate-100">
                          <td
                            className="max-w-[220px] truncate px-2 py-1 font-mono"
                            title={f.relativePath}
                          >
                            {f.fileName}
                          </td>
                          <td className="px-2 py-1 capitalize text-slate-600">
                            {f.status.replace(/_/g, " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {modalPhase === "importing" && !job && (
            <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-4">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
              <p className="font-semibold text-slate-800">Starting import…</p>
            </div>
          )}

          {modalPhase === "done" && job && (
            <div
              className={`rounded border px-3 py-3 ${
                failedFiles.length
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <p className="font-semibold">
                {failedFiles.length ? "Import finished with errors" : "Import complete"}
              </p>
              <p className="mt-1 text-[10px]">
                {job.totals.imported ?? 0} imported, {job.totals.skipped ?? 0} skipped,{" "}
                {job.totals.failed ?? 0} failed, {job.totals.annexures ?? 0} annexures linked.
              </p>
              {failedFiles.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[10px]">
                  {failedFiles.map((f) => (
                    <li key={f.relativePath}>
                      <span className="font-mono font-semibold">{f.fileName}</span>
                      {": "}
                      {f.message ?? "Import failed"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {modalPhase === "error" && scanError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-3 text-red-800">
              <p className="font-semibold">Error</p>
              <p className="mt-1 text-[10px]">{scanError}</p>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            {modalPhase === "select" && (
              <>
                <Btn onClick={closeModal}>Cancel</Btn>
                <Btn
                  variant="primary"
                  disabled={!selectedScopes.length}
                  onClick={startScan}
                >
                  Scan selected
                </Btn>
              </>
            )}
            {modalPhase === "preview" && (
              <>
                <Btn onClick={() => setModalPhase("select")}>Change selection</Btn>
                <Btn onClick={() => void loadPreview(selectedScopes, parentSop)}>Rescan</Btn>
                <Btn
                  variant="primary"
                  disabled={!canImport}
                  onClick={() => void runImport()}
                >
                  Import {preview?.pending ?? 0} file(s)
                </Btn>
              </>
            )}
            {(modalPhase === "done" || modalPhase === "error") && selectedScopes.length > 0 && (
              <Btn onClick={() => void loadPreview(selectedScopes, parentSop)}>Rescan</Btn>
            )}
            {modalPhase !== "select" && (
              <Btn onClick={closeModal} disabled={running}>
                {running ? "Importing…" : "Close"}
              </Btn>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        highlight ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-emerald-800" : "text-slate-800"}`}>
        {value}
      </p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-700">
      {children}
    </span>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { RegistrySOP } from "@/lib/types";
import type { VersionDiagnosticsReport } from "@/lib/version-diagnostics";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { ComplianceGuidelineDetail } from "./ComplianceGuidelineDetail";
import { Badge, Btn, Modal } from "./ui";
import { displaySopCode } from "@/lib/sop-display";

interface GuidelineItem {
  _id: string;
  name: string;
  folder: string;
  clauses: Array<{ number: string; title: string }>;
}

export function ComplianceModal({
  open,
  onClose,
  sops,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  sops: RegistrySOP[];
  onComplete?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedSops, setSelectedSops] = useState<string[]>([]);
  const [guidelines, setGuidelines] = useState<GuidelineItem[]>([]);
  const [selectedGuidelines, setSelectedGuidelines] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [resultKey, setResultKey] = useState<{ sopId: string; guidelineId: string } | null>(
    null,
  );
  const { showToast } = useDashboardStore();

  useEffect(() => {
    if (!open) return;
    fetch("/api/guidelines")
      .then((r) => r.json())
      .then((d) => setGuidelines(d.guidelines ?? []));
  }, [open]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const filteredSops = useMemo(
    () =>
      sops.filter(
        (s) =>
          s.identifier.toLowerCase().includes(search.toLowerCase()) ||
          s.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [sops, search],
  );

  const folders = useMemo(() => {
    const map = new Map<string, GuidelineItem[]>();
    for (const g of guidelines) {
      if (!map.has(g.folder)) map.set(g.folder, []);
      map.get(g.folder)!.push(g);
    }
    return map;
  }, [guidelines]);

  const runAnalysis = async () => {
    if (!selectedSops.length || !selectedGuidelines.length) return;
    setStep(3);
    setRunning(true);
    setLogs([]);
    setElapsed(0);

    const sop = sops.find((s) => s.identifier === selectedSops[0]);
    if (!sop) return;

    try {
      const res = await fetch("/api/compliance/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sopIdentifier: sop.identifier,
          guidelineId: selectedGuidelines[0],
        }),
      });

      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "log") setLogs((l) => [...l, event.message]);
            if (event.type === "finding")
              setLogs((l) => [...l, `Finding: ${event.finding?.clause} — ${event.finding?.status}`]);
            if (event.type === "complete") {
              setLogs((l) => [
                ...l,
                `Complete — score ${event.score}/10, ${event.findingsCount} findings`,
              ]);
              setResultKey({ sopId: sop.id, guidelineId: selectedGuidelines[0] });
              showToast(
                `${displaySopCode(sop.identifier)}: ${event.findingsCount} findings, score ${event.score}/10`,
              );
              onComplete?.();
            }
            if (event.type === "error") setLogs((l) => [...l, `ERROR: ${event.message}`]);
          } catch {
            /* skip malformed lines */
          }
        }
      }
    } catch (err) {
      setLogs((l) => [...l, `ERROR: ${err instanceof Error ? err.message : "Failed"}`]);
    } finally {
      setRunning(false);
    }
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Modal open={open} onClose={onClose} title="Compliance Analysis Wizard" wide>
      <div className="mb-3 flex gap-2 text-[10px]">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`rounded px-2 py-0.5 ${step === n ? "bg-violet-600 text-white" : "bg-slate-100"}`}
          >
            Step {n}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-2">
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="Search SOP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto rounded border border-slate-200">
            {filteredSops.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-1 text-xs hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedSops.includes(s.identifier)}
                  onChange={(e) =>
                    setSelectedSops((prev) =>
                      e.target.checked
                        ? [...prev, s.identifier]
                        : prev.filter((id) => id !== s.identifier),
                    )
                  }
                />
                <span className="font-semibold">{displaySopCode(s.identifier)}</span>
                <span className="truncate text-slate-500">{s.name}</span>
              </label>
            ))}
          </div>
          <Btn variant="primary" onClick={() => setStep(2)}>
            Next
          </Btn>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          {[...folders.entries()].map(([folder, items]) => (
            <div key={folder}>
              <p className="text-xs font-semibold text-violet-800">📁 {folder}</p>
              {items.map((g) => (
                <label
                  key={g._id}
                  className="ml-3 flex cursor-pointer items-center gap-2 py-0.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedGuidelines.includes(g._id)}
                    onChange={(e) =>
                      setSelectedGuidelines((prev) =>
                        e.target.checked
                          ? [...prev, g._id]
                          : prev.filter((id) => id !== g._id),
                      )
                    }
                  />
                  {g.name} ({g.clauses.length} clauses)
                </label>
              ))}
            </div>
          ))}
          <div className="flex gap-2">
            <Btn onClick={() => setStep(1)}>Back</Btn>
            <Btn variant="primary" onClick={runAnalysis}>
              Run Analysis
            </Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded border border-slate-900 bg-slate-900 p-3 font-mono text-[10px] text-emerald-400">
            <p>&gt; Elapsed: {mm}:{ss}</p>
            {logs.map((log, i) => (
              <p key={i}>&gt; {log}</p>
            ))}
            {running && <p>&gt; Analyzing...</p>}
          </div>
          {resultKey && !running && (
            <ComplianceGuidelineDetail
              sopId={resultKey.sopId}
              guidelineId={resultKey.guidelineId}
              onRerun={runAnalysis}
            />
          )}
          {!running && (
            <Btn onClick={onClose}>Close</Btn>
          )}
        </div>
      )}
    </Modal>
  );
}

export function AdminToolsModal({
  open,
  onClose,
  isAdmin,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onSuccess?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [confirmDeleteVersioned, setConfirmDeleteVersioned] = useState(false);
  const [deletingVersioned, setDeletingVersioned] = useState(false);
  const [backfillingNames, setBackfillingNames] = useState(false);

  // ── Version files diagnostic ──
  const [diagDept, setDiagDept] = useState("");
  const [diagCheckBunny, setDiagCheckBunny] = useState(true);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagReport, setDiagReport] = useState<VersionDiagnosticsReport | null>(null);
  const [diagError, setDiagError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [relinkDept, setRelinkDept] = useState("");
  const [relinking, setRelinking] = useState(false);

  // ── Files folder import ──
  const [importPreview, setImportPreview] = useState<{
    importDir: string;
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
  } | null>(null);
  const [importRunning, setImportRunning] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{
    status: string;
    phase: string;
    percent: number;
    totals: Record<string, number>;
    files: Array<{ relativePath: string; fileName: string; status: string; message?: string }>;
    error?: string;
  } | null>(null);
  const [exportingToFiles, setExportingToFiles] = useState(false);

  const loadImportPreview = async () => {
    try {
      const res = await fetch("/api/sop/files-import/preview");
      const data = await res.json();
      if (res.ok) setImportPreview(data);
      else setMessage(data.error ?? "Failed to preview import folder");
    } catch {
      setMessage("Failed to preview import folder");
    }
  };

  useEffect(() => {
    if (!isAdmin || !importJobId || !importRunning) return;
    const poll = async () => {
      const res = await fetch(`/api/sop/files-import/status?jobId=${importJobId}`);
      const data = await res.json();
      if (!res.ok || !data.job) return;
      setImportStatus(data.job);
      if (data.job.status === "completed" || data.job.status === "failed") {
        setImportRunning(false);
        const t = data.job.totals;
        setMessage(
          data.job.status === "failed"
            ? `Import failed: ${data.job.error ?? "unknown error"}`
            : `Import done: ${t.imported} imported, ${t.skipped} skipped, ${t.failed} failed, ${t.annexures} annexures`,
        );
        void loadImportPreview();
        onSuccess?.();
      }
    };
    const id = setInterval(() => void poll(), 2000);
    void poll();
    return () => clearInterval(id);
  }, [isAdmin, importJobId, importRunning, onSuccess]);

  const runFilesImport = async () => {
    setImportRunning(true);
    setMessage("Starting files folder import…");
    try {
      const res = await fetch("/api/sop/files-import/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Import failed to start");
        setImportRunning(false);
        return;
      }
      setImportJobId(data.jobId);
      setMessage(`Import started — scanning ${data.importDir}`);
      onSuccess?.();
    } catch {
      setMessage("Import failed to start");
      setImportRunning(false);
    }
  };

  const runExportToFiles = async () => {
    setExportingToFiles(true);
    setMessage("Exporting all SOP documents to files/ folder…");
    try {
      const res = await fetch("/api/admin/export-sops-to-files", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Export failed");
        return;
      }
      setMessage(
        `Exported to files/: ${data.written} written, ${data.skipped} unchanged, ${data.failed} failed ` +
          `(${data.currentFiles} current, ${data.priorFiles} prior in versions/)`,
      );
      void loadImportPreview();
    } catch {
      setMessage("Export to files/ failed");
    } finally {
      setExportingToFiles(false);
    }
  };

  const runRelinkBunny = async () => {
    setRelinking(true);
    setMessage(`Checking missing version files${relinkDept.trim() ? ` for ${relinkDept.trim()}` : ""} in Bunny…`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 300_000);
      const res = await fetch("/api/admin/relink-bunny-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: relinkDept.trim() || undefined,
          refreshIndex: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Relink failed");
        return;
      }
      setMessage(
        `Checked ${data.missingSlotsChecked} missing file slots (Bunny index: ${data.bunnyIndexSize ?? "?"} files) — linked ${data.linked}, created ${data.created}, ${data.notFoundInBunny} not in Bunny. Refresh the dashboard to see updated counts.`,
      );
      onSuccess?.();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessage("Relink timed out after 5 minutes. Try again with a single department filter.");
      } else {
        setMessage(err instanceof Error ? err.message : "Relink failed");
      }
    } finally {
      setRelinking(false);
    }
  };

  const runReconcileVersions = async () => {
    setReconciling(true);
    setMessage("Reconciling SOP version grouping…");
    try {
      const res = await fetch("/api/admin/reconcile-sop-versions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Reconcile failed");
        return;
      }
      setMessage(
        `Reconcile done: ${data.updated} records re-grouped, ${data.cleaned} prior-version file links cleaned (of ${data.total}).`,
      );
      onSuccess?.();
    } finally {
      setReconciling(false);
    }
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    setDiagReport(null);
    setDiagError("");
    try {
      const res = await fetch("/api/admin/version-diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkBunny: diagCheckBunny, department: diagDept.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiagError(data.error ?? "Diagnostic failed");
        return;
      }
      setDiagReport(data as VersionDiagnosticsReport);
    } catch {
      setDiagError("Network error. Please try again.");
    } finally {
      setDiagRunning(false);
    }
  };

  const runBackfillNames = async () => {
    setBackfillingNames(true);
    setMessage("Scanning records and extracting SOP names…");
    try {
      const res = await fetch("/api/admin/backfill-sop-names", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Backfill failed");
        return;
      }
      if (data.updated === 0) {
        setMessage(`No records needed updating (${data.skipped} already have correct names).`);
      } else {
        setMessage(
          `Updated ${data.updated} of ${data.total} records. ${data.skipped} already had correct names.`,
        );
      }
    } finally {
      setBackfillingNames(false);
    }
  };

  const runMigration = async () => {
    setMessage("Migrating to Bunny CDN...");
    const res = await fetch("/api/admin/bunny-sop-cleanup", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Migration failed");
      return;
    }
    setMessage(
      `Done: ${data.migrated} migrated, ${data.failed} failed, ${data.skipped} skipped`,
    );
    onSuccess?.();
  };

  const runDeleteVersionedSops = async () => {
    setDeletingVersioned(true);
    setMessage("Deleting versioned SOP families…");
    try {
      const res = await fetch("/api/admin/delete-versioned-sops", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Delete failed");
        return;
      }
      setMessage(
        `Done: ${data.familiesDeleted} SOP families deleted (${data.recordsDeleted} records, ${data.filesDeleted} files). Families: ${data.families.join(", ") || "none"}`,
      );
      onSuccess?.();
    } finally {
      setDeletingVersioned(false);
      setConfirmDeleteVersioned(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Admin Tools" wide>
      <div className="space-y-2">
        {[
          "Recheck Files",
          "Clear All File Links",
          "Import Locations (Excel)",
          "Add Custom Department",
        ].map((tool) => (
          <button
            key={tool}
            type="button"
            className="block w-full rounded border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50"
          >
            {tool}
          </button>
        ))}
        <button
          type="button"
          onClick={runMigration}
          className="block w-full rounded border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs font-semibold text-violet-800 hover:bg-violet-100"
        >
          Migrate to Bunny CDN
        </button>
        <button
          type="button"
          disabled={backfillingNames}
          onClick={runBackfillNames}
          className="block w-full rounded border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
        >
          {backfillingNames ? "Extracting names…" : "Fix SOP Names (backfill from files & content)"}
        </button>

        <div className="rounded border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-xs font-bold text-emerald-900">Files Folder Import</p>
          <p className="mt-0.5 text-[10px] leading-snug text-emerald-800">
            Copy SOPs, prior versions, and annexures as flat files into files/ (current at root,
            prior in files/versions/). Then run import — duplicates are skipped.
          </p>
          {importPreview && (
            <p className="mt-1 text-[10px] text-emerald-900">
              {importPreview.importDir}: {importPreview.total} file(s) — {importPreview.pending} pending
              ({importPreview.pendingMain} SOPs, {importPreview.pendingAnnexure} annexures,{" "}
              {importPreview.pendingPrior} prior), {importPreview.duplicate} duplicate
              {importPreview.obsolete > 0 ? `, ${importPreview.obsolete} obsolete` : ""}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn onClick={() => void loadImportPreview()}>Refresh Preview</Btn>
            <Btn disabled={exportingToFiles} onClick={() => void runExportToFiles()}>
              {exportingToFiles ? "Exporting…" : "Export DB → files/"}
            </Btn>
            <Btn variant="primary" disabled={importRunning} onClick={() => void runFilesImport()}>
              {importRunning ? "Importing…" : "Run Import"}
            </Btn>
          </div>
          {importStatus && importRunning && (
            <p className="mt-2 text-[10px] text-emerald-900">
              {importStatus.phase} ({importStatus.percent}%)
            </p>
          )}
        </div>

        <hr className="border-slate-200" />

        {/* ── Version files diagnostic ── */}
        <div className="rounded border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs font-bold text-amber-900">Version Files Diagnostic</p>
          <p className="mt-0.5 text-[10px] leading-snug text-amber-800">
            Finds the exact file (version · language · DOCX/PDF) missing for every SOP the
            dashboard counts as an incomplete version, and checks whether it already exists in
            Bunny storage (uploaded but not linked) or is genuinely absent.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={diagDept}
              onChange={(e) => setDiagDept(e.target.value)}
              placeholder="Department (blank = all)"
              className="w-48 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] focus:border-amber-500 focus:outline-none"
            />
            <label className="flex items-center gap-1 text-[11px] text-amber-900">
              <input
                type="checkbox"
                checked={diagCheckBunny}
                onChange={(e) => setDiagCheckBunny(e.target.checked)}
              />
              Cross-check Bunny storage
            </label>
            <Btn variant="primary" disabled={diagRunning} onClick={runDiagnostics}>
              {diagRunning ? "Scanning…" : "Run Diagnostic"}
            </Btn>
            <Btn disabled={reconciling} onClick={runReconcileVersions}>
              {reconciling ? "Reconciling…" : "Reconcile Version Grouping"}
            </Btn>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={relinkDept}
                onChange={(e) => setRelinkDept(e.target.value)}
                placeholder="Department (blank = all)"
                className="w-36 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] focus:border-amber-500 focus:outline-none"
              />
              <Btn variant="primary" disabled={relinking} onClick={runRelinkBunny}>
                {relinking ? "Linking…" : "Link Version Files from Bunny"}
              </Btn>
            </div>
          </div>

          {diagError && <p className="mt-2 text-[11px] text-red-600">{diagError}</p>}

          {diagReport && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="gray">Active SOPs: {diagReport.totalActive}</Badge>
                <Badge variant="green">Complete: {diagReport.versionComplete}</Badge>
                <Badge variant="red">Incomplete: {diagReport.versionIncomplete}</Badge>
                <Badge variant="amber">Missing DOCX: {diagReport.summary.missingDocx}</Badge>
                <Badge variant="amber">Missing PDF: {diagReport.summary.missingPdf}</Badge>
                <Badge variant="blue">Current: {diagReport.summary.missingCurrent}</Badge>
                <Badge variant="blue">Prior: {diagReport.summary.missingPrior}</Badge>
              </div>

              {diagReport.bunnyChecked ? (
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="green">
                    In Bunny (relinkable): {diagReport.summary.relinkableFromBunny}
                  </Badge>
                  <Badge variant="red">
                    Not in Bunny (re-upload): {diagReport.summary.notInBunny}
                  </Badge>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">
                  {diagReport.bunnyConfigured
                    ? "Bunny cross-check was skipped."
                    : "Bunny storage is not configured, so the storage cross-check was skipped."}
                </p>
              )}

              <div className="max-h-72 overflow-y-auto rounded border border-slate-200">
                <table className="w-full text-left text-[10px]">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-1 font-bold">SOP</th>
                      <th className="px-2 py-1 font-bold">Dept</th>
                      <th className="px-2 py-1 font-bold">Missing files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagReport.incompleteSops.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-3 text-center text-slate-400">
                          No incomplete version sets found.
                        </td>
                      </tr>
                    ) : (
                      diagReport.incompleteSops.map((s) => (
                        <tr key={s.identifier} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1 font-mono font-bold text-violet-700">
                            {displaySopCode(s.identifier)}
                            <span className="ml-1 font-sans text-[9px] font-normal text-slate-400">
                              v{s.currentVersion} · {s.language}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-slate-600">{s.department}</td>
                          <td className="px-2 py-1">
                            <div className="flex flex-wrap gap-1">
                              {s.missing.map((m, i) => (
                                <span
                                  key={i}
                                  title={
                                    m.inBunny === true
                                      ? `In Bunny: ${m.bunnyUrl ?? ""}`
                                      : m.inBunny === false
                                        ? "Not found in Bunny storage"
                                        : undefined
                                  }
                                  className={`inline-flex items-center gap-0.5 rounded border px-1 py-px font-semibold ${
                                    m.inBunny === true
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : m.inBunny === false
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-slate-200 bg-slate-50 text-slate-600"
                                  }`}
                                >
                                  {m.scope === "prior" ? `v${m.version}` : "cur"} {m.lang}{" "}
                                  {m.format.toUpperCase()}
                                  {m.inBunny === true && " ✓"}
                                  {m.inBunny === false && " ✗"}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] leading-snug text-slate-500">
                <span className="font-semibold text-emerald-700">Green ✓</span> = a matching file
                already exists in Bunny storage but isn’t linked to this SOP in the database — your
                upload reached storage, only the DB link is missing. Re-uploading that file through
                the app will attach it (the upload matches by SOP code + version + language).{" "}
                <span className="font-semibold text-red-700">Red ✗</span> = no matching file in
                Bunny, so it still needs to be uploaded.{" "}
                <span className="font-semibold text-slate-600">“Reconcile Version Grouping”</span>{" "}
                only repairs how existing records are grouped into versions (sopBaseId / versionNum)
                — useful when an uploaded version shows as a separate SOP instead of a prior version.
              </p>
            </div>
          )}
        </div>

        <hr className="border-slate-200" />

        {!confirmDeleteVersioned ? (
          <button
            type="button"
            onClick={() => setConfirmDeleteVersioned(true)}
            className="block w-full rounded border border-red-200 bg-red-50 px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Delete All Versioned SOPs
          </button>
        ) : (
          <div className="rounded border border-red-300 bg-red-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-800">
              This permanently deletes every SOP family that has multiple version records — all DB entries and local files. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={deletingVersioned}
                onClick={runDeleteVersionedSops}
                className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingVersioned ? "Deleting…" : "Yes, Delete"}
              </button>
              <button
                type="button"
                disabled={deletingVersioned}
                onClick={() => setConfirmDeleteVersioned(false)}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {message && <p className="text-xs text-slate-600">{message}</p>}
      </div>
    </Modal>
  );
}

export function GuidelinesPanel() {
  const { showGuidelines, toggleGuidelines } = useDashboardStore();
  const [guidelines, setGuidelines] = useState<
    Array<{ _id: string; name: string; folder: string; averageScore?: number }>
  >([]);

  useEffect(() => {
    if (!showGuidelines) return;
    fetch("/api/guidelines")
      .then((r) => r.json())
      .then((d) => setGuidelines(d.guidelines ?? []));
  }, [showGuidelines]);

  if (!showGuidelines) return null;

  const byFolder = guidelines.reduce<Record<string, typeof guidelines>>((acc, g) => {
    if (!acc[g.folder]) acc[g.folder] = [];
    acc[g.folder].push(g);
    return acc;
  }, {});

  return (
    <aside className="fixed left-0 top-32 z-30 h-[calc(100vh-8rem)] w-72 overflow-y-auto border-r border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="text-xs font-bold uppercase">Guidelines Library</h3>
        <button type="button" onClick={toggleGuidelines} className="text-xs text-slate-400">
          Close
        </button>
      </div>
      <div className="p-3 text-[10px] text-slate-600">
        {Object.entries(byFolder).map(([folder, items]) => (
          <div key={folder} className="mb-2">
            <p className="font-semibold">📁 {folder}</p>
            {items.map((g) => (
              <p key={g._id} className="ml-3">
                📄 {g.name}
                {g.averageScore != null ? ` — ${g.averageScore}/10` : ""}
              </p>
            ))}
          </div>
        ))}
        {!guidelines.length && <p className="text-slate-400">No guidelines loaded.</p>}
      </div>
    </aside>
  );
}

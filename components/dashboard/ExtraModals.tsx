"use client";

import { useEffect, useMemo, useState } from "react";
import type { RegistrySOP } from "@/lib/types";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { ComplianceFullViewer } from "./ComplianceFullViewer";
import { Btn, Modal } from "./ui";

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
                `${sop.identifier}: ${event.findingsCount} findings, score ${event.score}/10`,
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
                <span className="font-semibold">{s.identifier}</span>
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
            <ComplianceFullViewer
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

  if (!isAdmin) return null;

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
    <Modal open={open} onClose={onClose} title="Admin Tools">
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

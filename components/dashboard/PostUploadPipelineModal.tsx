"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { Btn, Modal } from "./ui";

const CODEX_UNAVAILABLE_MESSAGE =
  "No Codex available. Please use your local computer where Codex is available and run MCQ generation and compliance manually.";

type Phase = "checking" | "ask" | "unavailable" | "starting" | "started" | "error";

export function PostUploadPipelineModal({
  open,
  identifiers,
  onClose,
  onStarted,
}: {
  open: boolean;
  identifiers: string[];
  onClose: () => void;
  onStarted?: () => void;
}) {
  const { addPipelineJob, showToast } = useDashboardStore();
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("");

  const uniqueIds = [...new Set(identifiers.filter(Boolean))];
  const idsKey = uniqueIds.slice().sort().join("|");
  const label =
    uniqueIds.length === 1
      ? uniqueIds[0]
      : `${uniqueIds.length} SOP${uniqueIds.length === 1 ? "" : "s"}`;

  useEffect(() => {
    if (!open) {
      setPhase("checking");
      setMessage("");
      return;
    }
    if (!uniqueIds.length) {
      setPhase("error");
      setMessage("No uploaded SOPs to process");
      return;
    }

    let cancelled = false;
    setPhase("checking");
    setMessage("");

    void (async () => {
      try {
        const res = await fetch("/api/llm/codex-status");
        const data = await res.json();
        if (cancelled) return;
        const ok = Boolean(data.success && data.codex?.loggedIn);
        if (!ok) {
          setPhase("unavailable");
          setMessage(CODEX_UNAVAILABLE_MESSAGE);
          return;
        }
        setPhase("ask");
      } catch {
        if (cancelled) return;
        setPhase("unavailable");
        setMessage(CODEX_UNAVAILABLE_MESSAGE);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, idsKey]);

  const resetAndClose = () => {
    setPhase("checking");
    setMessage("");
    onClose();
  };

  const recheckCodex = async () => {
    setPhase("checking");
    setMessage("");
    try {
      const res = await fetch("/api/llm/codex-status");
      const data = await res.json();
      const ok = Boolean(data.success && data.codex?.loggedIn);
      if (!ok) {
        setPhase("unavailable");
        setMessage(CODEX_UNAVAILABLE_MESSAGE);
        return;
      }
      setPhase("ask");
    } catch {
      setPhase("unavailable");
      setMessage(CODEX_UNAVAILABLE_MESSAGE);
    }
  };

  const startPipeline = async () => {
    if (!uniqueIds.length) return;
    setPhase("starting");
    try {
      const res = await fetch("/api/sop/post-upload-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: uniqueIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.codexAvailable === false) {
          setPhase("unavailable");
          setMessage(data.error || CODEX_UNAVAILABLE_MESSAGE);
          return;
        }
        setPhase("error");
        setMessage(data.error || "Could not start MCQ / compliance pipeline");
        return;
      }

      const started: string[] = Array.isArray(data.started) ? data.started : uniqueIds;
      for (const identifier of started) {
        addPipelineJob({
          identifier,
          language: "ENG",
          stage: "mcq_generating",
          status: "running",
          progress: 8,
        });
      }

      showToast(
        `Codex MCQ + compliance started for ${started.length} SOP${started.length === 1 ? "" : "s"} — see Work in progress`,
      );
      setPhase("started");
      onStarted?.();
      setTimeout(() => {
        resetAndClose();
      }, 900);
    } catch {
      setPhase("error");
      setMessage("Could not start MCQ / compliance pipeline");
    }
  };

  return (
    <Modal
      open={open}
      onClose={phase === "starting" ? () => undefined : resetAndClose}
      title="MCQ + Compliance"
    >
      <div className="space-y-3 text-xs text-slate-700">
        {phase === "checking" && (
          <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            <span>Checking local Codex login…</span>
          </div>
        )}

        {phase === "unavailable" && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
            <p className="font-semibold">Codex not available</p>
            <p className="mt-1 text-[11px] leading-snug">
              {message || CODEX_UNAVAILABLE_MESSAGE}
            </p>
          </div>
        )}

        {phase === "ask" && (
          <>
            <p className="text-[11px] leading-snug text-slate-600">
              Upload finished for <span className="font-semibold text-slate-800">{label}</span>.
              Start <strong>MCQ generation</strong> and a <strong>full V3 compliance run</strong>{" "}
              (all guidelines, with annexures — same engine as the Compliance page) using local
              Codex?
            </p>
            <p className="text-[10px] text-slate-500">
              Both jobs run in the background. A “Work in progress” chip appears on the right —
              click it for live details.
            </p>
          </>
        )}

        {phase === "starting" && (
          <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            <span>Starting Codex MCQ + compliance…</span>
          </div>
        )}

        {phase === "started" && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-900">
            <p className="font-semibold">Started in the background</p>
            <p className="mt-1 text-[11px]">
              Watch the “Work in progress” chip on the right for MCQ and compliance status.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-3 text-red-800">
            <p className="font-semibold">Could not start</p>
            <p className="mt-1 text-[11px]">{message}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          {phase === "ask" && (
            <>
              <Btn onClick={resetAndClose}>Not now</Btn>
              <Btn variant="primary" onClick={() => void startPipeline()}>
                Start MCQ + Compliance
              </Btn>
            </>
          )}
          {phase === "unavailable" && (
            <>
              <Btn onClick={resetAndClose}>Close</Btn>
              <Btn variant="primary" onClick={() => void recheckCodex()}>
                Recheck Codex
              </Btn>
            </>
          )}
          {(phase === "started" || phase === "error") && (
            <Btn onClick={resetAndClose}>Close</Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}

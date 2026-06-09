"use client";

import { useEffect, useRef, useState } from "react";
import { QuestionAnalyticsModal } from "./QuestionAnalyticsModal";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Grid,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

interface MCQ {
  question: string;
  difficulty: "Easy" | "Medium" | "Hard";
  difficultyStars?: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  sopReference?: string;
  isChecked?: boolean;
  isReviewed?: boolean;
  isSimilar?: boolean;
}

interface MCQBank {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  language?: string;
  totalQuestions: number;
  mcqs: MCQ[];
}

type StatusFilter = "all" | "checked" | "pending" | "similar" | "reviewed";
type TabType = "active" | "recycled";

const BATCH = 30;

function highlight(text: string, term: string) {
  if (!term || !text) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-indigo-500/40 text-indigo-100 rounded px-0.5">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </span>
  );
}

interface QuestionCardProps {
  mcq: MCQ;
  originalIndex: number;
  bankId: string;
  searchTerm: string;
  onUpdated: (idx: number, patch: Partial<MCQ>) => void;
  onOpen: () => void;
}

function QuestionCard({ mcq, originalIndex, bankId, searchTerm, onUpdated, onOpen }: QuestionCardProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  async function toggle(field: "isChecked" | "isReviewed" | "isSimilar") {
    setUpdating(field);
    try {
      const res = await fetch("/api/mcq-bank/update-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId, index: originalIndex, field, value: !mcq[field] }),
      });
      if (res.ok) onUpdated(originalIndex, { [field]: !mcq[field] });
    } finally {
      setUpdating(null);
    }
  }

  const diffBadge =
    mcq.difficulty === "Easy"
      ? "bg-blue-50 text-blue-600 border-blue-200"
      : mcq.difficulty === "Medium"
      ? "bg-amber-50 text-amber-600 border-amber-200"
      : "bg-rose-50 text-rose-600 border-rose-200";

  const sl = searchTerm.toLowerCase().trim();

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm hover:border-purple-300 hover:shadow-md transition-all duration-300 min-w-0">
      {/* Hover glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="relative flex flex-row items-stretch flex-1">
        {/* Left sidebar: index */}
        <div
          className="flex w-14 shrink-0 flex-col items-center justify-start gap-2 border-r border-gray-100 bg-gray-50 p-3 cursor-pointer"
          onClick={onOpen}
        >
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 font-mono">#</span>
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-mono font-bold text-purple-700 shadow-sm group-hover:border-purple-300">
            {originalIndex + 1}
          </div>
        </div>

        {/* Main content — click opens analytics modal */}
        <div className="flex flex-1 flex-col px-4 pb-4 pt-3 min-w-0 cursor-pointer" onClick={onOpen}>
          {/* Top row: difficulty + status icons */}
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded border text-[11px] font-black ${diffBadge}`}
                title={mcq.difficulty}>
                {mcq.difficulty[0]}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {mcq.isSimilar && (
                <div className="rounded border border-amber-200 bg-amber-50 p-1 text-amber-600" title="Flagged as Similar">
                  <Copy className="h-3.5 w-3.5" />
                </div>
              )}
              {mcq.isChecked && (
                <div className="rounded border border-purple-200 bg-purple-50 p-1 text-purple-600" title="Approved">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
              )}
              {mcq.isReviewed && (
                <div className="rounded border border-blue-200 bg-blue-50 p-1 text-blue-600" title="Reviewed">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          </div>

          {/* Question text */}
          <div className="mb-2.5 min-w-0">
            <div className="flex min-w-0 items-start gap-1.5">
              <span className="mt-px shrink-0 select-none text-[15px] font-black text-purple-600">Q.</span>
              <p className="flex-1 min-w-0 break-words text-[15px] font-bold leading-snug text-gray-800 line-clamp-3">
                {sl ? highlight(mcq.question, sl) : mcq.question}
              </p>
            </div>
          </div>

          {/* Options 2×2 */}
          <div className="grid flex-1 grid-cols-2 gap-2">
            {(mcq.options || []).slice(0, 4).map((opt, oi) => {
              const isCorrect = opt === mcq.correctAnswer;
              return (
                <div key={oi}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-[13px] font-medium ${
                    isCorrect
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-gray-100 bg-gray-50 text-gray-600"
                  }`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                    isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {String.fromCharCode(65 + oi)}
                  </span>
                  <span className="min-w-0 flex-1 break-words leading-snug">
                    {sl ? highlight(opt, sl) : opt}
                  </span>
                  {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right action toolbar */}
        <div
          className="flex w-11 shrink-0 flex-col items-center justify-center gap-1.5 border-l border-gray-100 bg-gray-50 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Similar */}
          <button disabled={!!updating}
            onClick={() => toggle("isSimilar")}
            title="Toggle Similar"
            className={`rounded-lg p-2 transition-all ${
              mcq.isSimilar
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-400 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600"
            }`}>
            {updating === "isSimilar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {/* Approve */}
          <button disabled={!!updating}
            onClick={() => toggle("isChecked")}
            title="Approve"
            className={`rounded-lg p-2 transition-all ${
              mcq.isChecked
                ? "bg-emerald-500 text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-400 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
            }`}>
            {updating === "isChecked" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </button>
          {/* Review */}
          <button disabled={!!updating}
            onClick={() => toggle("isReviewed")}
            title="Mark Reviewed"
            className={`rounded-lg p-2 transition-all ${
              mcq.isReviewed
                ? "bg-blue-500 text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            }`}>
            {updating === "isReviewed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MCQViewerModalProps {
  bankId: string;
  onClose: () => void;
  onBack?: () => void;
}

export function MCQViewerModal({ bankId, onClose, onBack }: MCQViewerModalProps) {
  const [bank, setBank] = useState<MCQBank | null>(null);
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [isMaximized, setIsMaximized] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<{ mcq: MCQ; index: number } | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/mcq-bank/bank?id=${bankId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (!cancelled) {
          setBank(data.bank);
          setMcqs(data.bank?.mcqs ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bankId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (onBack ?? onClose)(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, onClose]);

  // Infinite scroll
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        setVisibleCount((v) => v + 20);
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const sl = searchTerm.toLowerCase().trim();

  const filtered = mcqs.filter((q) => {
    if (statusFilter === "checked" && !q.isChecked) return false;
    if (statusFilter === "pending" && (q.isChecked || q.isReviewed)) return false;
    if (statusFilter === "similar" && !q.isSimilar) return false;
    if (statusFilter === "reviewed" && !q.isReviewed) return false;
    if (sl) {
      const qText = (q.question || "").toLowerCase();
      const opts = (q.options || []).join(" ").toLowerCase();
      if (!qText.includes(sl) && !opts.includes(sl)) return false;
    }
    return true;
  });

  const visible = filtered.slice(0, visibleCount);

  function handleUpdated(idx: number, patch: Partial<MCQ>) {
    setMcqs((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  const statusCounts = {
    all:      mcqs.length,
    checked:  mcqs.filter((q) => q.isChecked).length,
    pending:  mcqs.filter((q) => !q.isChecked && !q.isReviewed).length,
    similar:  mcqs.filter((q) => q.isSimilar).length,
    reviewed: mcqs.filter((q) => q.isReviewed).length,
  };

  const langCode = (bank?.language ?? "").toLowerCase() === "gujarati" ? "GU" : "EN";

  const filterPills = [
    { id: "all" as const,      label: "All",      icon: <Grid className="h-3.5 w-3.5" />,        activeClass: "text-indigo-400" },
    { id: "checked" as const,  label: "Approved",  icon: <CheckCircle2 className="h-3.5 w-3.5" />, activeClass: "text-emerald-400" },
    { id: "pending" as const,  label: "Pending",   icon: <Loader2 className="h-3.5 w-3.5" />,      activeClass: "text-orange-400" },
    { id: "similar" as const,  label: "Similar",   icon: <Copy className="h-3.5 w-3.5" />,          activeClass: "text-amber-400" },
    { id: "reviewed" as const, label: "Reviewed",  icon: <CheckCircle2 className="h-3.5 w-3.5" />,  activeClass: "text-blue-400" },
  ] as const;

  return (
    <div className="fixed inset-0 z-[60] flex animate-in fade-in duration-300">
      <div className="flex h-full w-full flex-col bg-[#f8f9fa]">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 shrink-0 border-b border-gray-200 bg-white">
          {/* Brand / nav row */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={onBack ?? onClose}
                title={onBack ? "Back to previous screen" : "Close"}
                className="rounded-xl border border-gray-200 bg-gray-100 p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-all"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              {bank && (
                <div className="flex min-w-0 flex-col">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-purple-600">
                      SOP Identifier
                    </span>
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                      {bank.language ?? "English"} Version
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <h2 className="shrink-0 text-xl font-bold text-gray-800">
                      {bank.sopName}
                    </h2>
                    <span className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 font-mono text-xs font-bold text-purple-700">
                      {bank.sopIdentifier}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {bank && (
                <div className="hidden items-center justify-center rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 md:flex min-w-[2.5rem]">
                  <span className="text-[11px] font-bold text-purple-700">{filtered.length}</span>
                </div>
              )}

              <div className="mx-2 h-8 w-px bg-gray-200" />

              <div className="flex items-center gap-1">
                {/* Search toggle */}
                <button type="button"
                  onClick={() => { setSearchVisible((v) => !v); if (searchVisible) { setSearchInput(""); setSearchTerm(""); } }}
                  className={`rounded-xl border p-2 transition-all ${
                    searchVisible || searchTerm
                      ? "border-purple-200 bg-purple-100 text-purple-700"
                      : "border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  }`}>
                  <Search className="h-5 w-5" />
                </button>

                {/* Check Similar */}
                <button type="button"
                  className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-700 hover:bg-amber-100 transition-all">
                  <ScanSearch className="h-4 w-4" />
                  <span className="hidden sm:inline">Check Similar</span>
                </button>

                {/* Smart Regenerate */}
                <button type="button"
                  className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-violet-700 hover:bg-violet-100 transition-all">
                  <Sparkles className="h-4 w-4" />
                  <span className="hidden sm:inline">Smart Regenerate</span>
                </button>

                {/* EN/GU toggle */}
                <div className="flex overflow-hidden rounded-xl border border-gray-200">
                  <button type="button"
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                      langCode === "EN" ? "bg-purple-100 text-purple-700" : "bg-white text-gray-500 hover:bg-gray-100"
                    }`}>EN</button>
                  <button type="button"
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                      langCode === "GU" ? "bg-purple-100 text-purple-700" : "bg-white text-gray-500 hover:bg-gray-100"
                    }`}>GU</button>
                </div>

                {/* Reset & Regen */}
                <button type="button"
                  className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-100 transition-all">
                  <RotateCcw className="h-4 w-4" />
                  <span className="hidden sm:inline">Reset &amp; Regen</span>
                </button>

                {/* Maximize/Minimize */}
                <button type="button" onClick={() => setIsMaximized((v) => !v)}
                  className="rounded-xl border border-transparent p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
                  {isMaximized ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </button>

                {/* Close */}
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-transparent p-2 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Sub-header: search + filter */}
          <div className="space-y-4 px-6 pb-4">
            {searchVisible && (
              <div className="relative animate-in slide-in-from-top-2 duration-300">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400/60" />
                <input autoFocus type="text" value={searchInput}
                  onChange={(e) => { setSearchInput(e.target.value); setVisibleCount(BATCH); }}
                  placeholder="Search questions, references, or codes..."
                  className="w-full rounded-2xl border border-gray-300 py-3 pl-11 pr-12 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 hover:border-purple-300 transition-all" />
                {searchTerm && (
                  <button type="button" onClick={() => { setSearchInput(""); setSearchTerm(""); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-gray-100 p-1 text-gray-400 hover:text-gray-700">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Tabs + status filters */}
            <div className="flex items-center justify-between gap-4">
              {/* Tabs */}
              <nav className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-gray-100 p-1.5 shadow-inner">
                <button type="button"
                  onClick={() => { setActiveTab("active"); setVisibleCount(BATCH); }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    activeTab === "active"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-gray-500 hover:bg-white hover:text-gray-700"
                  }`}>
                  <Grid className="h-3 w-3" />
                  Active ({mcqs.length})
                </button>
                <button type="button"
                  onClick={() => setActiveTab("recycled")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    activeTab === "recycled"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-gray-500 hover:bg-white hover:text-gray-700"
                  }`}>
                  <Trash2 className="h-3 w-3" />
                  Recycled
                </button>
              </nav>

              {/* Status filter pills */}
              {activeTab === "active" && (
                <div className="flex items-center gap-2">
                  <span className="mr-1 hidden text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:inline">
                    Status Filter
                  </span>
                  <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1 shadow-inner">
                    {filterPills.map((pill) => (
                      <button key={pill.id} type="button"
                        onClick={() => { setStatusFilter(pill.id); setVisibleCount(BATCH); }}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all ${
                          statusFilter === pill.id
                            ? `border-gray-200 bg-white shadow-sm ${pill.activeClass}`
                            : "border-transparent text-gray-400 hover:bg-white hover:text-gray-700"
                        }`}>
                        {pill.icon}
                        {pill.label} ({statusCounts[pill.id]})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto border-x border-gray-200 bg-[#f8f9fa] px-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          ) : error ? (
            <div className="m-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : activeTab === "recycled" ? (
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">
              No recycled questions
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-gray-200 bg-gray-100 shadow-sm">
                <Search className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-700">No results found</h3>
              <p className="max-w-xs text-gray-500">Adjust your filters to see more questions.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
              {visible.map((mcq, i) => {
                const originalIndex = mcqs.indexOf(mcq);
                return (
                  <QuestionCard
                    key={originalIndex}
                    mcq={mcq}
                    originalIndex={originalIndex}
                    bankId={bankId}
                    searchTerm={searchTerm}
                    onUpdated={handleUpdated}
                    onOpen={() => setSelectedQuestion({ mcq, index: originalIndex })}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Question Analytics Modal */}
      {selectedQuestion && (
        <QuestionAnalyticsModal
          mcq={selectedQuestion.mcq}
          index={selectedQuestion.index}
          bankId={bankId}
          sopIdentifier={bank?.sopIdentifier ?? ""}
          onClose={() => setSelectedQuestion(null)}
          onUpdated={(idx, patch) => {
            handleUpdated(idx, patch);
            setSelectedQuestion((prev) =>
              prev ? { ...prev, mcq: { ...prev.mcq, ...patch } } : null
            );
          }}
        />
      )}
    </div>
  );
}

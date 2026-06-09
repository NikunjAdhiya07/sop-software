"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Home,
  LayoutList,
  Monitor,
  RefreshCw,
  Search,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { MCQViewerModal } from "./MCQViewerModal";
import { DeptDetailModal } from "./DeptDetailModal";
import { DeptGridSkeleton } from "./MCQSkeleton";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface DeptMCQStats {
  department: string;
  sopCount: number;
  subcategories: number;
  totalQuestions: number;
  checkedQuestions: number;
  reviewedQuestions: number;
  similarQuestions: number;
  remainingQuestions: number;
  mcqCoverage: number;
  withEnglish: number;
  withGujarati: number;
  totalSopEng: number;
  totalSopGuj: number;
  approvedSops: number;
  partialSops: number;
  pendingSops: number;
  similarSops: number;
  sopWithMcqs: number;
  sopWithoutMcqs: number;
  enRemaining: number;
  guRemaining: number;
  trainer: string | null;
}

interface MCQBankGlobalStats {
  totalUniqueSops: number;
  totalVersions: number;
  totalMcqBanks: number;
  mcqFound: number;
  notFound: number;
  withEnglish: number;
  withGujarati: number;
  approvedSops: number;
  partialSops: number;
  pendingSops: number;
  similarSops: number;
  totalQuestions: number;
  checkedQuestions: number;
  reviewedQuestions: number;
  similarQuestions: number;
  remainingQuestions: number;
  enRemaining: number;
  guRemaining: number;
  departments: DeptMCQStats[];
}

interface TrainingDeptData {
  employeeCount: number;
  fullyTrained: number;
  incomplete: number;
  trainersAssigned: number;
  sopTrainersAssigned: number;
  mcqCreatedCount: number;
  mcqNotCreatedCount: number;
  sopCount: number;
  foundInDb: number;
  dbSopCount: number;
}

interface RegistryEntry {
  id: string;
  identifier: string;
  sopName: string;
  department: string;
  language: string;
  langCode: string;
  totalMcqs: number;
  remaining: number;
  approved: number;
  partial: number;
  similar: number;
  lastUpdated: string | null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmt = (n: number | undefined | null) => (n == null ? "—" : n.toLocaleString());
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ─────────────────────────────────────────────────────────────
// Department theme (bordered white cards)
// ─────────────────────────────────────────────────────────────
function getDeptTheme(deptName: string) {
  const name = deptName.toLowerCase();
  if (name.includes("qa"))
    return { border: "border-purple-500", statBg: "bg-purple-50", iconBg: "bg-purple-100", iconText: "text-purple-600", accent: "text-purple-600", headerBorder: "border-b border-purple-100", capBg: "bg-purple-50 border-purple-200", pendingText: "text-purple-700", cardBg: "" };
  if (name.includes("qc"))
    return { border: "border-blue-500", statBg: "bg-blue-50", iconBg: "bg-blue-100", iconText: "text-blue-600", accent: "text-blue-600", headerBorder: "border-b border-blue-100", capBg: "bg-blue-50 border-blue-200", pendingText: "text-blue-700", cardBg: "" };
  if (name.includes("micro"))
    return { border: "border-orange-500", statBg: "bg-orange-50", iconBg: "bg-orange-100", iconText: "text-orange-600", accent: "text-orange-600", headerBorder: "border-b border-orange-100", capBg: "bg-orange-50 border-orange-200", pendingText: "text-orange-700", cardBg: "" };
  if (name.includes("prod"))
    return { border: "border-emerald-500", statBg: "bg-emerald-50", iconBg: "bg-emerald-100", iconText: "text-emerald-600", accent: "text-emerald-600", headerBorder: "border-b border-emerald-100", capBg: "bg-emerald-50 border-emerald-200", pendingText: "text-emerald-700", cardBg: "" };
  if (name.includes("store"))
    return { border: "border-amber-500", statBg: "bg-amber-50", iconBg: "bg-amber-100", iconText: "text-amber-600", accent: "text-amber-600", headerBorder: "border-b border-amber-100", capBg: "bg-amber-50 border-amber-200", pendingText: "text-amber-700", cardBg: "" };
  if (name.includes("engineer") || name.includes("maint"))
    return { border: "border-cyan-500", statBg: "bg-cyan-50", iconBg: "bg-cyan-100", iconText: "text-cyan-600", accent: "text-cyan-600", headerBorder: "border-b border-cyan-100", capBg: "bg-cyan-50 border-cyan-200", pendingText: "text-cyan-700", cardBg: "" };
  if (name.includes("person") || name.includes("hr"))
    return { border: "border-rose-500", statBg: "bg-rose-50", iconBg: "bg-rose-100", iconText: "text-rose-600", accent: "text-rose-600", headerBorder: "border-b border-rose-100", capBg: "bg-rose-50 border-rose-200", pendingText: "text-rose-700", cardBg: "" };
  return { border: "border-slate-400", statBg: "bg-slate-50", iconBg: "bg-slate-100", iconText: "text-slate-600", accent: "text-slate-600", headerBorder: "border-b border-slate-100", capBg: "bg-slate-50 border-slate-200", pendingText: "text-slate-700", cardBg: "" };
}

// ─────────────────────────────────────────────────────────────
// CapsuleMetric — compact label + value row
// ─────────────────────────────────────────────────────────────
function CM({
  label, value, vc, onClick, isActive = false,
}: {
  label: string; value: number; vc?: string;
  onClick?: () => void; isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick ? (e) => { e.preventDefault(); e.stopPropagation(); onClick(); } : undefined}
      aria-pressed={isActive || undefined}
      className={`flex w-full min-h-[24px] cursor-pointer items-center justify-between gap-1.5 rounded-[4px] px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
        isActive ? "border border-purple-400 bg-purple-100/90" : "border border-transparent"
      }`}
    >
      <span className="min-w-0 shrink text-gray-700 font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
      <span className={`font-bold tabular-nums shrink-0 leading-tight text-[11px] ${vc ?? "text-gray-900"}`}>{value}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// TripleRow — 3 CMs side by side
// ─────────────────────────────────────────────────────────────
function TripleRow({ items }: {
  items: { label: string; value: number; vc?: string; onClick?: () => void; isActive?: boolean }[];
}) {
  return (
    <div className="flex w-full gap-0.5">
      {items.map((item) => (
        <div key={item.label} className="flex-1 min-w-0">
          <CM label={item.label} value={item.value} vc={item.vc} onClick={item.onClick} isActive={item.isActive} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CovBar — coverage progress bar
// ─────────────────────────────────────────────────────────────
function CovBar({ pct, label = "COVERAGE" }: { pct: number; label?: string }) {
  return (
    <div className="pt-1.5 mt-1.5 border-t border-gray-100">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className={`text-[9px] font-black ${pct >= 100 ? "text-emerald-600" : pct >= 60 ? "text-blue-600" : "text-amber-500"}`}>{pct}%</span>
      </div>
      <div className="w-full h-[3px] bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : "bg-amber-500"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compact whitebox Card (MCQ Status Cards section)
// ─────────────────────────────────────────────────────────────
function StatusCard({
  title, subtitle, isGrand = false,
  totalSOPs, sopWithMCQs, sopWithoutMCQs,
  approvedSOPs, partialSOPs, pendingSOPs, similarSOPs,
  totalSopEng, totalSopGuj, remainingEng, remainingGuj,
  mcqFound, mcqNotFound,
  genCompleted, genTarget, genRemaining,
  trainingData,
  onOpen, onRowClick,
}: {
  title: string; subtitle: string; isGrand?: boolean;
  totalSOPs: number; sopWithMCQs: number; sopWithoutMCQs: number;
  approvedSOPs: number; partialSOPs: number; pendingSOPs: number; similarSOPs: number;
  totalSopEng: number; totalSopGuj: number; remainingEng: number; remainingGuj: number;
  mcqFound?: number; mcqNotFound?: number;
  genCompleted?: number; genTarget?: number; genRemaining?: number;
  trainingData?: TrainingDeptData;
  onOpen?: () => void;
  onRowClick?: (f: "approved" | "partial" | "pending" | "similar") => void;
}) {
  return (
    <div className={`flex w-full min-w-0 flex-col rounded-[10px] border px-2 py-1.5 text-left shadow-sm ${
      isGrand ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
    }`}>
      {/* Header */}
      <div
        role={isGrand || !onOpen ? undefined : "button"}
        tabIndex={isGrand || !onOpen ? -1 : 0}
        onClick={isGrand ? undefined : onOpen}
        onKeyDown={isGrand || !onOpen ? undefined : (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); }
        }}
        className={`mb-2 flex w-full min-h-[40px] items-start gap-1.5 rounded-md border-b pb-2 ${
          isGrand || !onOpen
            ? "cursor-default border-purple-200"
            : "cursor-pointer border-gray-100 hover:bg-purple-50/80 focus:outline-none focus:ring-2 focus:ring-purple-400"
        }`}
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
        <div className="min-w-0 flex-1">
          <span className="block min-w-0 text-[11px] font-bold leading-tight text-gray-800 truncate" title={title}>{title}</span>
          <span className="block text-[9px] font-medium text-gray-500 leading-tight mt-0.5">{subtitle}</span>
        </div>
      </div>

      {/* Total card extra rows */}
      {isGrand && mcqFound !== undefined && (
        <div className="flex flex-col gap-0 border-t border-transparent pt-0.5 mb-1">
          <CM label="Unique SOPs" value={totalSOPs} />
          <CM label="MCQ Found" value={mcqFound} vc="text-emerald-600" />
          <CM label="Not Found" value={mcqNotFound ?? 0} vc={(mcqNotFound ?? 0) > 0 ? "text-red-600" : "text-gray-900"} />
        </div>
      )}

      {/* SOP counts */}
      <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">
        <CM label="SOPs" value={totalSOPs} onClick={onOpen} />
        <CM label="w/ EN" value={totalSopEng} />
        <CM label="w/ GU" value={totalSopGuj} vc="text-orange-500" />
        <TripleRow items={[
          { label: "Approved", value: approvedSOPs, vc: "text-emerald-600", onClick: onRowClick ? () => onRowClick("approved") : undefined },
          { label: "Partial",  value: partialSOPs,  vc: "text-amber-500",  onClick: onRowClick ? () => onRowClick("partial")  : undefined },
          { label: "Pending",  value: pendingSOPs,  vc: "text-red-600",    onClick: onRowClick ? () => onRowClick("pending")  : undefined },
        ]} />
        <CM label="Similar" value={similarSOPs} onClick={onRowClick ? () => onRowClick("similar") : undefined} />
      </div>

      {/* Remaining SOPs section */}
      <div className={`mt-1.5 pt-1.5 border-t ${isGrand ? "border-purple-200" : "border-gray-100"}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <FileText className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800">Remaining</span>
        </div>
        <div className="flex flex-col gap-0">
          <CM label="w/ MCQs"   value={sopWithMCQs}    vc="text-emerald-600" onClick={onOpen} />
          <CM label="Remaining" value={sopWithoutMCQs} vc={sopWithoutMCQs > 0 ? "text-red-600" : "text-gray-900"} />
          <TripleRow items={[
            { label: "EN rem.", value: remainingEng, vc: remainingEng > 0 ? "text-red-600" : "text-gray-900" },
            { label: "GU rem.", value: remainingGuj, vc: remainingGuj > 0 ? "text-red-600" : "text-gray-900" },
          ]} />
        </div>
      </div>

      {/* Generation section (Total only) */}
      {genCompleted !== undefined && (
        <div className={`mt-1.5 pt-1.5 border-t ${isGrand ? "border-purple-200" : "border-gray-100"}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800">Generation</span>
          </div>
          <div className="flex flex-col gap-0">
            <CM label="Total SOPs" value={sopWithMCQs} vc="text-blue-600" />
            <TripleRow items={[
              { label: "Completed", value: genCompleted,     vc: "text-emerald-600" },
              { label: "Target",    value: genTarget ?? 0,   vc: "text-amber-500" },
              { label: "Remaining", value: genRemaining ?? 0, vc: "text-red-600" },
            ]} />
          </div>
        </div>
      )}

      {/* Training Matrix section */}
      {trainingData && (
        <div className={`mt-1.5 pt-1.5 border-t ${isGrand ? "border-purple-200" : "border-gray-100"}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800">Training</span>
          </div>
          <div className="flex flex-col gap-0">
            <CM label="Employees" value={trainingData.employeeCount} />
            <TripleRow items={[
              { label: "Trained",    value: trainingData.fullyTrained,  vc: "text-emerald-600" },
              { label: "Incomplete", value: trainingData.incomplete,    vc: trainingData.incomplete > 0 ? "text-amber-500" : "text-gray-900" },
            ]} />
            <CM label="SOPs w/ Trainer" value={trainingData.sopTrainersAssigned} vc="text-indigo-600" />
            {trainingData.dbSopCount > 0 && (
              <CM label="SOPs (DB)" value={trainingData.dbSopCount} vc="text-blue-600" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Colorful dept card (By Department section)
// ─────────────────────────────────────────────────────────────
function DeptColorCard({
  dept, trainingData, onClick,
}: {
  dept: DeptMCQStats;
  trainingData?: TrainingDeptData;
  onClick?: () => void;
}) {
  const theme = getDeptTheme(dept.department);
  const [expanded, setExpanded] = useState(false);
  const coveragePct = Math.min(dept.mcqCoverage, 100);

  // Coverage bar color matches accent
  const barColor = coveragePct >= 100 ? "bg-emerald-500" : coveragePct >= 60 ? "bg-blue-500" : "bg-amber-400";

  return (
    <div className={`rounded-xl border-2 ${theme.border} bg-white transition-all duration-300 shadow-sm hover:shadow-lg overflow-hidden group`}>
      {/* Clickable header area */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
        className="w-full px-4 pt-4 pb-3 flex flex-col gap-0 bg-transparent transition-all text-left cursor-pointer"
      >
        {/* Header row */}
        <div className="flex items-center justify-between w-full mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${theme.iconBg} border border-current/10`}>
              <Folder className={`h-5 w-5 ${theme.iconText}`} />
            </div>
            <div>
              <h3 className={`text-base font-bold ${theme.accent}`}>{dept.department}</h3>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <p className="text-[10px] text-gray-400">
                  {dept.subcategories} Subcategor{dept.subcategories !== 1 ? "ies" : "y"}
                </p>
                {dept.trainer && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    <div className={`px-1.5 py-0.5 rounded border ${theme.capBg} text-[8px] font-black uppercase tracking-wider text-gray-700`}>
                      <span className="opacity-60 mr-1">Trainer:</span>{dept.trainer}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            title={expanded ? "Collapse" : "Expand"}
            className={`h-6 w-6 rounded-full flex items-center justify-center border ${theme.border} ${theme.iconBg} ${theme.iconText} shrink-0 hover:opacity-80 transition-all duration-200`}
          >
            <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Top stats */}
        <div className={`grid gap-1.5 w-full mb-3 ${trainingData ? "grid-cols-4" : "grid-cols-2"}`}>
          <div className={`${theme.statBg} rounded-lg p-2 text-left border border-gray-100`}>
            <p className="text-gray-400 text-[8px] uppercase tracking-wider font-bold mb-0.5">SOP</p>
            <span className={`text-base font-black leading-none ${theme.accent}`}>{dept.sopWithMcqs}</span>
          </div>
          <div className={`${theme.statBg} rounded-lg p-2 text-left border border-gray-100`}>
            <p className="text-gray-400 text-[8px] uppercase tracking-wider font-bold mb-0.5">Questions</p>
            <span className="text-base font-black leading-none text-gray-800">{fmt(dept.totalQuestions)}</span>
          </div>
          {trainingData && (
            <>
              <div className="bg-indigo-50 rounded-lg p-2 text-left border border-indigo-100">
                <p className="text-indigo-300 text-[8px] uppercase tracking-wider font-bold mb-0.5">Employees</p>
                <span className="text-base font-black leading-none text-indigo-700">{trainingData.employeeCount}</span>
              </div>
              <div className={`rounded-lg p-2 text-left border ${trainingData.fullyTrained === trainingData.employeeCount && trainingData.employeeCount > 0 ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
                <p className="text-[8px] uppercase tracking-wider font-bold mb-0.5 text-gray-400">Trained</p>
                <span className={`text-base font-black leading-none ${trainingData.fullyTrained === trainingData.employeeCount && trainingData.employeeCount > 0 ? "text-emerald-600" : "text-amber-600"}`}>{trainingData.fullyTrained}</span>
              </div>
            </>
          )}
        </div>

        {/* Coverage bar */}
        <div className="w-full mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">MCQ Coverage</span>
            <span className={`text-[9px] font-black ${theme.accent}`}>{coveragePct}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${coveragePct}%` }} />
          </div>
        </div>

        {/* Status capsules */}
        <div className="grid grid-cols-2 gap-1.5 w-full mb-2">
          <div
            role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className={`flex items-center gap-1.5 justify-between ${theme.capBg} border rounded-lg px-2.5 py-1.5 hover:opacity-80 transition-all cursor-pointer`}
          >
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Approved</span>
            </div>
            <span className="text-sm font-black text-emerald-600 leading-none">{dept.approvedSops}</span>
          </div>
          <div className={`flex items-center gap-1.5 justify-between ${theme.capBg} border rounded-lg px-2.5 py-1.5`}>
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Pending</span>
            </div>
            <span className="text-sm font-black text-amber-600 leading-none">{dept.pendingSops}</span>
          </div>
          <div className={`flex items-center gap-1.5 justify-between ${theme.capBg} border rounded-lg px-2.5 py-1.5`}>
            <div className="flex items-center gap-1">
              <Copy className="h-3 w-3 text-red-500 shrink-0" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Similar</span>
            </div>
            <span className={`text-sm font-black leading-none ${dept.similarSops > 0 ? "text-red-500" : "text-gray-300"}`}>{dept.similarSops}</span>
          </div>
          <div className={`flex items-center gap-1.5 justify-between ${theme.capBg} border rounded-lg px-2.5 py-1.5`}>
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Remaining</span>
            </div>
            <span className={`text-sm font-black leading-none ${dept.sopWithoutMcqs > 0 ? "text-gray-700" : "text-gray-300"}`}>{dept.sopWithoutMcqs}</span>
          </div>
        </div>

        {/* Question breakdown badges */}
        {(dept.checkedQuestions > 0 || dept.similarQuestions > 0) && (
          <div className={`flex items-center gap-1.5 w-full ${theme.statBg} rounded-lg px-2 py-1.5 overflow-hidden flex-wrap border border-gray-100`}>
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mr-0.5">Qs:</span>
            {dept.checkedQuestions > 0 && (
              <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                <span className="text-[9px] font-bold text-emerald-600 leading-none">{dept.checkedQuestions}</span>
                <span className="text-[8px] text-gray-400 leading-none">chkd</span>
              </div>
            )}
            {dept.reviewedQuestions > 0 && (
              <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                <Eye className="h-2.5 w-2.5 text-blue-500 shrink-0" />
                <span className="text-[9px] font-bold text-blue-600 leading-none">{dept.reviewedQuestions}</span>
                <span className="text-[8px] text-gray-400 leading-none">rvwd</span>
              </div>
            )}
            {dept.similarQuestions > 0 && (
              <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-gray-200 animate-pulse">
                <AlertTriangle className="h-2.5 w-2.5 text-red-500 shrink-0" />
                <span className="text-[9px] font-bold text-red-500 leading-none">{dept.similarQuestions}</span>
                <span className="text-[8px] text-gray-400 leading-none">sim</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded training details */}
      {expanded && (
        <div className={`border-t ${theme.border} ${theme.statBg} px-3 py-2 flex flex-col gap-1.5`}>
          {trainingData && trainingData.employeeCount > 0 && (
            <>
              {/* Training completion bar */}
              <div className="bg-white border border-gray-100 rounded-lg px-2.5 py-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className={`h-3 w-3 ${theme.iconText}`} />
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider">Training Completion</span>
                  </div>
                  <span className={`text-[9px] font-black ${trainingData.employeeCount > 0 ? theme.accent : "text-gray-400"}`}>
                    {trainingData.employeeCount > 0 ? Math.round((trainingData.fullyTrained / trainingData.employeeCount) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                    style={{ width: `${trainingData.employeeCount > 0 ? Math.round((trainingData.fullyTrained / trainingData.employeeCount) * 100) : 0}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[8px] text-emerald-600 font-bold">{trainingData.fullyTrained} Trained</span>
                  <span className="text-[8px] text-amber-500 font-bold">{trainingData.incomplete} Incomplete</span>
                  {trainingData.sopTrainersAssigned > 0 && (
                    <span className="text-[8px] text-indigo-500 font-bold ml-auto">{trainingData.sopTrainersAssigned} SOPs w/ Trainer</span>
                  )}
                </div>
              </div>
              {/* DB SOP count */}
              {trainingData.dbSopCount > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-100">
                  <FileText className={`h-3 w-3 ${theme.iconText} shrink-0`} />
                  <span className="text-[9px] text-gray-500">
                    <span className={`font-bold ${theme.accent}`}>{trainingData.dbSopCount}</span> SOPs in DB ·
                    <span className="font-bold text-indigo-600 ml-1">{trainingData.foundInDb}</span> in Training Matrix
                  </span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-200">
            <FolderOpen className={`h-3 w-3 ${theme.iconText} shrink-0`} />
            <span className="text-[9px] text-gray-500">{dept.subcategories} subcategor{dept.subcategories !== 1 ? "ies" : "y"} — click department header to view</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Registry table row
// ─────────────────────────────────────────────────────────────
function RegistryRow({
  entry, idx, onViewMcqs,
}: {
  entry: RegistryEntry; idx: number; onViewMcqs?: (id: string) => void;
}) {
  const remaining = Math.max(0, entry.totalMcqs - entry.approved);
  const approvalStatus = entry.totalMcqs > 0 && entry.approved >= entry.totalMcqs
    ? "Approved"
    : entry.similar > 0 ? "Similar"
    : entry.totalMcqs > 0 && entry.approved > 0 ? "Partial"
    : "Pending";

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-200/60 transition-colors group/row">
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-[11px] font-black text-indigo-600">{entry.identifier}</span>
      </td>
      <td className="px-3 py-2.5 max-w-[220px]">
        <span className="text-[11px] text-gray-700 line-clamp-2">{entry.sopName}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-gray-600">{entry.department}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
          entry.langCode === "ENG" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"
        }`}>
          {entry.langCode}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`text-[11px] font-bold ${entry.totalMcqs > 0 ? "text-emerald-600" : "text-gray-300"}`}>
          {entry.totalMcqs > 0 ? fmt(entry.totalMcqs) : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`text-[11px] font-bold ${remaining > 0 ? "text-red-500" : "text-gray-300"}`}>
          {entry.totalMcqs > 0 ? fmt(remaining) : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`text-[11px] font-semibold ${entry.approved > 0 ? "text-emerald-600" : "text-gray-300"}`}>
          {fmt(entry.approved)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`text-[11px] font-semibold ${entry.partial > 0 ? "text-amber-600" : "text-gray-300"}`}>
          {fmt(entry.partial)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className={`text-[11px] font-semibold ${entry.similar > 0 ? "text-violet-600" : "text-gray-300"}`}>
          {fmt(entry.similar)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className="text-[11px] text-gray-500">{fmtDate(entry.lastUpdated)}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {entry.totalMcqs > 0 && entry.id ? (
          <button
            type="button"
            onClick={() => onViewMcqs?.(entry.id)}
            className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-2.5 py-1 text-[9px] font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <Eye className="h-2.5 w-2.5" /> VIEW MCQs
          </button>
        ) : (
          <span className="text-[9px] text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// Sort icon
// ─────────────────────────────────────────────────────────────
function SortIcon({ col, current, dir }: { col: string; current: string; dir: string }) {
  if (current !== col) return <span className="text-gray-400 ml-0.5">↕</span>;
  return <span className="text-purple-300 ml-0.5">{dir === "asc" ? "↑" : "↓"}</span>;
}

// ─────────────────────────────────────────────────────────────
// Main client component
// ─────────────────────────────────────────────────────────────
export function MCQBankClient() {
  const router = useRouter();

  // Modal state
  const [viewerBankId, setViewerBankId] = useState<string | null>(null);
  const [viewerSourceDept, setViewerSourceDept] = useState<string | null>(null);
  const [deptModal, setDeptModal] = useState<string | null>(null);

  // Data state
  const [stats, setStats] = useState<MCQBankGlobalStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [tmPerDept, setTmPerDept] = useState<Record<string, TrainingDeptData> | null>(null);
  const [tmTotalCard, setTmTotalCard] = useState<TrainingDeptData | null>(null);

  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [regLoading, setRegLoading] = useState(true);
  const [regError, setRegError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [langFilter, setLangFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [sortCol, setSortCol] = useState("identifier");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const limit = 50;

  // UI state
  const [showDeptCards, setShowDeptCards] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [regSearch, setRegSearch] = useState("");
  const [regDeptFilter, setRegDeptFilter] = useState("all");
  const [regLangFilter, setRegLangFilter] = useState("All");

  const mcqRegistryRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const [statsRes, tmRes] = await Promise.all([
        fetch("/api/mcq-bank/stats"),
        fetch("/api/training-matrix/overview"),
      ]);
      if (!statsRes.ok) throw new Error((await statsRes.json()).error ?? "Failed to load MCQ stats");
      setStats(await statsRes.json());

      if (tmRes.ok) {
        const tmData = await tmRes.json();
        if (tmData.success && tmData.perDept) {
          // dbSopCountsByDept lives in totalCard (per-dept DB SOP counts)
          const dbCounts: Record<string, number> = tmData.totalCard?.dbSopCountsByDept ?? {};

          // Per-dept slim records
          const slim: Record<string, TrainingDeptData> = {};
          for (const [dept, d] of Object.entries(tmData.perDept as Record<string, Record<string, number>>)) {
            slim[dept] = {
              employeeCount: d.employeeCount ?? 0,
              fullyTrained: d.fullyTrained ?? 0,
              incomplete: d.incomplete ?? 0,
              trainersAssigned: d.trainersAssigned ?? 0,
              sopTrainersAssigned: d.sopTrainersAssigned ?? 0,
              mcqCreatedCount: d.mcqCreatedCount ?? 0,
              mcqNotCreatedCount: d.mcqNotCreatedCount ?? 0,
              sopCount: d.sopCount ?? 0,
              foundInDb: d.foundInDb ?? 0,
              dbSopCount: (dbCounts[dept] as number) ?? 0,
            };
          }
          setTmPerDept(slim);

          // totalCard has correct aggregated values (avoids double-counting when summing per-dept)
          const tc = tmData.totalCard ?? {};
          setTmTotalCard({
            employeeCount: tc.employeeCount ?? 0,
            fullyTrained: tc.fullyTrained ?? 0,
            incomplete: tc.incomplete ?? 0,
            trainersAssigned: tc.trainersAssigned ?? 0,
            sopTrainersAssigned: tc.sopTrainersAssigned ?? 0,
            mcqCreatedCount: tc.mcqCreatedCount ?? 0,
            mcqNotCreatedCount: tc.mcqNotCreatedCount ?? 0,
            sopCount: tc.excelSopCount ?? tc.sopCount ?? 0,
            foundInDb: tc.foundInDb ?? 0,
            dbSopCount: tc.dbSopCount ?? 0, // = dbBaseSet.size, matches TM "SOPs (DB)"
          });
        }
      }
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchRegistry = useCallback(async () => {
    setRegLoading(true);
    setRegError(null);
    try {
      const params = new URLSearchParams({
        search, difficulty, language: langFilter, dept: deptFilter,
        sortBy: sortCol, sortDir, page: String(page), limit: String(limit),
      });
      const res = await fetch(`/api/mcq-bank/registry?${params}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setEntries(data.items);
      setTotal(data.total);
    } catch (e) {
      setRegError(e instanceof Error ? e.message : "Failed to load registry");
    } finally {
      setRegLoading(false);
    }
  }, [search, difficulty, langFilter, deptFilter, sortCol, sortDir, page]);

  useEffect(() => { fetchStats(); }, [fetchStats, refreshKey]);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); fetchRegistry(); }, search ? 300 : 0);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [fetchRegistry, search]);

  useEffect(() => { fetchRegistry(); }, [fetchRegistry, refreshKey]);

  const handleSort = (field: string) => {
    if (sortCol === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(field); setSortDir("asc"); }
    setPage(1);
  };

  // Build registry filtered/sorted from entries (already paginated from API)
  const filteredEntries = entries.filter((row) => {
    if (regDeptFilter !== "all" && row.department !== regDeptFilter) return false;
    if (regLangFilter !== "All" && row.language !== regLangFilter) return false;
    if (regSearch) {
      const q = regSearch.toLowerCase();
      if (!row.identifier.toLowerCase().includes(q) && !row.sopName.toLowerCase().includes(q) && !row.department.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(total / limit);
  const totalBanks = stats?.totalMcqBanks ?? total;

  const getDeptColor = (dept: string) => {
    const theme = getDeptTheme(dept);
    return { bg: theme.cardBg, bar: "bg-white/80", badge: theme.statBg };
  };

  // Aggregate global totals for StatusCard
  const globalCard = stats ? {
    totalSOPs: stats.totalUniqueSops,
    sopWithMCQs: stats.mcqFound,
    sopWithoutMCQs: stats.notFound,
    approvedSOPs: stats.approvedSops,
    partialSOPs: stats.partialSops,
    pendingSOPs: stats.pendingSops,
    similarSOPs: stats.similarSops,
    totalSopEng: stats.withEnglish,
    totalSopGuj: stats.withGujarati,
    remainingEng: stats.enRemaining,
    remainingGuj: stats.guRemaining,
  } : null;

  // Resolve TM data for an MCQ-bank dept name (handles "Engineering and Maintenance" → "Engineering")
  const getTmData = useCallback((deptName: string): TrainingDeptData | undefined => {
    if (!tmPerDept) return undefined;
    if (tmPerDept[deptName]) return tmPerDept[deptName];
    // Strip "and <word>" suffix (e.g. "Engineering and Maintenance" → "Engineering")
    const stripped = deptName.replace(/\s+and\s+\w+/gi, "").trim();
    if (tmPerDept[stripped]) return tmPerDept[stripped];
    // Case-insensitive prefix match
    const lower = deptName.toLowerCase();
    for (const key of Object.keys(tmPerDept)) {
      if (lower.startsWith(key.toLowerCase()) || key.toLowerCase().startsWith(lower)) return tmPerDept[key];
    }
    return undefined;
  }, [tmPerDept]);

  // tmTotalCard is used directly for the grand Total card (avoids summing per-dept which double-counts)

  const DEPT_ORDER = ["QA", "QC", "Microbiology", "Production", "Store", "Engineering", "Personnel"];
  const orderedDepts = stats ? [
    ...DEPT_ORDER.map((n) => stats.departments.find((d) => d.department === n)).filter(Boolean) as DeptMCQStats[],
    ...stats.departments.filter((d) => !DEPT_ORDER.includes(d.department)),
  ] : [];

  const totalStatusCards = 1 + orderedDepts.length;

  return (
    <>
      {/* MCQ Viewer Modal */}
      {viewerBankId && (
        <MCQViewerModal
          bankId={viewerBankId}
          onClose={() => { setViewerBankId(null); setViewerSourceDept(null); }}
          onBack={() => {
            setViewerBankId(null);
            if (viewerSourceDept) {
              setDeptModal(viewerSourceDept);
              setViewerSourceDept(null);
            }
          }}
        />
      )}

      {/* Dept Detail Modal */}
      {deptModal && (
        <DeptDetailModal
          dept={deptModal}
          deptColor={getDeptColor(deptModal)}
          onClose={() => setDeptModal(null)}
          onViewMcqs={(id) => {
            setViewerSourceDept(deptModal);
            setDeptModal(null);
            setViewerBankId(id);
          }}
        />
      )}

      <div className="min-h-screen bg-gray-50">
        {/* ── Header ── */}
        <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="mx-auto max-w-[1920px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-black text-slate-800">MCQ Question Bank</h1>
                <p className="text-xs text-slate-500">
                  Browse and manage your generated MCQ banks ({fmt(totalBanks)} total)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => router.back()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  ← Back
                </button>
                <button type="button" onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
                  <Home className="h-3.5 w-3.5" /> Home
                </button>
                <button type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">
                  <Monitor className="h-3.5 w-3.5" /> Dev Mode
                </button>
                <button type="button" onClick={() => setRefreshKey((k) => k + 1)}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                  <RefreshCw className={`h-3.5 w-3.5 ${statsLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button type="button"
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">
                  Obsolete Details
                </button>
                <button type="button"
                  className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
                  Similar Questions
                </button>
                <button type="button" onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">
                  <Upload className="h-3.5 w-3.5" /> Upload SOP
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1920px] space-y-6 px-6 py-4">

          {/* Error banner */}
          {statsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statsError}
            </div>
          )}

          {/* ── MCQ STATUS CARDS — horizontal scroll grid ── */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">MCQ Status</span>
              {statsLoading && <span className="text-[9px] text-gray-500 animate-pulse">Loading…</span>}
            </div>

            <div className="w-full px-1 py-2 sm:px-2 overflow-x-auto">
              {statsLoading ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(8, minmax(150px, 1fr))` }}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="rounded-[10px] border border-gray-200 bg-white p-3 space-y-2 animate-pulse">
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-2 bg-gray-100 rounded w-1/2" />
                      <div className="space-y-1 mt-2">
                        {[...Array(6)].map((_, j) => (
                          <div key={j} className="h-5 bg-gray-100 rounded" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : stats && globalCard ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${totalStatusCards}, minmax(150px, 1fr))` }}>
                  {/* Total card */}
                  <StatusCard
                    title="Total"
                    subtitle={`${orderedDepts.length} departments`}
                    isGrand
                    totalSOPs={globalCard.totalSOPs}
                    sopWithMCQs={globalCard.sopWithMCQs}
                    sopWithoutMCQs={globalCard.sopWithoutMCQs}
                    approvedSOPs={globalCard.approvedSOPs}
                    partialSOPs={globalCard.partialSOPs}
                    pendingSOPs={globalCard.pendingSOPs}
                    similarSOPs={globalCard.similarSOPs}
                    totalSopEng={globalCard.totalSopEng}
                    totalSopGuj={globalCard.totalSopGuj}
                    remainingEng={globalCard.remainingEng}
                    remainingGuj={globalCard.remainingGuj}
                    mcqFound={stats.mcqFound}
                    mcqNotFound={stats.notFound}
                    trainingData={tmTotalCard ?? undefined}
                  />
                  {/* Per-dept cards */}
                  {orderedDepts.map((dept) => (
                    <StatusCard
                      key={dept.department}
                      title={dept.department}
                      subtitle={`${dept.subcategories} subcategories`}
                      totalSOPs={dept.sopCount}
                      sopWithMCQs={dept.sopWithMcqs}
                      sopWithoutMCQs={dept.sopWithoutMcqs}
                      approvedSOPs={dept.approvedSops}
                      partialSOPs={dept.partialSops}
                      pendingSOPs={dept.pendingSops}
                      similarSOPs={dept.similarSops}
                      totalSopEng={dept.totalSopEng}
                      totalSopGuj={dept.totalSopGuj}
                      remainingEng={dept.enRemaining}
                      remainingGuj={dept.guRemaining}
                      trainingData={getTmData(dept.department)}
                      onOpen={() => setDeptModal(dept.department)}
                      onRowClick={(f) => setDeptModal(dept.department)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* ── BY DEPARTMENT — Collapsible colorful grid ── */}
          <button
            type="button"
            onClick={() => setShowDeptCards((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors text-left group"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 shadow-sm shrink-0">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-800">
                By Department <span className="text-gray-500 font-medium">({orderedDepts.length})</span>
              </span>
              <p className="text-xs text-gray-400 leading-none mt-0.5">Filter MCQs by department</p>
            </div>
            <span className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0">
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showDeptCards ? "" : "-rotate-90"}`} />
            </span>
          </button>

          {showDeptCards && (
            statsLoading ? (
              <DeptGridSkeleton count={8} />
            ) : stats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {orderedDepts.map((dept) => (
                  <DeptColorCard
                    key={dept.department}
                    dept={dept}
                    trainingData={getTmData(dept.department)}
                    onClick={() => setDeptModal(dept.department)}
                  />
                ))}
              </div>
            ) : null
          )}

          {/* ── MCQ REGISTRY TABLE ── */}
          <div className="mt-8" ref={mcqRegistryRef}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <LayoutList className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">MCQ Registry</h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {regLoading ? "Loading…" : `${filteredEntries.length} of ${total} banks`}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search SOPs..."
                    value={regSearch}
                    onChange={(e) => setRegSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-[11px] placeholder-gray-400 focus:outline-none focus:border-purple-400 w-44 transition-colors"
                  />
                </div>
                <select
                  value={regDeptFilter}
                  onChange={(e) => setRegDeptFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-[11px] focus:outline-none focus:border-purple-400 cursor-pointer"
                >
                  <option value="all">All Depts</option>
                  {stats?.departments.map((d) => (
                    <option key={d.department} value={d.department}>{d.department}</option>
                  ))}
                </select>
                <select
                  value={regLangFilter}
                  onChange={(e) => setRegLangFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-[11px] focus:outline-none focus:border-purple-400 cursor-pointer"
                >
                  <option value="All">All Languages</option>
                  <option value="English">English</option>
                  <option value="Gujarati">Gujarati</option>
                </select>
                {regSearch && (
                  <button
                    type="button"
                    onClick={() => setRegSearch("")}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 text-[10px] font-bold hover:bg-gray-200 transition-colors"
                  >
                    Clear <X className="h-3 w-3 ml-0.5" />
                  </button>
                )}
              </div>
            </div>

            {regError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{regError}</div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-200/70 border-b border-gray-200">
                      {([
                        ["identifier", "SOP No."],
                        ["name", "SOP Name"],
                        ["dept", "Dept"],
                        ["lang", "Lang"],
                        ["totalMcqs", "Total MCQs"],
                        ["remaining", "Remaining"],
                        ["approved", "Approved"],
                        ["partial", "Partial"],
                        ["similar", "Similar"],
                        ["lastUpdated", "Last Updated"],
                      ] as [string, string][]).map(([col, label]) => (
                        <th
                          key={col}
                          onClick={() => handleSort(col)}
                          className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-500 cursor-pointer hover:text-gray-800 whitespace-nowrap select-none transition-colors"
                        >
                          {label}<SortIcon col={col} current={sortCol} dir={sortDir} />
                        </th>
                      ))}
                      <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regLoading ? (
                      [...Array(8)].map((_, i) => (
                        <tr key={i} className="border-b border-gray-200">
                          {[...Array(11)].map((_, j) => (
                            <td key={j} className="px-3 py-3">
                              <div className="h-3 animate-pulse rounded bg-gray-200" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-12 text-gray-500 text-sm">
                          No MCQ banks match the current filters.
                        </td>
                      </tr>
                    ) : filteredEntries.map((entry, idx) => (
                      <RegistryRow
                        key={`${entry.identifier}||${entry.language}||${entry.id}`}
                        entry={entry}
                        idx={idx}
                        onViewMcqs={(id) => setViewerBankId(id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 bg-white px-5 py-3">
                  <p className="text-xs text-gray-500">Page {page} of {totalPages} · {total} total</p>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                      Prev
                    </button>
                    {(() => {
                      const windowSize = Math.min(5, totalPages);
                      let start = Math.max(1, page - 2);
                      if (start + windowSize - 1 > totalPages) start = Math.max(1, totalPages - windowSize + 1);
                      return [...Array(windowSize)].map((_, i) => {
                        const pg = start + i;
                        return (
                          <button key={i} type="button" onClick={() => setPage(pg)}
                            className={`rounded border px-2.5 py-1 text-xs ${
                              pg === page
                                ? "border-violet-600 bg-violet-600 text-white"
                                : "border-gray-300 text-gray-600 hover:bg-gray-50"
                            }`}>
                            {pg}
                          </button>
                        );
                      });
                    })()}
                    <button type="button" disabled={page === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

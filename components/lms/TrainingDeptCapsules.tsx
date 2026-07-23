"use client";

import { memo, useState, type ReactNode } from "react";
import { BarChart2, ChevronDown, FileText, Users, Video, Presentation, ListChecks } from "lucide-react";

export interface TrainingDeptCapsule {
  department: string;
  totalSops: number; sopCompleted: number; sopNot: number;
  totalEmployees: number; empCompleted: number; empNot: number;
  /** Employees with at least one regular training SOP. */
  empTraining: number;
  /** Employees with at least one induction SOP. */
  empInduction: number;
  slidesTotal: number; slidesCompleted: number; slidesNot: number;
  videosTotal: number; videosCompleted: number; videosNot: number;
  mcqTotal: number; mcqCompleted: number; mcqNot: number;
}

/* ─── Simple label + single value, with optional active highlight ──────────────
 * Mirrors the dashboard's DepartmentCapsules MetricRow styling exactly.       */
function MetricRow({
  label, value, valueClass, onClick, isActive,
}: {
  label: ReactNode; value: number; valueClass?: string;
  onClick?: () => void; isActive?: boolean;
}) {
  return (
    <button type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
      aria-pressed={isActive ? true : undefined}
      className={`flex min-h-6 w-full cursor-pointer items-center justify-between gap-1.5 rounded-sm px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
        isActive ? "border border-purple-400 bg-purple-100/90" : "border border-transparent"
      }`}
    >
      <span className="min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap text-gray-600">{label}</span>
      <span className={`shrink-0 font-bold leading-tight tabular-nums ${valueClass ?? "text-gray-900"}`}>
        {value}
      </span>
    </button>
  );
}

/* ─── Compact columns in a row (mirrors the dashboard's Expir./Near/No Dt) ── */
function StatusColumns({
  cols, onClick,
}: {
  cols: { label: string; value: number; cls?: string; title?: string; onClick?: () => void }[];
  onClick?: () => void;
}) {
  return (
    <div className="flex w-full gap-0.5">
      {cols.map((c) => (
        <div key={c.label} className="min-w-0 flex-1" title={c.title}>
          <MetricRow label={c.label} value={c.value} valueClass={c.cls} onClick={c.onClick ?? onClick} />
        </div>
      ))}
    </div>
  );
}

/* ─── Done / Not block (label row + two-column counts) ─────────────── */
function StatusBlock({
  label, total, done, notDone,
  onTotalClick, onDoneClick, onNotClick, onClick,
  doneTitle = "Completed", notTitle = "Not completed",
}: {
  label: ReactNode;
  total: number;
  done: number;
  notDone: number;
  onTotalClick?: () => void;
  onDoneClick?: () => void;
  onNotClick?: () => void;
  onClick?: () => void;
  doneTitle?: string;
  notTitle?: string;
}) {
  return (
    <>
      <MetricRow label={label} value={total} onClick={onTotalClick ?? onClick} />
      <StatusColumns
        cols={[
          { label: "Done", value: done,    cls: done > 0 ? "text-emerald-700" : "text-gray-700",  title: doneTitle, onClick: onDoneClick ?? onClick },
          { label: "Not",  value: notDone, cls: notDone > 0 ? "text-red-600" : "text-gray-700", title: notTitle,  onClick: onNotClick ?? onClick },
        ]}
      />
    </>
  );
}

/* ─── Individual department card (memoized) ───────────────────────────────── */
export type SopCapsuleFilter = "all" | "completed" | "not_completed";
export type EmpCapsuleStatus = "all" | "completed" | "not_completed";
export type EmpCapsuleKind = "overall" | "slides" | "videos" | "mcq" | "training" | "induction";
export type EmpCapsuleFilter = { kind: EmpCapsuleKind; status: EmpCapsuleStatus };

const DepartmentCard = memo(function DepartmentCard({
  cap, isSelected, onSelect, onSopFilter, onEmpFilter,
}: {
  cap: TrainingDeptCapsule;
  isSelected: boolean;
  onSelect: (department: string) => void;
  onSopFilter?: (department: string, status: SopCapsuleFilter) => void;
  onEmpFilter?: (department: string, filter: EmpCapsuleFilter) => void;
}) {
  const isTotal = cap.department === "Total";
  const dept = cap.department;
  const select = () => onSelect(dept);
  const emp = (kind: EmpCapsuleKind, status: EmpCapsuleStatus) =>
    () => onEmpFilter?.(dept, { kind, status });

  return (
    <div className={`flex w-full min-w-0 flex-col rounded-[10px] border px-2 py-1.5 text-left shadow-sm ${
      isTotal ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
    }`}>
      {/* Card header */}
      <div
        role={isTotal ? undefined : "button"}
        tabIndex={isTotal ? -1 : 0}
        onClick={() => !isTotal && select()}
        onKeyDown={(e) => {
          if (isTotal) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
        }}
        className={`mb-2 flex min-h-10 w-full items-start gap-1.5 rounded-md border-b pb-2 ${
          isTotal
            ? "cursor-default border-purple-200"
            : `cursor-pointer border-gray-100 hover:bg-purple-50/80 focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                isSelected ? "border-purple-300 bg-purple-100/70 ring-1 ring-purple-300" : ""
              }`
        }`}
        title={isTotal ? "Totals across all departments" : `Show ${dept} employees`}
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
        <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800 wrap-break-word">
          {dept}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">
        <MetricRow
          label="SOPs"
          value={cap.totalSops}
          onClick={() => onSopFilter?.(dept, "all")}
        />
        <StatusColumns
          cols={[
            { label: "Done", value: cap.sopCompleted, cls: cap.sopCompleted > 0 ? "text-emerald-700" : "text-gray-700", title: "Completed", onClick: () => onSopFilter?.(dept, "completed") },
            { label: "Not",  value: cap.sopNot,       cls: cap.sopNot > 0 ? "text-red-600" : "text-gray-700",          title: "Not completed", onClick: () => onSopFilter?.(dept, "not_completed") },
          ]}
        />

        <div className="h-1" />

        <StatusBlock
          label={<span className="inline-flex items-center gap-0.5"><Users className="h-3 w-3 shrink-0" aria-hidden /> Employees</span>}
          total={cap.totalEmployees}
          done={cap.empCompleted}
          notDone={cap.empNot}
          onTotalClick={emp("overall", "all")}
          onDoneClick={emp("overall", "completed")}
          onNotClick={emp("overall", "not_completed")}
          doneTitle="Completed all training"
          notTitle="Not completed"
        />

        <div className="h-1" />

        <StatusBlock
          label={<span className="inline-flex items-center gap-0.5"><Presentation className="h-3 w-3 shrink-0" aria-hidden /> Slides</span>}
          total={cap.slidesTotal}
          done={cap.slidesCompleted}
          notDone={cap.slidesNot}
          onTotalClick={emp("slides", "all")}
          onDoneClick={emp("slides", "completed")}
          onNotClick={emp("slides", "not_completed")}
        />

        <div className="h-1" />

        <StatusBlock
          label={<span className="inline-flex items-center gap-0.5"><Video className="h-3 w-3 shrink-0" aria-hidden /> Videos</span>}
          total={cap.videosTotal}
          done={cap.videosCompleted}
          notDone={cap.videosNot}
          onTotalClick={emp("videos", "all")}
          onDoneClick={emp("videos", "completed")}
          onNotClick={emp("videos", "not_completed")}
        />

        <div className="h-1" />

        <StatusBlock
          label={<span className="inline-flex items-center gap-0.5"><ListChecks className="h-3 w-3 shrink-0" aria-hidden /> MCQs</span>}
          total={cap.mcqTotal}
          done={cap.mcqCompleted}
          notDone={cap.mcqNot}
          onTotalClick={emp("mcq", "all")}
          onDoneClick={emp("mcq", "completed")}
          onNotClick={emp("mcq", "not_completed")}
        />

        <div className="h-1" />

        <StatusColumns
          cols={[
            { label: "Training",  value: cap.empTraining,  cls: cap.empTraining > 0 ? "text-blue-600" : "text-gray-700",   title: "Employees with regular training SOPs", onClick: emp("training", "all") },
            { label: "Induction", value: cap.empInduction, cls: cap.empInduction > 0 ? "text-orange-500" : "text-gray-700", title: "Employees with induction training SOPs", onClick: emp("induction", "all") },
          ]}
        />
      </div>
    </div>
  );
});

/* ─── Main export ─────────────────────────────────────────────────────────── */
export function TrainingDeptCapsules({
  capsules, selected, onSelect, onSopFilter, onEmpFilter,
}: {
  capsules: TrainingDeptCapsule[];
  /** Currently active department, or "All" / undefined when none. */
  selected: string;
  onSelect: (department: string) => void;
  onSopFilter?: (department: string, status: SopCapsuleFilter) => void;
  onEmpFilter?: (department: string, filter: EmpCapsuleFilter) => void;
}) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const deptCount = capsules.filter((c) => c.department !== "Total").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-violet-500 to-indigo-500 shadow-sm">
          <BarChart2 className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-gray-800">
            By Department{" "}
            <span className="font-medium text-gray-500">({deptCount})</span>
          </span>
          <p className="mt-0.5 text-xs leading-none text-gray-400">Filter by department</p>
        </div>
        <span className="shrink-0 text-gray-400 transition-colors group-hover:text-gray-600">
          <ChevronDown className={`h-4 w-4 transition-transform ${sectionOpen ? "" : "-rotate-90"}`} />
        </span>
      </button>

      {/* Cards — equal-width grid spanning the full container */}
      {sectionOpen && (
        <div className="border-t border-gray-100 bg-gray-50 px-1 py-2 sm:px-2">
          <div
            className="overflow-x-auto pb-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#d1d5db transparent" }}
          >
            <div
              className="grid w-full min-w-full gap-1"
              style={{ gridTemplateColumns: `repeat(${capsules.length}, minmax(180px, 1fr))` }}
            >
              {capsules.map((cap) => (
                <DepartmentCard
                  key={cap.department}
                  cap={cap}
                  isSelected={cap.department === "Total" ? selected === "All" : selected === cap.department}
                  onSelect={onSelect}
                  onSopFilter={onSopFilter}
                  onEmpFilter={onEmpFilter}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

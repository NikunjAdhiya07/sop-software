"use client";

import { useState, type ReactNode } from "react";
import { BarChart2, ChevronDown, FileText, Plus, Presentation, Video } from "lucide-react";
import type { DepartmentCapsule } from "@/lib/types";
import { useDashboardStore } from "@/lib/store/dashboard-store";

interface DepartmentCapsulesProps {
  capsules: DepartmentCapsule[];
}

/* ─── Green | red value pill box (reference styling) ──────────────────── */
function PillBox({
  available, missing, onAvailableClick, onMissingClick, minW = "1.35rem",
}: {
  available: number; missing: number;
  onAvailableClick?: () => void; onMissingClick?: () => void;
  minW?: string;
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/90 bg-white/95 px-0.5 py-px shadow-sm tabular-nums">
      <button type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAvailableClick?.(); }}
        style={{ minWidth: minW }}
        className="cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-700 transition-colors hover:bg-emerald-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-emerald-500/70">
        {available}
      </button>
      <span className="select-none text-[8px] font-light text-gray-300" aria-hidden>|</span>
      <button type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMissingClick?.(); }}
        style={{ minWidth: minW }}
        className="cursor-pointer rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none text-red-600 transition-colors hover:bg-red-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-red-400/70">
        {missing}
      </button>
    </div>
  );
}

/* ─── Metric row with label + green|red pill (reference grid layout) ──── */
function MetricAvailMiss({
  label, available, missing, onLabelClick, onAvailableClick, onMissingClick,
}: {
  label: ReactNode; available: number; missing: number;
  onLabelClick?: () => void; onAvailableClick?: () => void; onMissingClick?: () => void;
}) {
  return (
    <div className="grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
      <button type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLabelClick?.(); }}
        className="-mx-0.5 min-w-0 cursor-pointer truncate rounded px-0.5 text-left text-gray-600 transition-colors hover:text-purple-800 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400">
        {label}
      </button>
      <PillBox
        available={available} missing={missing}
        onAvailableClick={onAvailableClick} onMissingClick={onMissingClick}
      />
    </div>
  );
}

/* ─── Simple label + single value, with optional active highlight ────── */
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
      className={`flex min-h-[24px] w-full cursor-pointer items-center justify-between gap-1.5 rounded-[4px] px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-purple-100/80 active:bg-purple-200/60 focus:z-10 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
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

/* ─── Lang pair sub-row: L1 X|Y  L2 X|Y (reference styling) ──────────── */
function LangPairPills({
  l1, f1, m1, l2, f2, m2,
  onF1, onM1, onF2, onM2,
}: {
  l1: string; f1: number; m1: number;
  l2: string; f2: number; m2: number;
  onF1?: () => void; onM1?: () => void;
  onF2?: () => void; onM2?: () => void;
}) {
  const pair = (
    lang: string, f: number, m: number,
    onF?: () => void, onM?: () => void,
  ) => (
    <div className="flex items-center gap-0.5">
      <span className="min-w-fit text-[9px] font-medium text-gray-500">{lang}</span>
      <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/80 bg-white/90 px-0.5 py-0.5 shadow-sm tabular-nums">
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onF?.(); }}
          className="min-w-[1.3rem] cursor-pointer rounded px-0.5 py-0 text-center text-[10px] font-bold leading-tight text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400">{f}</button>
        <span className="select-none text-[7px] leading-tight text-gray-300">|</span>
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onM?.(); }}
          className="min-w-[1.3rem] cursor-pointer rounded px-0.5 py-0 text-center text-[10px] font-bold leading-tight text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400">{m}</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[22px] w-full items-center justify-between gap-1 px-1 py-0 text-[9px]">
      {pair(l1, f1, m1, onF1, onM1)}
      {pair(l2, f2, m2, onF2, onM2)}
    </div>
  );
}

/* ─── Format-labelled lang pair sub-row (DOCX/PDF + EN/GJ pills) ──────── */
function FormatLangPairRow({
  formatLabel, l1, f1, m1, l2, f2, m2,
}: {
  formatLabel: string;
  l1: string; f1: number; m1: number;
  l2: string; f2: number; m2: number;
}) {
  return (
    <div className="mt-0.5 flex min-h-[20px] w-full items-center justify-between gap-1 px-1 py-0 text-[9px]">
      <span className="inline-block w-[30px] shrink-0 font-medium text-gray-400">{formatLabel}</span>
      <LangPairPills l1={l1} f1={f1} m1={m1} l2={l2} f2={f2} m2={m2} />
    </div>
  );
}

/* ─── Version pair row (label + green|red pill) ──────────────────────── */
function VersionPairRow({
  label, found, missing, onLabelClick, onFoundClick, onMissingClick,
}: {
  label: ReactNode; found: number; missing: number;
  onLabelClick?: () => void; onFoundClick?: () => void; onMissingClick?: () => void;
}) {
  return (
    <MetricAvailMiss
      label={label}
      available={found}
      missing={missing}
      onLabelClick={onLabelClick}
      onAvailableClick={onFoundClick}
      onMissingClick={onMissingClick}
    />
  );
}

/* ─── Individual department card ─────────────────────────────────────── */
function DepartmentCard({
  cap, onFilter, isSelected,
}: {
  cap: DepartmentCapsule;
  onFilter: (patch: Record<string, string | boolean | undefined>) => void;
  isSelected: boolean;
}) {
  const isTotal = cap.department === "Total";
  const label = cap.department;

  return (
    <div className={`flex w-full min-w-0 flex-col rounded-[10px] border px-2 py-1.5 text-left shadow-sm ${
      isTotal ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
    }`}>
      {/* Card header */}
      <div
        role={isTotal ? undefined : "button"}
        tabIndex={isTotal ? -1 : 0}
        onClick={() => !isTotal && onFilter({})}
        onKeyDown={(e) => {
          if (isTotal) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFilter({}); }
        }}
        className={`mb-2 flex min-h-[40px] w-full items-start gap-1.5 rounded-md border-b pb-2 ${
          isTotal
            ? "cursor-default border-purple-200"
            : `cursor-pointer border-gray-100 hover:bg-purple-50/80 focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                isSelected ? "border-purple-300 bg-purple-100/70 ring-1 ring-purple-300" : ""
              }`
        }`}
        title={isTotal ? "Totals across all departments" : `Show all ${label} SOPs`}
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
        <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800 break-words">
          {label}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">

        <MetricRow
          label="SOPs" value={cap.total}
          onClick={() => onFilter({})}
          isActive={isSelected}
        />
        <MetricRow label="Dual" value={cap.dualLanguage} onClick={() => onFilter({ language: "ENG-GUJ" })} />
        <MetricRow label="w/ EN" value={cap.withEn ?? cap.total} onClick={() => onFilter({ language: "ENG" })} />
        <MetricRow label="w/ GU" value={cap.withGu ?? cap.dualLanguage} onClick={() => onFilter({ language: "GUJ" })} />

        {/* Expiry row: 3 compact columns */}
        <div className="flex w-full gap-0.5">
          <div className="min-w-0 flex-1">
            <MetricRow label="Expir." value={cap.expired}
              valueClass={cap.expired > 0 ? "text-red-600" : "text-gray-700"}
              onClick={() => onFilter({ expiry: "Expired" })} />
          </div>
          <div className="min-w-0 flex-1">
            <MetricRow label="Near" value={cap.nearExpiry}
              valueClass={cap.nearExpiry > 0 ? "text-amber-600" : "text-gray-700"}
              onClick={() => onFilter({ expiry: "Near" })} />
          </div>
          <div className="min-w-0 flex-1">
            <MetricRow label="No Dt" value={cap.noDate}
              onClick={() => onFilter({ expiry: "No Date" })} />
          </div>
        </div>

        {/* DOCX */}
        <MetricAvailMiss
          label="DOCX"
          available={cap.docx.en.found + cap.docx.gu.found}
          missing={cap.docx.en.missing + cap.docx.gu.missing}
          onLabelClick={() => onFilter({ fileType: "DOCX" })}
          onAvailableClick={() => onFilter({ fileType: "DOCX" })}
          onMissingClick={() => onFilter({ fileType: "No DOCX" })}
        />
        <LangPairPills
          l1="EN" f1={cap.docx.en.found} m1={cap.docx.en.missing}
          l2="GJ" f2={cap.docx.gu.found} m2={cap.docx.gu.missing}
          onF1={() => onFilter({ fileType: "DOCX", language: "ENG" })}
          onM1={() => onFilter({ fileType: "No DOCX", language: "ENG" })}
          onF2={() => onFilter({ fileType: "DOCX", language: "GUJ" })}
          onM2={() => onFilter({ fileType: "No DOCX", language: "GUJ" })}
        />

        {/* PDF */}
        <MetricAvailMiss
          label="PDF"
          available={cap.pdf.en.found + cap.pdf.gu.found}
          missing={cap.pdf.en.missing + cap.pdf.gu.missing}
          onLabelClick={() => onFilter({ fileType: "PDF" })}
          onAvailableClick={() => onFilter({ fileType: "PDF" })}
          onMissingClick={() => onFilter({ fileType: "No PDF" })}
        />
        <LangPairPills
          l1="EN" f1={cap.pdf.en.found} m1={cap.pdf.en.missing}
          l2="GJ" f2={cap.pdf.gu.found} m2={cap.pdf.gu.missing}
          onF1={() => onFilter({ fileType: "PDF", language: "ENG" })}
          onM1={() => onFilter({ fileType: "No PDF", language: "ENG" })}
          onF2={() => onFilter({ fileType: "PDF", language: "GUJ" })}
          onM2={() => onFilter({ fileType: "No PDF", language: "GUJ" })}
        />

        {/* Versions */}
        <div className="h-1" />
        <VersionPairRow
          label="Versions"
          found={cap.version.found} missing={cap.version.missing}
          onLabelClick={() => onFilter({ versionStatus: "missing" })}
          onFoundClick={() => onFilter({ versionStatus: "found" })}
          onMissingClick={() => onFilter({ versionStatus: "missing" })}
        />
        <FormatLangPairRow
          formatLabel="DOCX"
          l1="EN" f1={cap.docx.en.found} m1={cap.docx.en.missing}
          l2="GJ" f2={cap.docx.gu.found} m2={cap.docx.gu.missing}
        />
        <FormatLangPairRow
          formatLabel="PDF"
          l1="EN" f1={cap.pdf.en.found} m1={cap.pdf.en.missing}
          l2="GJ" f2={cap.pdf.gu.found} m2={cap.pdf.gu.missing}
        />

        {/* Version Dates */}
        <div className="h-1" />
        <VersionPairRow
          label="Version Dates"
          found={cap.versionDate.found} missing={cap.versionDate.missing}
          onLabelClick={() => onFilter({ versionDate: "missing" })}
          onFoundClick={() => onFilter({ versionDate: "found" })}
          onMissingClick={() => onFilter({ versionDate: "missing" })}
        />
        <LangPairPills
          l1="ENG" f1={cap.versionDate.en?.found ?? 0} m1={cap.versionDate.en?.missing ?? 0}
          l2="GUJ" f2={cap.versionDate.gu?.found ?? 0} m2={cap.versionDate.gu?.missing ?? 0}
        />

        {/* Videos */}
        <div className="h-1" />
        <MetricAvailMiss
          label={
            <span className="inline-flex items-center gap-0.5">
              <Video className="h-3 w-3 shrink-0" aria-hidden />
              Videos
            </span>
          }
          available={cap.videos.available} missing={cap.videos.missing}
          onLabelClick={() => onFilter({ media: "Video" })}
          onAvailableClick={() => onFilter({ media: "Video" })}
          onMissingClick={() => onFilter({ media: "No Video" })}
        />
        <LangPairPills
          l1="ENG" f1={cap.videos.en?.available ?? 0} m1={cap.videos.en?.missing ?? 0}
          l2="GUJ" f2={cap.videos.gu?.available ?? 0} m2={cap.videos.gu?.missing ?? 0}
          onF1={() => onFilter({ media: "Video", language: "ENG" })}
          onM1={() => onFilter({ media: "No Video", language: "ENG" })}
          onF2={() => onFilter({ media: "Video", language: "GUJ" })}
          onM2={() => onFilter({ media: "No Video", language: "GUJ" })}
        />

        {/* Slides */}
        <div className="h-1" />
        <MetricAvailMiss
          label={
            <span className="inline-flex items-center gap-0.5">
              <Presentation className="h-3 w-3 shrink-0" aria-hidden />
              Slides
            </span>
          }
          available={cap.slides.available} missing={cap.slides.missing}
          onLabelClick={() => onFilter({ media: "Slides" })}
          onAvailableClick={() => onFilter({ media: "Slides" })}
          onMissingClick={() => onFilter({ media: "No Slides" })}
        />
      </div>
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────── */
export function DepartmentCapsules({ capsules }: DepartmentCapsulesProps) {
  const { setFilter, filters } = useDashboardStore();
  const [sectionOpen, setSectionOpen] = useState(true);

  const deptCount = capsules.filter((c) => c.department !== "Total").length;
  const activeDept = filters.department; // undefined = Total is selected

  const applyFilter = (department: string, patch: Record<string, string | boolean | undefined> = {}) => {
    setFilter({
      department: department === "Total" ? undefined : department,
      ...patch,
    });
  };

  return (
    <section className="border-b border-gray-200 bg-white">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-violet-500 to-indigo-500 shadow-sm">
          <BarChart2 className="h-4 w-4 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800">
            By Department{" "}
            <span className="font-medium text-gray-500">({deptCount})</span>
          </span>
          <p className="mt-0.5 text-xs leading-none text-gray-400">Filter SOPs by department</p>
        </div>
        <span className="shrink-0 text-gray-400 transition-colors group-hover:text-gray-600">
          <ChevronDown className={`h-4 w-4 transition-transform ${sectionOpen ? "" : "-rotate-90"}`} />
        </span>
      </button>

      {/* Cards — responsive wrapping grid (reference layout) */}
      {sectionOpen && (
        <div className="border-t border-gray-100 bg-gray-50 px-1 py-2 sm:px-2">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 2xl:grid-cols-8">
            {capsules.map((cap) => (
              <DepartmentCard
                key={cap.department}
                cap={cap}
                isSelected={
                  cap.department === "Total"
                    ? !activeDept
                    : activeDept === cap.department
                }
                onFilter={(patch) => applyFilter(cap.department, patch)}
              />
            ))}
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 hover:border-purple-400 hover:text-purple-600"
            >
              <Plus className="h-3 w-3" /> Add Department
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

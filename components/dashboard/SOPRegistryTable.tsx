"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Edit2,
  FileText,
  Loader2,
  Presentation,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditSOPModal } from "./EditSOPModal";
import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { RegistrySOP } from "@/lib/types";
import {
  buildOfficeOnlineEmbedUrl,
  buildPreviewHref,
  isOfficePreviewAvailable,
} from "@/lib/file-urls";
import { formatUploaded } from "@/lib/sop-utils";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { Btn } from "./ui";

/* ─── SOP display helpers ────────────────────────────────────────────── */
function displaySopCode(identifier: string): string {
  const match = identifier.match(/^([A-Z]+\d+[-]\d+)/i);
  if (match) return match[1].toUpperCase();
  const seg = identifier.split("_")[0];
  return /^[A-Z]{2,}\d/i.test(seg) ? seg.toUpperCase() : identifier;
}

function displaySopTitle(name: string, identifier: string): string {
  const code = displaySopCode(identifier);
  const codePattern = code.replace(/[-]/g, String.raw`[\s_-]`);
  const stripped = name.replace(new RegExp(`^${codePattern}[\\s_-]*`, "i"), "").trim();
  return stripped || name;
}

/* ─── Document preview modal ─────────────────────────────────────────── */
function DocPreviewModal({
  filePath,
  label,
  isPdf,
  onClose,
}: {
  filePath: string;
  label: string;
  isPdf: boolean;
  onClose: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const previewSrc = `/api/sops/preview?path=${encodeURIComponent(filePath)}&type=pdf`;
  const officeEmbedSrc = !isPdf ? buildOfficeOnlineEmbedUrl(filePath, origin) : null;
  const officeAvailable = !isPdf && isOfficePreviewAvailable(filePath, origin);
  const downloadHref = buildPreviewHref(filePath);
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setIframeLoading(true);
  }, [officeEmbedSrc, previewSrc]);

  const modal = (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        style={{ height: "min(90vh, 900px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
          <span className="truncate text-sm font-semibold text-gray-800">{label}</span>
          <div className="flex items-center gap-2">
            <a
              href={downloadHref}
              download
              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3 w-3" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
              title="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-white">
          {!isPdf && !officeAvailable ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-600">
              <p>Office Online preview needs a public file URL.</p>
              <p className="text-xs text-gray-500">
                On localhost, use Download or deploy the app so Microsoft can reach the file.
              </p>
              <a
                href={downloadHref}
                download
                className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download file
              </a>
            </div>
          ) : (
            <>
              {iframeLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white text-sm text-gray-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading preview…
                </div>
              )}
              <iframe
                src={isPdf ? previewSrc : officeEmbedSrc!}
                className="absolute inset-0 h-full w-full border-0"
                title={`Preview: ${label}`}
                allowFullScreen
                onLoad={() => setIframeLoading(false)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

interface SOPRegistryTableProps {
  items: RegistrySOP[];
  total: number;
  loading: boolean;
  departments: string[];
  onSort: (field: string) => void;
  onRefresh: () => void;
  canMutate: boolean;
}

export function SOPRegistryTable({
  items,
  total,
  loading,
  departments,
  onSort,
  onRefresh,
  canMutate,
}: SOPRegistryTableProps) {
  const { filters, setFilter, resetFilters, expandedRows, toggleRow, toggleFilterSidebar, showToast } =
    useDashboardStore();
  const [editIdentifier, setEditIdentifier] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RegistrySOP | null>(null);
  const [deleting, setDeleting] = useState(false);

  const SortIcon = ({ field }: { field: string }) => {
    if (filters.sortBy !== field)
      return <ArrowUpDown className="h-3 w-3 text-gray-400 ml-0.5 inline opacity-60" />;
    return filters.sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 text-purple-600 ml-0.5 inline" />
      : <ArrowDown className="h-3 w-3 text-purple-600 ml-0.5 inline" />;
  };

  const thBase = "px-1 py-0.5 align-top text-[9px] font-bold text-gray-600 uppercase tracking-wide whitespace-normal wrap-break-word";
  const selBase = "w-full text-[8px] p-px border border-gray-300 rounded bg-white focus:outline-none focus:border-purple-500 cursor-pointer leading-tight";
  const sortBtn = "flex w-full items-center gap-0.5 rounded px-0.5 py-1 text-left font-bold uppercase tracking-wide text-gray-600 hover:bg-purple-50/80 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400";

  /* Unique language options for filter dropdown */
  const uniqueLanguages = useMemo(() => {
    const langs = new Set(items.map((s) => s.language));
    return Array.from(langs).sort();
  }, [items]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/sops/registry/${encodeURIComponent(deleteTarget.identifier)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to delete SOP");
      }
      showToast(`${deleteTarget.identifier} moved to Obsolete SOPs`);
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete SOP");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1920px] px-2 pb-24">
      <EditSOPModal
        open={editIdentifier !== null}
        identifier={editIdentifier}
        departmentList={departments}
        onClose={() => setEditIdentifier(null)}
        onSuccess={onRefresh}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete SOP"
        message={
          deleteTarget
            ? `Move SOP ${deleteTarget.identifier} to Obsolete SOPs? All files, versions, history, and metadata will be preserved. The SOP will be removed from active listings.`
            : ""
        }
        confirmLabel="Move to Obsolete"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
      <div className="flex flex-col w-full bg-gray-50">

        {/* Toolbar row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700">SOP Registry</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Btn size="xs" onClick={resetFilters}>Reset</Btn>
            <Btn size="xs">
              <Download className="h-3 w-3" /> Export Missing DOCX
            </Btn>
            <select
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-purple-500"
              value={filters.searchField ?? "All"}
              onChange={(e) => setFilter({ searchField: e.target.value })}
            >
              {["All fields", "SOP No", "Name", "Department", "Location"].map((f) => (
                <option key={f} value={f === "All fields" ? "All" : f}>{f}</option>
              ))}
            </select>
            <div className="relative">
              <input
                type="search"
                placeholder="Search SOPs..."
                className="w-44 rounded border border-gray-300 py-0.5 pl-2 pr-6 text-[10px] focus:border-purple-500 focus:outline-none"
                value={filters.search ?? ""}
                onChange={(e) => setFilter({ search: e.target.value })}
              />
            </div>
            <Btn size="xs" onClick={toggleFilterSidebar}>
              <SlidersHorizontal className="h-3 w-3" />
            </Btn>
          </div>
          <span className="ml-auto rounded bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
            {total} results
          </span>
        </div>

        {/* Table */}
        <div
          className="w-full overflow-auto overscroll-contain"
          style={{ scrollbarGutter: "stable both-edges", contain: "content" }}
        >
          <table className="w-full min-w-max table-fixed text-left border-collapse">
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className={`${thBase} text-center w-8`} />
                <th className={`${thBase} text-center w-10`} title="Serial number">SR</th>
                <th className={`${thBase} w-32`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("identifier")}>
                    SOP No <SortIcon field="identifier" />
                  </button>
                </th>
                <th className={`${thBase} text-center w-10`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("version")}>
                    Ver <SortIcon field="version" />
                  </button>
                </th>
                <th className={`${thBase} w-88`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("name")}>
                    SOP Name <SortIcon field="name" />
                  </button>
                </th>
                <th className={`${thBase} w-16`}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest leading-none">Guideline</span>
                    <button type="button" className={`${sortBtn} justify-center py-0.5`} onClick={() => onSort("guidelineReference")} title="Guideline reference">
                      <Sparkles className="h-3 w-3 text-orange-500 shrink-0" />
                      <SortIcon field="guidelineReference" />
                    </button>
                  </div>
                </th>
                <th className={`${thBase} w-24`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("location")}>
                    Location <SortIcon field="location" />
                  </button>
                </th>
                <th className={`${thBase} w-56`} title="Prior revisions (DOCX/PDF) per language">
                  <button type="button" className={sortBtn} onClick={() => onSort("priorVersions")}>
                    Prior Versions <SortIcon field="priorVersions" />
                  </button>
                </th>
                <th className={`${thBase} w-36`}>
                  <div className="flex flex-col gap-px">
                    <button type="button" className={sortBtn} onClick={() => onSort("department")}>
                      Department <SortIcon field="department" />
                    </button>
                    <select
                      className={selBase}
                      value={filters.department ?? ""}
                      onChange={(e) => setFilter({ department: e.target.value || undefined })}
                    >
                      <option value="">All</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </th>
                <th className={`${thBase} w-16`}>
                  <div className="flex flex-col gap-px">
                    <button type="button" className={sortBtn} onClick={() => onSort("language")}>
                      Lang <SortIcon field="language" />
                    </button>
                    <select
                      className={selBase}
                      value={filters.language ?? ""}
                      onChange={(e) => setFilter({ language: e.target.value || undefined })}
                    >
                      <option value="">All</option>
                      {uniqueLanguages.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </th>
                <th className={`${thBase} w-28 pr-3`} title="Current approved files: English first, then Gujarati when dual">
                  <button type="button" className={sortBtn} onClick={() => onSort("fileType")}>
                    Files <SortIcon field="fileType" />
                  </button>
                </th>
                <th className={`${thBase} w-24 pr-3`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("videos")} title="Training videos">
                    Video <SortIcon field="videos" />
                  </button>
                </th>
                <th className={`${thBase} w-20`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("slides")} title="Slide decks">
                    Slides <SortIcon field="slides" />
                  </button>
                </th>
                <th className={`${thBase} w-28`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("uploadedAt")} title="Upload date">
                    Uploaded <SortIcon field="uploadedAt" />
                  </button>
                </th>
                <th className={`${thBase} w-36`}>
                  <div className="flex flex-col gap-px">
                    <button type="button" className={sortBtn} onClick={() => onSort("expiryDate")}>
                      Expiry <SortIcon field="expiryDate" />
                    </button>
                  </div>
                </th>
                {canMutate && <th className={`${thBase} w-20`}>Actions</th>}
              </tr>
            </thead>
            <tbody className="text-[10px] text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={canMutate ? 16 : 15} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canMutate ? 16 : 15} className="py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-1">
                      <FileText className="h-5 w-5 text-gray-300" />
                      <p className="text-xs">No SOPs found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((sop, idx) => (
                  <SOPRow
                    key={sop.id}
                    sop={sop}
                    index={(filters.page! - 1) * (filters.limit ?? 50) + idx + 1}
                    isEven={idx % 2 === 0}
                    expanded={expandedRows.has(sop.id)}
                    onToggle={() => toggleRow(sop.id)}
                    canMutate={canMutate}
                    onEdit={() => setEditIdentifier(sop.identifier)}
                    onDelete={() => setDeleteTarget(sop)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > (filters.limit ?? 50) && (
          <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2">
            <span className="text-[10px] text-gray-500">
              Page {filters.page} of {Math.ceil(total / (filters.limit ?? 50))}
            </span>
            <div className="flex gap-1">
              <Btn size="xs" disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilter({ page: (filters.page ?? 1) - 1 })}>
                Previous
              </Btn>
              <Btn size="xs" disabled={(filters.page ?? 1) >= Math.ceil(total / (filters.limit ?? 50))}
                onClick={() => setFilter({ page: (filters.page ?? 1) + 1 })}>
                Next
              </Btn>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Individual row ─────────────────────────────────────────────────── */
const SOPRow = memo(function SOPRow({
  sop,
  index,
  isEven,
  expanded,
  onToggle,
  canMutate,
  onEdit,
  onDelete,
}: {
  sop: RegistrySOP;
  index: number;
  isEven: boolean;
  expanded: boolean;
  onToggle: () => void;
  canMutate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDual = sop.language === "ENG-GUJ";

  /* Expiry badge */
  const expiryNode = (() => {
    if (!sop.expiryDate) {
      return <span className="inline-block rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[8px] font-semibold text-gray-400">No Date</span>;
    }
    const diffDays = Math.floor((new Date(sop.expiryDate).getTime() - Date.now()) / 86400000);
    const absDays = Math.abs(diffDays);
    const months = Math.floor(absDays / 30);
    const remDays = absDays - months * 30;
    const breakdown = months > 0 && remDays > 0
      ? ` (${months} months ${remDays} days)`
      : months > 0 ? ` (${months} months)` : remDays > 0 ? ` (${remDays} days)` : "";

    let label: string;
    let colorClass: string;
    if (diffDays < 0) {
      label = `Expired · ${absDays} days ago${breakdown}`;
      colorClass = "text-red-700 bg-red-50 border-red-200";
    } else if (diffDays <= 30) {
      label = `${diffDays} days${breakdown}`;
      colorClass = "text-orange-700 bg-orange-50 border-orange-200";
    } else if (diffDays <= 90) {
      label = `${diffDays} days${breakdown}`;
      colorClass = "text-yellow-800 bg-yellow-50 border-yellow-200";
    } else {
      label = `${diffDays} days${breakdown}`;
      colorClass = "text-emerald-800 bg-emerald-50 border-emerald-200";
    }
    return (
      <span className={`inline-block max-w-[200px] rounded border px-1 py-0.5 text-[8px] font-semibold leading-snug ${colorClass}`}
        title={`Expiry: ${new Date(sop.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`}>
        {label}
      </span>
    );
  })();

  return (
    <Fragment>
      <tr
        onClick={onToggle}
        className={`hover:bg-purple-50/80 cursor-pointer transition-colors group border-b border-gray-100/80 ${
          expanded ? "bg-purple-50" : isEven ? "bg-white" : "bg-gray-50/60"
        }`}
      >
        {/* Expand toggle */}
        <td className="px-1 py-px text-center align-middle">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-purple-600 mx-auto" />
            : <ChevronRight className="h-4 w-4 text-gray-400 mx-auto" />}
        </td>

        {/* SR */}
        <td className="px-1 py-px text-center align-middle text-[10px] font-bold text-gray-600 tabular-nums">
          {index}
          {sop.isNew && (
            <span className="ml-0.5 rounded bg-blue-100 px-0.5 py-px text-[8px] font-bold text-blue-700">N</span>
          )}
        </td>

        {/* SOP No */}
        <td className="px-1 py-px font-mono text-[13px] font-bold tracking-wider align-middle text-purple-700 group-hover:underline whitespace-nowrap">
          {displaySopCode(sop.identifier)}
        </td>

        {/* Ver */}
        <td className="px-1 py-px text-center align-middle">
          <span className="text-[11px] font-bold text-gray-800 tabular-nums">{sop.version}</span>
        </td>

        {/* SOP Name */}
        <td className="px-1 py-px font-medium text-gray-800 align-middle">
          <div className="flex flex-col gap-0 leading-tight min-w-0">
            <span className="text-[12px] font-bold leading-tight text-gray-900 whitespace-normal wrap-break-word">
              {displaySopTitle(sop.name, sop.identifier)}
            </span>
            {sop.nameGujarati && (
              <span className="text-[10px] font-bold leading-tight text-indigo-700 whitespace-normal wrap-break-word">
                {displaySopTitle(sop.nameGujarati, sop.identifier)}
              </span>
            )}
          </div>
        </td>

        {/* Guideline */}
        <td className="px-1 py-px text-center align-middle">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 tabular-nums">
            {sop.guidelineReference ?? <span className="text-gray-300">—</span>}
          </span>
        </td>

        {/* Location */}
        <td className="px-1 py-px align-middle max-w-[100px]">
          <span className="line-clamp-1 text-[8px] leading-snug text-gray-600 cursor-help" title={sop.location ?? undefined}>
            {sop.location ?? <span className="text-gray-400">—</span>}
          </span>
        </td>

        {/* Prior Versions */}
        <td className="px-0.5 py-px align-middle">
          <PriorVersionsCell sop={sop} />
        </td>

        {/* Department */}
        <td className="px-1 py-px text-gray-700 whitespace-nowrap align-middle">
          <span className="bg-gray-200 text-gray-700 px-1 py-px rounded text-[9px] font-semibold leading-tight">
            {sop.department}
          </span>
        </td>

        {/* Lang */}
        <td className="px-1 py-px text-center whitespace-nowrap align-middle">
          {isDual ? (
            <div className="inline-flex flex-col items-center gap-0 leading-none">
              <span className="text-[9px] font-bold text-gray-800">ENG</span>
              <span className="text-[9px] font-bold text-indigo-800">GUJ</span>
            </div>
          ) : (
            <span className="text-[9px] font-semibold text-gray-700">
              {sop.language === "GUJ" ? "GUJ" : "ENG"}
            </span>
          )}
        </td>

        {/* Files */}
        <td className="px-1 py-px align-middle text-center">
          <FilesCell sop={sop} />
        </td>

        {/* Video */}
        <td className="pl-1 pr-3 py-px text-left align-middle">
          <VideoCell sop={sop} isDual={isDual} />
        </td>

        {/* Slides */}
        <td className="px-1 py-px text-left align-middle">
          <SlidesCell sop={sop} isDual={isDual} />
        </td>

        {/* Uploaded */}
        <td className="whitespace-nowrap px-1 py-px text-gray-600 align-middle text-[9px]">
          {formatUploaded(sop.uploadedAt)}
        </td>

        {/* Expiry */}
        <td className="px-1 py-px align-middle">{expiryNode}</td>

        {/* Actions */}
        {canMutate && (
          <td className="px-1 py-px align-middle">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="rounded p-0.5 hover:bg-slate-100"
                title="Edit SOP"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit2 className="h-3 w-3 text-slate-500" />
              </button>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-red-50"
                title="Delete SOP"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3 w-3 text-red-500" />
              </button>
            </div>
          </td>
        )}
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-gray-50 border-b border-gray-200">
          <td colSpan={canMutate ? 16 : 15} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-[10px] md:grid-cols-4">
              <div>
                <p className="font-semibold text-slate-500">Compliance</p>
                <p>Score: {sop.complianceScore}/10 ({sop.complianceStatus})</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Pipeline</p>
                <p>{sop.pipelineStatus}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">MCQs</p>
                <p>{sop.mcqCount} generated</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Record IDs</p>
                <p className="truncate">{sop.recordIds.join(", ")}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
});

/* ─── Files cell: ENG row + GUJ row ──────────────────────────────────── */
function FilesCell({ sop }: { sop: RegistrySOP }) {
  const isDual = sop.language === "ENG-GUJ";
  const hasGu = Boolean(sop.files.docx.gu || sop.files.pdf.gu) || isDual;

  const renderLangRow = (
    langLabel: string,
    docxPath: string | undefined,
    pdfPath: string | undefined,
  ) => (
    <div className="grid grid-cols-[20px_50px_4px_42px] items-center gap-x-0.5 text-left leading-none min-h-[10px]">
      <span className="text-[8px] font-bold text-gray-500">{langLabel}</span>
      {docxPath ? (
        <FileLink filePath={docxPath} label="DOCX" />
      ) : (
        <span className="text-[8px] font-bold leading-none text-red-600 whitespace-nowrap" title="DOCX missing">DOCX&nbsp;✗</span>
      )}
      <div className="flex justify-center text-gray-300 text-[9px] select-none">
        {docxPath && pdfPath ? "·" : ""}
      </div>
      {pdfPath ? (
        <FileLink filePath={pdfPath} label="PDF" isPdf />
      ) : (
        <span className="text-[8px] font-bold leading-none text-red-600 whitespace-nowrap" title="PDF missing">PDF&nbsp;✗</span>
      )}
    </div>
  );

  if (!hasGu) {
    return (
      <div className="mx-auto flex w-max flex-col gap-px text-left leading-none">
        {renderLangRow("ENG", sop.files.docx.en, sop.files.pdf.en)}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-max flex-col gap-px text-left leading-none">
      {renderLangRow("ENG", sop.files.docx.en, sop.files.pdf.en)}
      {renderLangRow("GUJ", sop.files.docx.gu, sop.files.pdf.gu)}
    </div>
  );
}

function FileLink({
  filePath,
  label,
  isPdf,
}: {
  filePath: string;
  label: string;
  isPdf?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const openPreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewOpen(true);
  }, []);
  const closePreview = useCallback(() => setPreviewOpen(false), []);

  return (
    <>
      <div className="flex flex-nowrap items-center gap-0.5 overflow-visible">
        <button
          type="button"
          className="font-bold text-[9px] text-green-600 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          onClick={openPreview}
          title={`Preview ${label}`}
        >
          {label}
        </button>
        <a
          href={buildPreviewHref(filePath)}
          download
          rel="noopener noreferrer"
          className="shrink-0 rounded p-px text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title={`Download ${label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-2.5 w-2.5" />
        </a>
      </div>
      {previewOpen && (
        <DocPreviewModal
          filePath={filePath}
          label={label}
          isPdf={!!isPdf}
          onClose={closePreview}
        />
      )}
    </>
  );
}

/* ─── Prior versions cell ─────────────────────────────────────────────── */
/** How many of the most recent prior versions to show per language. */
const MAX_PRIOR_VERSIONS = 2;

function PriorVersionsCell({ sop }: { sop: RegistrySOP }) {
  const isDual = sop.language === "ENG-GUJ";
  // priorVersions arrive newest-first; keep only the latest few per language.
  const engVersions = sop.priorVersions.filter((pv) => pv.language === "ENG").slice(0, MAX_PRIOR_VERSIONS);
  const gujVersions = sop.priorVersions.filter((pv) => pv.language === "GUJ").slice(0, MAX_PRIOR_VERSIONS);
  const hasAny = sop.priorVersions.length > 0;

  if (!hasAny) {
    return <span className="text-[8px] text-gray-400">—</span>;
  }

  const renderVersionRow = (pvs: typeof sop.priorVersions, subLabel: string) => {
    if (pvs.length === 0) return null;
    return (
      <div className="flex flex-row flex-nowrap items-center gap-x-2 leading-none">
        <span className="text-[8px] font-bold uppercase text-gray-400 leading-none w-[18px] shrink-0">{subLabel}</span>
        <div className="flex flex-row flex-wrap gap-x-3 gap-y-0.5 items-center">
          {pvs.map((pv) =>
            pv.missing ? (
              <div
                key={`${pv.version}-${pv.language}`}
                className="flex flex-row items-center gap-0.5"
                title={`Version ${pv.version} was never uploaded`}
              >
                <span className="text-[9px] font-bold text-gray-400 line-through leading-none whitespace-nowrap">V{pv.version}</span>
                <span className="text-[8px] font-semibold italic text-amber-600 leading-none whitespace-nowrap">not found</span>
              </div>
            ) : (
              <div key={`${pv.version}-${pv.language}`} className="flex flex-row items-center gap-0.5">
                <span className="text-[9px] font-bold text-green-700 leading-none whitespace-nowrap">V{pv.version}</span>
                <div className="flex items-center gap-0.5 leading-none text-[8px] font-bold">
                  {pv.docx ? (
                    <FileLink filePath={pv.docx} label="DOCX" />
                  ) : <span className="text-red-500" title="DOCX missing">DOCX</span>}
                  <span className="text-gray-300 select-none">/</span>
                  {pv.pdf ? (
                    <FileLink filePath={pv.pdf} label="PDF" isPdf />
                  ) : <span className="text-red-500" title="PDF missing">PDF</span>}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    );
  };

  if (isDual) {
    const fallback = sop.priorVersions.slice(0, MAX_PRIOR_VERSIONS);
    return (
      <div className="flex flex-col gap-px py-0 leading-none">
        {engVersions.length > 0 && renderVersionRow(engVersions, "ENG")}
        {gujVersions.length > 0 && renderVersionRow(gujVersions, "GUJ")}
        {engVersions.length === 0 && gujVersions.length === 0 && renderVersionRow(fallback, "ENG")}
      </div>
    );
  }

  const subLabel = sop.language === "GUJ" ? "GUJ" : "ENG";
  const single = sop.priorVersions.slice(0, MAX_PRIOR_VERSIONS);
  return renderVersionRow(single, subLabel);
}

/* ─── Video cell ─────────────────────────────────────────────────────── */
function VideoCell({ sop, isDual }: { sop: RegistrySOP; isDual: boolean }) {
  const enCount = sop.media.videos.en;
  const guCount = sop.media.videos.gu;
  const totalCount = enCount + guCount;

  const notFound = (
    <span className="text-[8px] font-semibold italic text-amber-600 leading-none whitespace-nowrap">no video found</span>
  );

  if (!isDual) {
    return totalCount > 0 ? (
      <span className="text-[10px] font-bold tabular-nums text-emerald-700">{totalCount}</span>
    ) : (
      notFound
    );
  }

  const renderLangRow = (langLabel: string, count: number) => (
    <div className="flex items-center gap-1 text-left leading-none min-h-[10px]">
      <span className="w-[24px] shrink-0 text-[8px] font-bold text-gray-500">{langLabel}</span>
      {count > 0 ? (
        <span className="inline-flex items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-0.5 py-px text-[8px] font-semibold text-emerald-700">
          <Video className="h-2 w-2" aria-hidden />
          {count}
        </span>
      ) : (
        notFound
      )}
    </div>
  );

  return (
    <div className="flex w-max flex-col gap-px text-left leading-none">
      {renderLangRow("ENG", enCount)}
      {renderLangRow("GUJ", guCount)}
    </div>
  );
}

/* ─── Slides cell ────────────────────────────────────────────────────── */
function SlidesCell({ sop, isDual }: { sop: RegistrySOP; isDual: boolean }) {
  const enCount = sop.media.slides.en;
  const guCount = sop.media.slides.gu;
  const totalCount = enCount + guCount;

  const notFound = (
    <span className="text-[8px] font-semibold italic text-amber-600 leading-none whitespace-nowrap">no slides found</span>
  );

  if (!isDual) {
    return totalCount > 0 ? (
      <span className="text-[10px] font-bold tabular-nums text-indigo-700">{totalCount}</span>
    ) : (
      notFound
    );
  }

  const renderLangRow = (langLabel: string, count: number) => (
    <div className="flex items-center gap-1 text-left leading-none min-h-[10px]">
      <span className="w-[24px] shrink-0 text-[8px] font-bold text-gray-500">{langLabel}</span>
      {count > 0 ? (
        <a href="#" onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 px-1 py-px text-[9px] font-semibold text-indigo-700 hover:bg-indigo-100">
          <Presentation className="h-2 w-2" aria-hidden />
          {count}
        </a>
      ) : (
        notFound
      )}
    </div>
  );

  return (
    <div className="flex w-max flex-col gap-px text-left leading-none">
      {renderLangRow("ENG", enCount)}
      {renderLangRow("GUJ", guCount)}
    </div>
  );
}

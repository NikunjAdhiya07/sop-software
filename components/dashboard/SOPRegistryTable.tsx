"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
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
  Users,
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

const registryTdBase = "px-1 py-px align-middle overflow-hidden max-w-0";

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

  const thBase = "sticky top-0 z-20 bg-gray-100 px-1 py-0.5 align-top text-[9px] font-bold text-gray-600 uppercase tracking-wide whitespace-normal wrap-break-word overflow-hidden";
  const selBase = "w-full min-w-0 text-[8px] p-px border border-gray-300 rounded bg-white focus:outline-none focus:border-purple-500 cursor-pointer leading-tight";
  const sortBtn = "flex w-full min-w-0 items-center gap-0.5 rounded px-0.5 py-1 text-left font-bold uppercase tracking-wide text-gray-600 hover:bg-purple-50/80 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400";

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
    <section className="mx-auto w-full max-w-full overflow-hidden px-1 pb-2 sm:px-2">
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

        {/* Table — vertical scroll only; columns share viewport width */}
        <div
          className="w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-y-contain max-h-[calc(100vh-180px)]"
        >
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col style={{ width: "1.5%" }} />
              <col style={{ width: "2%" }} />
              <col style={{ width: "5.5%" }} />
              <col style={{ width: "2.5%" }} />
              <col style={{ width: canMutate ? "19%" : "21%" }} />
              <col style={{ width: "3.5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: canMutate ? "10%" : "11%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "3.5%" }} />
              <col style={{ width: "8.5%" }} />
              <col style={{ width: "7.5%" }} />
              <col style={{ width: "6.5%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "10.5%" }} />
              {canMutate && <col style={{ width: "3.5%" }} />}
            </colgroup>
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className={`${thBase} text-center`} />
                <th className={`${thBase} text-center`} title="Serial number">SR</th>
                <th className={thBase}>
                  <button type="button" className={sortBtn} onClick={() => onSort("identifier")}>
                    SOP No <SortIcon field="identifier" />
                  </button>
                </th>
                <th className={`${thBase} text-center`}>
                  <button type="button" className={sortBtn} onClick={() => onSort("version")}>
                    Ver <SortIcon field="version" />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={sortBtn} onClick={() => onSort("name")}>
                    SOP Name <SortIcon field="name" />
                  </button>
                </th>
                <th className={thBase}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest leading-none">Guideline</span>
                    <button type="button" className={`${sortBtn} justify-center py-0.5`} onClick={() => onSort("guidelineReference")} title="Guideline reference">
                      <Sparkles className="h-3 w-3 text-orange-500 shrink-0" />
                      <SortIcon field="guidelineReference" />
                    </button>
                  </div>
                </th>
                <th className={thBase}>
                  <button type="button" className={sortBtn} onClick={() => onSort("location")}>
                    Location <SortIcon field="location" />
                  </button>
                </th>
                <th className={thBase} title="Prior revisions (DOCX/PDF) per language">
                  <button type="button" className={sortBtn} onClick={() => onSort("priorVersions")}>
                    Prior Versions <SortIcon field="priorVersions" />
                  </button>
                </th>
                <th className={thBase}>
                  <div className="flex flex-col gap-px min-w-0">
                    <button type="button" className={sortBtn} onClick={() => onSort("department")}>
                      Dept <SortIcon field="department" />
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
                <th className={thBase}>
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
                <th className={thBase} title="Current approved files: English first, then Gujarati when dual">
                  <button type="button" className={sortBtn} onClick={() => onSort("fileType")}>
                    Files <SortIcon field="fileType" />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={sortBtn} onClick={() => onSort("videos")} title="Training videos">
                    Video <SortIcon field="videos" />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={sortBtn} onClick={() => onSort("slides")} title="Slide decks">
                    Slides <SortIcon field="slides" />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={sortBtn} onClick={() => onSort("uploadedAt")} title="Upload date">
                    Uploaded <SortIcon field="uploadedAt" />
                  </button>
                </th>
                <th className={thBase}>
                  <div className="flex flex-col gap-px">
                    <button type="button" className={sortBtn} onClick={() => onSort("expiryDate")}>
                      Expiry <SortIcon field="expiryDate" />
                    </button>
                  </div>
                </th>
                {canMutate && <th className={thBase}>Actions</th>}
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
      <span
        className={`inline-block w-full max-w-full rounded border px-1 py-0.5 text-[8px] font-semibold leading-snug line-clamp-2 ${colorClass}`}
        title={`Expiry: ${new Date(sop.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} — ${label}`}
      >
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
        <td className={`${registryTdBase} text-center`}>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-purple-600 mx-auto" />
            : <ChevronRight className="h-4 w-4 text-gray-400 mx-auto" />}
        </td>

        {/* SR */}
        <td className={`${registryTdBase} text-center text-[10px] font-bold text-gray-600 tabular-nums`}>
          {index}
          {sop.isNew && (
            <span className="ml-0.5 rounded bg-blue-100 px-0.5 py-px text-[8px] font-bold text-blue-700">N</span>
          )}
        </td>

        {/* SOP No */}
        <td className={`${registryTdBase} font-mono text-[13px] font-bold tracking-wider text-purple-700 group-hover:underline`}>
          <span className="block truncate" title={displaySopCode(sop.identifier)}>
            {displaySopCode(sop.identifier)}
          </span>
        </td>

        {/* Ver */}
        <td className={`${registryTdBase} text-center`}>
          <span className="text-[11px] font-bold text-gray-800 tabular-nums">{sop.version}</span>
        </td>

        {/* SOP Name */}
        <td className={`${registryTdBase} font-medium text-gray-800`}>
          <div className="flex min-w-0 flex-col gap-0 leading-tight">
            <span
              className="line-clamp-2 text-[12px] font-bold leading-tight text-gray-900 wrap-break-word"
              title={displaySopTitle(sop.name, sop.identifier)}
            >
              {displaySopTitle(sop.name, sop.identifier)}
            </span>
            {sop.nameGujarati && (
              <span
                className="line-clamp-2 text-[10px] font-bold leading-tight text-indigo-700 wrap-break-word"
                title={displaySopTitle(sop.nameGujarati, sop.identifier)}
              >
                {displaySopTitle(sop.nameGujarati, sop.identifier)}
              </span>
            )}
          </div>
        </td>

        {/* Guideline */}
        <td className={`${registryTdBase} text-center`}>
          <span className="inline-block max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 tabular-nums">
            {sop.guidelineReference ?? <span className="text-gray-300">—</span>}
          </span>
        </td>

        {/* Location */}
        <td className={registryTdBase}>
          <span className="line-clamp-2 text-[8px] leading-snug text-gray-600 cursor-help" title={sop.location ?? undefined}>
            {sop.location ?? <span className="text-gray-400">—</span>}
          </span>
        </td>

        {/* Prior Versions */}
        <td className={`${registryTdBase} px-0.5`}>
          <PriorVersionsCell sop={sop} />
        </td>

        {/* Department */}
        <td className={`${registryTdBase} text-gray-700`}>
          <span
            className="inline-block max-w-full truncate rounded bg-gray-200 px-1 py-px text-[9px] font-semibold leading-tight text-gray-700"
            title={sop.department}
          >
            {sop.department}
          </span>
        </td>

        {/* Lang */}
        <td className={`${registryTdBase} text-center`}>
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
        <td className={`${registryTdBase} text-center`}>
          <FilesCell sop={sop} />
        </td>

        {/* Video */}
        <td className={`${registryTdBase} text-left`}>
          <VideoCell sop={sop} isDual={isDual} />
        </td>

        {/* Slides */}
        <td className={`${registryTdBase} text-left`}>
          <SlidesCell sop={sop} isDual={isDual} />
        </td>

        {/* Uploaded */}
        <td className={`${registryTdBase} text-[9px] leading-tight text-gray-600`}>
          <span className="line-clamp-2 wrap-break-word" title={formatUploaded(sop.uploadedAt)}>
            {formatUploaded(sop.uploadedAt)}
          </span>
        </td>

        {/* Expiry */}
        <td className={registryTdBase}>{expiryNode}</td>

        {/* Actions */}
        {canMutate && (
          <td className={registryTdBase}>
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
            <SOPDetailPanel
              sop={sop}
              expiryNode={expiryNode}
              canMutate={canMutate}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
});

/* ─── Expanded row detail panel ──────────────────────────────────────── */
function DetailRow({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 font-semibold text-gray-600">{label}</span>
      <span className="truncate text-right font-bold text-gray-800" title={title}>{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b border-gray-300 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-700">
      {children}
    </h4>
  );
}

function SOPDetailPanel({
  sop,
  expiryNode,
  canMutate,
  onEdit,
  onDelete,
}: {
  sop: RegistrySOP;
  expiryNode: React.ReactNode;
  canMutate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const languageLabel =
    sop.language === "ENG-GUJ" ? "English & Gujarati" : sop.language === "GUJ" ? "Gujarati" : "English";
  const videoCount = sop.media.videos.en + sop.media.videos.gu;
  const slideCount = sop.media.slides.en + sop.media.slides.gu;
  const effective = sop.effectiveDate
    ? new Date(sop.effectiveDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  const fileGroups = [
    { lang: "ENG", docx: sop.files.docx.en, pdf: sop.files.pdf.en },
    { lang: "GUJ", docx: sop.files.docx.gu, pdf: sop.files.pdf.gu },
  ].filter((g) => g.docx || g.pdf);

  const engPrior = sop.priorVersions.filter((pv) => pv.language === "ENG");
  const gujPrior = sop.priorVersions.filter((pv) => pv.language === "GUJ");

  const renderPriorGroup = (label: string, pvs: typeof sop.priorVersions) =>
    pvs.length === 0 ? null : (
      <div className="flex items-start gap-1.5">
        <span className="w-12 shrink-0 text-[8px] font-bold uppercase text-gray-400">{label}</span>
        <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          {pvs.map((pv) =>
            pv.missing ? (
              <span key={`${pv.version}-${pv.language}`} className="text-[8px] font-semibold italic text-amber-600" title={`Version ${pv.version} was never uploaded`}>
                <span className="font-bold not-italic text-gray-400 line-through">V{pv.version}</span> not found
              </span>
            ) : (
              <span key={`${pv.version}-${pv.language}`} className="flex items-center gap-0.5 text-[8px] font-bold">
                <span className="text-green-700">V{pv.version}</span>
                {pv.docx ? <FileLink filePath={pv.docx} label="DOCX" /> : <span className="text-red-500">DOCX</span>}
                <span className="select-none text-gray-300">/</span>
                {pv.pdf ? <FileLink filePath={pv.pdf} label="PDF" isPdf /> : <span className="text-red-500">PDF</span>}
              </span>
            ),
          )}
        </div>
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
      {/* Basic Information */}
      <div className="space-y-2">
        <SectionHeading>Basic Information</SectionHeading>
        <div className="space-y-1 text-[10px]">
          <DetailRow label="SOP Number:" value={sop.identifier} />
          <DetailRow label="Version:" value={sop.version || "—"} />
          <DetailRow label="Department:" value={sop.department || "Other"} />
          {sop.location && <DetailRow label="Location:" value={sop.location} title={sop.location} />}
          <DetailRow label="Language:" value={languageLabel} />
          {sop.name && <DetailRow label="English Name:" value={sop.name} title={sop.name} />}
          {sop.nameGujarati && <DetailRow label="Gujarati Name:" value={sop.nameGujarati} title={sop.nameGujarati} />}
          {sop.guidelineReference && <DetailRow label="Guideline:" value={sop.guidelineReference} title={sop.guidelineReference} />}
        </div>
      </div>

      {/* Documents & Revisions */}
      <div className="space-y-2">
        <SectionHeading>Documents &amp; Revisions</SectionHeading>
        <div className="space-y-2 text-[10px]">
          <div className="flex items-start gap-1.5">
            <FileText className="mt-0.5 h-3 w-3 shrink-0 text-gray-500" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold text-gray-600">Active Files:</span>
              {fileGroups.length === 0 ? (
                <span className="text-gray-500">No documents</span>
              ) : (
                fileGroups.map((g) => (
                  <div key={g.lang} className="flex items-center gap-1.5">
                    <span className="w-7 shrink-0 text-[8px] font-bold text-gray-400">{g.lang}</span>
                    <div className="flex items-center gap-2 text-[8px] font-bold">
                      {g.docx ? <FileLink filePath={g.docx} label="DOCX" /> : <span className="text-red-500">DOCX&nbsp;✗</span>}
                      {g.pdf ? <FileLink filePath={g.pdf} label="PDF" isPdf /> : <span className="text-red-500">PDF&nbsp;✗</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {sop.priorVersions.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-gray-200 pt-1.5">
              <span className="font-semibold text-gray-600">Prior Revisions:</span>
              {renderPriorGroup("English", engPrior)}
              {renderPriorGroup("Gujarati", gujPrior)}
            </div>
          )}
        </div>
      </div>

      {/* Training & Status */}
      <div className="space-y-2">
        <SectionHeading>Training &amp; Status</SectionHeading>
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-center gap-1.5">
            <Video className="h-3 w-3 shrink-0 text-gray-500" />
            <span className="font-semibold text-gray-600">Training Video:</span>
            <span className="font-bold text-gray-800">{videoCount > 0 ? `${videoCount} available` : "Not Available"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Presentation className="h-3 w-3 shrink-0 text-gray-500" />
            <span className="font-semibold text-gray-600">Slides &amp; Materials:</span>
            <span className="font-bold text-gray-800">{slideCount > 0 ? `${slideCount} available` : "Not Available"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 shrink-0 text-gray-500" />
            <span className="font-semibold text-gray-600">MCQ Bank:</span>
            <span className="font-bold text-gray-800">{sop.mcqCount > 0 ? `${sop.mcqCount} questions` : "Pending"}</span>
          </div>
          <div className="flex items-center gap-1.5 border-t border-gray-200 pt-1.5">
            <Calendar className="h-3 w-3 shrink-0 text-gray-500" />
            <span className="font-semibold text-gray-600">Expiry:</span>
            <span className="min-w-0 flex-1">{expiryNode}</span>
          </div>
          {effective && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0 text-gray-500" />
              <span className="font-semibold text-gray-600">Effective:</span>
              <span className="font-bold text-gray-800">{effective}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 shrink-0 text-gray-500" />
            <span className="font-semibold text-gray-600">Compliance:</span>
            <span className="font-bold text-gray-800">{sop.complianceScore}/10 ({sop.complianceStatus})</span>
          </div>

          {canMutate && (
            <div className="flex flex-col gap-1 pt-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="flex items-center justify-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Edit2 className="h-3 w-3" /> Edit SOP
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="flex items-center justify-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" /> Mark Obsolete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Files cell: ENG row + GUJ row ──────────────────────────────────── */
function FilesCell({ sop }: { sop: RegistrySOP }) {
  const isDual = sop.language === "ENG-GUJ";
  const hasGu = Boolean(sop.files.docx.gu || sop.files.pdf.gu) || isDual;

  const renderLangRow = (
    langLabel: string,
    docxPath: string | undefined,
    pdfPath: string | undefined,
  ) => (
    <div className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)_2px_minmax(0,1fr)] items-center gap-x-0.5 text-left leading-none min-h-[10px]">
      <span className="text-[8px] font-bold text-gray-500">{langLabel}</span>
      {docxPath ? (
        <FileLink filePath={docxPath} label="DOCX" />
      ) : (
        <span className="truncate text-[8px] font-bold leading-none text-red-600" title="DOCX missing">DOCX&nbsp;✗</span>
      )}
      <div className="flex justify-center text-gray-300 text-[9px] select-none">
        {docxPath && pdfPath ? "·" : ""}
      </div>
      {pdfPath ? (
        <FileLink filePath={pdfPath} label="PDF" isPdf />
      ) : (
        <span className="truncate text-[8px] font-bold leading-none text-red-600" title="PDF missing">PDF&nbsp;✗</span>
      )}
    </div>
  );

  if (!hasGu) {
    return (
      <div className="mx-auto flex w-full min-w-0 flex-col gap-px text-left leading-none">
        {renderLangRow("ENG", sop.files.docx.en, sop.files.pdf.en)}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-px text-left leading-none">
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
      <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
        <button
          type="button"
          className="min-w-0 truncate font-bold text-[9px] text-green-600 hover:underline cursor-pointer"
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
      <div className="flex min-w-0 flex-row items-start gap-x-1 leading-none">
        <span className="w-[18px] shrink-0 text-[8px] font-bold uppercase leading-none text-gray-400">{subLabel}</span>
        <div className="flex min-w-0 flex-1 flex-row flex-wrap gap-x-1 gap-y-0.5 items-center">
          {pvs.map((pv) =>
            pv.missing ? (
              <div
                key={`${pv.version}-${pv.language}`}
                className="flex min-w-0 max-w-full flex-row items-center gap-0.5"
                title={`Version ${pv.version} was never uploaded`}
              >
                <span className="shrink-0 text-[9px] font-bold leading-none text-gray-400 line-through">V{pv.version}</span>
                <span className="truncate text-[8px] font-semibold italic leading-none text-amber-600">not found</span>
              </div>
            ) : (
              <div key={`${pv.version}-${pv.language}`} className="flex min-w-0 max-w-full flex-row items-center gap-0.5">
                <span className="shrink-0 text-[9px] font-bold leading-none text-green-700">V{pv.version}</span>
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
      <div className="flex min-w-0 flex-col gap-px py-0 leading-none">
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
    <span className="block truncate text-[8px] font-semibold italic leading-none text-amber-600" title="no video found">no video found</span>
  );

  if (!isDual) {
    return totalCount > 0 ? (
      <span className="text-[10px] font-bold tabular-nums text-emerald-700">{totalCount}</span>
    ) : (
      notFound
    );
  }

  const renderLangRow = (langLabel: string, count: number) => (
    <div className="flex min-w-0 items-center gap-1 text-left leading-none min-h-[10px]">
      <span className="w-[20px] shrink-0 text-[8px] font-bold text-gray-500">{langLabel}</span>
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
    <div className="flex w-full min-w-0 flex-col gap-px text-left leading-none">
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
    <span className="block truncate text-[8px] font-semibold italic leading-none text-amber-600" title="no slides found">no slides found</span>
  );

  if (!isDual) {
    return totalCount > 0 ? (
      <span className="text-[10px] font-bold tabular-nums text-indigo-700">{totalCount}</span>
    ) : (
      notFound
    );
  }

  const renderLangRow = (langLabel: string, count: number) => (
    <div className="flex min-w-0 items-center gap-1 text-left leading-none min-h-[10px]">
      <span className="w-[20px] shrink-0 text-[8px] font-bold text-gray-500">{langLabel}</span>
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

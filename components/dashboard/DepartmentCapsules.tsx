"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { BarChart2, ChevronDown, FileText, Pencil, Plus, Presentation, Trash2, Video, X } from "lucide-react";
import type { DepartmentCapsule } from "@/lib/types";
import { useDashboardStore } from "@/lib/store/dashboard-store";

// Password required to confirm a department deletion.
const DELETE_PASSWORD = "indiana132";

function emptyDepartmentCapsule(name: string): DepartmentCapsule {
  const zero = { found: 0, missing: 0 };
  const zeroLang = { found: 0, missing: 0, en: { found: 0, missing: 0 }, gu: { found: 0, missing: 0 } };
  return {
    department: name,
    total: 0, dualLanguage: 0, withEn: 0, withGu: 0,
    expired: 0, nearExpiry: 0, active: 0, noDate: 0,
    docx: zeroLang, pdf: zeroLang,
    version: {
      found: 0, missing: 0,
      docx: { en: { found: 0, missing: 0 }, gu: { found: 0, missing: 0 } },
      pdf: { en: { found: 0, missing: 0 }, gu: { found: 0, missing: 0 } },
    },
    versionDate: zeroLang,
    annexures: zero,
    videos: { available: 0, required: 0, missing: 0, en: { available: 0, missing: 0 }, gu: { available: 0, missing: 0 } },
    explainerVideos: zero, briefVideos: zero,
    slides: { available: 0, required: 0, missing: 0, en: { available: 0, missing: 0 }, gu: { available: 0, missing: 0 } },
  };
}

function DepartmentManagerModal({
  onClose,
  onAdd,
  onDelete,
  onRename,
  departments,
}: {
  onClose: () => void;
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  departments: DepartmentCapsule[];
}) {
  const [tab, setTab] = useState<"add" | "edit" | "delete">("add");

  // ── Add tab state ──
  const [name, setName] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Delete tab state ──
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Open/close a department's confirm row, resetting the password + error.
  const startConfirm = (dept: string | null) => {
    setConfirmDelete(dept);
    setDeletePassword("");
    setDeleteError("");
  };

  // ── Edit tab state ──
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (tab === "add") inputRef.current?.focus();
  }, [tab]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setAddError("Department name is required."); return; }
    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed to add department."); return; }
      onAdd(trimmed);
      onClose();
    } catch {
      setAddError("Network error. Please try again.");
    } finally {
      setAddLoading(false);
    }
  };

  const deletableDepts = departments.filter((d) => d.department !== "Total");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-gray-800">Manage Departments</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            type="button"
            onClick={() => setTab("add")}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              tab === "add"
                ? "border-b-2 border-purple-600 text-purple-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Plus className="h-3 w-3" /> Add
          </button>
          <button
            type="button"
            onClick={() => { setTab("edit"); setEditingDept(null); setEditError(""); }}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              tab === "edit"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setTab("delete")}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              tab === "delete"
                ? "border-b-2 border-red-500 text-red-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>

        <div className="p-5">
          {/* ── Add tab ── */}
          {tab === "add" && (
            <form onSubmit={handleAdd}>
              <p className="mb-3 text-xs text-gray-500">The new department will appear on the dashboard immediately.</p>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Department Name</label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setAddError(""); }}
                placeholder="e.g. R&D, Logistics, HR..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              {addError && <p className="mt-1.5 text-xs text-red-600">{addError}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex items-center gap-1 rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" />
                  {addLoading ? "Adding…" : "Add Department"}
                </button>
              </div>
            </form>
          )}

          {/* ── Edit tab ── */}
          {tab === "edit" && (
            <div>
              <p className="mb-3 text-xs text-gray-500">
                Select a department to rename it. All SOPs in that department will be updated.
              </p>
              {deletableDepts.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">No departments to show.</p>
              ) : (
                <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                  {deletableDepts.map((dept) => {
                    const isEditing = editingDept === dept.department;
                    return (
                      <li key={dept.department} className="px-3 py-2">
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={editName}
                              onChange={(e) => { setEditName(e.target.value); setEditError(""); }}
                              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              placeholder="New department name…"
                            />
                            {editError && <p className="text-[10px] text-red-600">{editError}</p>}
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => { setEditingDept(null); setEditError(""); }}
                                className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={editLoading}
                                onClick={async () => {
                                  const trimmed = editName.trim();
                                  if (!trimmed) { setEditError("Name is required."); return; }
                                  if (trimmed === dept.department) { setEditError("Name is unchanged."); return; }
                                  setEditLoading(true);
                                  setEditError("");
                                  try {
                                    const res = await fetch("/api/departments", {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ oldName: dept.department, newName: trimmed }),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) { setEditError(data.error ?? "Failed to rename."); return; }
                                    onRename(dept.department, trimmed);
                                    setEditingDept(null);
                                  } catch {
                                    setEditError("Network error. Please try again.");
                                  } finally {
                                    setEditLoading(false);
                                  }
                                }}
                                className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                              >
                                {editLoading ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium text-gray-800">{dept.department}</span>
                            <button
                              type="button"
                              onClick={() => { setEditingDept(dept.department); setEditName(dept.department); setEditError(""); }}
                              className="shrink-0 rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                              title={`Rename ${dept.department}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          )}

          {/* ── Delete tab ── */}
          {tab === "delete" && (
            <div>
              <p className="mb-3 text-xs text-gray-500">
                Only departments with no SOPs can be removed. Departments with SOPs must have their SOPs deleted first.
              </p>
              {deletableDepts.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">No departments to show.</p>
              ) : (
                <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                  {deletableDepts.map((dept) => {
                    const isEmpty = dept.total === 0;
                    const isConfirming = confirmDelete === dept.department;
                    return (
                      <li key={dept.department} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-gray-800">{dept.department}</span>
                          <span className={`text-[10px] ${isEmpty ? "text-gray-400" : "text-amber-600"}`}>
                            {isEmpty ? "No SOPs" : `${dept.total} SOP${dept.total !== 1 ? "s" : ""}`}
                          </span>
                        </div>
                        {isEmpty ? (
                          isConfirming ? (
                            <form
                              className="flex shrink-0 items-center gap-1"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (deleting) return;
                                if (deletePassword !== DELETE_PASSWORD) {
                                  setDeleteError("Incorrect password.");
                                  return;
                                }
                                setDeleteError("");
                                setDeleting(true);
                                try {
                                  const res = await fetch("/api/departments", {
                                    method: "DELETE",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: dept.department, password: deletePassword }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) { setDeleteError(data.error ?? "Failed to delete."); return; }
                                } catch {
                                  setDeleteError("Network error. Please try again.");
                                  return;
                                } finally {
                                  setDeleting(false);
                                }
                                onDelete(dept.department);
                                startConfirm(null);
                              }}
                            >
                              <input
                                type="password"
                                autoFocus
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                placeholder="Password"
                                aria-label={`Password to delete ${dept.department}`}
                                className="w-24 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] focus:border-red-400 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => startConfirm(null)}
                                className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={deleting}
                                className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {deleting ? "Deleting…" : "Confirm"}
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startConfirm(dept.department)}
                              className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              title={`Delete ${dept.department}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )
                        ) : (
                          <span className="shrink-0 rounded p-1 text-gray-300" title="Cannot delete: department has SOPs">
                            <Trash2 className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {deleteError && <p className="mt-2 text-xs text-red-600">{deleteError}</p>}
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DepartmentCapsulesProps {
  capsules: DepartmentCapsule[];
  onDepartmentAdded?: (name: string) => void;
  onDepartmentDeleted?: (name: string) => void;
  onDepartmentRenamed?: (oldName: string, newName: string) => void;
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
    <div className="grid min-h-6.5 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[5px] border border-transparent px-1 py-px text-[10px]">
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
    <div className="flex min-h-5.5 w-full flex-nowrap items-center justify-between gap-x-1 gap-y-0.5 px-1 py-0 text-[9px]">
      {pair(l1, f1, m1, onF1, onM1)}
      {pair(l2, f2, m2, onF2, onM2)}
    </div>
  );
}

/* ─── Format-labelled lang pair sub-row (DOCX/PDF + EN/GJ pills) ──────── */
function FormatLangPairRow({
  formatLabel, l1, f1, m1, l2, f2, m2,
  onF1, onM1, onF2, onM2,
}: {
  formatLabel: string;
  l1: string; f1: number; m1: number;
  l2: string; f2: number; m2: number;
  onF1?: () => void; onM1?: () => void;
  onF2?: () => void; onM2?: () => void;
}) {
  return (
    <div className="mt-0.5 flex min-h-5 w-full items-center gap-1 px-1 py-0 text-[9px]">
      <span className="inline-block w-6 shrink-0 font-medium text-gray-400">{formatLabel}</span>
      <div className="min-w-0 flex-1">
        <LangPairPills l1={l1} f1={f1} m1={m1} l2={l2} f2={f2} m2={m2}
          onF1={onF1} onM1={onM1} onF2={onF2} onM2={onM2} />
      </div>
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

/* ─── Individual department card (memoized to prevent unnecessary re-renders) ── */
const DepartmentCard = memo(function DepartmentCard({
  cap,
  applyFilter,
  isSelected,
}: {
  cap: DepartmentCapsule;
  applyFilter: (department: string, patch?: Record<string, string | boolean | undefined>) => void;
  isSelected: boolean;
}) {
  const isTotal = cap.department === "Total";
  const dept = cap.department;
  const f = (patch?: Record<string, string | boolean | undefined>) => applyFilter(dept, patch);

  return (
    <div className={`flex w-full min-w-0 flex-col rounded-[10px] border px-2 py-1.5 text-left shadow-sm ${
      isTotal ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
    }`}>
      {/* Card header */}
      <div
        role={isTotal ? undefined : "button"}
        tabIndex={isTotal ? -1 : 0}
        onClick={() => !isTotal && f()}
        onKeyDown={(e) => {
          if (isTotal) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); }
        }}
        className={`mb-2 flex min-h-10 w-full items-start gap-1.5 rounded-md border-b pb-2 ${
          isTotal
            ? "cursor-default border-purple-200"
            : `cursor-pointer border-gray-100 hover:bg-purple-50/80 focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                isSelected ? "border-purple-300 bg-purple-100/70 ring-1 ring-purple-300" : ""
              }`
        }`}
        title={isTotal ? "Totals across all departments" : `Show all ${dept} SOPs`}
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
        <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight text-gray-800 wrap-break-word">
          {dept}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-0 border-t border-transparent pt-0.5">

        <MetricRow
          label="SOPs" value={cap.total}
          onClick={() => f()}
          isActive={isSelected}
        />
        <MetricRow label="Dual" value={cap.dualLanguage} onClick={() => f({ language: "ENG-GUJ" })} />
        <MetricRow label="w/ EN" value={cap.withEn ?? cap.total} onClick={() => f({ language: "ENG" })} />
        <MetricRow label="w/ GU" value={cap.withGu ?? cap.dualLanguage} onClick={() => f({ language: "GUJ" })} />

        {/* Expiry row: 3 compact columns */}
        <div className="flex w-full gap-0.5">
          <div className="min-w-0 flex-1">
            <MetricRow label="Expir." value={cap.expired}
              valueClass={cap.expired > 0 ? "text-red-600" : "text-gray-700"}
              onClick={() => f({ expiry: "Expired" })} />
          </div>
          <div className="min-w-0 flex-1">
            <MetricRow label="Near" value={cap.nearExpiry}
              valueClass={cap.nearExpiry > 0 ? "text-amber-600" : "text-gray-700"}
              onClick={() => f({ expiry: "Near" })} />
          </div>
          <div className="min-w-0 flex-1">
            <MetricRow label="No Dt" value={cap.noDate}
              onClick={() => f({ expiry: "No Date" })} />
          </div>
        </div>

        {/* DOCX */}
        <MetricAvailMiss
          label="DOCX"
          available={cap.docx.found}
          missing={cap.docx.missing}
          onLabelClick={() => f({ fileType: "DOCX" })}
          onAvailableClick={() => f({ fileType: "DOCX" })}
          onMissingClick={() => f({ fileType: "No DOCX" })}
        />
        <LangPairPills
          l1="EN" f1={cap.docx.en.found} m1={cap.docx.en.missing}
          l2="GJ" f2={cap.docx.gu.found} m2={cap.docx.gu.missing}
          onF1={() => f({ fileType: "EN DOCX" })}
          onM1={() => f({ fileType: "No EN DOCX" })}
          onF2={() => f({ fileType: "GJ DOCX" })}
          onM2={() => f({ fileType: "No GJ DOCX" })}
        />

        {/* PDF */}
        <MetricAvailMiss
          label="PDF"
          available={cap.pdf.found}
          missing={cap.pdf.missing}
          onLabelClick={() => f({ fileType: "PDF" })}
          onAvailableClick={() => f({ fileType: "PDF" })}
          onMissingClick={() => f({ fileType: "No PDF" })}
        />
        <LangPairPills
          l1="EN" f1={cap.pdf.en.found} m1={cap.pdf.en.missing}
          l2="GJ" f2={cap.pdf.gu.found} m2={cap.pdf.gu.missing}
          onF1={() => f({ fileType: "EN PDF" })}
          onM1={() => f({ fileType: "No EN PDF" })}
          onF2={() => f({ fileType: "GJ PDF" })}
          onM2={() => f({ fileType: "No GJ PDF" })}
        />

        {/* Versions */}
        <div className="h-1" />
        <VersionPairRow
          label="Versions"
          found={cap.version.found} missing={cap.version.missing}
          onLabelClick={() => f({ versionStatus: "missing" })}
          onFoundClick={() => f({ versionStatus: "found" })}
          onMissingClick={() => f({ versionStatus: "missing" })}
        />
        <FormatLangPairRow
          formatLabel="DOCX"
          l1="EN" f1={cap.version.docx?.en?.found ?? 0} m1={cap.version.docx?.en?.missing ?? 0}
          l2="GJ" f2={cap.version.docx?.gu?.found ?? 0} m2={cap.version.docx?.gu?.missing ?? 0}
          onF1={() => f({ versionStatus: "found", language: "ENG" })}
          onM1={() => f({ versionStatus: "missing", language: "ENG" })}
          onF2={() => f({ versionStatus: "found", language: "GUJ" })}
          onM2={() => f({ versionStatus: "missing", language: "GUJ" })}
        />
        <FormatLangPairRow
          formatLabel="PDF"
          l1="EN" f1={cap.version.pdf?.en?.found ?? 0} m1={cap.version.pdf?.en?.missing ?? 0}
          l2="GJ" f2={cap.version.pdf?.gu?.found ?? 0} m2={cap.version.pdf?.gu?.missing ?? 0}
          onF1={() => f({ versionStatus: "found", language: "ENG" })}
          onM1={() => f({ versionStatus: "missing", language: "ENG" })}
          onF2={() => f({ versionStatus: "found", language: "GUJ" })}
          onM2={() => f({ versionStatus: "missing", language: "GUJ" })}
        />

        {/* Version Dates */}
        <div className="h-1" />
        <VersionPairRow
          label="Version Dates"
          found={cap.versionDate.found} missing={cap.versionDate.missing}
          onLabelClick={() => f({ versionDate: "missing" })}
          onFoundClick={() => f({ versionDate: "found" })}
          onMissingClick={() => f({ versionDate: "missing" })}
        />
        <FormatLangPairRow
          formatLabel="DOCX"
          l1="EN" f1={cap.versionDate.en?.found ?? 0} m1={cap.versionDate.en?.missing ?? 0}
          l2="GJ" f2={cap.versionDate.gu?.found ?? 0} m2={cap.versionDate.gu?.missing ?? 0}
          onF1={() => f({ versionDate: "found", language: "ENG" })}
          onM1={() => f({ versionDate: "missing", language: "ENG" })}
          onF2={() => f({ versionDate: "found", language: "GUJ" })}
          onM2={() => f({ versionDate: "missing", language: "GUJ" })}
        />

        {/* Annexures */}
        <div className="h-1" />
        <VersionPairRow
          label="Annexures"
          found={cap.annexures.found}
          missing={cap.annexures.missing}
          onLabelClick={() => f({ annexureStatus: "missing" })}
          onFoundClick={() => f({ annexureStatus: "found" })}
          onMissingClick={() => f({ annexureStatus: "missing" })}
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
          onLabelClick={() => f({ media: "Video" })}
          onAvailableClick={() => f({ media: "Video" })}
          onMissingClick={() => f({ media: "No Video" })}
        />
        <LangPairPills
          l1="ENG" f1={cap.videos.en?.available ?? 0} m1={cap.videos.en?.missing ?? 0}
          l2="GUJ" f2={cap.videos.gu?.available ?? 0} m2={cap.videos.gu?.missing ?? 0}
          onF1={() => f({ media: "Video", language: "ENG" })}
          onM1={() => f({ media: "No Video", language: "ENG" })}
          onF2={() => f({ media: "Video", language: "GUJ" })}
          onM2={() => f({ media: "No Video", language: "GUJ" })}
        />
        {/* Explainer (EX) + Brief (BR) side by side — clickable */}
        <div className="flex min-h-5.5 w-full items-center justify-between gap-1 px-1 py-0 text-[9px]">
          {(["EX", "BR"] as const).map((tag) => {
            const isEx = tag === "EX";
            const counts = isEx ? cap.explainerVideos : cap.briefVideos;
            const foundFilter = isEx ? "Explainer" : "Brief";
            const missingFilter = isEx ? "No Explainer" : "No Brief";
            return (
              <div key={tag} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); f({ videoType: foundFilter }); }}
                  className="min-w-fit cursor-pointer rounded px-0.5 text-[9px] font-medium text-gray-500 hover:text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  title={`Show SOPs with ${isEx ? "Explainer" : "Brief"} video`}
                >
                  {tag}
                </button>
                <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200/80 bg-white/90 px-0.5 py-0.5 shadow-sm tabular-nums">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); f({ videoType: foundFilter }); }}
                    className="min-w-[1.3rem] cursor-pointer rounded px-0.5 py-0 text-center text-[10px] font-bold leading-tight text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    title={`${counts?.found ?? 0} SOPs have ${isEx ? "Explainer" : "Brief"} video`}
                  >
                    {counts?.found ?? 0}
                  </button>
                  <span className="select-none text-[7px] leading-tight text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); f({ videoType: missingFilter }); }}
                    className="min-w-[1.3rem] cursor-pointer rounded px-0.5 py-0 text-center text-[10px] font-bold leading-tight text-red-600 hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400"
                    title={`${counts?.missing ?? 0} SOPs missing ${isEx ? "Explainer" : "Brief"} video`}
                  >
                    {counts?.missing ?? 0}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

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
          onLabelClick={() => f({ media: "Slides" })}
          onAvailableClick={() => f({ media: "Slides" })}
          onMissingClick={() => f({ media: "No Slides" })}
        />
        <LangPairPills
          l1="ENG" f1={cap.slides.en?.available ?? 0} m1={cap.slides.en?.missing ?? 0}
          l2="GUJ" f2={cap.slides.gu?.available ?? 0} m2={cap.slides.gu?.missing ?? 0}
          onF1={() => f({ media: "Slides", language: "ENG" })}
          onM1={() => f({ media: "No Slides", language: "ENG" })}
          onF2={() => f({ media: "Slides", language: "GUJ" })}
          onM2={() => f({ media: "No Slides", language: "GUJ" })}
        />
      </div>
    </div>
  );
});

/* ─── Main export ────────────────────────────────────────────────────── */
export function DepartmentCapsules({ capsules, onDepartmentAdded, onDepartmentDeleted, onDepartmentRenamed }: DepartmentCapsulesProps) {
  const { setFilter, filters } = useDashboardStore();
  const [sectionOpen, setSectionOpen] = useState(true);
  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [extraCapsules, setExtraCapsules] = useState<DepartmentCapsule[]>([]);

  const allCapsules = useMemo(() => [
    ...capsules,
    ...extraCapsules.filter((ec) => !capsules.some((c) => c.department === ec.department)),
  ], [capsules, extraCapsules]);

  const handleAddDepartment = useCallback((name: string) => {
    setExtraCapsules((prev) =>
      prev.some((c) => c.department === name) ? prev : [...prev, emptyDepartmentCapsule(name)]
    );
    onDepartmentAdded?.(name);
  }, [onDepartmentAdded]);

  const handleDeleteDepartment = useCallback((name: string) => {
    setExtraCapsules((prev) => prev.filter((c) => c.department !== name));
    onDepartmentDeleted?.(name);
  }, [onDepartmentDeleted]);

  const handleRenameDepartment = useCallback((oldName: string, newName: string) => {
    setExtraCapsules((prev) =>
      prev.map((c) => c.department === oldName ? { ...c, department: newName } : c)
    );
    onDepartmentRenamed?.(oldName, newName);
  }, [onDepartmentRenamed]);

  const deptCount = useMemo(
    () => allCapsules.filter((c) => c.department !== "Total").length,
    [allCapsules],
  );

  const activeDept = filters.department;

  const applyFilter = useCallback((department: string, patch: Record<string, string | boolean | undefined> = {}) => {
    setFilter({
      language: undefined,
      expiry: undefined,
      fileType: undefined,
      media: undefined,
      videoType: undefined,
      versionStatus: undefined,
      versionDate: undefined,
      annexureStatus: undefined,
      dualLanguage: undefined,
      search: undefined,
      locations: [],
      versions: [],
      dateFrom: undefined,
      dateTo: undefined,
      absoluteSop: undefined,
      department: department === "Total" ? undefined : department,
      ...patch,
    });
    document.getElementById("sop-registry")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setFilter]);

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

      {/* Cards — single horizontal scrolling row */}
      {sectionOpen && (
        <div className="border-t border-gray-100 bg-gray-50 px-1 py-2 sm:px-2">
          <div
            className="flex gap-3 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#d1d5db transparent" }}
          >
            {allCapsules.map((cap) => (
              <div key={cap.department} className="min-w-42.5 flex-1">
                <DepartmentCard
                  cap={cap}
                  isSelected={
                    cap.department === "Total"
                      ? !activeDept
                      : activeDept === cap.department
                  }
                  applyFilter={applyFilter}
                />
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setAddDeptOpen(true)}
              className="flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 hover:border-purple-400 hover:text-purple-600"
            >
              <Plus className="h-3 w-3" /> Add / Delete Department
            </button>
          </div>
          {addDeptOpen && (
            <DepartmentManagerModal
              onClose={() => setAddDeptOpen(false)}
              onAdd={handleAddDepartment}
              onDelete={handleDeleteDepartment}
              onRename={handleRenameDepartment}
              departments={allCapsules}
            />
          )}
        </div>
      )}
    </section>
  );
}

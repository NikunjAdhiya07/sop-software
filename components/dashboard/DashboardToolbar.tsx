"use client";

import { useState } from "react";
import {
  Archive,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CloudUpload,
  FileUp,
  FolderUp,
  Languages,
  MapPin,
  Plus,
  Upload,
  Video,
  Wrench,
} from "lucide-react";
import type { DashboardStats } from "@/lib/types";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { ConfirmDialog } from "./ConfirmDialog";
import { Btn } from "./ui";

interface DashboardToolbarProps {
  stats: DashboardStats | null;
  onRefresh: () => void;
  onExport: () => void;
  canMutate: boolean;
  isAdmin: boolean;
}

export function DashboardToolbar({
  stats,
  onRefresh,
  canMutate,
  isAdmin,
}: DashboardToolbarProps) {
  const {
    toggleGuidelines,
    setUploadModalOpen,
    setPdfUploadOpen,
    setFolderUploadOpen,
    setGujaratiUploadOpen,
    setLocationUploadOpen,
    setBunnyMigrateOpen,
    setVideoUploadOpen,
    setAdminOpen,
    setFilter,
    filters,
    showToast,
  } = useDashboardStore();
  const [clearPriorOpen, setClearPriorOpen] = useState(false);
  const [clearingPrior, setClearingPrior] = useState(false);

  const handleClearPriorVersions = async () => {
    setClearingPrior(true);
    try {
      const res = await fetch("/api/admin/clear-prior-versions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Clear failed");
      showToast(
        `Removed ${data.deleted} prior version record(s). ${data.kept} current file(s) kept across ${data.familiesCleared} SOP(s).`,
      );
      setClearPriorOpen(false);
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setClearingPrior(false);
    }
  };

  return (
    <div className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-1.5 px-4 py-2">

        {/* Guidelines */}
        <Btn size="sm" onClick={toggleGuidelines}>
          <BookOpen className="h-3 w-3" /> Guidelines
        </Btn>

        {/* Show charts */}
        <Btn size="sm">
          <BarChart3 className="h-3 w-3" /> Show charts
        </Btn>

        {/* Prior Ver. Archive – amber with count; admin can clear incorrect mappings */}
        <Btn
          size="sm"
          className="border-amber-400 bg-amber-400 text-amber-950 hover:bg-amber-500"
          onClick={isAdmin ? () => setClearPriorOpen(true) : undefined}
          title={
            isAdmin
              ? "Clear all prior version file records (keeps current Files column)"
              : undefined
          }
        >
          <Archive className="h-3 w-3" />
          Prior Ver. Archive
          <span className="ml-0.5 rounded bg-amber-950/20 px-1.5 py-px text-[10px] font-bold leading-none">
            {stats?.priorVersionCount ?? 0}
          </span>
        </Btn>

        <ConfirmDialog
          open={clearPriorOpen}
          title="Clear all prior version files?"
          message="This removes every historical version file record from the database. Current SOP files in the Files column, names, departments, and other master data are kept. You can re-upload version folders afterward to rebuild correct Prior Versions mappings."
          confirmLabel="Clear prior versions"
          loading={clearingPrior}
          onConfirm={handleClearPriorVersions}
          onCancel={() => !clearingPrior && setClearPriorOpen(false)}
        />

        {canMutate && (
          <>
            <Btn size="sm" onClick={() => setFolderUploadOpen(true)}>
              <Upload className="h-3 w-3" /> Version Fetch Upload
            </Btn>
            <Btn size="sm" onClick={() => setVideoUploadOpen(true)}>
              <Video className="h-3 w-3" /> Upload Videos &amp; Slides
            </Btn>

            {/* BULK separator */}
            <span className="px-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              BULK
            </span>

            {/* Bulk Uploads dropdown */}
            <div className="group relative">
              <Btn size="sm">
                <FolderUp className="h-3 w-3" /> Bulk Uploads{" "}
                <ChevronDown className="h-3 w-3" />
              </Btn>

              <div className="absolute left-0 top-full z-30 hidden w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-xl group-hover:block">
                {/* Upload SOPs */}
                <DropdownItem
                  icon={<FileUp className="h-3.5 w-3.5 text-orange-500" />}
                  label="Upload SOPs"
                  onClick={() => setFolderUploadOpen(true)}
                />
                <DropdownItem
                  icon={<Languages className="h-3.5 w-3.5 text-orange-500" />}
                  label="Gujarati folders"
                  onClick={() => setGujaratiUploadOpen(true)}
                />
                <DropdownItem
                  icon={<Upload className="h-3.5 w-3.5 text-orange-500" />}
                  label="Upload PDFs"
                  onClick={() => setPdfUploadOpen(true)}
                />
                <DropdownItem
                  icon={<Video className="h-3.5 w-3.5 text-orange-500" />}
                  label="Upload Videos & Slides"
                  onClick={() => setVideoUploadOpen(true)}
                />
                <DropdownItem
                  icon={<MapPin className="h-3.5 w-3.5 text-orange-500" />}
                  label="Upload locations"
                  onClick={() => setLocationUploadOpen(true)}
                />
                <DropdownItem
                  icon={<CloudUpload className="h-3.5 w-3.5 text-orange-500" />}
                  label="Migrate to Bunny"
                  onClick={() => setBunnyMigrateOpen(true)}
                />
              </div>
            </div>
          </>
        )}

        {/* Training Matrix – green filled */}
        <Btn
          size="sm"
          className="border-green-600 bg-green-600 text-white hover:bg-green-700"
        >
          <BarChart3 className="h-3 w-3" /> Training Matrix
        </Btn>

        {/* SOP Scheduler – green filled */}
        <Btn
          size="sm"
          className="border-green-600 bg-green-600 text-white hover:bg-green-700"
        >
          <CalendarDays className="h-3 w-3" /> SOP Scheduler
        </Btn>

        {canMutate && (
          <>
            {/* SINGLE separator */}
            <span className="px-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              SINGLE
            </span>

            {/* Obsolete SOPs – red filled */}
            <Btn
              size="sm"
              className="border-red-500 bg-red-500 text-white hover:bg-red-600"
              onClick={() => setFilter({ obsoleteOnly: !filters.obsoleteOnly })}
            >
              Obsolete SOPs
            </Btn>

            {/* SOP Upload – green outlined */}
            <Btn
              size="sm"
              className="border-green-600 text-green-700 hover:bg-green-50"
              onClick={() => setUploadModalOpen(true)}
            >
              <Plus className="h-3 w-3" /> SOP Upload
            </Btn>
          </>
        )}

        {/* MCQ Bank – dark navy filled */}
        <Btn
          size="sm"
          className="border-slate-800 bg-slate-800 text-white hover:bg-slate-900"
        >
          <BarChart3 className="h-3 w-3" /> MCQ Bank
        </Btn>

        {/* Admin Tools – admin only (includes Fix SOP Names backfill) */}
        {isAdmin && (
          <Btn
            size="sm"
            className="border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
            onClick={() => setAdminOpen(true)}
            title="Admin tools: fix SOP names, migrate files, delete versioned SOPs"
          >
            <Wrench className="h-3 w-3" /> Admin Tools
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ── Dropdown item ── */
function DropdownItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-700 hover:bg-sky-50"
    >
      {icon}
      {label}
    </button>
  );
}

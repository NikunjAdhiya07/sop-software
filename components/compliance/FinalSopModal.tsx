'use client';

import { useState, useMemo } from 'react';
import {
  X,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

export interface SopFix {
  originalText: string;
  replacementText: string;
  section: string;
  clauseNumber: string;
  clauseTitle: string;
}

interface FinalSopModalProps {
  isOpen: boolean;
  onClose: () => void;
  sopId?: string;
  sopIdentifier?: string;
  sopName?: string;
  department?: string;
  fixes: SopFix[];
}

interface SectionGroup {
  sectionKey: string;
  fixes: (SopFix & { index: number })[];
}

function groupBySection(fixes: SopFix[]): SectionGroup[] {
  const map = new Map<string, (SopFix & { index: number })[]>();
  fixes.forEach((fix, i) => {
    const key = fix.section?.trim() || 'General';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ ...fix, index: i });
  });
  return Array.from(map.entries()).map(([sectionKey, fixes]) => ({ sectionKey, fixes }));
}

function DiffBlock({ original, replacement }: { original: string; replacement: string }) {
  return (
    <div className="space-y-2">
      {/* Removed */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3">
        <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
          Remove
        </p>
        <p className="text-sm text-rose-800 leading-relaxed font-mono whitespace-pre-wrap line-through decoration-rose-400/70">
          {original || <span className="italic text-rose-400">No current text identified</span>}
        </p>
      </div>
      {/* Added */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Replace with
        </p>
        <p className="text-sm text-emerald-900 leading-relaxed font-mono whitespace-pre-wrap">
          {replacement}
        </p>
      </div>
    </div>
  );
}

function SectionCard({ group }: { group: SectionGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-purple-600 shrink-0" />
          <span className="text-sm font-bold text-gray-800">{group.sectionKey}</span>
          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black border border-purple-200">
            {group.fixes.length} change{group.fixes.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 py-4 space-y-5 divide-y divide-gray-100">
          {group.fixes.map((fix, i) => (
            <div key={i} className={i > 0 ? 'pt-5' : ''}>
              <div className="mb-3">
                <span className="inline-block px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[10px] font-black text-blue-700 uppercase tracking-wide mr-2">
                  § {fix.clauseNumber}
                </span>
                <span className="text-xs font-semibold text-gray-700">{fix.clauseTitle}</span>
              </div>
              <DiffBlock original={fix.originalText} replacement={fix.replacementText} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinalSopModal({
  isOpen,
  onClose,
  sopId,
  sopIdentifier,
  sopName,
  department,
  fixes,
}: FinalSopModalProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{ applied: number; skipped: number } | null>(null);

  const sections = useMemo(() => groupBySection(fixes), [fixes]);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (!sopId || !fixes.length) return;
    setExporting(true);
    setExportError(null);
    setExportResult(null);

    try {
      const res = await fetch('/api/compliance/final-sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sopId,
          fixes: fixes.map(f => ({
            originalText: f.originalText,
            replacementText: f.replacementText,
            clauseTitle: f.clauseTitle,
            section: f.section,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(data.error ?? 'Export failed.');
        return;
      }

      const applied = Number(res.headers.get('X-Applied-Count') ?? fixes.length);
      const skipped = Number(res.headers.get('X-Skipped-Count') ?? 0);
      setExportResult({ applied, skipped });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disp = res.headers.get('Content-Disposition') ?? '';
      const match = disp.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `FINAL_SOP_${sopIdentifier ?? 'SOP'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-50 border border-purple-200 shrink-0">
              <FileText className="h-5 w-5 text-purple-700" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                Final SOP — All Proposed Changes
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {sopIdentifier}{sopName ? ` — ${sopName}` : ''}{department ? ` · ${department}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="shrink-0 flex items-center gap-4 px-6 py-3 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="text-[11px] font-bold text-gray-700">Red = current text to be removed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-bold text-gray-700">Green = replacement text</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-purple-700">
            <Info className="h-3.5 w-3.5" />
            {fixes.length} fix{fixes.length !== 1 ? 'es' : ''} across {sections.length} section{sections.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Scrollable diff body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-gray-50">
          {sections.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No actionable fixes found in this report.</p>
            </div>
          ) : (
            sections.map((group) => (
              <SectionCard key={group.sectionKey} group={group} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            {/* Export result */}
            {exportResult && !exportError && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {exportResult.applied} fix{exportResult.applied !== 1 ? 'es' : ''} applied
                {exportResult.skipped > 0 && `, ${exportResult.skipped} skipped`}
              </div>
            )}
            {exportError && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 max-w-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {exportError}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exporting || !sopId || !fixes.length}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 shadow-md shadow-purple-200 transition-all"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exporting ? 'Generating DOCX…' : 'Export Final SOP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

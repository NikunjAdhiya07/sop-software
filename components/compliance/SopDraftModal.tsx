'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Download, Loader2, AlertTriangle, FileText } from 'lucide-react';

interface SopDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  sopId?: string;
  sopIdentifier?: string;
  sopName?: string;
  sectionAffected?: string;
  suggestedAction?: string;
  currentText?: string;
  proposedText?: string;
}

function highlightProposedText(container: HTMLElement, proposedText: string) {
  const needle = proposedText.replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase();
  if (!needle) return;

  // Query all leaf-ish text elements rendered by docx-preview
  const els = container.querySelectorAll<HTMLElement>('p, span');
  let scrollTarget: HTMLElement | null = null;

  els.forEach((el) => {
    if ((el.children?.length ?? 0) > 5) return; // skip container elements
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').toLowerCase();
    if (text.includes(needle)) {
      el.style.backgroundColor = 'rgba(253, 224, 71, 0.5)';
      el.style.outline = '2px solid #f59e0b';
      el.style.borderRadius = '2px';
      if (!scrollTarget) scrollTarget = el;
    }
  });

  if (scrollTarget) (scrollTarget as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export default function SopDraftModal({
  isOpen,
  onClose,
  sopId,
  sopIdentifier,
  sopName,
  sectionAffected,
  suggestedAction,
  currentText,
  proposedText,
}: SopDraftModalProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'rendering' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState('DRAFT_SOP.docx');
  const [patchApplied, setPatchApplied] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // Prevent stale renders after unmount / re-open
  const runIdRef = useRef(0);

  const fetchAndRender = useCallback(async () => {
    if (!sopId || !currentText || !proposedText) return;

    const runId = ++runIdRef.current;
    setStatus('loading');
    setErrorMsg(null);
    setDocxBlob(null);
    setPatchApplied(true);

    // ── 1. Fetch patched DOCX ──────────────────────────────────────────────
    let blob: Blob;
    let fname = `DRAFT_${sopIdentifier ?? 'SOP'}.docx`;
    try {
      const res = await fetch('/api/compliance/draft-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopId, originalText: currentText, replacementText: proposedText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      const disp = res.headers.get('Content-Disposition') ?? '';
      const m = disp.match(/filename="([^"]+)"/);
      if (m?.[1]) fname = m[1];
      const applied = res.headers.get('X-Patch-Applied') !== 'false';
      setPatchApplied(applied);
      blob = await res.blob();
    } catch (e: unknown) {
      if (runId !== runIdRef.current) return;
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load draft.');
      setStatus('error');
      return;
    }

    if (runId !== runIdRef.current) return;
    setFilename(fname);
    setDocxBlob(blob);
    setStatus('rendering');

    // ── 2. Wait one tick so the container becomes visible, then render ──────
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    if (runId !== runIdRef.current) return;

    const container = containerRef.current;
    if (!container) {
      setErrorMsg('Preview container not available.');
      setStatus('error');
      return;
    }

    // ── 3. Render with docx-preview ────────────────────────────────────────
    try {
      const { renderAsync } = await import('docx-preview');
      container.innerHTML = '';
      await renderAsync(blob, container, undefined, {
        className: 'docx',
        ignoreWidth: false,
        ignoreHeight: true,
        ignoreFonts: false,
        breakPages: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
      });
    } catch (e: unknown) {
      if (runId !== runIdRef.current) return;
      setErrorMsg(e instanceof Error ? e.message : 'Failed to render DOCX preview.');
      setStatus('error');
      return;
    }

    if (runId !== runIdRef.current) return;
    setStatus('done');

    // ── 4. Highlight the change ────────────────────────────────────────────
    if (proposedText) {
      setTimeout(() => {
        if (runId === runIdRef.current && containerRef.current) {
          highlightProposedText(containerRef.current, proposedText);
        }
      }, 100);
    }
  }, [sopId, currentText, proposedText, sopIdentifier]);

  // Trigger fetch+render every time the modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAndRender();
    } else {
      // Reset on close
      runIdRef.current++;
      setStatus('idle');
      setDocxBlob(null);
      setErrorMsg(null);
      if (containerRef.current) containerRef.current.innerHTML = '';
    }
  }, [isOpen, fetchAndRender]);

  const handleDownload = () => {
    if (!docxBlob) return;
    const url = URL.createObjectURL(docxBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const isLoading = status === 'loading' || status === 'rendering';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 shrink-0">
              <FileText className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">SOP Draft Preview</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {sopIdentifier}{sopName ? ` — ${sopName}` : ''}{sectionAffected ? ` · ${sectionAffected}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Suggested action pill */}
        {suggestedAction && (
          <div className="shrink-0 px-6 py-2 bg-amber-50 border-b border-amber-100 flex items-start gap-2">
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest whitespace-nowrap mt-0.5">Change:</span>
            <p className="text-xs text-gray-800">{suggestedAction}</p>
          </div>
        )}

        {/* Highlight legend — only when rendered and patch was applied */}
        {status === 'done' && patchApplied && (
          <div className="shrink-0 px-6 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded border-2 border-amber-400" style={{ background: 'rgba(253,224,71,0.5)' }} />
            <span className="text-[11px] font-semibold text-yellow-800">
              Yellow highlight = proposed change location in the document
            </span>
          </div>
        )}

        {/* Warning when original text couldn't be matched */}
        {status === 'done' && !patchApplied && (
          <div className="shrink-0 px-6 py-2 bg-orange-50 border-b border-orange-200 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <span className="text-[11px] font-semibold text-orange-800">
              Showing original SOP — the exact source text couldn't be located in the document. Apply the proposed change manually in the section shown above.
            </span>
          </div>
        )}

        {/* Preview body — always rendered, overlays handle loading/error */}
        <div className="flex-1 overflow-y-auto bg-gray-300 relative">

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-100/90">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm font-semibold text-gray-600">
                {status === 'loading' ? 'Generating draft document…' : 'Rendering document…'}
              </p>
            </div>
          )}

          {/* Error overlay */}
          {status === 'error' && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-8 bg-gray-50">
              <AlertTriangle className="h-8 w-8 text-rose-400" />
              <p className="text-sm text-rose-700 text-center max-w-sm font-medium">{errorMsg}</p>
              <button
                onClick={fetchAndRender}
                className="mt-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          )}

          {/* docx-preview renders here — always in DOM so ref is always valid */}
          <div ref={containerRef} className="min-h-full" />
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={handleDownload}
            disabled={!docxBlob || isLoading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shadow-md shadow-blue-200 transition-all"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isLoading ? 'Loading…' : 'Download Draft DOCX'}
          </button>
        </div>
      </div>
    </div>
  );
}

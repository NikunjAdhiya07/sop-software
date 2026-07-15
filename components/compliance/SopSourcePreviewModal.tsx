'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, AlertTriangle, FileText } from 'lucide-react';
import { buildDocxDownloadHref } from '@/lib/viewDocLinks';

interface SopSourcePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sopIdentifier: string;
  sopName?: string;
  language?: string;
}

function parseFilename(cd: string | null, fallback: string): string {
  if (!cd) return fallback;
  const quoted = cd.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  return fallback;
}

export default function SopSourcePreviewModal({
  isOpen,
  onClose,
  sopIdentifier,
  sopName,
  language = 'English',
}: SopSourcePreviewModalProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'rendering' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState(`${sopIdentifier}.docx`);
  const containerRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef(0);

  const fetchAndRender = useCallback(async () => {
    if (!sopIdentifier.trim()) return;

    const runId = ++runIdRef.current;
    setStatus('loading');
    setErrorMsg(null);
    setDocxBlob(null);

    let blob: Blob;
    let fname = `${sopIdentifier}.docx`;
    try {
      const params = new URLSearchParams({ word: '1', identifier: sopIdentifier.trim() });
      if (language) params.set('language', language);
      const res = await fetch(`/api/files/download?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Could not load SOP (${res.status})`);
      }
      fname = parseFilename(res.headers.get('Content-Disposition'), fname);
      blob = await res.blob();
    } catch (e: unknown) {
      if (runId !== runIdRef.current) return;
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load SOP document.');
      setStatus('error');
      return;
    }

    if (runId !== runIdRef.current) return;
    setFilename(fname);
    setDocxBlob(blob);
    setStatus('rendering');

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    if (runId !== runIdRef.current) return;

    const container = containerRef.current;
    if (!container) {
      setErrorMsg('Preview container not available.');
      setStatus('error');
      return;
    }

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
      setErrorMsg(e instanceof Error ? e.message : 'Failed to render document preview.');
      setStatus('error');
      return;
    }

    if (runId !== runIdRef.current) return;
    setStatus('done');
  }, [sopIdentifier, language]);

  useEffect(() => {
    if (isOpen) {
      void fetchAndRender();
    } else {
      runIdRef.current++;
      setStatus('idle');
      setDocxBlob(null);
      setErrorMsg(null);
      if (containerRef.current) containerRef.current.innerHTML = '';
    }
  }, [isOpen, fetchAndRender]);

  const handleDownload = () => {
    if (docxBlob) {
      const url = URL.createObjectURL(docxBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    const href = buildDocxDownloadHref(null, sopIdentifier, language);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  const isLoading = status === 'loading' || status === 'rendering';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
              <FileText className="h-4 w-4 text-slate-700" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">SOP Document</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {sopIdentifier}{sopName ? ` — ${sopName}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-300 relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-100/90">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              <p className="text-sm font-semibold text-gray-600">
                {status === 'loading' ? 'Loading SOP document…' : 'Rendering preview…'}
              </p>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-8 bg-gray-50">
              <AlertTriangle className="h-8 w-8 text-rose-400" />
              <p className="text-sm text-rose-700 text-center max-w-sm font-medium">{errorMsg}</p>
              <button
                type="button"
                onClick={() => void fetchAndRender()}
                className="mt-2 px-4 py-2 rounded-lg text-sm font-bold bg-slate-700 text-white hover:bg-slate-800"
              >
                Retry
              </button>
            </div>
          )}
          <div ref={containerRef} className="min-h-full" />
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40 shadow-md transition-all"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

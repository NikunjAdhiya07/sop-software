'use client';

import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

type Props = {
  pathParam: string;
  identifierParam: string | null;
  languageParam: string | null;
  backHref?: string;
  backLabel?: string;
};

/**
 * Inline PDF via same-origin `/api/files/download` (browser-native rendering).
 */
export default function PdfPreviewClient({
  pathParam,
  identifierParam,
  languageParam,
  backHref = '/dashboard',
  backLabel = 'Back to Dashboard',
}: Props) {
  const dl = new URLSearchParams();
  dl.set('path', pathParam);
  dl.set('open', '1');
  if (identifierParam) dl.set('identifier', identifierParam);
  if (languageParam) dl.set('language', languageParam);

  const iframeSrc = `/api/files/download?${dl.toString()}`;
  const isGujarati = (languageParam || '').toLowerCase() === 'gujarati';

  return (
    <div className="flex h-screen flex-col bg-[#e5e7eb]">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            window.close();
            setTimeout(() => {
              if (!window.closed) {
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  window.location.href = backHref;
                }
              }
            }, 150);
          }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline cursor-pointer bg-transparent border-0 p-0"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </button>
        <span className="flex items-center gap-2 text-xs text-gray-500">
          <FileText className="h-4 w-4" />
          PDF
          {isGujarati ? <span className="font-semibold text-indigo-600">Gujarati</span> : null}
        </span>
      </div>
      <div className="min-h-0 flex-1 p-2 sm:p-3">
        <iframe
          src={iframeSrc}
          title="SOP PDF document"
          className="h-[calc(100vh-3.25rem)] min-h-[480px] w-full max-w-[1200px] mx-auto rounded-lg border border-gray-200 bg-white shadow-md"
        />
      </div>
    </div>
  );
}

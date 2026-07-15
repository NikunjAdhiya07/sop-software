'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Search, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { isSmartSearchTerm, type PdfSearchResolution } from '@/lib/guidelineDocSearch';
import {
  buildPdfSearchResolution,
  resolveSearchPhraseFromText,
} from '@/lib/guidelinePdfResolveClient';
import { openGuidelinePdf } from '@/lib/guidelinePdfLoader';
import { enqueuePdfResolve } from '@/lib/guidelinePdfResolveQueue';
import { extractPdfFullText, findMatchInPdf, findHighlightInItems, type PdfTextItem } from '@/lib/pdfTextSearch';

interface GuidelinePdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  guidelineId: string;
  /** Initial search hint — re-resolved against actual PDF text on open. */
  searchPhrase: string;
  /** Gap, SOP snippet, requirement — used to find the right point in this PDF. */
  searchAnchors?: string[];
  clauseNumber?: string;
  /** Assessed requirement — used to detect smart vs exact search term. */
  requirementText?: string;
  /** Already-resolved search from the finding card — avoids panel flash on re-open. */
  prefetchedResolution?: PdfSearchResolution | null;
  onSearchResolved?: (resolution: PdfSearchResolution) => void;
  title?: string;
  fullPage?: boolean;
}

const HIGHLIGHT_STYLE = 'rgba(253, 224, 71, 0.72)';

type PdfDoc = import('pdfjs-dist').PDFDocumentProxy;

function GuidelinePdfPage({
  pdf,
  pageNum,
  width,
  highlightItems,
  onReadyRef,
}: {
  pdf: PdfDoc;
  pageNum: number;
  width: number;
  highlightItems: number[];
  onReadyRef: React.RefObject<((el: HTMLDivElement) => void) | undefined>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<import('pdfjs-dist').RenderTask | null>(null);

  useEffect(() => {
    if (!width) return;

    let cancelled = false;

    (async () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      const highlightLayer = highlightLayerRef.current;
      if (!wrap || !canvas || !highlightLayer) return;

      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;

      const pdfjs = await import('pdfjs-dist');
      const page = await pdf.getPage(pageNum);
      if (cancelled) return;

      const baseVp = page.getViewport({ scale: 1 });
      const scale = width / baseVp.width;
      const viewport = page.getViewport({ scale });

      wrap.style.width = `${viewport.width}px`;
      wrap.style.height = `${viewport.height}px`;

      const outputScale = new pdfjs.OutputScale();
      canvas.width = Math.floor(viewport.width * outputScale.sx);
      canvas.height = Math.floor(viewport.height * outputScale.sy);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const transform =
        outputScale.sx !== 1 || outputScale.sy !== 1
          ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
          : undefined;

      const task = page.render({ canvasContext: ctx, viewport, transform, canvas });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;

      highlightLayer.innerHTML = '';
      highlightLayer.style.width = `${viewport.width}px`;
      highlightLayer.style.height = `${viewport.height}px`;

      if (highlightItems.length) {
        const content = await page.getTextContent();
        const textItems = content.items as PdfTextItem[];

        for (const idx of highlightItems) {
          const item = textItems[idx];
          if (!item?.str?.trim()) continue;

          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(item.transform[2], item.transform[3]);
          const div = document.createElement('div');
          div.style.position = 'absolute';
          div.style.left = `${tx[4]}px`;
          div.style.top = `${tx[5] - fontHeight}px`;
          div.style.width = `${Math.max(item.width * scale, 4)}px`;
          div.style.height = `${Math.max(fontHeight, 4)}px`;
          div.style.backgroundColor = HIGHLIGHT_STYLE;
          div.style.borderRadius = '2px';
          div.style.pointerEvents = 'none';
          div.dataset.highlight = 'true';
          highlightLayer.appendChild(div);
        }
      }

      if (!cancelled && wrapRef.current) onReadyRef.current?.(wrapRef.current);
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNum, width, highlightItems, onReadyRef]);

  return (
    <div
      ref={wrapRef}
      data-page={pageNum}
      className="relative shrink-0 bg-white shadow-md"
    >
      <canvas ref={canvasRef} className="block" />
      <div ref={highlightLayerRef} className="absolute inset-0 overflow-visible pointer-events-none" aria-hidden />
    </div>
  );
}

export default function GuidelinePdfModal({
  isOpen,
  onClose,
  guidelineId,
  searchPhrase,
  searchAnchors = [],
  clauseNumber,
  requirementText = '',
  prefetchedResolution = null,
  onSearchResolved,
  title,
  fullPage = false,
}: GuidelinePdfModalProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [matchPage, setMatchPage] = useState(1);
  const [visiblePage, setVisiblePage] = useState(1);
  const [effectiveSearch, setEffectiveSearch] = useState('');
  const [resolvedPoint, setResolvedPoint] = useState('');
  const [matchFound, setMatchFound] = useState(false);
  const [highlightItems, setHighlightItems] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [pageWidth, setPageWidth] = useState(0);

  const pdfRef = useRef<PdfDoc | null>(null);
  const runIdRef = useRef(0);
  const requirementTextRef = useRef(requirementText);
  const prefetchedRef = useRef<PdfSearchResolution | null>(null);
  prefetchedRef.current = prefetchedResolution;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrolledToMatchRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !guidelineId) return;

    requirementTextRef.current = requirementText;
    prefetchedRef.current = prefetchedResolution;
    const seeded = prefetchedResolution;

    const runId = ++runIdRef.current;
    scrolledToMatchRef.current = false;
    pageElsRef.current.clear();
    setStatus('loading');
    setErrorMsg('');
    setEffectiveSearch(seeded?.searchPhrase ?? '');
    setResolvedPoint(seeded?.fullPoint ?? '');
    setMatchFound(seeded?.matchFound ?? false);
    setMatchPage(seeded?.matchPage ?? 1);
    setVisiblePage(seeded?.matchPage ?? 1);
    setHighlightItems([]);
    setPageWidth(0);
    pdfRef.current = null;

    (async () => {
      let pdf: PdfDoc | null = null;
      try {
        pdf = await enqueuePdfResolve(() => openGuidelinePdf(guidelineId));
        if (runId !== runIdRef.current) return;

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);

        // Trust an already-resolved (and already-displayed) match instead of
        // re-mining the full PDF text — that uses a different resolution path
        // and can land on a different point, making the modal jump on open.
        let query: string;
        let point: string;
        if (seeded?.matchFound && seeded.searchPhrase) {
          query = seeded.searchPhrase;
          point = seeded.fullPoint ?? '';
        } else {
          const pdfText = await extractPdfFullText(pdf);
          if (runId !== runIdRef.current) return;
          ({ query, point } = resolveSearchPhraseFromText(
            pdfText,
            searchPhrase,
            searchAnchors,
            clauseNumber,
          ));
        }

        let foundPage = seeded?.matchPage ?? 1;
        let found = seeded?.matchFound ?? false;
        let items: number[] = [];

        if (query) {
          const pageHint = seeded?.matchPage;
          if (pageHint && pageHint >= 1 && pageHint <= pdf.numPages) {
            const page = await pdf.getPage(pageHint);
            const content = await page.getTextContent();
            const precise = findHighlightInItems(content.items as PdfTextItem[], query);
            if (precise) {
              foundPage = pageHint;
              found = true;
              items = precise.highlightItems;
            }
          }

          if (!items.length) {
            const hit = await findMatchInPdf(pdf, query);
            if (hit) {
              foundPage = hit.page;
              found = true;
              items = hit.highlightItems;
            }
          }
        }

        if (runId !== runIdRef.current) return;

        setEffectiveSearch(query);
        setResolvedPoint(point);
        setMatchPage(foundPage);
        setVisiblePage(foundPage);
        setMatchFound(found);
        setHighlightItems(items);
        setStatus('ready');

        const resolution = buildPdfSearchResolution(
          query,
          point,
          requirementTextRef.current,
          found,
          foundPage,
        );
        if (resolution) {
          const seeded = prefetchedRef.current;
          const sameAsSeeded =
            seeded &&
            seeded.searchPhrase.toLowerCase() === resolution.searchPhrase.toLowerCase() &&
            (seeded.fullPoint || '').toLowerCase() === (resolution.fullPoint || '').toLowerCase();
          if (!sameAsSeeded) onSearchResolved?.(resolution);
        }
      } catch (err) {
        if (runId !== runIdRef.current) return;
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load PDF');
      } finally {
        if (pdf && runId !== runIdRef.current) {
          await pdf.destroy().catch(() => {});
          if (pdfRef.current === pdf) pdfRef.current = null;
        }
      }
    })();

    return () => {
      runIdRef.current++;
    };
  }, [isOpen, guidelineId, searchPhrase, searchAnchors, clauseNumber, onSearchResolved]);

  useEffect(() => {
    if (isOpen) return;
    runIdRef.current++;
    pdfRef.current?.destroy().catch(() => {});
    pdfRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (status !== 'ready') return;
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => setPageWidth(Math.max(el.clientWidth - 32, 320));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  const scrollToMatch = useCallback((pageEl: HTMLDivElement) => {
    if (scrolledToMatchRef.current) return;
    scrolledToMatchRef.current = true;

    const highlight = pageEl.querySelector('[data-highlight="true"]');
    if (highlight) {
      highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const matchPageRef = useRef(matchPage);
  const matchFoundRef = useRef(matchFound);
  matchPageRef.current = matchPage;
  matchFoundRef.current = matchFound;

  const onPageReadyRef = useRef<(el: HTMLDivElement) => void>(() => {});
  onPageReadyRef.current = (el: HTMLDivElement) => {
    const pageNum = Number(el.dataset.page);
    if (!pageNum) return;
    pageElsRef.current.set(pageNum, el);
    if (pageNum === matchPageRef.current && matchFoundRef.current) {
      scrollToMatch(el);
    }
  };

  const updateVisiblePage = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const center = root.scrollTop + root.clientHeight / 2;
    let bestPage = 1;
    let bestDist = Infinity;
    for (const [page, el] of pageElsRef.current) {
      const mid = el.offsetTop + el.offsetHeight / 2;
      const dist = Math.abs(mid - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = page;
      }
    }
    setVisiblePage(bestPage);
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || status !== 'ready') return;
    root.addEventListener('scroll', updateVisiblePage, { passive: true });
    return () => root.removeEventListener('scroll', updateVisiblePage);
  }, [status, numPages, pageWidth, updateVisiblePage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const scrollToPage = (pageNum: number) => {
    const el = pageElsRef.current.get(pageNum);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopySearch = () => {
    const text = effectiveSearch.trim();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const displaySearch = effectiveSearch.trim();
  const compareReq = resolvedPoint || requirementText.trim();
  const showSmartTag = displaySearch && isSmartSearchTerm(compareReq, displaySearch);
  const pdf = pdfRef.current;

  const shell = (
    <div
      className={
        fullPage
          ? 'flex h-screen w-full flex-col overflow-hidden bg-white'
          : 'flex w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl h-[94vh]'
      }
    >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{title || 'Guideline'}</p>
            {displaySearch ? (
              <p className="flex items-center gap-1 text-[11px] mt-0.5 flex-wrap">
                <Search className={`h-3 w-3 shrink-0 ${matchFound ? 'text-emerald-600' : 'text-amber-600'}`} />
                <span className={`line-clamp-2 ${matchFound ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {matchFound ? (
                    <>&ldquo;{displaySearch}&rdquo; — page {matchPage}</>
                  ) : (
                    <>No match for &ldquo;{displaySearch}&rdquo; in this PDF</>
                  )}
                </span>
                {showSmartTag && (
                  <span className="shrink-0 text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    Smart search term
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[11px] text-amber-700 mt-0.5">
                Could not locate a matching requirement point in this PDF.
              </p>
            )}
            {resolvedPoint && matchFound && (
              <p className="text-[10px] text-gray-600 line-clamp-2 mt-0.5">{resolvedPoint}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {displaySearch && (
              <button
                type="button"
                onClick={handleCopySearch}
                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copied' : 'Copy search'}
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-400">
          {status === 'loading' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-600 bg-gray-200">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading guideline and locating requirement…
            </div>
          )}
          {status === 'error' && (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-rose-600 px-6 text-center">
              {errorMsg}
            </div>
          )}
          {status === 'ready' && pdf && pageWidth > 0 && (
            <div className="flex flex-col items-center gap-4 p-4">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <GuidelinePdfPage
                  key={pageNum}
                  pdf={pdf}
                  pageNum={pageNum}
                  width={pageWidth}
                  highlightItems={pageNum === matchPage ? highlightItems : []}
                  onReadyRef={onPageReadyRef}
                />
              ))}
            </div>
          )}
        </div>

        {status === 'ready' && numPages > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-2.5 bg-white">
            <button
              type="button"
              disabled={visiblePage <= 1}
              onClick={() => scrollToPage(visiblePage - 1)}
              className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="text-xs text-gray-600 tabular-nums font-medium">
              Page {visiblePage} / {numPages}
            </span>
            <button
              type="button"
              disabled={visiblePage >= numPages}
              onClick={() => scrollToPage(visiblePage + 1)}
              className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-gray-50"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
    </div>
  );

  if (fullPage) return shell;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      {shell}
    </div>,
    document.body,
  );
}

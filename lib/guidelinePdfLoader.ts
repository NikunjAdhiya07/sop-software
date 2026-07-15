type PdfDoc = import('pdfjs-dist').PDFDocumentProxy;

const bytesCache = new Map<string, Promise<ArrayBuffer>>();
let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;

export async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsReady) {
    pdfjsReady = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      return pdfjs;
    });
  }
  return pdfjsReady;
}

export function fetchGuidelinePdfBytes(
  guidelineId: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const key = guidelineId.trim();
  if (!key) return Promise.reject(new Error('Missing guideline ID'));

  let pending = bytesCache.get(key);
  if (!pending) {
    pending = fetch(`/api/guidelines/upload?serve=${encodeURIComponent(key)}`, { signal })
      .then((res) => {
        if (!res.ok) throw new Error('Could not load guideline PDF');
        return res.arrayBuffer();
      })
      .then((buf) => buf.slice(0))
      .catch((err) => {
        bytesCache.delete(key);
        throw err;
      });
    bytesCache.set(key, pending);
  }

  if (!signal) return pending;

  return pending.then(
    (data) => data,
    (err) => {
      if (signal.aborted) throw err;
      throw err;
    },
  );
}

export async function openGuidelinePdf(
  guidelineId: string,
  signal?: AbortSignal,
): Promise<PdfDoc> {
  const pdfjs = await loadPdfJs();
  const data = await fetchGuidelinePdfBytes(guidelineId, signal);
  // pdf.js detaches the buffer when a document is destroyed; clone so the cache stays valid.
  const copy = data.slice(0);
  return pdfjs.getDocument({ data: copy }).promise;
}

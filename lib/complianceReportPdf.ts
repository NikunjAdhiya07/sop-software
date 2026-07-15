// Client-side "Export to PDF" for a compliance report.
//
// Renders the live report DOM (header + every finding card) to a canvas and
// slices it across A4 pages, so the exported PDF keeps the exact same layout as
// the on-screen UI and never drops a finding. Tailwind v4 emits `oklch()` colors
// which the original html2canvas cannot parse, so we use html2canvas-pro.
//
// Both html2canvas-pro and jspdf are heavy and browser-only, so they are
// dynamically imported here and only pulled in when the user clicks Export.

type UnclipTarget = HTMLElement | null | undefined;

interface ExportOptions {
  /** Element whose full content (including overflow) should be captured. */
  element: HTMLElement;
  /** File name for the downloaded PDF. */
  fileName: string;
  /**
   * Scroll containers whose height/overflow constraints must be removed while
   * capturing so the full content is laid out instead of clipped to a viewport.
   */
  unclip?: UnclipTarget[];
}

interface SavedStyle {
  el: HTMLElement;
  cssText: string;
}

// Remove viewport-height / scroll constraints so the element lays out its full
// content. Returns the saved inline styles so they can be restored afterwards.
function unclipElements(targets: UnclipTarget[]): SavedStyle[] {
  const saved: SavedStyle[] = [];
  for (const el of targets) {
    if (!el) continue;
    saved.push({ el, cssText: el.style.cssText });
    el.style.height = 'auto';
    el.style.maxHeight = 'none';
    el.style.overflow = 'visible';
    el.style.overflowY = 'visible';
    el.style.overflowX = 'visible';
  }
  return saved;
}

function restoreElements(saved: SavedStyle[]): void {
  for (const { el, cssText } of saved) el.style.cssText = cssText;
}

export async function exportComplianceReportToPdf({ element, fileName, unclip = [] }: ExportOptions): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const saved = unclipElements([element, ...unclip]);
  // Let the browser reflow with the constraints removed before we snapshot.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Cap the render scale so a long report never exceeds the browser's max
  // canvas dimension (~16384px in Chromium), which would abort the capture.
  const MAX_CANVAS_DIM = 16384;
  const fullW = element.scrollWidth;
  const fullH = element.scrollHeight;
  const scale = Math.max(1, Math.min(2, MAX_CANVAS_DIM / Math.max(fullW, fullH, 1)));

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      backgroundColor: '#f8f9fa',
      // Capture the fully laid-out content, not just the visible viewport slice.
      windowWidth: fullW,
      windowHeight: fullH,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    restoreElements(saved);
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  // Slice the tall capture across as many A4 pages as needed by shifting the
  // image up one page height each time.
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
  }

  pdf.save(fileName);
}

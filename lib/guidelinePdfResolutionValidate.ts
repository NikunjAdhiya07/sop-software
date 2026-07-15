import type { PdfSearchResolution } from '@/lib/guidelineDocSearch';
import { isGuidelineBoilerplate } from '@/lib/guidelineBoilerplate';
import { textSupportedByBody } from '@/lib/guidelineDocSearch';

/** Drop PDF-resolved phrases that are cover-page chrome or unrelated to the finding. */
export function acceptPdfResolution(
  result: PdfSearchResolution | null | undefined,
  requirementFallback = '',
): PdfSearchResolution | null {
  if (!result?.searchPhrase?.trim()) return null;

  const phrase = result.searchPhrase.trim();
  const point = result.fullPoint?.trim() ?? '';

  if (isGuidelineBoilerplate(phrase)) return null;
  if (point && isGuidelineBoilerplate(point)) {
    if (isGuidelineBoilerplate(phrase)) return null;
    return { ...result, fullPoint: undefined };
  }

  // A confirmed match was actually located and highlighted in the PDF text —
  // trust it over the (possibly stale/truncated) stored fallback rather than
  // discarding a verified result for not resembling unverified stored text.
  const fallback = requirementFallback.trim();
  if (!result.matchFound && fallback && !isGuidelineBoilerplate(fallback) && point) {
    const related =
      textSupportedByBody(point, fallback) ||
      textSupportedByBody(fallback, point) ||
      textSupportedByBody(phrase, fallback);
    if (!related) return null;
  }

  return result;
}

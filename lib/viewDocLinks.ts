/**
 * Shared links for dashboard document preview and downloads.
 * Routes to the in-app DOCX viewer (/dashboard/view-doc) which renders
 * directly in the browser using docx-preview — much faster than Office Online.
 * An "Open in Office Online" button is available inside the viewer for users
 * who need pixel-perfect rendering.
 */
export function buildViewDocHref(path: string, identifier?: string, language?: string): string {
  const params = new URLSearchParams();
  if (identifier) params.set('identifier', identifier);
  if (language) params.set('language', language);
  if (path) params.set('path', path);
  return `/dashboard/view-doc?${params.toString()}`;
}

/** Forces server-resolved Word bytes as attachment (same resolution as preview). */
export function buildDocxDownloadHref(
  pathParam: string | null,
  identifierParam: string | null,
  languageParam: string | null,
): string | null {
  if (!pathParam && !identifierParam) return null;
  const dl = new URLSearchParams();
  dl.set('word', '1');
  dl.set('attach', '1');
  if (pathParam) dl.set('path', pathParam);
  if (identifierParam) dl.set('identifier', identifierParam);
  if (languageParam) dl.set('language', languageParam);
  return `/api/files/download?${dl.toString()}`;
}

export function buildPdfDownloadHref(
  path: string,
  identifier?: string,
  language?: string,
): string {
  const dl = new URLSearchParams();
  dl.set('path', path.trim());
  dl.set('attach', '1');
  if (identifier) dl.set('identifier', identifier);
  if (language) dl.set('language', language);
  return `/api/files/download?${dl.toString()}`;
}

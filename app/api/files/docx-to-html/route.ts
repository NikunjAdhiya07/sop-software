import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { verifyViewerToken } from '@/lib/viewerToken';
import { loadWordDocumentBuffer } from '@/lib/loadStoredFileBuffer';
import mammoth from 'mammoth';
import { extractDocumentBodyHtmlFromDocx } from '@/lib/docxHeaderExtractor';

// ---------------------------------------------------------------------------
// Server-side HTML cache for converted DOCX content.
// Keyed by SHA-256 of the DOCX bytes (POST) or by token path (GET).
// TTL: 30 minutes. Eliminates re-running mammoth on every view of the same doc.
// ---------------------------------------------------------------------------
const HTML_CACHE_TTL_MS = 30 * 60 * 1000;
interface HtmlCacheEntry { html: string; cachedAt: number }
const g = global as typeof global & { __docxHtmlCache?: Map<string, HtmlCacheEntry> };
if (!g.__docxHtmlCache) g.__docxHtmlCache = new Map();
const htmlCache = g.__docxHtmlCache;

function getCachedHtml(key: string): string | null {
  const entry = htmlCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > HTML_CACHE_TTL_MS) { htmlCache.delete(key); return null; }
  return entry.html;
}

function setCachedHtml(key: string, html: string): void {
  htmlCache.set(key, { html, cachedAt: Date.now() });
  if (htmlCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of htmlCache) {
      if (now - v.cachedAt > HTML_CACHE_TTL_MS) htmlCache.delete(k);
    }
  }
}

async function convertBufferToHtml(buffer: Buffer): Promise<string> {
  // Try DOCX body extraction first (preserves layout better).
  // The DOCX body already contains the SOP header table — do NOT prepend a duplicate template header.
  let bodyHtml = '';
  try {
    const docxBody = await extractDocumentBodyHtmlFromDocx(buffer);
    if (docxBody?.trim()) bodyHtml = docxBody;
  } catch { /* ignore */ }

  if (!bodyHtml) {
    try {
      const result = await mammoth.convertToHtml(
        { buffer },
        {
          // Keep as much original doc formatting as possible for Gujarati SOPs.
          includeDefaultStyleMap: true,
          includeEmbeddedStyleMap: true,
          convertImage: mammoth.images.dataUri,
        },
      );
      bodyHtml = result.value;
    } catch {
      bodyHtml = '<p>Could not extract document content.</p>';
    }
  }

  return bodyHtml;
}

/**
 * GET /api/files/docx-to-html?t=<token>
 * Server fetches the file (for non-CDN paths).
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const payload = verifyViewerToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });

    // Check HTML cache before fetching + converting the file.
    const cacheKey = `get::${payload.path ?? ''}::${payload.identifier ?? ''}::${payload.language ?? ''}`;
    const cached = getCachedHtml(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, html: cached }, { headers: { 'Cache-Control': 'private, max-age=1800' } });
    }

    const buffer = await loadWordDocumentBuffer(
      (payload.path || '').trim(),
      payload.identifier?.trim() || null,
      payload.language,
    );
    if (!buffer) return NextResponse.json({ error: 'File not found on server' }, { status: 404 });

    const html = await convertBufferToHtml(buffer);
    setCachedHtml(cacheKey, html);
    return NextResponse.json({ success: true, html }, { headers: { 'Cache-Control': 'private, max-age=1800' } });
  } catch (error) {
    console.error('docx-to-html GET error:', error);
    return NextResponse.json({ error: 'Failed to convert document' }, { status: 500 });
  }
}

/**
 * POST /api/files/docx-to-html?identifier=...&language=...
 * Browser sends the raw DOCX bytes (fetched directly from CDN).
 * Used when server cannot reach CDN but browser can (primarily Gujarati SOPs).
 */
export async function POST(request: NextRequest) {
  try {
    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      return NextResponse.json({ error: 'Empty file body' }, { status: 400 });
    }
    const buffer = Buffer.from(arrayBuffer);

    // Key by SHA-256 of the bytes so the same file uploaded multiple times hits the cache.
    const hash = createHash('sha256').update(buffer).digest('hex');
    const cached = getCachedHtml(hash);
    if (cached) {
      return NextResponse.json({ success: true, html: cached }, { headers: { 'Cache-Control': 'private, max-age=1800' } });
    }

    const html = await convertBufferToHtml(buffer);
    setCachedHtml(hash, html);
    return NextResponse.json({ success: true, html }, { headers: { 'Cache-Control': 'private, max-age=1800' } });
  } catch (error) {
    console.error('docx-to-html POST error:', error);
    return NextResponse.json({ error: 'Failed to convert document' }, { status: 500 });
  }
}

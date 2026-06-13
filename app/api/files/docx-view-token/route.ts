import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { sopIdentifierMatchFilter } from '@/lib/sopIdentifierNormalize';
import { signViewerToken } from '@/lib/viewerToken';
import { resolveDocxPathForViewer } from '@/lib/loadStoredFileBuffer';
import { fileKindFromStoredPath } from '@/lib/filePathFileKind';

function looksGujarati(sop: any): boolean {
  if (sop.language === 'Gujarati') return true;
  const name = (sop.name || '') + (sop.originalFileName || '');
  const url = sop.fileUrl || '';
  const folder = sop.folderPath || '';
  if (/[઀-૿]{4,}/.test(name)) return true;
  if (/(^|[/\\\s_-])guj([/\\\s_-]|$)/i.test(url) || /gujarati/i.test(url)) return true;
  if (/(^|[/\\\s_-])guj([/\\\s_-]|$)/i.test(folder) || /gujarati/i.test(folder)) return true;
  return false;
}

function normalizeTokenPath(p: string): string {
  const t = p.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return t.replace(/^\/+/, '');
}

/**
 * GET ?identifier=...&language=... or ?path=...
 * Returns a short-lived token so the client can fetch the DOCX from serve-docx for in-browser preview (e.g. docx-preview).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get('identifier');
    const language = searchParams.get('language');
    const pathParam = searchParams.get('path');

    const pathTrim = pathParam?.trim() || '';
    const idTrim = identifier?.trim() || null;
    const lang = language || undefined;

    let fileUrl: string | null = null;

    /**
     * Trust an explicit Word pathParam — the dashboard picks the correct file per language slot,
     * and CDN basenames are often hash/timestamped so we can't second-guess by path text. Honour
     * the caller's choice (same property the download flow relies on) and skip identifier-based
     * resolution that may swap to the other language's file.
     */
    if (pathTrim) {
      const k = fileKindFromStoredPath(pathTrim);
      const isWord = k === 'docx' || k === 'doc';
      if (isWord) {
        fileUrl = normalizeTokenPath(pathTrim);
      }
    }

    if (!fileUrl) {
      const resolved = await resolveDocxPathForViewer(idTrim, lang, pathTrim || null);
      if (resolved?.trim()) {
        fileUrl = normalizeTokenPath(resolved);
      }
    }

    if (!fileUrl && pathTrim) {
      fileUrl = normalizeTokenPath(pathTrim);
    }

    if (!fileUrl && idTrim) {
      await connectDB();

      const allSops = (await SOP.find(sopIdentifierMatchFilter(idTrim))
        .select('fileUrl fileType language name originalFileName folderPath')
        .lean()) as Array<{
        fileUrl?: string;
        fileType?: string;
        language?: string;
        name?: string;
        originalFileName?: string;
        folderPath?: string;
      }>;

      const wantGujarati = language === 'Gujarati';
      const target = wantGujarati
        ? allSops.find((s) => looksGujarati(s))
        : allSops.find((s) => !looksGujarati(s)) || allSops[0];
      const other = wantGujarati ? allSops.find((s) => !looksGujarati(s)) : null;

      if (target?.fileUrl) {
        const k = fileKindFromStoredPath(target.fileUrl, target.fileType);
        if (k !== 'docx' && k !== 'doc') {
          /* PDF-only SOP row — leave fileUrl null so we don't mint a token for a PDF */
        } else {
          const norm = (p: string) => (p || '').replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
          if (wantGujarati && other?.fileUrl && norm(target.fileUrl) === norm(other.fileUrl)) {
            fileUrl = normalizeTokenPath(target.fileUrl);
          } else {
            fileUrl = normalizeTokenPath(target.fileUrl);
          }
        }
      }
    }

    if (!fileUrl) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    /**
     * Do not put long paths in the token: GET /api/files/serve-docx?t=… must stay under browser/proxy limits.
     * Firebase / signed URLs can be multi‑KB; omit `path` when we have an identifier so serve-docx resolves from DB/CDN.
     */
    const MAX_PATH_IN_TOKEN = 1200;
    const tokenPayload: { path?: string; identifier?: string; language: string } = {
      language: language || 'English',
    };
    if (idTrim) tokenPayload.identifier = idTrim;
    if (!idTrim || fileUrl.length <= MAX_PATH_IN_TOKEN) {
      tokenPayload.path = fileUrl;
    }

    const token = signViewerToken(tokenPayload);

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('docx-view-token error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get token' },
      { status: 500 },
    );
  }
}

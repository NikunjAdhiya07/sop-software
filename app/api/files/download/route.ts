import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import {
  loadStoredFileBuffer,
  resolveAlternateStoredLocation,
  loadWordDocumentBuffer,
  resolveDocxPathForViewer,
} from '@/lib/loadStoredFileBuffer';
import { normalizePath } from '@/lib/filePathResolver';

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'doc') return 'application/msword';
  return 'application/octet-stream';
}

function displayFileNameFromSource(sourcePath: string, fallback: string): string {
  const s = (sourcePath || '').trim().split(/[?#]/)[0];
  if (!s) return fallback;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const base = path.posix.basename(u.pathname);
      if (base) return base;
    }
  } catch {
    /* ignore */
  }
  return path.basename(normalizePath(s)) || fallback;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path')?.trim() || '';
    const identifier = searchParams.get('identifier')?.trim() || null;
    const language = searchParams.get('language') || undefined;
    const wordMode = searchParams.get('word') === '1' || searchParams.get('word') === 'true';

    if (!filePath && !wordMode) {
      return NextResponse.json({ success: false, error: 'File path is required' }, { status: 400 });
    }

    if (wordMode && !identifier && !filePath) {
      return NextResponse.json(
        { success: false, error: 'For Word download (word=1), provide identifier and/or path' },
        { status: 400 },
      );
    }

    let buffer: Buffer | null = null;
    let sourcePath = filePath;

    if (wordMode) {
      buffer = await loadWordDocumentBuffer(filePath, identifier, language);
      if (buffer) {
        const resolved = await resolveDocxPathForViewer(identifier, language, filePath || null);
        sourcePath = resolved?.trim() || filePath || `${(identifier || 'SOP').replace(/[^\w.-]+/g, '_')}.docx`;
      }
    }

    if (!buffer && filePath) {
      buffer = await loadStoredFileBuffer(filePath);
      if (!buffer) {
        const fromDb = await resolveAlternateStoredLocation(filePath, identifier, language);
        if (fromDb) {
          buffer = await loadStoredFileBuffer(fromDb, { trustedRemote: true });
          if (buffer) sourcePath = fromDb;
        }
      }
    }

    // Identifier-only fallback: when no path is given, find any file (PDF or DOCX) for this SOP
    if (!buffer && !filePath && identifier) {
      const { resolveFileUrlFromSopIdentifier } = await import('@/lib/loadStoredFileBuffer');
      const anyUrl = await resolveFileUrlFromSopIdentifier(identifier, language);
      if (anyUrl) {
        buffer = await loadStoredFileBuffer(anyUrl, { trustedRemote: true });
        if (buffer) sourcePath = anyUrl;
      }
    }

    if (!buffer) {
      console.error(`File not found: path=${filePath}${identifier ? ` identifier=${identifier}` : ''} word=${wordMode}`);
      return NextResponse.json(
        {
          success: false,
          error: 'File not found. It may have been deleted or moved after uploading.',
          hint:
            'If the file was moved to CDN, ensure SOPLibrary has a matching sopDocuments entry (https:// filePath) for that PDF/DOCX. The app scans the path for codes like PEGE13-05 (even when sopIdentifier differs) and matches basename. Add ?identifier=SOPCODE&language=English if needed. For DOCX use ?word=1 with the same identifier/language as preview. Endpoint: /api/files/download.',
        },
        { status: 404 },
      );
    }

    const fallbackName = wordMode ? `${(identifier || 'document').replace(/[^\w.-]+/g, '_')}.docx` : 'document';
    const fileName = displayFileNameFromSource(sourcePath, fallbackName);
    const mimeType = getMimeType(fileName);

    const forceAttachment = searchParams.get('attach') === '1' || searchParams.get('attach') === 'true';
    const openInline = searchParams.get('open') === '1' || searchParams.get('open') === 'true';
    const disposition =
      forceAttachment ? 'attachment' : openInline || mimeType === 'application/pdf' ? 'inline' : 'attachment';

    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to download file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

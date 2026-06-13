import { NextRequest, NextResponse } from 'next/server';
import { verifyViewerToken } from '@/lib/viewerToken';
import { loadWordDocumentBuffer } from '@/lib/loadStoredFileBuffer';

function docxResponse(buffer: Buffer) {
  const body = new Uint8Array(buffer);
  const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline; filename="document.docx"',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const payload = verifyViewerToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });
    }

    const pathHint = (payload.path || '').trim();
    const identifier = payload.identifier?.trim() || null;
    const buffer = await loadWordDocumentBuffer(
      pathHint,
      identifier,
      payload.language,
    );

    if (!buffer) {
      console.error('[serve-docx] File not found. identifier:', identifier, 'pathHint:', pathHint?.slice(0, 100));
      return NextResponse.json({ error: 'File not found on server' }, { status: 404 });
    }

    return docxResponse(buffer);
  } catch (error) {
    console.error('serve-docx error:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}

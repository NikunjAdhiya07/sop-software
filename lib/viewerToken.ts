import crypto from 'crypto';

const SECRET = process.env.DOCX_VIEWER_SECRET || process.env.NEXTAUTH_SECRET || 'sop-docx-viewer-secret';
const TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface ViewerTokenPayload {
  identifier?: string;
  language?: string;
  path?: string;
  exp: number;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  const pad = 4 - (str.length % 4);
  const b64 = (str + (pad === 4 ? '' : '='.repeat(pad))).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

export function signViewerToken(payload: Omit<ViewerTokenPayload, 'exp'>): string {
  const exp = Date.now() + TTL_MS;
  const data = JSON.stringify({ ...payload, exp });
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest();
  return base64UrlEncode(Buffer.from(data, 'utf8')) + '.' + base64UrlEncode(sig);
}

export function verifyViewerToken(token: string): ViewerTokenPayload | null {
  try {
    const [raw, sig] = token.split('.');
    if (!raw || !sig) return null;
    const data = base64UrlDecode(raw).toString('utf8');
    const expected = base64UrlEncode(crypto.createHmac('sha256', SECRET).update(data).digest());
    if (expected !== sig) return null;
    const payload = JSON.parse(data) as ViewerTokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

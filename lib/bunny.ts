import { readFile } from "fs/promises";
import path from "path";
import { getBunnyConfig, isBunnyConfigured } from "@/lib/validateEnv";
import { buildCdnPath, isCdnUrl } from "@/lib/file-urls";

export { isBunnyConfigured } from "@/lib/validateEnv";
export { buildCdnPath, isCdnUrl } from "@/lib/file-urls";

// 60 s per attempt; override with BUNNY_UPLOAD_TIMEOUT_MS env var.
const DEFAULT_BUNNY_UPLOAD_TIMEOUT_MS = 60_000;

function bunnyUploadTimeoutMs(): number {
  const raw = process.env.BUNNY_UPLOAD_TIMEOUT_MS;
  if (!raw) return DEFAULT_BUNNY_UPLOAD_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUNNY_UPLOAD_TIMEOUT_MS;
}

async function uploadToBunnyOnce(
  buffer: Buffer,
  url: string,
  apiKey: string,
  contentType: string,
): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { AccessKey: apiKey, "Content-Type": contentType },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(bunnyUploadTimeoutMs()),
  });
}

export async function uploadToBunny(
  buffer: Buffer,
  cdnPath: string,
  contentType: string,
): Promise<string> {
  const { apiKey, storageZone, hostname, cdnUrl } = getBunnyConfig();
  const normalizedPath = cdnPath.startsWith("/") ? cdnPath.slice(1) : cdnPath;
  const url = `https://${hostname}/${storageZone}/${normalizedPath}`;

  let res: Response;
  try {
    res = await uploadToBunnyOnce(buffer, url, apiKey, contentType);
  } catch {
    // One retry for transient network / timeout errors.
    res = await uploadToBunnyOnce(buffer, url, apiKey, contentType);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny upload failed (${res.status}): ${text}`);
  }

  return `${cdnUrl}/${normalizedPath}`;
}

export async function uploadFileToBunny(params: {
  buffer: Buffer;
  department: string;
  identifier: string;
  language: string;
  fileType: string;
  filename: string;
  contentType: string;
}): Promise<string> {
  const cdnPath = buildCdnPath(
    params.department,
    params.identifier,
    params.language,
    params.fileType,
    params.filename,
  );
  return uploadToBunny(params.buffer, cdnPath, params.contentType);
}

export async function readFileBuffer(source: string): Promise<Buffer> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch ${source}`);
    return Buffer.from(await res.arrayBuffer());
  }

  const relative = source.startsWith("/") ? source.slice(1) : source;
  const localPath = path.join(process.cwd(), "public", relative);
  return readFile(localPath);
}

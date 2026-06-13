/**
 * Bunny Storage Utility
 *
 * Provides helper functions to interact with Bunny CDN/Storage
 * for serving SOP documents and videos.
 */

// Environment variables should be set in .env.local:
// BUNNY_STORAGE_ZONE      - The storage zone name
// BUNNY_STORAGE_PASSWORD  - The API/password key for storage operations
// BUNNY_PULL_ZONE_URL     - The CDN pull zone URL (e.g. https://sop-pharma-indiana.b-cdn.net)
// BUNNY_STORAGE_HOSTNAME  - Usually storage.bunnycdn.com

interface BunnyConfig {
  storageZone: string;
  apiKey: string;
  cdnHostname: string;
  storageHostname: string;
}

function getConfig(): BunnyConfig {
  // Support both old and new env variable naming conventions
  const storageZone =
    process.env.BUNNY_STORAGE_ZONE ||
    process.env.BUNNY_STORAGE_ZONE_NAME ||
    '';
  const apiKey =
    process.env.BUNNY_STORAGE_PASSWORD ||
    process.env.BUNNY_API_KEY ||
    '';
  // cdnHostname: accept full URL or just hostname
  const rawCdn =
    process.env.BUNNY_PULL_ZONE_URL ||
    process.env.BUNNY_CDN_HOSTNAME ||
    '';
  // Strip protocol if a full URL was provided
  const cdnHostname = rawCdn.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const storageHostname =
    process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';

  if (!storageZone || !apiKey || !cdnHostname) {
    console.warn('[BunnyStorage] Missing Bunny configuration in environment variables');
  }

  return { storageZone, apiKey, cdnHostname, storageHostname };
}

/**
 * Construct a public CDN URL for a file stored in Bunny Storage.
 * @param filePath - The path within the storage zone (e.g., "sops/QAGE01-01/document.pdf")
 * @returns The full CDN URL
 */
export function getBunnyCdnUrl(filePath: string): string {
  const config = getConfig();

  if (!config.cdnHostname) {
    console.error('[BunnyStorage] CDN hostname not configured');
    return '';
  }

  // Remove leading slash if present
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

  return `https://${config.cdnHostname}/${cleanPath}`;
}

/**
 * Check if a file path is a Bunny Storage path (starts with bunny:// or is a full bunny URL)
 */
export function isBunnyPath(filePath: string): boolean {
  const t = (filePath || '').trim();
  if (!t) return false;
  if (t.startsWith('bunny://')) return true;
  if (t.includes('b-cdn.net')) return true;
  const { cdnHostname } = getConfig();
  /** Empty hostname would make `.includes('')` true for every path — must guard. */
  if (cdnHostname && t.includes(cdnHostname)) return true;
  return false;
}

/**
 * Extract the storage path from a bunny:// URI or full URL
 */
export function extractBunnyPath(filePath: string): string {
  if (filePath.startsWith('bunny://')) {
    return filePath.replace('bunny://', '');
  }

  const config = getConfig();
  if (config.cdnHostname && filePath.includes(config.cdnHostname)) {
    try {
      const url = new URL(filePath);
      return url.pathname.slice(1); // Remove leading slash
    } catch {
      return filePath;
    }
  }

  return filePath;
}

/**
 * Upload a file to Bunny Storage
 * @param fileBuffer - The file data as a Buffer
 * @param destinationPath - The path within the storage zone
 * @returns The CDN URL of the uploaded file, or null on failure
 */
export async function uploadToBunny(
  fileBuffer: Buffer,
  destinationPath: string
): Promise<string | null> {
  const config = getConfig();

  if (!config.storageZone || !config.apiKey) {
    console.error('[BunnyStorage] Storage zone or API key not configured');
    return null;
  }

  const cleanPath = destinationPath.startsWith('/') ? destinationPath.slice(1) : destinationPath;
  const uploadUrl = `https://${config.storageHostname}/${config.storageZone}/${cleanPath}`;
  const timeoutMs = (() => {
    const raw = String(process.env.BUNNY_UPLOAD_TIMEOUT_MS || '').trim();
    const n = parseInt(raw, 10);
    // Default 5 minutes to survive slower Bunny header responses on large runs.
    return Number.isFinite(n) && n >= 30_000 ? n : 300_000;
  })();
  const maxAttempts = (() => {
    const raw = String(process.env.BUNNY_UPLOAD_MAX_RETRIES || '').trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(8, n) : 5;
  })();
  const backoffMs = (attempt: number) => {
    const base = Math.min(12_000, 1_200 * attempt * attempt);
    const jitter = Math.floor(Math.random() * 600);
    return base + jitter;
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': config.apiKey,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(fileBuffer),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = response.status >= 500 || response.status === 429;
        console.error(
          `[BunnyStorage] Upload failed (attempt ${attempt}/${maxAttempts}):`,
          response.status,
          errorText,
        );
        if (!retryable || attempt === maxAttempts) return null;
        await new Promise((r) => setTimeout(r, Math.min(6000, 1000 * attempt * attempt)));
        continue;
      }

      // Return the CDN URL
      return getBunnyCdnUrl(cleanPath);
    } catch (error) {
      const code = (error as any)?.cause?.code || (error as any)?.code;
      const name = (error as any)?.name || '';
      const msg = error instanceof Error ? error.message : String(error);
      const lowMsg = msg.toLowerCase();
      const retryable =
        code === 'UND_ERR_HEADERS_TIMEOUT' ||
        code === 'UND_ERR_CONNECT_TIMEOUT' ||
        code === 'UND_ERR_SOCKET' ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        name === 'AbortError' ||
        name === 'TimeoutError' ||
        lowMsg.includes('timeout') ||
        lowMsg.includes('timed out') ||
        lowMsg.includes('aborted due to timeout');
      const compactErr =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      console.error(`[BunnyStorage] Upload error (attempt ${attempt}/${maxAttempts}): ${compactErr}`);
      if (!retryable || attempt === maxAttempts) return null;
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
  }
  return null;
}

/**
 * Delete a file from Bunny Storage
 * @param storagePath - The path within the storage zone
 * @returns true if successful, false otherwise
 */
export async function deleteFromBunny(storagePath: string): Promise<boolean> {
  const config = getConfig();

  if (!config.storageZone || !config.apiKey) {
    console.error('[BunnyStorage] Storage zone or API key not configured');
    return false;
  }

  const cleanPath = extractBunnyPath(storagePath);
  const deleteUrl = `https://${config.storageHostname}/${config.storageZone}/${cleanPath}`;

  try {
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': config.apiKey,
      },
    });

    if (!response.ok) {
      console.error('[BunnyStorage] Delete failed:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[BunnyStorage] Delete error:', error);
    return false;
  }
}

/**
 * Check if a file exists in Bunny Storage (bypassing CDN cache by hitting Storage API)
 * @param storagePath - The path within the storage zone
 * @returns true if file exists, false otherwise
 */
export async function checkBunnyFileExists(storagePath: string): Promise<boolean> {
  const config = getConfig();

  // Use Storage API if configured to avoid edge caching issues where deleted files still return 200
  if (config.storageZone && config.apiKey) {
    const cleanPath = extractBunnyPath(storagePath);
    const url = `https://${config.storageHostname}/${config.storageZone}/${cleanPath}`;
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'AccessKey': config.apiKey,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Fallback to CDN URL
  const cdnUrl = getBunnyCdnUrl(extractBunnyPath(storagePath));
  if (!cdnUrl) return false;

  try {
    const response = await fetch(`${cdnUrl}?_t=${Date.now()}`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a destination path for SOP files in Bunny Storage
 * @param sopIdentifier - e.g., "QAGE01-01"
 * @param fileType - "document", "video", or "slide"
 * @param fileName - The original file name
 */
export function generateBunnyPath(
  sopIdentifier: string,
  fileType: 'document' | 'video' | 'slide',
  fileName: string
): string {
  const sanitizedId = sopIdentifier.replace(/[^a-zA-Z0-9-]/g, '_');
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

  return `sop-files/${sanitizedId}/${fileType}s/${timestamp}-${sanitizedName}`;
}

/**
 * Generate path for SOP document uploads (department folders)
 * e.g. sop-documents/QA/QAGE01-01_1730123456789.docx
 */
export function generateSOPDocumentPath(
  department: string,
  sopIdentifier: string,
  fileName: string
): string {
  const sanitizedDept = department.replace(/[^a-zA-Z0-9-_]/g, '_');
  const sanitizedId = sopIdentifier.replace(/[^a-zA-Z0-9-]/g, '_');
  const timestamp = Date.now();
  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'docx';
  return `sop-documents/${sanitizedDept}/${sanitizedId}_${timestamp}.${ext}`;
}

interface BunnyListEntry {
  ObjectName: string;
  IsDirectory: boolean;
  LastChanged: string;
}

/**
 * List files directly from Bunny Storage API under a given path.
 */
async function listBunnyStoragePath(config: BunnyConfig, storagePath: string): Promise<BunnyListEntry[]> {
  const cleanPath = storagePath.replace(/^\/+|\/+$/g, '');
  const url = cleanPath
    ? `https://${config.storageHostname}/${config.storageZone}/${cleanPath}/`
    : `https://${config.storageHostname}/${config.storageZone}/`;
  try {
    const res = await fetch(url, {
      headers: { AccessKey: config.apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Search Bunny Storage for a DOCX file matching the given SOP identifier.
 * Lists sop-documents/ and its department subdirectories, finding the most-recently-modified
 * DOCX whose stem (after stripping a trailing timestamp) normalizes to the same code.
 * e.g. "QAGE09-10_1777290850711.docx" matches identifier "QAGE9-10".
 * Returns the CDN URL of the match, or null if not found.
 */
export async function searchBunnyStorageForDocx(
  identifier: string,
  _language?: string,
): Promise<string | null> {
  const config = getConfig();
  if (!config.storageZone || !config.apiKey || !config.cdnHostname) return null;

  // Normalize identifier: strip leading zeros so QAGE09-10 === QAGE9-10
  const normalizeId = (id: string): string => {
    const cleaned = id.toUpperCase().replace(/[‐-―−﹘﹣－]/g, '-');
    const m = cleaned.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
    if (m) return `${m[1]}${parseInt(m[2], 10)}-${parseInt(m[3], 10)}`;
    return cleaned;
  };

  const normalizedId = normalizeId((identifier || '').trim());
  if (!normalizedId) return null;

  const candidates: Array<{ path: string; lastChanged: string }> = [];

  const collectMatches = (entries: BunnyListEntry[], basePath: string) => {
    for (const entry of entries) {
      if (entry.IsDirectory) continue;
      const ext = entry.ObjectName.split('.').pop()?.toLowerCase() ?? '';
      if (ext !== 'docx' && ext !== 'doc') continue;
      // Strip extension and trailing Unix-ms timestamp (e.g. _1777290850711)
      const stem = entry.ObjectName.replace(/\.[^.]+$/, '').replace(/_\d{10,}$/, '');
      if (normalizeId(stem) === normalizedId) {
        candidates.push({ path: `${basePath}/${entry.ObjectName}`, lastChanged: entry.LastChanged });
      }
    }
  };

  // List sop-documents/ once — reuse for both flat files and dept dir list
  const topEntries = await listBunnyStoragePath(config, 'sop-documents');
  collectMatches(topEntries, 'sop-documents');

  if (!candidates.length) {
    const deptDirs = topEntries.filter((e) => e.IsDirectory).map((e) => e.ObjectName);
    for (const dept of deptDirs) {
      const deptEntries = await listBunnyStoragePath(config, `sop-documents/${dept}`);
      collectMatches(deptEntries, `sop-documents/${dept}`);
      if (candidates.length) break; // stop at first department that has a match
    }
  }

  if (!candidates.length) return null;

  // Return the most recently modified match
  candidates.sort((a, b) => new Date(b.lastChanged).getTime() - new Date(a.lastChanged).getTime());
  return getBunnyCdnUrl(candidates[0].path);
}

/**
 * Fetch file content from Bunny (CDN URL or bunny:// path).
 * Used by view-docx when the SOP file is stored in Bunny.
 */
export async function fetchBunnyFile(filePathOrUrl: string): Promise<Buffer | null> {
  let url: string;
  if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
    url = filePathOrUrl;
  } else if (filePathOrUrl.startsWith('bunny://')) {
    const path = filePathOrUrl.replace(/^bunny:\/\//, '');
    url = getBunnyCdnUrl(path);
  } else {
    url = getBunnyCdnUrl(filePathOrUrl);
  }
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    console.error('[BunnyStorage] fetchBunnyFile error:', err);
    return null;
  }
}

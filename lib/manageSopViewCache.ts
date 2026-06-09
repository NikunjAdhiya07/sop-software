const CACHE_PREFIX = 'manage-sop-view:v4';
const MEMORY_CACHE_TTL_MS = 15 * 60 * 1000;

type MemoryEntry = { cachedAt: number; payload: unknown };

const g = global as typeof global & {
  __manageSopViewCacheVersion?: number;
  __manageSopViewCache?: Map<string, MemoryEntry>;
  __manageSopViewInflight?: Map<string, Promise<unknown>>;
};

function normalizeYear(year: number | 'all'): string {
  return year === 'all' ? 'all' : String(year);
}

function normalizeSearch(search: string): string {
  return String(search || '').trim().toLowerCase();
}

function getActiveVersion(): number {
  return g.__manageSopViewCacheVersion ?? 1;
}

function buildCacheKey(version: number, year: number | 'all', search: string): string {
  const y = normalizeYear(year);
  const q = normalizeSearch(search);
  return `${CACHE_PREFIX}:${version}:${y}:${encodeURIComponent(q)}`;
}

function getMemoryStore(): Map<string, MemoryEntry> {
  if (!g.__manageSopViewCache) g.__manageSopViewCache = new Map();
  return g.__manageSopViewCache;
}

function pruneMemoryStore(store: Map<string, MemoryEntry>) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.cachedAt > MEMORY_CACHE_TTL_MS) {
      store.delete(key);
    }
  }
}

export async function getManageSopViewCached(
  year: number | 'all',
  search: string,
): Promise<unknown | null> {
  const key = buildCacheKey(getActiveVersion(), year, search);
  const store = getMemoryStore();
  pruneMemoryStore(store);
  const memory = store.get(key);
  if (!memory) return null;
  if (Date.now() - memory.cachedAt > MEMORY_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return memory.payload;
}

export async function setManageSopViewCached(
  year: number | 'all',
  search: string,
  payload: unknown,
): Promise<void> {
  const key = buildCacheKey(getActiveVersion(), year, search);
  const store = getMemoryStore();
  pruneMemoryStore(store);
  store.set(key, { cachedAt: Date.now(), payload });
}

export async function invalidateManageSopViewCache(): Promise<void> {
  g.__manageSopViewCacheVersion = getActiveVersion() + 1;
  g.__manageSopViewCache = new Map();
  g.__manageSopViewInflight = new Map();
}

/** Deduplicate concurrent cold rebuilds for the same cache key. */
export async function runManageSopViewRebuildSingleflight<T>(
  year: number | 'all',
  search: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = buildCacheKey(getActiveVersion(), year, search);
  if (!g.__manageSopViewInflight) g.__manageSopViewInflight = new Map();
  const existing = g.__manageSopViewInflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fn().finally(() => {
    g.__manageSopViewInflight?.delete(key);
  });
  g.__manageSopViewInflight.set(key, promise);
  return promise;
}

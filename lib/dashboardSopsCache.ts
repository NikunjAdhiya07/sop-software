const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

interface MemoryCacheEntry {
  payload: unknown;
  cachedAt: number;
}

const g = global as typeof global & { __dashboardSopsCache?: MemoryCacheEntry | null };

function getMemoryCache(): MemoryCacheEntry | null {
  const entry = g.__dashboardSopsCache ?? null;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > MEMORY_CACHE_TTL_MS) {
    g.__dashboardSopsCache = null;
    return null;
  }
  return entry;
}

export async function getDashboardSopsCache(): Promise<{ payload: unknown; cachedAt: number } | null> {
  return getMemoryCache();
}

export async function setDashboardSopsCache(payload: unknown): Promise<void> {
  g.__dashboardSopsCache = { payload, cachedAt: Date.now() };
}

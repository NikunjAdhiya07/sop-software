const CACHE_KEY = 'training-matrix-overview:v44';
const MEMORY_CACHE_TTL_MS = 15 * 60 * 1000;

type MemoryCacheEntry = { ts: number; key: string; payload: unknown };

function getMemoryCached(): unknown | null {
  const store = (globalThis as { __tm_overview_cache?: MemoryCacheEntry }).__tm_overview_cache;
  if (!store) return null;
  if (store.key !== CACHE_KEY) return null;
  if (Date.now() - store.ts > MEMORY_CACHE_TTL_MS) return null;
  return store.payload;
}

export function setMemoryCached(payload: unknown) {
  (globalThis as { __tm_overview_cache?: MemoryCacheEntry }).__tm_overview_cache = {
    ts: Date.now(),
    key: CACHE_KEY,
    payload,
  };
}

export async function getTrainingMatrixCached(): Promise<unknown | null> {
  return getMemoryCached();
}

export async function setTrainingMatrixCached(payload: unknown) {
  setMemoryCached(payload);
}

export async function invalidateTrainingMatrixCache() {
  (globalThis as { __tm_overview_cache?: MemoryCacheEntry }).__tm_overview_cache = undefined;
}

import type { RegistrySOP } from "@/lib/types";

export const DASHBOARD_CACHE_KEY = "sop-dashboard-cache-v1";
export const DASHBOARD_STATS_CACHE_KEY = "sop-dashboard-stats-v1";

/* ─── Server-side cache ──────────────────────────────────────────────────
 * Caches the expensive step — querying every SOP and grouping the records
 * into the registry shape. Filtering/sorting/paginating is cheap and runs
 * per-request on the cached array, so this single entry serves every query. */
let serverGroupedCache: { items: RegistrySOP[]; expiresAt: number } | null = null;
const SERVER_TTL_MS = 5 * 60 * 1000;

export function invalidateDashboardSopsCache() {
  serverGroupedCache = null;
}

export function getServerGroupedCache(): RegistrySOP[] | null {
  if (!serverGroupedCache || serverGroupedCache.expiresAt < Date.now()) return null;
  return serverGroupedCache.items;
}

export function setServerGroupedCache(items: RegistrySOP[]) {
  serverGroupedCache = { items, expiresAt: Date.now() + SERVER_TTL_MS };
}

/* ─── Client-side cache ──────────────────────────────────────────────────
 * Stale-while-revalidate store in sessionStorage so the dashboard paints
 * instantly on navigation while fresh data is fetched in the background. */
export function clearClientDashboardCache() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
  sessionStorage.removeItem(DASHBOARD_STATS_CACHE_KEY);
  localStorage.removeItem(DASHBOARD_CACHE_KEY);
  localStorage.removeItem(DASHBOARD_STATS_CACHE_KEY);
}

export function readClientCache<T>(key: string, field: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, T>;
    return obj?.[field] ?? null;
  } catch {
    return null;
  }
}

export function writeClientCache(key: string, field: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(key);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    obj[field] = value;
    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch {
    /* storage full or unavailable — caching is best-effort */
  }
}

export function bustDashboardCache() {
  invalidateDashboardSopsCache();
  clearClientDashboardCache();
}

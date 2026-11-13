// A cache key for a list read: its name plus the query, with the query's
// fields in a fixed order so the same filters always give the same key.
export function listCacheKey(name: string, query: object = {}): string {
  const fields = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, value]) => `${field}=${String(value)}`);
  return `${name}?${fields.join('&')}`;
}

// Owner lists are cached this long. Writes clear them sooner (see
// DashboardCache.invalidate).
export const LIST_CACHE_TTL_MS = 30_000;

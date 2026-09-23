// Cursors remain opaque: validate their transport encoding, not server-owned
// scope/timestamp internals. Never normalize, persist, or log a boundary.
function canonicalCursor(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === value;
  } catch { return false; }
}

export function validateHistoryPage<T extends { id?: number }>(data: unknown, field: string, previousCursor?: string) {
  const invalid = () => { throw new Error('Invalid records page'); };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalid();
  const page = data as Record<string, unknown>;
  const rows = page[field];
  // Stable bounded IDs are required for append/deduplication. A malformed row
  // must reject the entire page, never silently disappear or advance a cursor.
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !row || typeof row !== 'object'
    || Array.isArray(row) || !Number.isInteger(row.id) || row.id < 1 || row.id > 2147483647)
    || typeof page.hasMore !== 'boolean') return invalid();
  if (page.hasMore) {
    if (!rows.length || !canonicalCursor(page.nextCursor) || page.nextCursor === previousCursor) return invalid();
  } else if (page.nextCursor !== null) return invalid();
  return { rows: rows as T[], hasMore: page.hasMore, nextCursor: page.nextCursor as string | null };
}

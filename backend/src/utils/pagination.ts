import { createHash } from 'node:crypto';

export class PaginationError extends Error {
  constructor() { super('Invalid pagination parameters'); }
}

export interface CursorScope {
  endpoint: string;
  patient?: string;
  filters?: Record<string, string>;
  // Set only when the query is actor-scoped. Shared-clinic reads remain shared.
  actor?: number;
  nullableTimestamp?: boolean;
}
type Position = { v: 1; s: string; t: string | null; id: number };
const scopeHash = (scope: CursorScope) => createHash('sha256').update(JSON.stringify([
  scope.endpoint, scope.patient ?? null, scope.actor ?? null,
  Object.entries(scope.filters ?? {}).sort(([a], [b]) => a.localeCompare(b)),
])).digest('hex');

// PostgreSQL TIMESTAMP wall fields, not instants. Never round-trip through Date:
// it loses microseconds and invents a timezone for this legacy schema.
function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(value)) return false;
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59;
}

export function pagination(query: Record<string, unknown>, scope: CursorScope, defaultLimit: number, allowOffset = false) {
  // Express's simple query parser leaves bracket/dot objects as literal keys.
  // Reject these too, rather than silently treating an object cursor as absent.
  if (Object.keys(query).some(key => /^(cursor|limit|offset|filter)(?:\[|\.)/.test(key))) throw new PaginationError();
  const integer = (value: unknown, fallback: number, min: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || value.length > 6 || Number(value) < min || Number(value) > max) throw new PaginationError();
    return Number(value);
  };
  const limit = integer(query.limit, defaultLimit, 1, 100);
  if (query.offset !== undefined && (!allowOffset || query.cursor !== undefined)) throw new PaginationError();
  const offset = integer(query.offset, 0, 0, 100000);
  const hash = scopeHash(scope);
  let cursor: Position | null = null;
  if (query.cursor !== undefined) {
    const raw = query.cursor;
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new PaginationError();
    try {
      const bytes = Buffer.from(raw, 'base64url');
      if (bytes.toString('base64url') !== raw) throw new PaginationError();
      const parsed = JSON.parse(bytes.toString('utf8'));
      if (!parsed || Array.isArray(parsed) || Object.keys(parsed).sort().join(',') !== 'id,s,t,v'
        || parsed.v !== 1 || parsed.s !== hash || !Number.isInteger(parsed.id) || parsed.id < 1 || parsed.id > 2147483647
        || !(canonicalTimestamp(parsed.t) || (scope.nullableTimestamp && parsed.t === null))) throw new PaginationError();
      cursor = parsed;
    } catch { throw new PaginationError(); }
  }
  return {
    limit, offset, cursor,
    page<T extends { id: number; _cursor_timestamp: string | null }>(rows: T[]) {
      const hasMore = rows.length > limit;
      const visible = rows.slice(0, limit);
      const last = visible.at(-1);
      const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ v: 1, s: hash, t: last._cursor_timestamp, id: last.id })).toString('base64url') : null;
      return { rows: visible.map(({ _cursor_timestamp, ...row }) => row), hasMore, nextCursor };
    },
  };
}
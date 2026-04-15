import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';

export type CheckSeverity = 'error' | 'warning' | 'notice';

export interface CheckResult {
  code: string;
  severity: CheckSeverity;
  message: string; // Swedish fallback
  messageParams?: Record<string, string | number>; // for i18n interpolation in renderer
  personIds: string[];
  eventIds?: string[];
  relationshipIds?: string[];
  placeIds?: string[];
  resolvedLat?: number;
  resolvedLon?: number;
  matchedPath?: string;
}

/**
 * Load all events of a given type for all persons in two simple JOINs.
 * Returns a Map<person_id, [{event_id, date_value}]>.
 *
 * Using a single SQL query that joins event_participants × events twice (once
 * for births, once for deaths, etc.) produces a large intermediate Cartesian
 * product in WASM SQLite that can take 100+ seconds on 20k-person databases.
 * Two separate queries + a JS join is dramatically faster.
 */
export function loadPersonEvents(
  db: Database,
  eventType: string,
  dateTypes: string[] = ['exact', 'calculated'],
): Map<string, Array<{ event_id: string; date_value: string }>> {
  const placeholders = dateTypes.map(() => '?').join(', ');
  const rows = queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT ep.person_id, e.id AS event_id, e.date_value
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id
    WHERE e.event_type = ? AND e.date_type IN (${placeholders}) AND e.date_value IS NOT NULL
  `, [eventType, ...dateTypes]);
  const map = new Map<string, Array<{ event_id: string; date_value: string }>>();
  for (const r of rows) {
    if (!map.has(r.person_id)) map.set(r.person_id, []);
    map.get(r.person_id)!.push({ event_id: r.event_id, date_value: r.date_value });
  }
  return map;
}

/**
 * Returns a Set of person_ids that have at least one event of the given type.
 * Used by NOT-EXISTS-style checks to avoid correlated subqueries that run
 * O(n) SQL lookups per row.
 */
export function personIdsWithEvent(db: Database, eventType: string): Set<string> {
  const rows = queryAll<{ person_id: string }>(db, `
    SELECT DISTINCT ep.person_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id
    WHERE e.event_type = ?
  `, [eventType]);
  return new Set(rows.map(r => r.person_id));
}

/**
 * Returns true only if date string `a` is definitively later than `b`.
 * Handles mixed precision: year-only ("1777"), year-month ("1777-02"),
 * full date ("1777-02-12"). Never flags when precision is insufficient —
 * e.g. birth "1777-02-12" vs death "1777" returns false because we don't
 * know which month in 1777 the person died.
 */
export function dateDefinitelyAfter(a: string, b: string): boolean {
  const aYear = a.substring(0, 4);
  const bYear = b.substring(0, 4);
  if (aYear > bYear) return true;
  if (aYear < bYear) return false;
  if (a.length < 7 || b.length < 7) return false;
  const aMonth = a.substring(5, 7);
  const bMonth = b.substring(5, 7);
  if (aMonth > bMonth) return true;
  if (aMonth < bMonth) return false;
  if (a.length < 10 || b.length < 10) return false;
  return a.substring(8, 10) > b.substring(8, 10);
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Days per month (non-leap). February is capped at 29 to allow leap-year
 * dates without requiring full leap-year calculation — the goal is to catch
 * clearly impossible dates like month 14 or day 90.
 */
const DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isInvalidDate(d: string): string | null {
  // Expect YYYY, YYYY-MM, or YYYY-MM-DD
  const parts = d.split('-');
  // Handle negative years (leading -)
  const negative = d.startsWith('-');
  if (negative) {
    parts.shift(); // remove empty string before the first -
    if (parts.length > 0) parts[0] = '-' + parts[0];
  }
  const year = parseInt(parts[0], 10);
  if (isNaN(year) || year < 0) return `ogiltigt år (${parts[0]})`;
  if (parts.length === 1) return null;
  const month = parseInt(parts[1], 10);
  if (isNaN(month) || month < 1 || month > 12) return `ogiltig månad (${month})`;
  if (parts.length === 2) return null;
  const day = parseInt(parts[2], 10);
  if (isNaN(day) || day < 1 || day > DAYS_IN_MONTH[month]) return `ogiltig dag (${day}) för månad ${month}`;
  return null;
}

export const TODAY = new Date().toISOString().substring(0, 10);

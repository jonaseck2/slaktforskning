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
  mediaIds?: string[];
  sourceIds?: string[];
  resolvedLat?: number;
  resolvedLon?: number;
  matchedPath?: string;
  /**
   * Deep-link target for this finding. For DUPLICATE_* rows this routes the
   * genealogist to the duplicates view's correct tab and pre-opens the
   * compare-and-merge modal for the named pair, so they don't have to
   * re-locate the row by hand.
   *
   * Format: '/duplicates?tab=<entity>&pair=<id1>:<id2>'.
   */
  landingPath?: string;
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

const MONTH_NAMES_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAMES_SV: Record<string, number> = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6,
  juli: 7, augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
  // Common Swedish 3-letter abbreviations that don't collide with English
  okt: 10,
};

/**
 * Tolerant date parser for the free-form strings the MCP / GEDCOM importers
 * may store in `events.date_value`. Returns `{y, m?, d?}` on a recognized
 * shape, `null` otherwise.
 *
 * Recognized shapes:
 *   - "1763"
 *   - "1763-01-26", "1763-01" (ISO)
 *   - "26 Jan 1763", "26 January 1763", "January 26 1763"
 *   - "1763 Jan 26"
 *
 * Rule: a 4-digit run is the year; an English/Swedish month name is the
 * month; any 1–2 digit run that isn't the year is the day. Falls back to
 * the year alone when month/day can't be disambiguated.
 *
 * Why this exists: pre-2026-05-09, checks computed years via
 * `CAST(SUBSTR(date_value, 1, 4) AS INTEGER)` which assumed the column
 * always holds ISO. When the MCP stored "26 Jan 1763" it returned 26 — the
 * day-of-month — flagging Karl XIV Johan as born in year 26 against a son
 * born in year 4. 65% of the run_checks output was this single bug.
 */
export function parseLooseDate(s: string | null | undefined): { y: number; m?: number; d?: number } | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  // Fast path for ISO `YYYY` / `YYYY-MM` / `YYYY-MM-DD` (also accepts negative years).
  const iso = trimmed.match(/^(-?\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = iso[2] ? parseInt(iso[2], 10) : undefined;
    const d = iso[3] ? parseInt(iso[3], 10) : undefined;
    return { y, m, d };
  }

  // First 4-consecutive-digit run is treated as the year.
  const yearMatch = trimmed.match(/-?\d{4}/);
  if (!yearMatch) return null;
  const y = parseInt(yearMatch[0], 10);

  // Look for a month name (English or Swedish).
  let m: number | undefined;
  for (const word of trimmed.toLowerCase().split(/[^a-zåäö]+/)) {
    if (!word) continue;
    const wordKey = word.length >= 3 ? word.slice(0, 3) : word;
    if (MONTH_NAMES_EN[wordKey] !== undefined) {
      m = MONTH_NAMES_EN[wordKey];
      break;
    }
    if (MONTH_NAMES_SV[word] !== undefined) {
      m = MONTH_NAMES_SV[word];
      break;
    }
    if (MONTH_NAMES_SV[wordKey] !== undefined) {
      m = MONTH_NAMES_SV[wordKey];
      break;
    }
  }

  // Look for a 1–2 digit run that isn't part of the year.
  let d: number | undefined;
  if (m !== undefined) {
    // Exclude the year span before scanning for a day so the year's first/last
    // digit can't be misread as a day.
    const yearStart = trimmed.indexOf(yearMatch[0]);
    const before = trimmed.slice(0, yearStart);
    const after = trimmed.slice(yearStart + yearMatch[0].length);
    const dayCandidates = (before + ' ' + after).match(/\b\d{1,2}\b/g);
    if (dayCandidates && dayCandidates.length > 0) {
      const candidate = parseInt(dayCandidates[0], 10);
      if (candidate >= 1 && candidate <= 31) d = candidate;
    }
  }

  return { y, m, d };
}

/**
 * Year-only convenience accessor for SQL JOINs that need to select years
 * out of date_value columns. Returns NaN-safe `null` when the column is
 * empty or unparseable.
 */
export function extractYear(s: string | null | undefined): number | null {
  const parsed = parseLooseDate(s);
  return parsed ? parsed.y : null;
}

/**
 * Returns true only if date string `a` is definitively later than `b`.
 * Handles mixed precision: year-only ("1777"), year-month ("1777-02"),
 * full date ("1777-02-12"). Never flags when precision is insufficient —
 * e.g. birth "1777-02-12" vs death "1777" returns false because we don't
 * know which month in 1777 the person died.
 *
 * Uses parseLooseDate so it works against both ISO `date_value` and the
 * free-form strings the MCP may have stored before normalization landed.
 */
export function dateDefinitelyAfter(a: string, b: string): boolean {
  const pa = parseLooseDate(a);
  const pb = parseLooseDate(b);
  if (!pa || !pb) return false;
  if (pa.y > pb.y) return true;
  if (pa.y < pb.y) return false;
  if (pa.m === undefined || pb.m === undefined) return false;
  if (pa.m > pb.m) return true;
  if (pa.m < pb.m) return false;
  if (pa.d === undefined || pb.d === undefined) return false;
  return pa.d > pb.d;
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

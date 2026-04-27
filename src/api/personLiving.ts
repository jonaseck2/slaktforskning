import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne } from './db';

/**
 * Threshold beyond which a person with a known birth but no death event
 * is presumed deceased. Standard genealogy convention.
 */
export const PRESUMED_DEAD_AGE_YEARS = 120;

/**
 * Returns a SQL expression yielding 1 if the person is living, else 0.
 * The expression references the given person table alias (default `p`).
 *
 * Living = no death/burial/cremation event AND
 *          (no birth event OR birth year >= currentYear - PRESUMED_DEAD_AGE_YEARS).
 */
export function livingSqlExpr(personAlias = 'p'): string {
  return `(CASE
    WHEN EXISTS (
      SELECT 1 FROM events e_d
      JOIN event_participants ep_d ON ep_d.event_id = e_d.id
      WHERE ep_d.person_id = ${personAlias}.id
        AND e_d.event_type IN ('death', 'burial', 'cremation')
    ) THEN 0
    WHEN EXISTS (
      SELECT 1 FROM events e_b
      JOIN event_participants ep_b ON ep_b.event_id = e_b.id
      WHERE ep_b.person_id = ${personAlias}.id
        AND e_b.event_type = 'birth'
        AND e_b.date_value IS NOT NULL
        AND length(e_b.date_value) >= 4
        AND CAST(substr(e_b.date_value, 1, 4) AS INTEGER) > 0
        AND CAST(substr(e_b.date_value, 1, 4) AS INTEGER) < (CAST(strftime('%Y', 'now') AS INTEGER) - ${PRESUMED_DEAD_AGE_YEARS})
    ) THEN 0
    ELSE 1
  END)`;
}

export function isPersonLiving(db: Database, personId: string): boolean {
  const row = queryOne<{ living: number }>(db,
    `SELECT ${livingSqlExpr('p')} AS living FROM persons p WHERE p.id = ?`,
    [personId]
  );
  return row ? row.living === 1 : true;
}

/**
 * Pre-aggregated derivation data for bulk living/deceased computation.
 * Two set-returning queries replace `livingSqlExpr`'s per-row correlated
 * subqueries — O(events) total instead of O(persons × events_per_person).
 * Use this when deriving `living` for many persons at once (snapshot,
 * preview, reports). For single-person lookups `isPersonLiving` is fine.
 */
export interface LivingDerivation {
  deceasedIds: Set<string>;
  birthYears: Map<string, number>;
  cutoffYear: number;
}

export function loadLivingDerivation(db: Database): LivingDerivation {
  const deceasedRows = queryAll<{ person_id: string }>(
    db,
    `SELECT DISTINCT ep.person_id
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     WHERE e.event_type IN ('death', 'burial', 'cremation')`,
  );
  const deceasedIds = new Set(deceasedRows.map(r => r.person_id));

  const birthRows = queryAll<{ person_id: string; year: number }>(
    db,
    `SELECT ep.person_id, MIN(CAST(substr(e.date_value, 1, 4) AS INTEGER)) AS year
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     WHERE e.event_type = 'birth'
       AND e.date_value IS NOT NULL
       AND length(e.date_value) >= 4
       AND CAST(substr(e.date_value, 1, 4) AS INTEGER) > 0
     GROUP BY ep.person_id`,
  );
  const birthYears = new Map<string, number>();
  for (const r of birthRows) birthYears.set(r.person_id, r.year);

  const cutoffYear = new Date().getFullYear() - PRESUMED_DEAD_AGE_YEARS;
  return { deceasedIds, birthYears, cutoffYear };
}

export function isLivingDerived(personId: string, d: LivingDerivation): boolean {
  if (d.deceasedIds.has(personId)) return false;
  const by = d.birthYears.get(personId);
  if (by !== undefined && by < d.cutoffYear) return false;
  return true;
}

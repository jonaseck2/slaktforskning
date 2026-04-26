import type { Database } from 'node-sqlite3-wasm';
import { queryOne } from './db';

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

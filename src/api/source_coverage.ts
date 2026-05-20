// Source coverage event CRUD (T08 — GEDCOM alignment plan).
//
// A `source_coverage_events` row records what *kinds* of events / date ranges
// / places a single source covers as a whole — e.g. "Östergötland parish
// register covers BIRT events 1850-1920 in Östergötland". This is distinct
// from a `citation`, which attaches a source to one specific authored event.
//
// Round-trips losslessly under both GEDCOM 5.5.1 and 7.0 via the SOUR/DATA
// /EVEN substructure (spec identical across both versions).

import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { SourceCoverageEvent } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export async function createSourceCoverageEvent(
  db: Database,
  data: {
    source_id: string;
    event_type: string;
    date_value_from?: string;
    date_value_to?: string;
    place_id?: string | null;
    notes?: string;
  },
): Promise<SourceCoverageEvent> {
  const id = uuid();
  await runSql(
    db,
    `INSERT INTO source_coverage_events
       (id, source_id, event_type, date_value_from, date_value_to, place_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.source_id,
      data.event_type,
      data.date_value_from ?? '',
      data.date_value_to ?? '',
      data.place_id ?? null,
      data.notes ?? '',
    ],
  );
  return (await getSourceCoverageEvent(db, id))!;
}

export async function getSourceCoverageEvent(
  db: Database,
  id: string,
): Promise<SourceCoverageEvent | null> {
  return (
    (await queryOne<SourceCoverageEvent>(
      db,
      `SELECT * FROM source_coverage_events WHERE id = ?`,
      [id],
    )) ?? null
  );
}

/** All coverage rows attached to a given source, in insertion order. */
export async function getCoverageForSource(
  db: Database,
  sourceId: string,
): Promise<SourceCoverageEvent[]> {
  return await queryAll<SourceCoverageEvent>(
    db,
    `SELECT * FROM source_coverage_events WHERE source_id = ? ORDER BY created_at, id`,
    [sourceId],
  );
}

export async function updateSourceCoverageEvent(
  db: Database,
  id: string,
  data: Partial<Pick<SourceCoverageEvent, 'event_type' | 'date_value_from' | 'date_value_to' | 'place_id' | 'notes'>>,
): Promise<SourceCoverageEvent | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    if (key === 'place_id') {
      values.push(value ?? null);
    } else {
      values.push(value ?? '');
    }
  }
  if (fields.length === 0) return await getSourceCoverageEvent(db, id);
  values.push(id);
  await runSql(db, `UPDATE source_coverage_events SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getSourceCoverageEvent(db, id);
}

export async function deleteSourceCoverageEvent(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, `DELETE FROM source_coverage_events WHERE id = ?`, [id])) > 0;
}

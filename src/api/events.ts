import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { GenealogyEvent } from './types';
import { queryOne, queryAll, runSql, runSqlChanges, runBatch } from './db';

export async function createEvent(
  db: Database,
  data: {
    event_type: string;
    relationship_id?: string | null;
    date_type?: GenealogyEvent['date_type'];
    date_value?: string | null;
    date_value_end?: string | null;
    date_original?: string;
    place_id?: string | null;
    cause?: string | null;
    value?: string | null;
    notes?: string;
    is_negation?: boolean;
    negation_event_type?: string;
  }
): Promise<GenealogyEvent> {
  const id = uuid();
  await runSql(db, `
    INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, cause, value, notes, is_negation, negation_event_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.event_type,
    data.relationship_id ?? null,
    data.date_type ?? 'unknown',
    data.date_value ?? null,
    data.date_value_end ?? null,
    data.date_original ?? '',
    data.place_id ?? null,
    data.cause ?? null,
    data.value ?? null,
    data.notes ?? '',
    data.is_negation ? 1 : 0,
    data.negation_event_type ?? '',
  ]);
  return (await getEvent(db, id))!;
}

/**
 * Bulk-insert events rows. One batched INSERT for N rows — used by the
 * GEDCOM importer's phaseIndividuals + phaseFamilies to collapse N IPC
 * calls into one for the per-event row.
 *
 * Each row may supply its own `id`; otherwise a v4 UUID is generated.
 * Callers that need the id ahead of time (the importer's collect-then-flush
 * shape) MUST supply it so downstream rows (citations, participants,
 * media_links) can reference it without a second pass.
 *
 * `place_address` is included here so the per-event "UPDATE events SET
 * place_address = ?" follow-up call in the singular path is folded into
 * the bulk INSERT.
 */
export async function bulkCreateEvents(
  db: Database,
  rows: Array<{
    id?: string;
    event_type: string;
    relationship_id?: string | null;
    date_type?: GenealogyEvent['date_type'];
    date_value?: string | null;
    date_value_end?: string | null;
    date_original?: string;
    place_id?: string | null;
    place_address?: string | null;
    cause?: string | null;
    value?: string | null;
    notes?: string;
    is_negation?: boolean;
    negation_event_type?: string;
  }>,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const ids: string[] = new Array(rows.length);
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.id ?? uuid();
    ids[i] = id;
    params[i] = [
      id,
      r.event_type,
      r.relationship_id ?? null,
      r.date_type ?? 'unknown',
      r.date_value ?? null,
      r.date_value_end ?? null,
      r.date_original ?? '',
      r.place_id ?? null,
      r.place_address ?? null,
      r.cause ?? null,
      r.value ?? null,
      r.notes ?? '',
      r.is_negation ? 1 : 0,
      r.negation_event_type ?? '',
    ];
  }
  await runBatch(
    db,
    'INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes, is_negation, negation_event_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params,
  );
  return ids;
}

export async function getEvent(db: Database, id: string): Promise<GenealogyEvent | null> {
  return (await queryOne<GenealogyEvent>(db, `SELECT * FROM events WHERE id = ?`, [id])) ?? null;
}

export async function getEventsForPerson(db: Database, personId: string): Promise<(GenealogyEvent & { citation_count: number })[]> {
  return await queryAll<GenealogyEvent & { citation_count: number }>(db, `
    SELECT e.*, COALESCE(cc.cnt, 0) AS citation_count, p.name AS place_name
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM citations WHERE event_id IN (SELECT e2.id FROM events e2 JOIN event_participants ep2 ON ep2.event_id = e2.id WHERE ep2.person_id = ?) GROUP BY event_id) cc ON cc.event_id = e.id
    LEFT JOIN places p ON p.id = e.place_id
    WHERE ep.person_id = ?
    ORDER BY e.date_value
  `, [personId, personId]);
}

export async function getEventsForRelationship(db: Database, relationshipId: string): Promise<(GenealogyEvent & { citation_count: number })[]> {
  return await queryAll<GenealogyEvent & { citation_count: number }>(db, `
    SELECT e.*, COALESCE(cc.cnt, 0) AS citation_count, p.name AS place_name
    FROM events e
    LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM citations WHERE event_id IN (SELECT e2.id FROM events e2 WHERE e2.relationship_id = ?) GROUP BY event_id) cc ON cc.event_id = e.id
    LEFT JOIN places p ON p.id = e.place_id
    WHERE e.relationship_id = ?
    ORDER BY e.date_value
  `, [relationshipId, relationshipId]);
}

export async function getEventsForPlace(db: Database, placeId: string): Promise<(GenealogyEvent & { participant_names: string })[]> {
  return await queryAll<GenealogyEvent & { participant_names: string }>(db, `
    SELECT e.*,
      COALESCE(
        GROUP_CONCAT(
          COALESCE(pn.given_name, '') || ' ' || COALESCE(pn.surname, ''),
          ', '
        ),
        ''
      ) AS participant_names
    FROM events e
    LEFT JOIN event_participants ep ON ep.event_id = e.id
    LEFT JOIN person_names pn ON pn.person_id = ep.person_id AND pn.sort_order = (
      SELECT MIN(pn2.sort_order) FROM person_names pn2 WHERE pn2.person_id = ep.person_id
    )
    WHERE e.place_id = ?
    GROUP BY e.id
    ORDER BY e.date_value
  `, [placeId]);
}

export async function updateEvent(
  db: Database,
  id: string,
  data: Partial<Omit<GenealogyEvent, 'id' | 'created_at' | 'updated_at'>>
): Promise<GenealogyEvent | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    // T06: coerce booleans to SQLite 0/1 for is_negation (the column is
    // INTEGER NOT NULL DEFAULT 0; passing JS boolean true would bind as
    // text 'true' under some drivers).
    if (key === 'is_negation') {
      values.push(value ? 1 : 0);
    } else {
      values.push(value ?? null);
    }
  }
  if (fields.length === 0) return await getEvent(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await runSql(db, `UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getEvent(db, id);
}

export async function deleteEvent(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, `DELETE FROM events WHERE id = ?`, [id])) > 0;
}

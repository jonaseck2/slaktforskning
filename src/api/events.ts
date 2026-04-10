import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { GenealogyEvent } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createEvent(
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
    description?: string;
  }
): GenealogyEvent {
  const id = uuid();
  runSql(db, `
    INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, cause, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    data.description ?? ''
  ]);
  return getEvent(db, id)!;
}

export function getEvent(db: Database, id: string): GenealogyEvent | null {
  return queryOne<GenealogyEvent>(db, `SELECT * FROM events WHERE id = ?`, [id]) ?? null;
}

export function getEventsForPerson(db: Database, personId: string): (GenealogyEvent & { citation_count: number })[] {
  return queryAll<GenealogyEvent & { citation_count: number }>(db, `
    SELECT e.*, COALESCE(cc.cnt, 0) AS citation_count
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM citations GROUP BY event_id) cc ON cc.event_id = e.id
    WHERE ep.person_id = ?
    ORDER BY e.date_value
  `, [personId]);
}

export function getEventsForRelationship(db: Database, relationshipId: string): (GenealogyEvent & { citation_count: number })[] {
  return queryAll<GenealogyEvent & { citation_count: number }>(db, `
    SELECT e.*, COALESCE(cc.cnt, 0) AS citation_count
    FROM events e
    LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM citations GROUP BY event_id) cc ON cc.event_id = e.id
    WHERE e.relationship_id = ?
    ORDER BY e.date_value
  `, [relationshipId]);
}

export function updateEvent(
  db: Database,
  id: string,
  data: Partial<Omit<GenealogyEvent, 'id' | 'created_at' | 'updated_at'>>
): GenealogyEvent | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value ?? null);
  }
  if (fields.length === 0) return getEvent(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  runSql(db, `UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
  return getEvent(db, id);
}

export function deleteEvent(db: Database, id: string): boolean {
  return runSqlChanges(db, `DELETE FROM events WHERE id = ?`, [id]) > 0;
}

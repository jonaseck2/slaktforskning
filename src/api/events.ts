import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { GenealogyEvent } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

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
  }
): Promise<GenealogyEvent> {
  const id = uuid();
  await runSql(db, `
    INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, cause, value, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    data.notes ?? ''
  ]);
  return (await getEvent(db, id))!;
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
    values.push(value ?? null);
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

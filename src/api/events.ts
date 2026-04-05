import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { GenealogyEvent } from './types';

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
  db.prepare(`
    INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, cause, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
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
  return (db.prepare(`SELECT * FROM events WHERE id = ?`).get([id]) as GenealogyEvent) ?? null;
}

export function getEventsForPerson(db: Database, personId: string): GenealogyEvent[] {
  return db.prepare(`
    SELECT e.* FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE ep.person_id = ?
    ORDER BY e.date_value
  `).all([personId]) as GenealogyEvent[];
}

export function getEventsForRelationship(db: Database, relationshipId: string): GenealogyEvent[] {
  return db.prepare(`SELECT * FROM events WHERE relationship_id = ? ORDER BY date_value`).all([relationshipId]) as GenealogyEvent[];
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
  db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(values);
  return getEvent(db, id);
}

export function deleteEvent(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM events WHERE id = ?`).run([id]).changes > 0;
}

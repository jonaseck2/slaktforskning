import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Relationship, EventParticipant, RelationshipType, EventParticipantRole } from './types';

export function createRelationship(
  db: Database,
  data: {
    type: RelationshipType;
    person1_id?: string | null;
    person2_id?: string | null;
    subtype?: string | null;
    notes?: string;
  }
): Relationship {
  const id = uuid();
  db.prepare(`
    INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run([id, data.type, data.person1_id ?? null, data.person2_id ?? null, data.subtype ?? null, data.notes ?? '']);
  return getRelationship(db, id)!;
}

export function getRelationship(db: Database, id: string): Relationship | null {
  return (db.prepare(`SELECT * FROM relationships WHERE id = ?`).get([id]) as Relationship) ?? null;
}

export function listRelationships(db: Database): Relationship[] {
  return db.prepare(`SELECT * FROM relationships ORDER BY created_at`).all() as Relationship[];
}

export function updateRelationship(
  db: Database,
  id: string,
  data: Partial<Pick<Relationship, 'type' | 'person1_id' | 'person2_id' | 'subtype' | 'notes'>>
): Relationship | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value ?? null);
  }
  if (fields.length === 0) return getRelationship(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE relationships SET ${fields.join(', ')} WHERE id = ?`).run(values);
  return getRelationship(db, id);
}

export function deleteRelationship(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM relationships WHERE id = ?`).run([id]).changes > 0;
}

export function getRelationshipsOfPerson(db: Database, personId: string): Relationship[] {
  return db.prepare(`
    SELECT * FROM relationships
    WHERE person1_id = ? OR person2_id = ?
    ORDER BY type, created_at
  `).all([personId, personId]) as Relationship[];
}

export function searchRelationships(
  db: Database,
  query: string
): (Relationship & { person1_given_name: string; person1_surname: string; person2_given_name: string; person2_surname: string })[] {
  const like = `%${query}%`;
  return db.prepare(`
    SELECT DISTINCT r.*,
      COALESCE(pn1.given_name, '') as person1_given_name,
      COALESCE(pn1.surname, '') as person1_surname,
      COALESCE(pn2.given_name, '') as person2_given_name,
      COALESCE(pn2.surname, '') as person2_surname
    FROM relationships r
    LEFT JOIN person_names pn1 ON pn1.person_id = r.person1_id
      AND pn1.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = r.person1_id)
    LEFT JOIN person_names pn2 ON pn2.person_id = r.person2_id
      AND pn2.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = r.person2_id)
    WHERE pn1.given_name LIKE ? OR pn1.surname LIKE ?
       OR pn2.given_name LIKE ? OR pn2.surname LIKE ?
    ORDER BY pn1.surname, pn1.given_name
  `).all([like, like, like, like]) as unknown as (Relationship & { person1_given_name: string; person1_surname: string; person2_given_name: string; person2_surname: string })[];
}

// Event Participants

export function addEventParticipant(
  db: Database,
  data: {
    event_id: string;
    person_id: string;
    role?: EventParticipantRole;
  }
): EventParticipant {
  const id = uuid();
  db.prepare(`
    INSERT INTO event_participants (id, event_id, person_id, role)
    VALUES (?, ?, ?, ?)
  `).run([id, data.event_id, data.person_id, data.role ?? 'primary']);
  return db.prepare(`SELECT * FROM event_participants WHERE id = ?`).get([id]) as EventParticipant;
}

export function getEventParticipants(db: Database, eventId: string): EventParticipant[] {
  return db.prepare(`SELECT * FROM event_participants WHERE event_id = ?`).all([eventId]) as EventParticipant[];
}

export function removeEventParticipant(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM event_participants WHERE id = ?`).run([id]).changes > 0;
}

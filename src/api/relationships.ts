import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Relationship, EventParticipant, RelationshipType, EventParticipantRole } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';
import { displayedNameIdSql } from './persons';

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
  runSql(db, `
    INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, data.type, data.person1_id ?? null, data.person2_id ?? null, data.subtype ?? null, data.notes ?? '']);
  return getRelationship(db, id)!;
}

export function getRelationship(db: Database, id: string): Relationship | null {
  return queryOne<Relationship>(db, `SELECT * FROM relationships WHERE id = ?`, [id]) ?? null;
}

export function listRelationships(db: Database): Relationship[] {
  return queryAll<Relationship>(db, `SELECT * FROM relationships ORDER BY created_at`);
}

type RelWithNames = Relationship & {
  person1_given_name: string; person1_surname: string;
  person1_preferred_name: string | null; person1_nickname: string | null;
  person1_sex: 'M' | 'F' | 'U' | null;
  person2_given_name: string; person2_surname: string;
  person2_preferred_name: string | null; person2_nickname: string | null;
  person2_sex: 'M' | 'F' | 'U' | null;
};

export function countRelationships(db: Database): number {
  return (queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM relationships`) ?? { n: 0 }).n;
}

export function listRelationshipsPage(db: Database, limit: number, offset: number): RelWithNames[] {
  return queryAll<RelWithNames>(db, `
    SELECT r.*,
      COALESCE(pn1.given_name, '') as person1_given_name,
      COALESCE(pn1.surname, '') as person1_surname,
      pn1.preferred_name as person1_preferred_name,
      pn1.nickname as person1_nickname,
      p1.sex as person1_sex,
      COALESCE(pn2.given_name, '') as person2_given_name,
      COALESCE(pn2.surname, '') as person2_surname,
      pn2.preferred_name as person2_preferred_name,
      pn2.nickname as person2_nickname,
      p2.sex as person2_sex
    FROM relationships r
    LEFT JOIN persons p1 ON p1.id = r.person1_id
    LEFT JOIN persons p2 ON p2.id = r.person2_id
    LEFT JOIN person_names pn1 ON pn1.id = ${displayedNameIdSql('r.person1_id')}
    LEFT JOIN person_names pn2 ON pn2.id = ${displayedNameIdSql('r.person2_id')}
    ORDER BY r.created_at
    LIMIT ? OFFSET ?
  `, [limit, offset]);
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
  runSql(db, `UPDATE relationships SET ${fields.join(', ')} WHERE id = ?`, values);
  return getRelationship(db, id);
}

export function deleteRelationship(db: Database, id: string): boolean {
  return runSqlChanges(db, `DELETE FROM relationships WHERE id = ?`, [id]) > 0;
}

export function getRelationshipsOfPerson(db: Database, personId: string): Relationship[] {
  return queryAll<Relationship>(db, `
    SELECT * FROM relationships
    WHERE person1_id = ? OR person2_id = ?
    ORDER BY type, created_at
  `, [personId, personId]);
}

export function searchRelationships(
  db: Database,
  query: string
): (Relationship & { person1_given_name: string; person1_surname: string; person1_preferred_name: string | null; person1_nickname: string | null; person2_given_name: string; person2_surname: string; person2_preferred_name: string | null; person2_nickname: string | null })[] {
  const like = `%${query}%`;
  return queryAll<Relationship & { person1_given_name: string; person1_surname: string; person1_preferred_name: string | null; person1_nickname: string | null; person2_given_name: string; person2_surname: string; person2_preferred_name: string | null; person2_nickname: string | null }>(db, `
    SELECT DISTINCT r.*,
      COALESCE(pn1.given_name, '') as person1_given_name,
      COALESCE(pn1.surname, '') as person1_surname,
      pn1.preferred_name as person1_preferred_name,
      pn1.nickname as person1_nickname,
      COALESCE(pn2.given_name, '') as person2_given_name,
      COALESCE(pn2.surname, '') as person2_surname,
      pn2.preferred_name as person2_preferred_name,
      pn2.nickname as person2_nickname
    FROM relationships r
    LEFT JOIN person_names pn1 ON pn1.id = ${displayedNameIdSql('r.person1_id')}
    LEFT JOIN person_names pn2 ON pn2.id = ${displayedNameIdSql('r.person2_id')}
    WHERE pn1.given_name LIKE ? OR pn1.surname LIKE ?
       OR pn2.given_name LIKE ? OR pn2.surname LIKE ?
    ORDER BY pn1.surname, pn1.given_name
  `, [like, like, like, like]);
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
  runSql(db, `
    INSERT INTO event_participants (id, event_id, person_id, role)
    VALUES (?, ?, ?, ?)
  `, [id, data.event_id, data.person_id, data.role ?? 'primary']);
  return queryOne<EventParticipant>(db, `SELECT * FROM event_participants WHERE id = ?`, [id])!;
}

export function getEventParticipants(db: Database, eventId: string): EventParticipant[] {
  return queryAll<EventParticipant>(db, `SELECT * FROM event_participants WHERE event_id = ?`, [eventId]);
}

export function removeEventParticipant(db: Database, id: string): boolean {
  return runSqlChanges(db, `DELETE FROM event_participants WHERE id = ?`, [id]) > 0;
}

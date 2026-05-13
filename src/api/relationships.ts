import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Relationship, EventParticipant, RelationshipType, EventParticipantRole } from './types';
import { queryOne, queryAll, runSql, runSqlChanges, runBatch } from './db';
import { displayedNameIdSql, birthSurnameSql } from './persons';

export async function createRelationship(
  db: Database,
  data: {
    type: RelationshipType;
    person1_id?: string | null;
    person2_id?: string | null;
    subtype?: string | null;
    notes?: string;
  }
): Promise<Relationship> {
  const id = uuid();
  await runSql(db, `
    INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, data.type, data.person1_id ?? null, data.person2_id ?? null, data.subtype ?? null, data.notes ?? '']);
  return (await getRelationship(db, id))!;
}

/**
 * Bulk-insert relationships rows. One batched INSERT for N rows — used by
 * the GEDCOM importer's phaseFamilies for couple + parent_child rows.
 * Caller may supply `id`; otherwise a v4 UUID is generated. Caller MUST
 * supply `id` when downstream code references it before the flush.
 */
export async function bulkCreateRelationships(
  db: Database,
  rows: Array<{
    id?: string;
    type: RelationshipType;
    person1_id?: string | null;
    person2_id?: string | null;
    subtype?: string | null;
    notes?: string;
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
      r.type,
      r.person1_id ?? null,
      r.person2_id ?? null,
      r.subtype ?? null,
      r.notes ?? '',
    ];
  }
  await runBatch(
    db,
    'INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes) VALUES (?, ?, ?, ?, ?, ?)',
    params,
  );
  return ids;
}

export async function getRelationship(db: Database, id: string): Promise<Relationship | null> {
  return (await queryOne<Relationship>(db, `SELECT * FROM relationships WHERE id = ?`, [id])) ?? null;
}

export async function listRelationships(db: Database): Promise<Relationship[]> {
  return await queryAll<Relationship>(db, `SELECT * FROM relationships ORDER BY created_at`);
}

type RelWithNames = Relationship & {
  person1_given_name: string; person1_surname: string;
  person1_preferred_name: string | null; person1_nickname: string | null;
  person1_birth_surname: string | null;
  person1_sex: 'M' | 'F' | 'U' | null;
  person2_given_name: string; person2_surname: string;
  person2_preferred_name: string | null; person2_nickname: string | null;
  person2_birth_surname: string | null;
  person2_sex: 'M' | 'F' | 'U' | null;
};

export async function countRelationships(db: Database): Promise<number> {
  return ((await queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM relationships`)) ?? { n: 0 }).n;
}

export async function listRelationshipsPage(db: Database, limit: number, offset: number): Promise<RelWithNames[]> {
  // `person1_birth_surname` / `person2_birth_surname` are display-only —
  // see plan birth-name-display-and-quality-check. Never persisted.
  return await queryAll<RelWithNames>(db, `
    SELECT r.*,
      COALESCE(pn1.given_name, '') as person1_given_name,
      COALESCE(pn1.surname, '') as person1_surname,
      pn1.preferred_name as person1_preferred_name,
      pn1.nickname as person1_nickname,
      ${birthSurnameSql('r.person1_id')} as person1_birth_surname,
      p1.sex as person1_sex,
      COALESCE(pn2.given_name, '') as person2_given_name,
      COALESCE(pn2.surname, '') as person2_surname,
      pn2.preferred_name as person2_preferred_name,
      pn2.nickname as person2_nickname,
      ${birthSurnameSql('r.person2_id')} as person2_birth_surname,
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

export async function updateRelationship(
  db: Database,
  id: string,
  data: Partial<Pick<Relationship, 'type' | 'person1_id' | 'person2_id' | 'subtype' | 'notes'>>
): Promise<Relationship | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    if (key === 'notes') {
      values.push(value ?? '');
    } else {
      values.push(value ?? null);
    }
  }
  if (fields.length === 0) return await getRelationship(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await runSql(db, `UPDATE relationships SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getRelationship(db, id);
}

export async function deleteRelationship(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, `DELETE FROM relationships WHERE id = ?`, [id])) > 0;
}

export async function getRelationshipsOfPerson(db: Database, personId: string): Promise<Relationship[]> {
  return await queryAll<Relationship>(db, `
    SELECT * FROM relationships
    WHERE person1_id = ? OR person2_id = ?
    ORDER BY type, created_at
  `, [personId, personId]);
}

export async function searchRelationships(
  db: Database,
  query: string
): Promise<(Relationship & { person1_given_name: string; person1_surname: string; person1_preferred_name: string | null; person1_nickname: string | null; person1_birth_surname: string | null; person2_given_name: string; person2_surname: string; person2_preferred_name: string | null; person2_nickname: string | null; person2_birth_surname: string | null })[]> {
  const like = `%${query}%`;
  // `person1_birth_surname` / `person2_birth_surname` are display-only —
  // see plan birth-name-display-and-quality-check. Never persisted.
  return await queryAll<Relationship & { person1_given_name: string; person1_surname: string; person1_preferred_name: string | null; person1_nickname: string | null; person1_birth_surname: string | null; person2_given_name: string; person2_surname: string; person2_preferred_name: string | null; person2_nickname: string | null; person2_birth_surname: string | null }>(db, `
    SELECT DISTINCT r.*,
      COALESCE(pn1.given_name, '') as person1_given_name,
      COALESCE(pn1.surname, '') as person1_surname,
      pn1.preferred_name as person1_preferred_name,
      pn1.nickname as person1_nickname,
      ${birthSurnameSql('r.person1_id')} as person1_birth_surname,
      COALESCE(pn2.given_name, '') as person2_given_name,
      COALESCE(pn2.surname, '') as person2_surname,
      pn2.preferred_name as person2_preferred_name,
      pn2.nickname as person2_nickname,
      ${birthSurnameSql('r.person2_id')} as person2_birth_surname
    FROM relationships r
    LEFT JOIN person_names pn1 ON pn1.id = ${displayedNameIdSql('r.person1_id')}
    LEFT JOIN person_names pn2 ON pn2.id = ${displayedNameIdSql('r.person2_id')}
    WHERE pn1.given_name LIKE ? OR pn1.surname LIKE ?
       OR pn2.given_name LIKE ? OR pn2.surname LIKE ?
    ORDER BY pn1.surname, pn1.given_name
  `, [like, like, like, like]);
}

// Event Participants

export async function addEventParticipant(
  db: Database,
  data: {
    event_id: string;
    person_id: string;
    role?: EventParticipantRole;
  }
): Promise<EventParticipant> {
  const id = uuid();
  await runSql(db, `
    INSERT INTO event_participants (id, event_id, person_id, role)
    VALUES (?, ?, ?, ?)
  `, [id, data.event_id, data.person_id, data.role ?? 'primary']);
  return (await queryOne<EventParticipant>(db, `SELECT * FROM event_participants WHERE id = ?`, [id]))!;
}

/**
 * Bulk-insert event_participants rows. One batched INSERT for N rows —
 * used by the GEDCOM importer's phaseIndividuals Pass 2 to collapse N
 * IPC roundtrips into one for the primary-role participant per event.
 */
export async function bulkAddEventParticipants(
  db: Database,
  rows: Array<{ event_id: string; person_id: string; role?: EventParticipantRole }>,
): Promise<void> {
  if (rows.length === 0) return;
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    params[i] = [uuid(), r.event_id, r.person_id, r.role ?? 'primary'];
  }
  await runBatch(
    db,
    'INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)',
    params,
  );
}

export async function getEventParticipants(db: Database, eventId: string): Promise<EventParticipant[]> {
  return await queryAll<EventParticipant>(db, `SELECT * FROM event_participants WHERE event_id = ?`, [eventId]);
}

export async function removeEventParticipant(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, `DELETE FROM event_participants WHERE id = ?`, [id])) > 0;
}

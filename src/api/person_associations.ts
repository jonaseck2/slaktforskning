// Person-to-person association CRUD (T05 — GEDCOM alignment plan).
//
// Distinct from `relationships` (sibling/godparent/other relationships that
// can also ride a FAM): a `person_associations` row is the GEDCOM ASSO
// substructure under an INDI that does NOT mediate via any event — "this
// other person was my friend / colleague / godparent (in general) /
// neighbor / enemy / something else". The UNIQUE (person_id,
// related_person_id, role) triple lets the same pair carry multiple roles
// (a friend who is also a colleague) but blocks duplicates of the same
// role.

import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { PersonAssociation, PersonAssociationRole } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export async function createPersonAssociation(
  db: Database,
  data: {
    person_id: string;
    related_person_id: string;
    role: PersonAssociationRole;
    notes?: string;
  },
): Promise<PersonAssociation> {
  const id = uuid();
  await runSql(
    db,
    `INSERT INTO person_associations (id, person_id, related_person_id, role, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [id, data.person_id, data.related_person_id, data.role, data.notes ?? ''],
  );
  return (await getPersonAssociation(db, id))!;
}

export async function getPersonAssociation(
  db: Database,
  id: string,
): Promise<PersonAssociation | null> {
  return (
    (await queryOne<PersonAssociation>(
      db,
      `SELECT * FROM person_associations WHERE id = ?`,
      [id],
    )) ?? null
  );
}

/** All associations whose `person_id` (subject side) equals `personId`. */
export async function getAssociationsForPerson(
  db: Database,
  personId: string,
): Promise<PersonAssociation[]> {
  return await queryAll<PersonAssociation>(
    db,
    `SELECT * FROM person_associations WHERE person_id = ? ORDER BY created_at`,
    [personId],
  );
}

/** All associations whose `related_person_id` (object side) equals `personId`
 *  — i.e. the reverse direction. Used by panel views showing "people who
 *  named you as their godparent / friend / etc." */
export async function getAssociationsToPerson(
  db: Database,
  personId: string,
): Promise<PersonAssociation[]> {
  return await queryAll<PersonAssociation>(
    db,
    `SELECT * FROM person_associations WHERE related_person_id = ? ORDER BY created_at`,
    [personId],
  );
}

export async function updatePersonAssociation(
  db: Database,
  id: string,
  data: Partial<Pick<PersonAssociation, 'role' | 'notes' | 'person_id' | 'related_person_id'>>,
): Promise<PersonAssociation | null> {
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
  if (fields.length === 0) return await getPersonAssociation(db, id);
  values.push(id);
  await runSql(db, `UPDATE person_associations SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getPersonAssociation(db, id);
}

export async function deletePersonAssociation(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, `DELETE FROM person_associations WHERE id = ?`, [id])) > 0;
}

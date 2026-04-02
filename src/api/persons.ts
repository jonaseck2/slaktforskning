import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Person, PersonName } from './types';

export function createPerson(
  db: Database,
  data: { sex?: Person['sex']; living?: boolean; notes?: string; given_name?: string; surname?: string }
): Person {
  const id = uuid();
  db.prepare(
    `INSERT INTO persons (id, sex, living, notes) VALUES (?, ?, ?, ?)`
  ).run([id, data.sex ?? 'U', data.living !== false ? 1 : 0, data.notes ?? '']);

  if (data.given_name || data.surname) {
    const nameId = uuid();
    db.prepare(
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order) VALUES (?, ?, ?, ?, 'birth', 0)`
    ).run([nameId, id, data.given_name ?? '', data.surname ?? '']);
  }

  return getPerson(db, id)!;
}

export function getPerson(db: Database, id: string): Person | null {
  return (db.prepare(`SELECT *, living as living FROM persons WHERE id = ?`).get([id]) as Person) ?? null;
}

export function listPersons(db: Database): (Person & { given_name: string; surname: string })[] {
  return db.prepare(`
    SELECT p.*, pn.given_name, pn.surname
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
    )
    ORDER BY pn.surname, pn.given_name
  `).all() as (Person & { given_name: string; surname: string })[];
}

export function updatePerson(
  db: Database,
  id: string,
  data: Partial<Pick<Person, 'sex' | 'living' | 'notes'>>
): Person | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.sex !== undefined) { fields.push('sex = ?'); values.push(data.sex); }
  if (data.living !== undefined) { fields.push('living = ?'); values.push(data.living ? 1 : 0); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (fields.length === 0) return getPerson(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE persons SET ${fields.join(', ')} WHERE id = ?`).run(values);
  return getPerson(db, id);
}

export function deletePerson(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM persons WHERE id = ?`).run([id]);
  return result.changes > 0;
}

export function searchPersons(db: Database, query: string): (Person & { given_name: string; surname: string })[] {
  const like = `%${query}%`;
  return db.prepare(`
    SELECT p.*, pn.given_name, pn.surname
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
    )
    WHERE pn.given_name LIKE ? OR pn.surname LIKE ? OR p.notes LIKE ?
    ORDER BY pn.surname, pn.given_name
  `).all([like, like, like]) as (Person & { given_name: string; surname: string })[];
}

export function addPersonName(
  db: Database,
  personId: string,
  data: { given_name: string; surname: string; name_type?: PersonName['name_type'] }
): PersonName {
  const id = uuid();
  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM person_names WHERE person_id = ?`
  ).get([personId]) as { max_order: number };
  db.prepare(
    `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
  ).run([id, personId, data.given_name, data.surname, data.name_type ?? 'birth', maxOrder.max_order + 1]);
  return db.prepare(`SELECT * FROM person_names WHERE id = ?`).get([id]) as PersonName;
}

export function getPersonNames(db: Database, personId: string): PersonName[] {
  return db.prepare(`SELECT * FROM person_names WHERE person_id = ? ORDER BY sort_order`).all([personId]) as PersonName[];
}

export function updatePersonName(
  db: Database,
  id: string,
  data: Partial<Pick<PersonName, 'given_name' | 'surname' | 'name_type'>>
): PersonName | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.given_name !== undefined) { fields.push('given_name = ?'); values.push(data.given_name); }
  if (data.surname !== undefined) { fields.push('surname = ?'); values.push(data.surname); }
  if (data.name_type !== undefined) { fields.push('name_type = ?'); values.push(data.name_type); }
  if (fields.length === 0) return (db.prepare(`SELECT * FROM person_names WHERE id = ?`).get([id]) as PersonName) ?? null;
  values.push(id);
  db.prepare(`UPDATE person_names SET ${fields.join(', ')} WHERE id = ?`).run(values);
  return (db.prepare(`SELECT * FROM person_names WHERE id = ?`).get([id]) as PersonName) ?? null;
}

import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Person, PersonName, PersonIdentifier } from './types';

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

/**
 * Returns the preferred given name for display: preferred_name if set,
 * otherwise the first token of given_name.
 */
export function getDisplayGivenName(name: { given_name: string | null; preferred_name: string | null }): string {
  if (name.preferred_name) return name.preferred_name;
  return name.given_name?.split(' ')[0] ?? '';
}

export function listPersons(db: Database): (Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null })[] {
  return db.prepare(`
    SELECT p.*, pn.given_name, pn.surname, pn.preferred_name, pn.nickname
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
    )
    ORDER BY pn.surname, pn.given_name
  `).all() as (Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null })[];
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

export function searchPersons(db: Database, query: string): (Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null })[] {
  const like = `%${query}%`;
  return db.prepare(`
    SELECT p.*, pn.given_name, pn.surname, pn.preferred_name, pn.nickname
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
    )
    WHERE p.notes LIKE ?
       OR EXISTS (
         SELECT 1 FROM person_names n
         WHERE n.person_id = p.id
           AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ?)
       )
    ORDER BY pn.surname, pn.given_name
  `).all([like, like, like, like]) as (Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null })[];
}

export function addPersonName(
  db: Database,
  personId: string,
  data: {
    given_name?: string | null;
    surname?: string | null;
    name_type?: PersonName['name_type'];
    date_from?: string | null;
    date_to?: string | null;
    sort_order?: number;
    name_prefix?: string | null;
    name_suffix?: string | null;
    patronymic_base?: string | null;
    name_qualifier?: PersonName['name_qualifier'];
    preferred_name?: string | null;
    nickname?: string | null;
  }
): PersonName {
  const id = uuid();
  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM person_names WHERE person_id = ?`
  ).get([personId]) as { max_order: number };
  db.prepare(`
    INSERT INTO person_names
      (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order,
       name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    id, personId,
    data.given_name ?? null, data.surname ?? null,
    data.name_type ?? 'birth',
    data.date_from ?? null, data.date_to ?? null,
    data.sort_order ?? (maxOrder.max_order + 1),
    data.name_prefix ?? null, data.name_suffix ?? null,
    data.patronymic_base ?? null, data.name_qualifier ?? null,
    data.preferred_name ?? null, data.nickname ?? null,
  ]);
  return db.prepare(`SELECT * FROM person_names WHERE id = ?`).get([id]) as PersonName;
}

export function getPersonNames(db: Database, personId: string): PersonName[] {
  return db.prepare(`SELECT * FROM person_names WHERE person_id = ? ORDER BY sort_order`).all([personId]) as PersonName[];
}

export function updatePersonName(
  db: Database,
  id: string,
  data: Partial<Pick<PersonName, 'given_name' | 'surname' | 'name_type' | 'name_prefix' | 'name_suffix' | 'patronymic_base' | 'name_qualifier' | 'preferred_name' | 'nickname'>>
): PersonName | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.given_name !== undefined) { fields.push('given_name = ?'); values.push(data.given_name); }
  if (data.surname !== undefined) { fields.push('surname = ?'); values.push(data.surname); }
  if (data.name_type !== undefined) { fields.push('name_type = ?'); values.push(data.name_type); }
  if (data.name_prefix !== undefined) { fields.push('name_prefix = ?'); values.push(data.name_prefix); }
  if (data.name_suffix !== undefined) { fields.push('name_suffix = ?'); values.push(data.name_suffix); }
  if (data.patronymic_base !== undefined) { fields.push('patronymic_base = ?'); values.push(data.patronymic_base); }
  if (data.name_qualifier !== undefined) { fields.push('name_qualifier = ?'); values.push(data.name_qualifier); }
  if (data.preferred_name !== undefined) { fields.push('preferred_name = ?'); values.push(data.preferred_name); }
  if (data.nickname !== undefined) { fields.push('nickname = ?'); values.push(data.nickname); }
  if (fields.length === 0) return (db.prepare(`SELECT * FROM person_names WHERE id = ?`).get([id]) as PersonName) ?? null;
  values.push(id);
  db.prepare(`UPDATE person_names SET ${fields.join(', ')} WHERE id = ?`).run(values);
  return (db.prepare(`SELECT * FROM person_names WHERE id = ?`).get([id]) as PersonName) ?? null;
}

export function deletePersonName(db: Database, id: string): boolean {
  return (db.prepare('DELETE FROM person_names WHERE id = ?').run([id]) as { changes: number }).changes > 0;
}

export function addPersonIdentifier(
  db: Database,
  personId: string,
  data: { identifier_type: PersonIdentifier['identifier_type']; identifier_value: string }
): PersonIdentifier {
  const id = uuid();
  db.prepare(
    `INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run([id, personId, data.identifier_type, data.identifier_value, new Date().toISOString()]);
  return db.prepare('SELECT * FROM person_identifiers WHERE id = ?').get([id]) as PersonIdentifier;
}

export function getPersonIdentifiers(db: Database, personId: string): PersonIdentifier[] {
  return db.prepare('SELECT * FROM person_identifiers WHERE person_id = ? ORDER BY created_at ASC').all([personId]) as PersonIdentifier[];
}

export function deletePersonIdentifier(db: Database, id: string): boolean {
  return (db.prepare('DELETE FROM person_identifiers WHERE id = ?').run([id]) as { changes: number }).changes > 0;
}

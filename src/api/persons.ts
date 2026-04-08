import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Person, PersonName, PersonIdentifier } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createPerson(
  db: Database,
  data: { sex?: Person['sex']; living?: boolean; notes?: string; given_name?: string; surname?: string }
): Person {
  const id = uuid();
  runSql(db,
    `INSERT INTO persons (id, sex, living, notes) VALUES (?, ?, ?, ?)`,
    [id, data.sex ?? 'U', data.living !== false ? 1 : 0, data.notes ?? '']
  );

  if (data.given_name || data.surname) {
    const nameId = uuid();
    runSql(db,
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order) VALUES (?, ?, ?, ?, 'birth', 0)`,
      [nameId, id, data.given_name ?? '', data.surname ?? '']
    );
  }

  return getPerson(db, id)!;
}

export function getPerson(db: Database, id: string): Person | null {
  return queryOne<Person>(db, `SELECT *, living as living FROM persons WHERE id = ?`, [id]) ?? null;
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
  return queryAll<Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null }>(db, `
    SELECT p.*, pn.given_name, pn.surname, pn.preferred_name, pn.nickname
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
    )
    ORDER BY pn.surname, pn.given_name
  `);
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
  runSql(db, `UPDATE persons SET ${fields.join(', ')} WHERE id = ?`, values);
  return getPerson(db, id);
}

export function deletePerson(db: Database, id: string): boolean {
  return runSqlChanges(db, `DELETE FROM persons WHERE id = ?`, [id]) > 0;
}

export function searchPersons(db: Database, query: string): (Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null })[] {
  const like = `%${query}%`;
  return queryAll<Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null }>(db, `
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
  `, [like, like, like, like]);
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
  const maxOrder = queryOne<{ max_order: number }>(db,
    `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM person_names WHERE person_id = ?`,
    [personId]
  )!;
  runSql(db, `
    INSERT INTO person_names
      (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order,
       name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, personId,
    data.given_name ?? null, data.surname ?? null,
    data.name_type ?? 'birth',
    data.date_from ?? null, data.date_to ?? null,
    data.sort_order ?? (maxOrder.max_order + 1),
    data.name_prefix ?? null, data.name_suffix ?? null,
    data.patronymic_base ?? null, data.name_qualifier ?? null,
    data.preferred_name ?? null, data.nickname ?? null,
  ]);
  return queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id])!;
}

export function getPersonNames(db: Database, personId: string): PersonName[] {
  return queryAll<PersonName>(db, `SELECT * FROM person_names WHERE person_id = ? ORDER BY sort_order`, [personId]);
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
  if (fields.length === 0) return queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id]) ?? null;
  values.push(id);
  runSql(db, `UPDATE person_names SET ${fields.join(', ')} WHERE id = ?`, values);
  return queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id]) ?? null;
}

export function deletePersonName(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM person_names WHERE id = ?', [id]) > 0;
}

export function addPersonIdentifier(
  db: Database,
  personId: string,
  data: { identifier_type: PersonIdentifier['identifier_type']; identifier_value: string }
): PersonIdentifier {
  const id = uuid();
  runSql(db,
    `INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, personId, data.identifier_type, data.identifier_value, new Date().toISOString()]
  );
  return queryOne<PersonIdentifier>(db, 'SELECT * FROM person_identifiers WHERE id = ?', [id])!;
}

export function getPersonIdentifiers(db: Database, personId: string): PersonIdentifier[] {
  return queryAll<PersonIdentifier>(db, 'SELECT * FROM person_identifiers WHERE person_id = ? ORDER BY created_at ASC', [personId]);
}

export function deletePersonIdentifier(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM person_identifiers WHERE id = ?', [id]) > 0;
}

export type PersonListItem = {
  id: string;
  sex: Person['sex'];
  given_name: string;
  surname: string;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
};

const PERSON_LIST_BASE_QUERY = `
  SELECT
    p.id,
    p.sex,
    COALESCE(pn.given_name, '') AS given_name,
    COALESCE(pn.surname, '')    AS surname,
    (
      SELECT e.date_original
      FROM event_participants ep
      JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
      WHERE ep.person_id = p.id
      LIMIT 1
    ) AS birth_date,
    (
      SELECT pl.name
      FROM event_participants ep
      JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
      LEFT JOIN places pl ON pl.id = e.place_id
      WHERE ep.person_id = p.id
      LIMIT 1
    ) AS birth_place,
    (
      SELECT e.date_original
      FROM event_participants ep
      JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
      WHERE ep.person_id = p.id
      LIMIT 1
    ) AS death_date,
    (
      SELECT pl.name
      FROM event_participants ep
      JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
      LEFT JOIN places pl ON pl.id = e.place_id
      WHERE ep.person_id = p.id
      LIMIT 1
    ) AS death_place
  FROM persons p
  LEFT JOIN person_names pn
    ON pn.person_id = p.id
    AND pn.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id)
`;

const PERSON_LIST_QUERY = `${PERSON_LIST_BASE_QUERY} ORDER BY pn.surname, pn.given_name`;

export function listPersonsPage(db: Database, limit: number, offset: number): PersonListItem[] {
  // Pass 1: sort + paginate with only name data — no birth/death subqueries.
  // Correlated subqueries on all N persons before LIMIT caused O(4N) lookups on large DBs.
  const page = queryAll<{ id: string; sex: string; given_name: string; surname: string }>(db, `
    SELECT p.id, p.sex,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '')    AS surname
    FROM persons p
    LEFT JOIN person_names pn
      ON pn.person_id = p.id
      AND pn.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id)
    ORDER BY pn.surname, pn.given_name
    LIMIT ? OFFSET ?
  `, [limit, offset]);

  if (page.length === 0) return [];

  // Pass 2: fetch birth + death events for this page's persons only.
  const ids = page.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const eventRows = queryAll<{
    person_id: string;
    event_type: string;
    date_original: string | null;
    place_name: string | null;
  }>(db, `
    SELECT ep.person_id, e.event_type, e.date_original, pl.name AS place_name
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id AND e.event_type IN ('birth', 'death')
    LEFT JOIN places pl ON pl.id = e.place_id
    WHERE ep.person_id IN (${placeholders})
  `, ids);

  type EventData = { birth_date: string | null; birth_place: string | null; death_date: string | null; death_place: string | null };
  const eventMap = new Map<string, EventData>();
  for (const row of eventRows) {
    if (!eventMap.has(row.person_id)) {
      eventMap.set(row.person_id, { birth_date: null, birth_place: null, death_date: null, death_place: null });
    }
    const entry = eventMap.get(row.person_id)!;
    if (row.event_type === 'birth') {
      if (entry.birth_date === null) entry.birth_date = row.date_original;
      if (entry.birth_place === null) entry.birth_place = row.place_name;
    } else {
      if (entry.death_date === null) entry.death_date = row.date_original;
      if (entry.death_place === null) entry.death_place = row.place_name;
    }
  }

  return page.map(p => {
    const events = eventMap.get(p.id) ?? { birth_date: null, birth_place: null, death_date: null, death_place: null };
    return { id: p.id, sex: p.sex as Person['sex'], given_name: p.given_name, surname: p.surname, ...events };
  });
}

export function countPersons(db: Database): number {
  return queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons')?.n ?? 0;
}

// Unsourced = no citations on any event the person participates in, AND no direct person citations
const UNSOURCED_FILTER = `
  NOT EXISTS (
    SELECT 1 FROM event_participants ep2
    JOIN events e2 ON e2.id = ep2.event_id
    JOIN citations c ON c.event_id = e2.id
    WHERE ep2.person_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM citations c2 WHERE c2.person_id = p.id
  )
`;

export function listUnsourcedPersonsPage(db: Database, limit: number, offset: number): PersonListItem[] {
  const page = queryAll<{ id: string; sex: string; given_name: string; surname: string }>(db, `
    SELECT p.id, p.sex,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '')    AS surname
    FROM persons p
    LEFT JOIN person_names pn
      ON pn.person_id = p.id
      AND pn.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id)
    WHERE ${UNSOURCED_FILTER}
    ORDER BY pn.surname, pn.given_name
    LIMIT ? OFFSET ?
  `, [limit, offset]);

  if (page.length === 0) return [];

  const ids = page.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const eventRows = queryAll<{
    person_id: string;
    event_type: string;
    date_original: string | null;
    place_name: string | null;
  }>(db, `
    SELECT ep.person_id, e.event_type, e.date_original, pl.name AS place_name
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id AND e.event_type IN ('birth', 'death')
    LEFT JOIN places pl ON pl.id = e.place_id
    WHERE ep.person_id IN (${placeholders})
  `, ids);

  type EventData = { birth_date: string | null; birth_place: string | null; death_date: string | null; death_place: string | null };
  const eventMap = new Map<string, EventData>();
  for (const row of eventRows) {
    if (!eventMap.has(row.person_id)) {
      eventMap.set(row.person_id, { birth_date: null, birth_place: null, death_date: null, death_place: null });
    }
    const entry = eventMap.get(row.person_id)!;
    if (row.event_type === 'birth') {
      if (entry.birth_date === null) entry.birth_date = row.date_original;
      if (entry.birth_place === null) entry.birth_place = row.place_name;
    } else {
      if (entry.death_date === null) entry.death_date = row.date_original;
      if (entry.death_place === null) entry.death_place = row.place_name;
    }
  }

  return page.map(p => {
    const events = eventMap.get(p.id) ?? { birth_date: null, birth_place: null, death_date: null, death_place: null };
    return { id: p.id, sex: p.sex as Person['sex'], given_name: p.given_name, surname: p.surname, ...events };
  });
}

export function countUnsourcedPersons(db: Database): number {
  return queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM persons p WHERE ${UNSOURCED_FILTER}`)?.n ?? 0;
}

export function searchPersonsWithDetails(db: Database, query: string): PersonListItem[] {
  const like = `%${query}%`;
  return queryAll<PersonListItem>(db, `
    ${PERSON_LIST_BASE_QUERY}
    WHERE p.notes LIKE ?
       OR EXISTS (
         SELECT 1 FROM person_names n
         WHERE n.person_id = p.id
           AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ?)
       )
    ORDER BY pn.surname, pn.given_name
  `, [like, like, like, like]);
}

export function getPersonDisplayNames(db: Database, ids: string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = queryAll<{ person_id: string; given_name: string; surname: string }>(db, `
    SELECT pn.person_id,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '')    AS surname
    FROM person_names pn
    WHERE pn.person_id IN (${placeholders})
      AND pn.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = pn.person_id)
  `, ids);
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = [row.given_name, row.surname].filter(Boolean).join(' ');
    map.set(row.person_id, name || '?');
  }
  return map;
}

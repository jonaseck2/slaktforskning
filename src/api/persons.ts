import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Person, PersonName, PersonIdentifier } from './types';
import { queryOne, queryAll, runSql, runSqlChanges, runBatch } from './db';
import { livingSqlExpr, loadLivingDerivation, isLivingDerived } from './personLiving';

/**
 * SQL fragment returning the id of the *displayed* name for a person.
 *
 * Display rule (Bengt feedback round, 2026-04-29):
 *   1. The name with the latest non-null `date_from` wins.
 *   2. For `name_type = 'birth'`, the effective `date_from` is the person's
 *      birth event `date_value` if any (otherwise the stored `date_from`).
 *   3. Names with no effective date sort below dated names.
 *   4. Ties between undated names break by highest `sort_order` (manual
 *      ▲/▼ ordering — most recently moved-down wins), then by `id` for
 *      determinism.
 *
 * Replaces the old "MIN(sort_order)" / star-marked primary mechanism.
 *
 * `personIdRef` is an SQL expression yielding the person id (e.g. `p.id`,
 * `r.person1_id`) — interpolated directly, NEVER user input.
 */
export function displayedNameIdSql(personIdRef: string): string {
  return `(
    SELECT pn_d.id
    FROM person_names pn_d
    LEFT JOIN events be_d
      ON be_d.event_type = 'birth'
     AND pn_d.name_type = 'birth'
     AND be_d.id = (
       SELECT e2.id FROM events e2
       JOIN event_participants ep2 ON ep2.event_id = e2.id
       WHERE ep2.person_id = pn_d.person_id
         AND ep2.role = 'primary'
         AND e2.event_type = 'birth'
         AND e2.date_value IS NOT NULL AND e2.date_value <> ''
       ORDER BY e2.date_value
       LIMIT 1
     )
    WHERE pn_d.person_id = ${personIdRef}
    ORDER BY
      CASE WHEN COALESCE(
        CASE WHEN pn_d.name_type = 'birth' THEN be_d.date_value ELSE NULL END,
        pn_d.date_from
      ) IS NULL THEN 1 ELSE 0 END,
      COALESCE(
        CASE WHEN pn_d.name_type = 'birth' THEN be_d.date_value ELSE NULL END,
        pn_d.date_from
      ) DESC,
      pn_d.sort_order DESC,
      pn_d.id
    LIMIT 1
  )`;
}

/**
 * Parse preferred-name markers from a given_name string.
 * A trailing `*` or `!` on any token marks it as the preferred name (tilltalsnamn).
 * E.g. "Johan Erik*" → { given_name: "Johan Erik", preferred_name: "Erik" }
 */
export function parsePreferredName(givenName: string | undefined | null): { given_name: string | null; preferred_name: string | null } {
  if (!givenName) return { given_name: givenName ?? null, preferred_name: null };
  const match = givenName.match(/(\S+)[*!]/);
  if (!match) return { given_name: givenName, preferred_name: null };
  const preferred = match[1];
  const cleaned = givenName.replace(/([*!])/g, '').replace(/\s+/g, ' ').trim();
  return { given_name: cleaned || null, preferred_name: preferred };
}

/**
 * Create a person row, with an associated `person_names` row when at least one
 * of `given_name` / `surname` (after trim) is non-empty.
 *
 * **User-goal guard:** in default mode, throws if both name fields are blank.
 * The Prime Directive says we don't fabricate names, but the User Goal of plan
 * 2026-05-04-new-person-dialog-hardening says no code path may *silently*
 * produce a nameless `persons` row either. Importers that legitimately need
 * to preserve a nameless source record (because the source's reference graph
 * needs the person to exist as a parent / spouse) opt in via
 * `{ allowNameless: true }` AND must record a warning in their import report.
 * No other code path may pass that flag.
 */
export async function createPerson(
  db: Database,
  data: { sex?: Person['sex']; notes?: string; given_name?: string; surname?: string },
  options: { allowNameless?: boolean } = {}
): Promise<Person> {
  const hasName = !!(data.given_name?.trim() || data.surname?.trim());
  if (!hasName && !options.allowNameless) {
    throw new Error('Cannot create person without a name. Provide given_name or surname.');
  }

  const id = uuid();
  await runSql(db,
    `INSERT INTO persons (id, sex, notes) VALUES (?, ?, ?)`,
    [id, data.sex ?? 'U', data.notes ?? '']
  );
  // Assign display_id = max + 1 for this database. UNIQUE index catches any
  // race; SQLite serializes within a single connection so this is safe.
  await runSql(db,
    `UPDATE persons SET display_id = (SELECT COALESCE(MAX(display_id), 0) + 1 FROM persons) WHERE id = ?`,
    [id]
  );

  if (hasName) {
    const nameId = uuid();
    const parsed = parsePreferredName(data.given_name);
    await runSql(db,
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order, preferred_name) VALUES (?, ?, ?, ?, 'birth', 0, ?)`,
      [nameId, id, parsed.given_name ?? '', data.surname ?? '', parsed.preferred_name]
    );
  }

  // Skip livingSqlExpr — the just-created person has no events yet, so living=true
  // by definition. Calling getPerson() here ran two correlated EXISTS subqueries
  // against the growing events + event_participants tables on every INSERT, which
  // turned bulk imports into O(n²). Regression introduced in bad81619.
  const row = (await queryOne<Omit<Person, 'living'>>(db, `SELECT * FROM persons WHERE id = ?`, [id]))!;
  return { ...row, living: true };
}

/**
 * Bulk-insert persons rows. One batched INSERT for N rows instead of N
 * `await stmt.run([...])` IPC roundtrips. Used by the GEDCOM importer's
 * `phaseIndividuals` collect-then-flush pass — at 22k persons this
 * collapses ~22k IPC calls to one.
 *
 * Each row may supply its own `id`; otherwise a v4 UUID is generated.
 * `display_id` is assigned dense and sequential starting after the current
 * `MAX(display_id)`, mirroring the singular `createPerson` semantics; the
 * high-water mark is queried once and the values assigned in JS so the
 * batch is a single INSERT statement.
 *
 * Returns the array of assigned ids in input order. No readback — the
 * caller-supplied / generated ids are sufficient for any downstream rows
 * that reference them, and a SELECT `WHERE id IN (...)` with N≫32k blows
 * past SQLite's variable limit anyway. Tests that need the full row
 * shape should query the DB directly.
 */
export async function bulkCreatePersons(
  db: Database,
  rows: Array<{ id?: string; sex?: Person['sex']; notes?: string }>,
): Promise<string[]> {
  if (rows.length === 0) return [];

  const high = (await queryOne<{ max_id: number }>(db, 'SELECT COALESCE(MAX(display_id), 0) AS max_id FROM persons'))!;
  let nextDisplayId = high.max_id;

  const ids: string[] = new Array(rows.length);
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.id ?? uuid();
    ids[i] = id;
    nextDisplayId++;
    params[i] = [id, r.sex ?? 'U', r.notes ?? '', nextDisplayId];
  }

  await runBatch(db, 'INSERT INTO persons (id, sex, notes, display_id) VALUES (?, ?, ?, ?)', params);
  return ids;
}

/**
 * Bulk-insert person_names rows. Sort order is assigned dense per-person in
 * input order when the caller doesn't supply `sort_order` — matches the
 * singular `addPersonName` which queries `MAX(sort_order)+1`. Caller must
 * already have person rows committed (FK on `person_id`).
 */
export async function bulkAddPersonNames(
  db: Database,
  rows: Array<{
    id?: string;
    person_id: string;
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
  }>,
): Promise<string[]> {
  if (rows.length === 0) return [];

  // Per-person dense sort_order when not supplied. The singular function
  // queries MAX(sort_order)+1 per call; importers create persons fresh so
  // we just start at 0 and increment.
  const seenPerPerson = new Map<string, number>();
  const ids: string[] = new Array(rows.length);
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.id ?? uuid();
    ids[i] = id;
    const parsed = parsePreferredName(r.given_name);
    const preferredName = r.preferred_name !== undefined ? r.preferred_name : parsed.preferred_name;
    let sortOrder = r.sort_order;
    if (sortOrder === undefined) {
      sortOrder = seenPerPerson.get(r.person_id) ?? 0;
      seenPerPerson.set(r.person_id, sortOrder + 1);
    }
    params[i] = [
      id,
      r.person_id,
      parsed.given_name ?? null,
      r.surname ?? null,
      r.name_type ?? 'birth',
      r.date_from ?? null,
      r.date_to ?? null,
      sortOrder,
      r.name_prefix ?? null,
      r.name_suffix ?? null,
      r.patronymic_base ?? null,
      r.name_qualifier ?? null,
      preferredName ?? null,
      r.nickname ?? null,
    ];
  }

  await runBatch(
    db,
    `INSERT INTO person_names
       (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order,
        name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params,
  );
  return ids;
}

/**
 * Bulk-insert person_identifiers rows. Caller must already have person
 * rows committed (FK on `person_id`).
 */
export async function bulkAddPersonIdentifiers(
  db: Database,
  rows: Array<{
    id?: string;
    person_id: string;
    identifier_type: PersonIdentifier['identifier_type'];
    identifier_value: string;
  }>,
): Promise<string[]> {
  if (rows.length === 0) return [];

  const now = new Date().toISOString();
  const ids: string[] = new Array(rows.length);
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.id ?? uuid();
    ids[i] = id;
    params[i] = [id, r.person_id, r.identifier_type, r.identifier_value, now];
  }

  await runBatch(
    db,
    'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)',
    params,
  );
  return ids;
}

export async function getPerson(db: Database, id: string): Promise<Person | null> {
  const row = await queryOne<Omit<Person, 'living'> & { living: number }>(
    db,
    `SELECT p.*, ${livingSqlExpr('p')} AS living FROM persons p WHERE p.id = ?`,
    [id]
  );
  if (!row) return null;
  return { ...row, living: row.living === 1 };
}

/**
 * Returns the preferred given name for display: preferred_name if set,
 * otherwise the first token of given_name.
 */
export function getDisplayGivenName(name: { given_name: string | null; preferred_name: string | null }): string {
  if (name.preferred_name) return name.preferred_name;
  return name.given_name?.split(' ')[0] ?? '';
}

export async function listPersons(db: Database): Promise<(Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null })[]> {
  // `living` is derived in JS via the bulk set-membership derivation
  // (loadLivingDerivation: two O(events) queries) rather than the inline
  // per-row correlated `livingSqlExpr`. Over the full un-paged person list the
  // correlated subquery is O(persons × events) — on a 22k tree it dominated the
  // GEDCOM export at 130s of a 131s run (docs/baseline-perf/2026-06-17/
  // export-bulk-transfer.md). isLivingDerived is the exact JS equivalent of
  // livingSqlExpr, so the derived value is identical. The paged listPersonsPage
  // / getPerson / searchPersons keep livingSqlExpr — they evaluate it for ≤ a
  // page of output rows, where it is trivially fast.
  type Row = Omit<Person, 'living'> & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null };
  const rows = await queryAll<Row>(db, `
    SELECT p.*,
           pn.given_name, pn.surname, pn.preferred_name, pn.nickname
    FROM persons p
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    ORDER BY pn.surname, pn.given_name
  `);
  const livingDerivation = await loadLivingDerivation(db);
  return rows.map(r => ({ ...r, living: isLivingDerived(r.id, livingDerivation) }));
}

export async function updatePerson(
  db: Database,
  id: string,
  data: Partial<Pick<Person, 'sex' | 'notes'>>
): Promise<Person | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.sex !== undefined) { fields.push('sex = ?'); values.push(data.sex); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (fields.length === 0) return await getPerson(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await runSql(db, `UPDATE persons SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getPerson(db, id);
}

export async function deletePerson(db: Database, id: string): Promise<boolean> {
  // Clean up polymorphic link rows that don't have FK CASCADE
  await runSqlChanges(db, `DELETE FROM task_links WHERE entity_type = 'person' AND entity_id = ?`, [id]);
  await runSqlChanges(db, `DELETE FROM group_links WHERE entity_type = 'person' AND entity_id = ?`, [id]);
  // Polymorphic ignored-duplicate rows: the FK to persons was dropped in the
  // v0.220.0 migration to allow place/source/media pairs. Cleanup is now
  // explicit, mirroring task_links / group_links above.
  await runSqlChanges(
    db,
    `DELETE FROM ignored_duplicates WHERE entity_type = 'person' AND (person1_id = ? OR person2_id = ?)`,
    [id, id],
  );
  return (await runSqlChanges(db, `DELETE FROM persons WHERE id = ?`, [id])) > 0;
}

export async function searchPersons(
  db: Database,
  query: string,
  relateeId?: string | null,
  limit = 20,
): Promise<(Person & {
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  /**
   * Lowest-`sort_order` `birth`-type record's surname. Display-only — never
   * persisted. Renderer composes "(f. …)" / "(b. …)" parenthetical when the
   * global toggle is on AND this differs from `surname`.
   */
  birth_surname: string | null;
  relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
  birth_year: string | null;
  death_year: string | null;
})[]> {
  // Split query into tokens so "Linda Ahnstedt" matches "Eva Linda* Marie f. Ahnstedt"
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  // Each token must match at least one name field (given_name, surname, preferred_name) on ANY name row
  const tokenClauses = tokens.map(() =>
    `EXISTS (
       SELECT 1 FROM person_names n
       WHERE n.person_id = p.id
         AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ?)
     )`
  ).join(' AND ');
  const tokenParams = tokens.flatMap(t => { const l = `%${t}%`; return [l, l, l]; });

  // Relevance: prefix matches on surname/given_name score higher than substring matches
  const firstToken = `${tokens[0]}%`;
  const relevanceParams = [firstToken, firstToken];

  const relatee = relateeId ?? null;

  type Row = Omit<Person, 'living'> & {
    living: number;
    given_name: string;
    surname: string;
    preferred_name: string | null;
    nickname: string | null;
    birth_surname: string | null;
    relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
    birth_year: string | null;
    death_year: string | null;
  };
  const rows = await queryAll<Row>(db, `
    SELECT p.*, ${livingSqlExpr('p')} AS living,
      pn.given_name, pn.surname, pn.preferred_name, pn.nickname,
      ${birthSurnameSql('p.id')} AS birth_surname,
      (SELECT
          CASE
            WHEN r.type = 'parent_child' AND r.person1_id = p.id THEN 'parent'
            WHEN r.type = 'parent_child' AND r.person2_id = p.id THEN 'child'
            WHEN r.type = 'couple'       THEN 'partner'
            WHEN r.type = 'sibling'      THEN 'sibling'
            WHEN r.type = 'godparent'    THEN 'godparent'
            ELSE NULL
          END
         FROM relationships r
         WHERE ? IS NOT NULL
           AND (
             (r.person1_id = p.id AND r.person2_id = ?)
             OR (r.person2_id = p.id AND r.person1_id = ?)
           )
           AND r.type IN ('parent_child','couple','sibling','godparent')
         ORDER BY r.created_at
         LIMIT 1
      ) AS relation_role,
      (SELECT SUBSTR(e.date_value, 1, 4)
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = p.id
           AND ep.role = 'primary'
           AND e.event_type = 'birth'
           AND e.date_value IS NOT NULL AND e.date_value <> ''
         ORDER BY e.date_value
         LIMIT 1
      ) AS birth_year,
      (SELECT SUBSTR(e.date_value, 1, 4)
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = p.id
           AND ep.role = 'primary'
           AND e.event_type = 'death'
           AND e.date_value IS NOT NULL AND e.date_value <> ''
         ORDER BY e.date_value
         LIMIT 1
      ) AS death_year
    FROM persons p
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    WHERE ${tokenClauses}
    ORDER BY
      CASE WHEN pn.given_name LIKE ? THEN 0 WHEN pn.surname LIKE ? THEN 1 ELSE 2 END,
      pn.surname, pn.given_name
    LIMIT ?
  `, [relatee, relatee, relatee, ...tokenParams, ...relevanceParams, limit]);
  return rows.map(r => ({ ...r, living: r.living === 1 }));
}

export async function addPersonName(
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
): Promise<PersonName> {
  const id = uuid();
  const maxOrder = (await queryOne<{ max_order: number }>(db,
    `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM person_names WHERE person_id = ?`,
    [personId]
  ))!;
  const parsed = parsePreferredName(data.given_name);
  // Explicit preferred_name in data takes precedence over marker-parsed value
  const preferredName = data.preferred_name !== undefined ? data.preferred_name : parsed.preferred_name;
  await runSql(db, `
    INSERT INTO person_names
      (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order,
       name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, personId,
    parsed.given_name ?? null, data.surname ?? null,
    data.name_type ?? 'birth',
    data.date_from ?? null, data.date_to ?? null,
    data.sort_order ?? (maxOrder.max_order + 1),
    data.name_prefix ?? null, data.name_suffix ?? null,
    data.patronymic_base ?? null, data.name_qualifier ?? null,
    preferredName ?? null, data.nickname ?? null,
  ]);
  return (await queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id]))!;
}

export async function getPersonNames(db: Database, personId: string): Promise<PersonName[]> {
  return await queryAll<PersonName>(db, `SELECT * FROM person_names WHERE person_id = ? ORDER BY sort_order`, [personId]);
}

export async function updatePersonName(
  db: Database,
  id: string,
  data: Partial<Pick<PersonName, 'given_name' | 'surname' | 'name_type' | 'date_from' | 'date_to' | 'name_prefix' | 'name_suffix' | 'patronymic_base' | 'name_qualifier' | 'preferred_name' | 'nickname' | 'sort_order'>>
): Promise<PersonName | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.given_name !== undefined) {
    const parsed = parsePreferredName(data.given_name);
    fields.push('given_name = ?'); values.push(parsed.given_name);
    // Auto-set preferred_name from marker unless explicitly provided
    if (parsed.preferred_name && data.preferred_name === undefined) {
      fields.push('preferred_name = ?'); values.push(parsed.preferred_name);
    }
  }
  if (data.surname !== undefined) { fields.push('surname = ?'); values.push(data.surname); }
  if (data.name_type !== undefined) { fields.push('name_type = ?'); values.push(data.name_type); }
  if (data.date_from !== undefined) { fields.push('date_from = ?'); values.push(data.date_from); }
  if (data.date_to !== undefined) { fields.push('date_to = ?'); values.push(data.date_to); }
  if (data.name_prefix !== undefined) { fields.push('name_prefix = ?'); values.push(data.name_prefix); }
  if (data.name_suffix !== undefined) { fields.push('name_suffix = ?'); values.push(data.name_suffix); }
  if (data.patronymic_base !== undefined) { fields.push('patronymic_base = ?'); values.push(data.patronymic_base); }
  if (data.name_qualifier !== undefined) { fields.push('name_qualifier = ?'); values.push(data.name_qualifier); }
  if (data.preferred_name !== undefined) { fields.push('preferred_name = ?'); values.push(data.preferred_name); }
  if (data.nickname !== undefined) { fields.push('nickname = ?'); values.push(data.nickname); }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order); }
  if (fields.length === 0) return (await queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id])) ?? null;
  values.push(id);
  await runSql(db, `UPDATE person_names SET ${fields.join(', ')} WHERE id = ?`, values);
  return (await queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id])) ?? null;
}

export async function deletePersonName(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM person_names WHERE id = ?', [id])) > 0;
}

export async function addPersonIdentifier(
  db: Database,
  personId: string,
  data: { identifier_type: PersonIdentifier['identifier_type']; identifier_value: string }
): Promise<PersonIdentifier> {
  const id = uuid();
  await runSql(db,
    `INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, personId, data.identifier_type, data.identifier_value, new Date().toISOString()]
  );
  return (await queryOne<PersonIdentifier>(db, 'SELECT * FROM person_identifiers WHERE id = ?', [id]))!;
}

export async function getPersonIdentifiers(db: Database, personId: string): Promise<PersonIdentifier[]> {
  return await queryAll<PersonIdentifier>(db, 'SELECT * FROM person_identifiers WHERE person_id = ? ORDER BY created_at ASC', [personId]);
}

export async function deletePersonIdentifier(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM person_identifiers WHERE id = ?', [id])) > 0;
}

export type PersonListItem = {
  id: string;
  sex: Person['sex'];
  display_id: number | null;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  /**
   * Lowest-`sort_order` `birth`-type record's surname when distinct from
   * `surname` (the displayed surname). Used by name-rendering surfaces to
   * append a "(f. …)" / "(b. …)" parenthetical when the global toggle is on.
   * Display-only — never written back to the DB.
   */
  birth_surname: string | null;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  /**
   * Aggregate counts used by the persons-list "research-progress map"
   * columns. All computed by correlated subqueries in the same SELECT
   * as the row — never per-row IPC. See plan
   * 2026-05-09-persons-list-aggregate-columns.
   *
   * `quality_count` is read from the `quality_issue_counts` cache table
   * and may be `0` if the cache has never been populated. The cache is
   * refreshed by App.vue's badge cycle and by an explicit refresher.
   */
  name_count: number;
  event_count: number;
  relationship_count: number;
  media_count: number;
  group_count: number;
  task_count: number;
  quality_count: number;
};

/**
 * SQL fragment yielding the surname of the lowest-`sort_order` `birth`-type
 * `person_names` row for the given person id expression. Returns NULL when no
 * birth record exists. Display-only: see plan birth-name-display-and-quality-check.
 *
 * `personIdRef` is interpolated directly — caller is responsible for ensuring
 * it is an SQL expression (e.g. `p.id`, `r.person1_id`), never user input.
 */
export function birthSurnameSql(personIdRef: string): string {
  return `(
    SELECT pn_b.surname
    FROM person_names pn_b
    WHERE pn_b.person_id = ${personIdRef}
      AND pn_b.name_type = 'birth'
    ORDER BY pn_b.sort_order ASC, pn_b.id ASC
    LIMIT 1
  )`;
}

const PERSON_LIST_BASE_QUERY = `
  SELECT
    p.id,
    p.sex,
    p.display_id,
    COALESCE(pn.given_name, '') AS given_name,
    COALESCE(pn.surname, '')    AS surname,
    pn.preferred_name           AS preferred_name,
    pn.nickname                 AS nickname,
    ${birthSurnameSql('p.id')}  AS birth_surname,
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
    ) AS death_place,
    -- Aggregate columns kept at 0 in this snapshot view; full counts are
    -- only surfaced from the paged list view that opts the user into them.
    0 AS name_count,
    0 AS event_count,
    0 AS relationship_count,
    0 AS media_count,
    0 AS group_count,
    0 AS task_count,
    0 AS quality_count
  FROM persons p
  LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
`;


export type ListPersonsSortBy =
  | 'surname'
  | 'given_name'
  | 'birth_date'
  | 'display_id'
  | 'sex'
  | 'name_count'
  | 'event_count'
  | 'relationship_count'
  | 'media_count'
  | 'group_count'
  | 'task_count'
  | 'quality_count';
export type ListPersonsSortDir = 'asc' | 'desc';

/**
 * SQL fragment for one aggregate-count expression. Used inside the SELECT
 * (as a column) and inside ORDER BY (as a sort key). Kept in one place so
 * the column value and the sort match exactly.
 */
const AGG_SQL: Record<Exclude<ListPersonsSortBy, 'surname' | 'given_name' | 'birth_date' | 'display_id' | 'sex'>, string> = {
  name_count: '(SELECT COUNT(*) FROM person_names WHERE person_id = p.id)',
  event_count: '(SELECT COUNT(*) FROM event_participants WHERE person_id = p.id)',
  relationship_count: '(SELECT COUNT(*) FROM relationships WHERE person1_id = p.id OR person2_id = p.id)',
  media_count: "(SELECT COUNT(*) FROM media_links WHERE entity_type = 'person' AND entity_id = p.id)",
  group_count: "(SELECT COUNT(*) FROM group_links WHERE entity_type = 'person' AND entity_id = p.id)",
  task_count: "(SELECT COUNT(*) FROM task_links WHERE entity_type = 'person' AND entity_id = p.id)",
  quality_count: '(SELECT COALESCE(issue_count, 0) FROM quality_issue_counts WHERE person_id = p.id)',
};

function buildPersonsFilterClause(query: string | undefined): { where: string; params: unknown[] } {
  const tokens = (query ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { where: '', params: [] };
  const tokenClauses = tokens.map(() =>
    `EXISTS (
       SELECT 1 FROM person_names n
       WHERE n.person_id = p.id
         AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ? OR n.nickname LIKE ?)
     )`
  ).join(' AND ');
  const params = tokens.flatMap(t => { const l = `%${t}%`; return [l, l, l, l]; });
  return { where: `WHERE ${tokenClauses}`, params };
}

/**
 * Builds the ORDER BY fragment for one sort dimension. Used for both the
 * primary and secondary sort. `dir` is already pre-validated to ASC/DESC.
 *
 * For the count columns and `sex`, the natural sort key is the column's
 * own value; for `name`-style keys we use the displayed name expression so
 * the sort matches the rendered column.
 */
function orderByFragment(sortBy: ListPersonsSortBy, dir: 'ASC' | 'DESC'): string {
  if (sortBy === 'given_name') {
    return `COALESCE(NULLIF(TRIM(pn.preferred_name), ''), pn.given_name) ${dir}, pn.surname ${dir}`;
  }
  if (sortBy === 'birth_date') {
    return `CASE WHEN bd.date_value IS NULL THEN 1 ELSE 0 END, bd.date_value ${dir}`;
  }
  if (sortBy === 'display_id') {
    return `CASE WHEN p.display_id IS NULL THEN 1 ELSE 0 END, p.display_id ${dir}`;
  }
  if (sortBy === 'sex') {
    return `p.sex ${dir}`;
  }
  if (sortBy === 'surname') {
    return `pn.surname ${dir}, pn.given_name ${dir}`;
  }
  // Aggregate count columns
  return `${AGG_SQL[sortBy]} ${dir}`;
}

export async function listPersonsPage(
  db: Database,
  limit: number,
  offset: number,
  sortBy: ListPersonsSortBy = 'surname',
  sortDir: ListPersonsSortDir = 'asc',
  query?: string,
  sortBy2?: ListPersonsSortBy | null,
  sortDir2?: ListPersonsSortDir,
): Promise<PersonListItem[]> {
  // Single SQL pass: select id + display fields + every aggregate count in
  // one correlated-subquery sweep. The plan demands "single SQL per page,
  // never per-row" — see .claude/rules/api.md "Bulk / Batch naming".
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const dir2 = sortDir2 === 'desc' ? 'DESC' : 'ASC';
  // Default tiebreaker chain: when sorting by a low-cardinality column
  // (sex, any count), fall back to displayed-surname ASC then given_name
  // ASC so rows within each bucket appear alphabetically, matching the
  // user goal "sex-sort still has surnames in alphabetical order within
  // each sex bucket". When the user explicitly sets a secondary, that
  // wins; the surname/given fallback applies after BOTH user-selected
  // sorts.
  const primaryFrag = orderByFragment(sortBy, dir);
  const secondaryFrag = sortBy2 && sortBy2 !== sortBy
    ? orderByFragment(sortBy2, dir2)
    : '';
  const tiebreaker = 'pn.surname ASC, pn.given_name ASC';
  const orderBy = [primaryFrag, secondaryFrag, tiebreaker].filter(Boolean).join(', ');
  const filter = buildPersonsFilterClause(query);
  // `birth_surname` is a display-only correlated subquery — see
  // plan birth-name-display-and-quality-check. Computed at read time;
  // never persisted.
  const page = await queryAll<{
    id: string;
    sex: string;
    display_id: number | null;
    given_name: string;
    surname: string;
    preferred_name: string | null;
    nickname: string | null;
    birth_surname: string | null;
    name_count: number;
    event_count: number;
    relationship_count: number;
    media_count: number;
    group_count: number;
    task_count: number;
    quality_count: number;
  }>(db, `
    SELECT p.id, p.sex, p.display_id,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '')    AS surname,
           pn.preferred_name           AS preferred_name,
           pn.nickname                 AS nickname,
           ${birthSurnameSql('p.id')}  AS birth_surname,
           ${AGG_SQL.name_count}         AS name_count,
           ${AGG_SQL.event_count}        AS event_count,
           ${AGG_SQL.relationship_count} AS relationship_count,
           ${AGG_SQL.media_count}        AS media_count,
           ${AGG_SQL.group_count}        AS group_count,
           ${AGG_SQL.task_count}         AS task_count,
           ${AGG_SQL.quality_count}      AS quality_count
    FROM persons p
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    LEFT JOIN (
      SELECT person_id, MIN(date_value) AS date_value
      FROM event_participants ep
      JOIN events e ON e.id = ep.event_id
      WHERE e.event_type = 'birth' AND e.date_value IS NOT NULL
      GROUP BY ep.person_id
    ) bd ON bd.person_id = p.id
    ${filter.where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...filter.params, limit, offset]);

  if (page.length === 0) return [];

  // Pass 2: fetch birth + death events for this page's persons only.
  const ids = page.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const eventRows = await queryAll<{
    person_id: string;
    event_type: string;
    date_display: string | null;
    place_name: string | null;
  }>(db, `
    SELECT ep.person_id, e.event_type,
           COALESCE(NULLIF(e.date_original, ''), e.date_value) AS date_display,
           pl.name AS place_name
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
      if (entry.birth_date === null) entry.birth_date = row.date_display;
      if (entry.birth_place === null) entry.birth_place = row.place_name;
    } else {
      if (entry.death_date === null) entry.death_date = row.date_display;
      if (entry.death_place === null) entry.death_place = row.place_name;
    }
  }

  return page.map(p => {
    const events = eventMap.get(p.id) ?? { birth_date: null, birth_place: null, death_date: null, death_place: null };
    return {
      id: p.id,
      sex: p.sex as Person['sex'],
      display_id: p.display_id,
      given_name: p.given_name,
      surname: p.surname,
      preferred_name: p.preferred_name,
      nickname: p.nickname,
      birth_surname: p.birth_surname,
      ...events,
      name_count: p.name_count ?? 0,
      event_count: p.event_count ?? 0,
      relationship_count: p.relationship_count ?? 0,
      media_count: p.media_count ?? 0,
      group_count: p.group_count ?? 0,
      task_count: p.task_count ?? 0,
      quality_count: p.quality_count ?? 0,
    };
  });
}

/**
 * Returns a Map from person_id to unresolved-quality-issue count, read from
 * the `quality_issue_counts` cache table. Bulk-by-name per
 * `.claude/rules/api.md` — single SQL with `IN (?,?,...)` regardless of N.
 *
 * Missing entries (persons not yet seen by `refreshQualityIssueCounts`)
 * default to 0 in the returned map.
 */
export async function getQualityIssueCounts(db: Database, personIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const id of personIds) result[id] = 0;
  if (personIds.length === 0) return result;
  const placeholders = personIds.map(() => '?').join(',');
  const rows = await queryAll<{ person_id: string; issue_count: number }>(db,
    `SELECT person_id, issue_count FROM quality_issue_counts WHERE person_id IN (${placeholders})`,
    personIds,
  );
  for (const row of rows) result[row.person_id] = row.issue_count;
  return result;
}

/**
 * Replace the entire `quality_issue_counts` table from a fresh
 * person_id → count map. Caller is responsible for running
 * `runAllChecks` and bucketing results by personId. Single transaction
 * — wipe + bulk insert. Idempotent.
 */
export async function refreshQualityIssueCounts(db: Database, counts: Record<string, number>): Promise<void> {
  await runSql(db, 'BEGIN IMMEDIATE');
  try {
    await runSql(db, 'DELETE FROM quality_issue_counts');
    for (const [personId, count] of Object.entries(counts)) {
      if (count > 0) {
        await runSql(db,
          'INSERT INTO quality_issue_counts (person_id, issue_count) VALUES (?, ?)',
          [personId, count],
        );
      }
    }
    await runSql(db, 'COMMIT');
  } catch (err) {
    try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

export async function countPersons(db: Database, query?: string): Promise<number> {
  const filter = buildPersonsFilterClause(query);
  if (!filter.where) {
    return (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons'))?.n ?? 0;
  }
  return (await queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM persons p ${filter.where}`, filter.params))?.n ?? 0;
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

export async function listUnsourcedPersonsPage(db: Database, limit: number, offset: number): Promise<PersonListItem[]> {
  // `birth_surname` is a display-only correlated subquery — see
  // plan birth-name-display-and-quality-check. Computed at read time;
  // never persisted.
  const page = await queryAll<{ id: string; sex: string; given_name: string; surname: string; preferred_name: string | null; nickname: string | null; birth_surname: string | null }>(db, `
    SELECT p.id, p.sex,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '')    AS surname,
           pn.preferred_name           AS preferred_name,
           pn.nickname                 AS nickname,
           ${birthSurnameSql('p.id')}  AS birth_surname
    FROM persons p
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    WHERE ${UNSOURCED_FILTER}
    ORDER BY pn.surname, pn.given_name
    LIMIT ? OFFSET ?
  `, [limit, offset]);

  if (page.length === 0) return [];

  const ids = page.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const eventRows = await queryAll<{
    person_id: string;
    event_type: string;
    date_display: string | null;
    place_name: string | null;
  }>(db, `
    SELECT ep.person_id, e.event_type,
           COALESCE(NULLIF(e.date_original, ''), e.date_value) AS date_display,
           pl.name AS place_name
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
      if (entry.birth_date === null) entry.birth_date = row.date_display;
      if (entry.birth_place === null) entry.birth_place = row.place_name;
    } else {
      if (entry.death_date === null) entry.death_date = row.date_display;
      if (entry.death_place === null) entry.death_place = row.place_name;
    }
  }

  return page.map(p => {
    const events = eventMap.get(p.id) ?? { birth_date: null, birth_place: null, death_date: null, death_place: null };
    return {
      id: p.id,
      sex: p.sex as Person['sex'],
      display_id: null,
      given_name: p.given_name,
      surname: p.surname,
      preferred_name: p.preferred_name,
      nickname: p.nickname,
      birth_surname: p.birth_surname,
      ...events,
      // Unsourced view doesn't surface aggregate columns — kept at 0 to
      // maintain the PersonListItem shape consumers rely on.
      name_count: 0,
      event_count: 0,
      relationship_count: 0,
      media_count: 0,
      group_count: 0,
      task_count: 0,
      quality_count: 0,
    };
  });
}

export async function countUnsourcedPersons(db: Database): Promise<number> {
  return (await queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM persons p WHERE ${UNSOURCED_FILTER}`))?.n ?? 0;
}

export async function searchPersonsWithDetails(db: Database, query: string): Promise<PersonListItem[]> {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const tokenClauses = tokens.map(() =>
    `EXISTS (
       SELECT 1 FROM person_names n
       WHERE n.person_id = p.id
         AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ?)
     )`
  ).join(' AND ');
  const like = `%${query}%`;
  const tokenParams = tokens.flatMap(t => { const l = `%${t}%`; return [l, l, l]; });

  return await queryAll<PersonListItem>(db, `
    ${PERSON_LIST_BASE_QUERY}
    WHERE p.notes LIKE ?
       OR (${tokenClauses})
    ORDER BY pn.surname, pn.given_name
  `, [like, ...tokenParams]);
}

export async function getPersonDisplayNames(db: Database, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await queryAll<{ person_id: string; given_name: string; surname: string }>(db, `
    SELECT pn.person_id,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '')    AS surname
    FROM person_names pn
    WHERE pn.person_id IN (${placeholders})
      AND pn.id = ${displayedNameIdSql('pn.person_id')}
  `, ids);
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = [row.given_name, row.surname].filter(Boolean).join(' ');
    map.set(row.person_id, name || '?');
  }
  return map;
}

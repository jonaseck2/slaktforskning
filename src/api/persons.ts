import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Person, PersonName, PersonIdentifier, GenealogyEvent } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';
import { livingSqlExpr } from './personLiving';

/**
 * Thrown by `updatePerson` when a sex flip is requested on a person who has
 * one or more active relationships and the caller has not declared whether
 * the change is a typo correction or a genuine gender transition.
 *
 * The UI catches this error and routes the user through the
 * `GenderTransitionConfirmModal` (Phase 2). The MCP tool wrapper adds the
 * confirmation arguments in Phase 3.
 *
 * Carries `personId` and `activeRelationshipIds` so the consumer can render
 * a per-relationship review without an extra DB round-trip.
 */
export class SexChangeRequiresConfirmationError extends Error {
  readonly personId: string;
  readonly activeRelationshipIds: string[];
  constructor(personId: string, activeRelationshipIds: string[]) {
    super(
      `Sex change on person ${personId} requires explicit confirmation: ` +
      `person has ${activeRelationshipIds.length} active relationship(s). ` +
      `Pass opts.confirmCorrection=true (typo) or opts.confirmGenderTransition (transition event).`
    );
    this.name = 'SexChangeRequiresConfirmationError';
    this.personId = personId;
    this.activeRelationshipIds = activeRelationshipIds;
  }
}

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
export function createPerson(
  db: Database,
  data: { sex?: Person['sex']; notes?: string; given_name?: string; surname?: string },
  options: { allowNameless?: boolean } = {}
): Person {
  const hasName = !!(data.given_name?.trim() || data.surname?.trim());
  if (!hasName && !options.allowNameless) {
    throw new Error('Cannot create person without a name. Provide given_name or surname.');
  }

  const id = uuid();
  runSql(db,
    `INSERT INTO persons (id, sex, notes) VALUES (?, ?, ?)`,
    [id, data.sex ?? 'U', data.notes ?? '']
  );
  // Assign display_id = max + 1 for this database. UNIQUE index catches any
  // race; SQLite serializes within a single connection so this is safe.
  runSql(db,
    `UPDATE persons SET display_id = (SELECT COALESCE(MAX(display_id), 0) + 1 FROM persons) WHERE id = ?`,
    [id]
  );

  if (hasName) {
    const nameId = uuid();
    const parsed = parsePreferredName(data.given_name);
    runSql(db,
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order, preferred_name) VALUES (?, ?, ?, ?, 'birth', 0, ?)`,
      [nameId, id, parsed.given_name ?? '', data.surname ?? '', parsed.preferred_name]
    );
  }

  // Skip livingSqlExpr — the just-created person has no events yet, so living=true
  // by definition. Calling getPerson() here ran two correlated EXISTS subqueries
  // against the growing events + event_participants tables on every INSERT, which
  // turned bulk imports into O(n²). Regression introduced in bad81619.
  const row = queryOne<Omit<Person, 'living'>>(db, `SELECT * FROM persons WHERE id = ?`, [id])!;
  return { ...row, living: true };
}

export function getPerson(db: Database, id: string): Person | null {
  const row = queryOne<Omit<Person, 'living'> & { living: number }>(
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

export function listPersons(db: Database): (Person & { given_name: string; surname: string; preferred_name: string | null; nickname: string | null })[] {
  type Row = Omit<Person, 'living'> & { living: number; given_name: string; surname: string; preferred_name: string | null; nickname: string | null };
  const rows = queryAll<Row>(db, `
    SELECT p.*, ${livingSqlExpr('p')} AS living,
           pn.given_name, pn.surname, pn.preferred_name, pn.nickname
    FROM persons p
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    ORDER BY pn.surname, pn.given_name
  `);
  return rows.map(r => ({ ...r, living: r.living === 1 }));
}

/**
 * Optional caller-supplied details for a `gender_transition` event created
 * atomically with a sex flip. Mirrors the relevant subset of `createEvent`
 * — `event_type` is fixed to `'gender_transition'` and `relationship_id`
 * cannot be set (a person-only fact).
 */
export type GenderTransitionEventDetails = {
  date: string;
  date_type?: GenealogyEvent['date_type'];
  date_original?: string;
  place_id?: string | null;
  notes?: string;
};

/**
 * Options for `updatePerson` that opt out of (or into) the sex-change guard.
 *
 * - `confirmCorrection: true` — caller declares the sex change is fixing a
 *   typo. No event is created; sex flips silently.
 * - `confirmGenderTransition: { date, ... }` — caller declares the sex
 *   change records a real-life transition. A `gender_transition` event is
 *   created AND the sex flips, atomically in one transaction.
 *
 * If neither is set and the change targets `sex` on a person with active
 * relationships, `updatePerson` throws `SexChangeRequiresConfirmationError`.
 */
export type UpdatePersonOptions = {
  confirmCorrection?: boolean;
  confirmGenderTransition?: GenderTransitionEventDetails;
};

/**
 * Returns the IDs of all relationships that involve `personId` as either
 * `person1_id` or `person2_id`. Used by the sex-change guard to decide
 * whether silent flips are safe (zero relationships) or need confirmation.
 */
function getActiveRelationshipIdsForPerson(db: Database, personId: string): string[] {
  return queryAll<{ id: string }>(
    db,
    `SELECT id FROM relationships WHERE person1_id = ? OR person2_id = ?`,
    [personId, personId]
  ).map(r => r.id);
}

/**
 * Update a person's mutable fields (`sex`, `notes`).
 *
 * **Sex-change guard (plan 2026-05-06-sex-change-guard, Phase 1).** When
 * `data.sex` is set AND differs from the stored value AND the person has at
 * least one active relationship, the caller must opt into one of two paths:
 *
 *   1. `opts.confirmCorrection: true` — typo correction, sex flips silently,
 *      no event created.
 *   2. `opts.confirmGenderTransition: { date, ... }` — real-life transition;
 *      a `gender_transition` event is created AND the sex flips, in a single
 *      transaction.
 *
 * If neither flag is set under those conditions, the function throws
 * `SexChangeRequiresConfirmationError` carrying the active relationship IDs
 * so the UI / MCP wrapper can render the appropriate confirmation flow.
 *
 * Persons with zero active relationships flip silently — no friction
 * (locked decision D1 in the plan).
 *
 * Per the Prime Directive, the resolver of "what sex was this person at
 * date X" lives at render time (`resolveParentSexAt`). This function only
 * persists what the user authored: their current sex AND, optionally, an
 * authored transition event marking when the change happened.
 */
export function updatePerson(
  db: Database,
  id: string,
  data: Partial<Pick<Person, 'sex' | 'notes'>>,
  opts?: UpdatePersonOptions,
): Person | null {
  // Sex-change guard: only fires when the caller actually requests a sex
  // change AND it would change the stored value.
  if (data.sex !== undefined) {
    const existing = getPerson(db, id);
    if (existing && existing.sex !== data.sex) {
      const relIds = getActiveRelationshipIdsForPerson(db, id);
      const hasRelationships = relIds.length > 0;

      if (hasRelationships) {
        if (opts?.confirmGenderTransition) {
          // Atomic: create the transition event AND flip the sex.
          const ev = opts.confirmGenderTransition;
          runSql(db, 'BEGIN IMMEDIATE');
          try {
            const eventId = uuid();
            runSql(db, `
              INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, cause, value, notes)
              VALUES (?, 'gender_transition', NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?)
            `, [
              eventId,
              ev.date_type ?? 'exact',
              ev.date,
              ev.date_original ?? '',
              ev.place_id ?? null,
              ev.notes ?? '',
            ]);
            const participantId = uuid();
            runSql(db, `
              INSERT INTO event_participants (id, event_id, person_id, role)
              VALUES (?, ?, ?, 'primary')
            `, [participantId, eventId, id]);
            runSql(db, `
              UPDATE persons SET sex = ?, updated_at = datetime('now')
              ${data.notes !== undefined ? ', notes = ?' : ''}
              WHERE id = ?
            `, data.notes !== undefined ? [data.sex, data.notes, id] : [data.sex, id]);
            runSql(db, 'COMMIT');
          } catch (err) {
            try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
            throw err;
          }
          return getPerson(db, id);
        }
        if (!opts?.confirmCorrection) {
          throw new SexChangeRequiresConfirmationError(id, relIds);
        }
        // confirmCorrection === true → fall through to plain UPDATE below.
      }
      // Zero active relationships → fall through; silent flip allowed.
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.sex !== undefined) { fields.push('sex = ?'); values.push(data.sex); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (fields.length === 0) return getPerson(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  runSql(db, `UPDATE persons SET ${fields.join(', ')} WHERE id = ?`, values);
  return getPerson(db, id);
}

/**
 * Convenience wrapper for the gender-transition path. Equivalent to:
 *   updatePerson(db, id, { sex }, { confirmGenderTransition: eventDetails })
 * but returns both the updated person and the created event for callers
 * (Phase 2 modals, Phase 3 MCP) that need both ids without re-querying.
 */
export function updatePersonWithGenderTransitionWorkflow(
  db: Database,
  id: string,
  args: { sex: Person['sex']; eventDetails: GenderTransitionEventDetails },
): { person: Person | null; event: GenealogyEvent | null } {
  const person = updatePerson(
    db,
    id,
    { sex: args.sex },
    { confirmGenderTransition: args.eventDetails },
  );
  // The most recently inserted gender_transition event for this person —
  // we just created it inside the same transaction, so it's the newest.
  const event = queryOne<GenealogyEvent>(db, `
    SELECT e.* FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE ep.person_id = ?
      AND e.event_type = 'gender_transition'
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `, [id]) ?? null;
  return { person, event };
}

export function deletePerson(db: Database, id: string): boolean {
  // Clean up polymorphic link rows that don't have FK CASCADE
  runSqlChanges(db, `DELETE FROM task_links WHERE entity_type = 'person' AND entity_id = ?`, [id]);
  runSqlChanges(db, `DELETE FROM group_links WHERE entity_type = 'person' AND entity_id = ?`, [id]);
  return runSqlChanges(db, `DELETE FROM persons WHERE id = ?`, [id]) > 0;
}

export function searchPersons(
  db: Database,
  query: string,
  relateeId?: string | null,
  limit = 20,
): (Person & {
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
})[] {
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
  const rows = queryAll<Row>(db, `
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
  const parsed = parsePreferredName(data.given_name);
  // Explicit preferred_name in data takes precedence over marker-parsed value
  const preferredName = data.preferred_name !== undefined ? data.preferred_name : parsed.preferred_name;
  runSql(db, `
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
  return queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id])!;
}

export function getPersonNames(db: Database, personId: string): PersonName[] {
  return queryAll<PersonName>(db, `SELECT * FROM person_names WHERE person_id = ? ORDER BY sort_order`, [personId]);
}

export function updatePersonName(
  db: Database,
  id: string,
  data: Partial<Pick<PersonName, 'given_name' | 'surname' | 'name_type' | 'date_from' | 'date_to' | 'name_prefix' | 'name_suffix' | 'patronymic_base' | 'name_qualifier' | 'preferred_name' | 'nickname' | 'sort_order'>>
): PersonName | null {
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
    ) AS death_place
  FROM persons p
  LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
`;


export type ListPersonsSortBy = 'surname' | 'given_name' | 'birth_date' | 'display_id';
export type ListPersonsSortDir = 'asc' | 'desc';

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

export function listPersonsPage(
  db: Database,
  limit: number,
  offset: number,
  sortBy: ListPersonsSortBy = 'surname',
  sortDir: ListPersonsSortDir = 'asc',
  query?: string,
): PersonListItem[] {
  // Pass 1: sort + paginate with only name + birth-date data — no death/place
  // subqueries (those are pass 2). Correlated subqueries on all N persons
  // before LIMIT caused O(4N) lookups on large DBs.
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  // NULL birth_dates sort last on asc, first on desc (CASE WHEN trick).
  // For given_name sort, use COALESCE(NULLIF(TRIM(preferred_name), ''), given_name)
  // so the sort key matches what the user sees in the row (display uses
  // preferred_name when set; otherwise the full given_name). Read-only —
  // never written back to the DB.
  const orderBy = sortBy === 'given_name'
    ? `COALESCE(NULLIF(TRIM(pn.preferred_name), ''), pn.given_name) ${dir}, pn.surname ${dir}`
    : sortBy === 'birth_date'
    ? `CASE WHEN bd.date_value IS NULL THEN 1 ELSE 0 END, bd.date_value ${dir}, pn.surname ASC, pn.given_name ASC`
    : sortBy === 'display_id'
    ? `CASE WHEN p.display_id IS NULL THEN 1 ELSE 0 END, p.display_id ${dir}`
    : `pn.surname ${dir}, pn.given_name ${dir}`;
  const filter = buildPersonsFilterClause(query);
  // `birth_surname` is a display-only correlated subquery — see
  // plan birth-name-display-and-quality-check. Computed at read time;
  // never persisted.
  const page = queryAll<{ id: string; sex: string; display_id: number | null; given_name: string; surname: string; preferred_name: string | null; nickname: string | null; birth_surname: string | null }>(db, `
    SELECT p.id, p.sex, p.display_id,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '')    AS surname,
           pn.preferred_name           AS preferred_name,
           pn.nickname                 AS nickname,
           ${birthSurnameSql('p.id')}  AS birth_surname
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
  const eventRows = queryAll<{
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
    };
  });
}

export function countPersons(db: Database, query?: string): number {
  const filter = buildPersonsFilterClause(query);
  if (!filter.where) {
    return queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons')?.n ?? 0;
  }
  return queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM persons p ${filter.where}`, filter.params)?.n ?? 0;
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
  // `birth_surname` is a display-only correlated subquery — see
  // plan birth-name-display-and-quality-check. Computed at read time;
  // never persisted.
  const page = queryAll<{ id: string; sex: string; given_name: string; surname: string; preferred_name: string | null; nickname: string | null; birth_surname: string | null }>(db, `
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
  const eventRows = queryAll<{
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
    };
  });
}

export function countUnsourcedPersons(db: Database): number {
  return queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM persons p WHERE ${UNSOURCED_FILTER}`)?.n ?? 0;
}

export function searchPersonsWithDetails(db: Database, query: string): PersonListItem[] {
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

  return queryAll<PersonListItem>(db, `
    ${PERSON_LIST_BASE_QUERY}
    WHERE p.notes LIKE ?
       OR (${tokenClauses})
    ORDER BY pn.surname, pn.given_name
  `, [like, ...tokenParams]);
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
      AND pn.id = ${displayedNameIdSql('pn.person_id')}
  `, ids);
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = [row.given_name, row.surname].filter(Boolean).join(' ');
    map.set(row.person_id, name || '?');
  }
  return map;
}

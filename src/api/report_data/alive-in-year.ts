import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { loadLivingDerivation, isLivingDerived } from '../personLiving';

export interface AliveInYearPerson {
  id: string;
  given_name: string | null;
  surname: string | null;
  /**
   * Birth-type record's surname when distinct from `surname`. Display only —
   * see plan birth-name-display-and-quality-check.
   */
  birth_surname: string | null;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthYear: number | null;
  deathYear: number | null;
  age: number | null;
  placeName: string | null;
}

export interface AliveInYearFamily {
  relationshipId: string;
  parents: AliveInYearPerson[];
  children: AliveInYearPerson[];
}

export interface AliveInYearResult {
  year: number;
  persons: AliveInYearPerson[];
  families: AliveInYearFamily[];
  unattached: AliveInYearPerson[];
}

const MAX_LIFESPAN = 110;

/**
 * Returns all persons who were likely alive in a given year, grouped by
 * family unit (couple relationships). Inclusion rules:
 *   - known birth + death bracketing year → include
 *   - birth only (before year) and not > MAX_LIFESPAN ago → include
 *   - death only (after year) and not > MAX_LIFESPAN in the future → include
 *   - no birth/death but has any event in the target year → include
 *   - otherwise → exclude
 * placeName is the name of the place from the most recent event at or before
 * the target year that has a place_id.
 */
export async function getAliveInYear(db: Database, year: number): Promise<AliveInYearResult> {
  // Bulk pre-load — replaces a per-person correlated-subquery storm that
  // saturated CPU and exhausted the WASM heap on real-sized trees.
  const livingDerivation = await loadLivingDerivation(db);

  const birthYearRows = await queryAll<{ person_id: string; year: number }>(db, `
    SELECT ep.person_id, MIN(CAST(substr(e.date_value, 1, 4) AS INTEGER)) AS year
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'birth' AND e.date_value IS NOT NULL
    GROUP BY ep.person_id
  `);
  const birthYearByPerson = new Map(birthYearRows.map(r => [r.person_id, r.year]));

  const deathYearRows = await queryAll<{ person_id: string; year: number }>(db, `
    SELECT ep.person_id, MIN(CAST(substr(e.date_value, 1, 4) AS INTEGER)) AS year
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'death' AND e.date_value IS NOT NULL
    GROUP BY ep.person_id
  `);
  const deathYearByPerson = new Map(deathYearRows.map(r => [r.person_id, r.year]));

  const eventInYearRows = await queryAll<{ person_id: string }>(db, `
    SELECT DISTINCT ep.person_id
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.date_value IS NOT NULL
      AND CAST(substr(e.date_value, 1, 4) AS INTEGER) = ?
  `, [year]);
  const personsWithEventInYear = new Set(eventInYearRows.map(r => r.person_id));

  // Latest place at-or-before target year per person — single scan, JS reduce.
  const placeRows = await queryAll<{ person_id: string; date_value: string; place_name: string }>(db, `
    SELECT ep.person_id, e.date_value, pl.name AS place_name
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN places pl ON pl.id = e.place_id
    WHERE e.date_value IS NOT NULL
      AND CAST(substr(e.date_value, 1, 4) AS INTEGER) <= ?
      AND pl.name IS NOT NULL
  `, [year]);
  const latestPlaceByPerson = new Map<string, { date_value: string; name: string }>();
  for (const r of placeRows) {
    const cur = latestPlaceByPerson.get(r.person_id);
    if (!cur || r.date_value > cur.date_value) {
      latestPlaceByPerson.set(r.person_id, { date_value: r.date_value, name: r.place_name });
    }
  }

  // Names: bulk-load and replicate displayedNameIdSql / birthSurnameSql in JS.
  type NameRow = {
    id: string;
    person_id: string;
    given_name: string | null;
    surname: string | null;
    name_type: string;
    date_from: string | null;
    sort_order: number;
  };
  const nameRows = await queryAll<NameRow>(db, `
    SELECT id, person_id, given_name, surname, name_type, date_from, sort_order
    FROM person_names
  `);
  const namesByPerson = new Map<string, NameRow[]>();
  for (const n of nameRows) {
    const list = namesByPerson.get(n.person_id);
    if (list) list.push(n);
    else namesByPerson.set(n.person_id, [n]);
  }

  // Earliest primary-role birth event date per person — used to date 'birth' name_type.
  const birthEventDateRows = await queryAll<{ person_id: string; date_value: string }>(db, `
    SELECT ep.person_id, MIN(e.date_value) AS date_value
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'birth'
      AND ep.role = 'primary'
      AND e.date_value IS NOT NULL AND e.date_value <> ''
    GROUP BY ep.person_id
  `);
  const birthEventDateByPerson = new Map(birthEventDateRows.map(r => [r.person_id, r.date_value]));

  function effectiveDate(n: NameRow): string | null {
    if (n.name_type === 'birth') {
      return birthEventDateByPerson.get(n.person_id) ?? n.date_from;
    }
    return n.date_from;
  }

  function pickDisplayedName(personId: string): { given_name: string | null; surname: string | null } {
    const list = namesByPerson.get(personId);
    if (!list || list.length === 0) return { given_name: null, surname: null };
    let best: NameRow | null = null;
    let bestDate: string | null = null;
    for (const n of list) {
      const d = effectiveDate(n);
      if (best === null) {
        best = n; bestDate = d; continue;
      }
      // Mirror SQL: nulls last on effective date; then date DESC; then sort_order DESC; then id ASC.
      const aHasDate = bestDate != null;
      const bHasDate = d != null;
      let bWins = false;
      if (aHasDate !== bHasDate) {
        bWins = bHasDate && !aHasDate;
      } else if (aHasDate && bHasDate && bestDate !== d) {
        bWins = (d as string) > (bestDate as string);
      } else if (n.sort_order !== best.sort_order) {
        bWins = n.sort_order > best.sort_order;
      } else {
        bWins = n.id < best.id;
      }
      if (bWins) { best = n; bestDate = d; }
    }
    return { given_name: best?.given_name ?? null, surname: best?.surname ?? null };
  }

  function pickBirthSurname(personId: string): string | null {
    const list = namesByPerson.get(personId);
    if (!list) return null;
    let best: NameRow | null = null;
    for (const n of list) {
      if (n.name_type !== 'birth') continue;
      if (!best
        || n.sort_order < best.sort_order
        || (n.sort_order === best.sort_order && n.id < best.id)) {
        best = n;
      }
    }
    return best?.surname ?? null;
  }

  const personRows = await queryAll<{ id: string; sex: 'M' | 'F' | 'U' }>(db, `SELECT id, sex FROM persons`);

  const alive: AliveInYearPerson[] = [];
  for (const p of personRows) {
    const birthYear = birthYearByPerson.get(p.id) ?? null;
    const deathYear = deathYearByPerson.get(p.id) ?? null;

    const notBornYet = birthYear != null && birthYear > year;
    const diedAlready = deathYear != null && deathYear < year;
    const tooOldNoBirth = birthYear == null && deathYear != null && (deathYear - year) > MAX_LIFESPAN;
    const tooOldNoDeath = deathYear == null && birthYear != null && (year - birthYear) > MAX_LIFESPAN;

    let include = false;
    if (notBornYet || diedAlready) include = false;
    else if (birthYear != null && deathYear != null) include = true;
    else if (birthYear != null) include = !tooOldNoDeath;
    else if (deathYear != null) include = !tooOldNoBirth;
    else include = personsWithEventInYear.has(p.id);

    if (!include) continue;

    const { given_name, surname } = pickDisplayedName(p.id);
    const rawBirthSurname = pickBirthSurname(p.id);
    const cleanBirthSurname = rawBirthSurname && rawBirthSurname.trim() && rawBirthSurname.trim() !== (surname ?? '').trim()
      ? rawBirthSurname
      : null;

    alive.push({
      id: p.id,
      sex: p.sex,
      living: isLivingDerived(p.id, livingDerivation),
      given_name,
      surname,
      birth_surname: cleanBirthSurname,
      birthYear,
      deathYear,
      age: birthYear != null ? year - birthYear : null,
      placeName: latestPlaceByPerson.get(p.id)?.name ?? null,
    });
  }

  const coupleRows = await queryAll<{ id: string; person1_id: string | null; person2_id: string | null }>(db,
    `SELECT id, person1_id, person2_id FROM relationships WHERE type = 'couple'`
  );

  const parentChildRows = await queryAll<{ parent_id: string | null; child_id: string | null }>(db,
    `SELECT person1_id AS parent_id, person2_id AS child_id
     FROM relationships WHERE type = 'parent_child'`
  );

  const childrenByParent = new Map<string, string[]>();
  for (const r of parentChildRows) {
    if (!r.parent_id || !r.child_id) continue;
    if (!childrenByParent.has(r.parent_id)) childrenByParent.set(r.parent_id, []);
    childrenByParent.get(r.parent_id)!.push(r.child_id);
  }

  const personById = new Map(alive.map(p => [p.id, p]));
  const families: AliveInYearFamily[] = [];
  const groupedPersonIds = new Set<string>();

  for (const c of coupleRows) {
    // Only skip if BOTH sides are null — a half-couple (one known partner) is still valid
    if (!c.person1_id && !c.person2_id) continue;
    const p1 = c.person1_id ? personById.get(c.person1_id) : undefined;
    const p2 = c.person2_id ? personById.get(c.person2_id) : undefined;
    if (!p1 && !p2) continue;
    const parents: AliveInYearPerson[] = [];
    if (p1) { parents.push(p1); groupedPersonIds.add(p1.id); }
    if (p2) { parents.push(p2); groupedPersonIds.add(p2.id); }

    const childIds = new Set<string>();
    if (c.person1_id) (childrenByParent.get(c.person1_id) || []).forEach(x => childIds.add(x));
    if (c.person2_id) (childrenByParent.get(c.person2_id) || []).forEach(x => childIds.add(x));
    const children: AliveInYearPerson[] = [];
    for (const cid of childIds) {
      const child = personById.get(cid);
      if (child) { children.push(child); groupedPersonIds.add(child.id); }
    }

    families.push({ relationshipId: c.id, parents, children });
  }

  const unattached = alive.filter(p => !groupedPersonIds.has(p.id));

  return { year, persons: alive, families, unattached };
}

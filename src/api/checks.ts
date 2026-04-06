import type { Database } from 'node-sqlite3-wasm';
import { queryOne, queryAll } from './db';

export type CheckSeverity = 'error' | 'warning' | 'notice';

export interface CheckResult {
  code: string;
  severity: CheckSeverity;
  message: string; // Swedish fallback
  messageParams?: Record<string, string | number>; // for i18n interpolation in renderer
  personIds: string[];
  eventIds?: string[];
  relationshipIds?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load all events of a given type for all persons in two simple JOINs.
 * Returns a Map<person_id, [{event_id, date_value}]>.
 *
 * Using a single SQL query that joins event_participants × events twice (once
 * for births, once for deaths, etc.) produces a large intermediate Cartesian
 * product in WASM SQLite that can take 100+ seconds on 20k-person databases.
 * Two separate queries + a JS join is dramatically faster.
 */
function loadPersonEvents(
  db: Database,
  eventType: string,
  dateTypes: string[] = ['exact', 'calculated'],
): Map<string, Array<{ event_id: string; date_value: string }>> {
  const placeholders = dateTypes.map(() => '?').join(', ');
  const rows = queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT ep.person_id, e.id AS event_id, e.date_value
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id
    WHERE e.event_type = ? AND e.date_type IN (${placeholders}) AND e.date_value IS NOT NULL
  `, [eventType, ...dateTypes]);
  const map = new Map<string, Array<{ event_id: string; date_value: string }>>();
  for (const r of rows) {
    if (!map.has(r.person_id)) map.set(r.person_id, []);
    map.get(r.person_id)!.push({ event_id: r.event_id, date_value: r.date_value });
  }
  return map;
}

/**
 * Returns a Set of person_ids that have at least one event of the given type.
 * Used by NOT-EXISTS-style checks to avoid correlated subqueries that run
 * O(n) SQL lookups per row.
 */
function personIdsWithEvent(db: Database, eventType: string): Set<string> {
  const rows = queryAll<{ person_id: string }>(db, `
    SELECT DISTINCT ep.person_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id
    WHERE e.event_type = ?
  `, [eventType]);
  return new Set(rows.map(r => r.person_id));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TODAY = new Date().toISOString().substring(0, 10);

// ---------------------------------------------------------------------------
// A. Chronological — Person
// ---------------------------------------------------------------------------

function checkBirthAfterDeath(db: Database): CheckResult[] {
  const births = loadPersonEvents(db, 'birth');
  const deaths = loadPersonEvents(db, 'death');
  const results: CheckResult[] = [];
  for (const [personId, deathList] of deaths) {
    for (const d of deathList) {
      for (const b of births.get(personId) ?? []) {
        if (b.date_value > d.date_value) {
          results.push({
            code: 'BIRTH_AFTER_DEATH',
            severity: 'error',
            message: `Födelsedag (${b.date_value}) är efter dödsdatum (${d.date_value})`,
            messageParams: { birthDate: b.date_value, deathDate: d.date_value },
            personIds: [personId],
            eventIds: [b.event_id, d.event_id],
          });
        }
      }
    }
  }
  return results;
}

function checkEventAfterDeath(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; event_id: string; event_type: string; event_date: string; death_id: string; death_date: string }>(db, `
    SELECT p.id AS person_id,
           e.id AS event_id, e.event_type, e.date_value AS event_date,
           d.id AS death_id, d.date_value AS death_date
    FROM persons p
    JOIN event_participants epd ON epd.person_id = p.id
    JOIN events d ON d.id = epd.event_id AND d.event_type = 'death'
      AND d.date_type IN ('exact','calculated') AND d.date_value IS NOT NULL
    JOIN event_participants epe ON epe.person_id = p.id
    JOIN events e ON e.id = epe.event_id
      AND e.event_type NOT IN ('death','burial','will','probate')
      AND e.date_type NOT IN ('unknown')
      AND e.date_value IS NOT NULL
      AND (SUBSTR(e.date_value, 1, 4) > SUBSTR(d.date_value, 1, 4)
           OR (SUBSTR(e.date_value, 1, 4) = SUBSTR(d.date_value, 1, 4)
               AND LENGTH(e.date_value) >= 10 AND LENGTH(d.date_value) >= 10
               AND e.date_value > d.date_value))
  `);

  const eventTypeLabels: Record<string, string> = {
    birth: 'Födselhändelse', christening: 'Dop', baptism: 'Dop', confirmation: 'Konfirmation',
    ordination: 'Ordination', census: 'Folkräkning', immigration: 'Invandring',
    emigration: 'Utvandring', naturalization: 'Medborgarskap', occupation: 'Yrke',
    residence: 'Boende', education: 'Utbildning', graduation: 'Examen',
    military: 'Militärtjänst', retirement: 'Pension', marriage: 'Giftermål',
    divorce: 'Skilsmässa', mention: 'Omnämning', other: 'Övrigt',
  };

  return rows.map(r => ({
    code: 'EVENT_AFTER_DEATH',
    severity: 'error' as CheckSeverity,
    message: `${eventTypeLabels[r.event_type] ?? r.event_type} (${r.event_date}) sker efter dödsdatum (${r.death_date})`,
    messageParams: { eventType: eventTypeLabels[r.event_type] ?? r.event_type, eventDate: r.event_date, deathDate: r.death_date },
    personIds: [r.person_id],
    eventIds: [r.event_id, r.death_id],
  }));
}

function checkBurialBeforeDeath(db: Database): CheckResult[] {
  const burials = loadPersonEvents(db, 'burial');
  const deaths = loadPersonEvents(db, 'death');
  const results: CheckResult[] = [];
  for (const [personId, burialList] of burials) {
    for (const b of burialList) {
      for (const d of deaths.get(personId) ?? []) {
        if (b.date_value < d.date_value) {
          results.push({
            code: 'BURIAL_BEFORE_DEATH',
            severity: 'error',
            message: `Begravning (${b.date_value}) sker före dödsdatum (${d.date_value})`,
            messageParams: { burialDate: b.date_value, deathDate: d.date_value },
            personIds: [personId],
            eventIds: [b.event_id, d.event_id],
          });
        }
      }
    }
  }
  return results;
}

function checkLifespan(db: Database): CheckResult[] {
  const births = loadPersonEvents(db, 'birth');
  const deaths = loadPersonEvents(db, 'death');
  const rows: { person_id: string; birth_year: number; death_year: number; birth_id: string; death_id: string }[] = [];
  for (const [personId, deathList] of deaths) {
    for (const d of deathList) {
      for (const b of births.get(personId) ?? []) {
        const birthYear = parseInt(b.date_value.substring(0, 4), 10);
        const deathYear = parseInt(d.date_value.substring(0, 4), 10);
        if (deathYear - birthYear > 105) {
          rows.push({ person_id: personId, birth_year: birthYear, death_year: deathYear, birth_id: b.event_id, death_id: d.event_id });
        }
      }
    }
  }

  const results: CheckResult[] = [];
  for (const r of rows) {
    const span = r.death_year - r.birth_year;
    if (span > 120) {
      results.push({
        code: 'LIFESPAN_OVER_120',
        severity: 'warning',
        message: `Livsspan på ${span} år överstiger 120 år (född ${r.birth_year}, död ${r.death_year})`,
        messageParams: { span, birthYear: r.birth_year, deathYear: r.death_year },
        personIds: [r.person_id],
        eventIds: [r.birth_id, r.death_id],
      });
    } else {
      results.push({
        code: 'LIFESPAN_OVER_105',
        severity: 'notice',
        message: `Livsspan på ${span} år överstiger 105 år (född ${r.birth_year}, död ${r.death_year})`,
        messageParams: { span, birthYear: r.birth_year, deathYear: r.death_year },
        personIds: [r.person_id],
        eventIds: [r.birth_id, r.death_id],
      });
    }
  }
  return results;
}

function checkFutureDates(db: Database): CheckResult[] {
  const results: CheckResult[] = [];

  const births = queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value > ?
  `, [TODAY]);

  for (const r of births) {
    results.push({
      code: 'FUTURE_BIRTH',
      severity: 'error',
      message: `Födelsedag (${r.date_value}) är i framtiden`,
      messageParams: { date: r.date_value },
      personIds: [r.person_id],
      eventIds: [r.event_id],
    });
  }

  const deaths = queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value > ?
  `, [TODAY]);

  for (const r of deaths) {
    results.push({
      code: 'FUTURE_DEATH',
      severity: 'error',
      message: `Dödsdatum (${r.date_value}) är i framtiden`,
      messageParams: { date: r.date_value },
      personIds: [r.person_id],
      eventIds: [r.event_id],
    });
  }

  return results;
}

function checkBaptismLate(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; baptism_id: string; bap_year: number; birth_id: string; birth_year: number }>(db, `
    SELECT p.id AS person_id,
           bap.id AS baptism_id, CAST(SUBSTR(bap.date_value, 1, 4) AS INTEGER) AS bap_year,
           b.id AS birth_id, CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) AS birth_year
    FROM persons p
    JOIN event_participants epbap ON epbap.person_id = p.id
    JOIN events bap ON bap.id = epbap.event_id AND bap.event_type = 'baptism'
      AND bap.date_type NOT IN ('unknown') AND bap.date_value IS NOT NULL
    JOIN event_participants epb ON epb.person_id = p.id
    JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
      AND b.date_type NOT IN ('unknown') AND b.date_value IS NOT NULL
    WHERE CAST(SUBSTR(bap.date_value, 1, 4) AS INTEGER) > CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) + 10
  `);

  return rows.map(r => ({
    code: 'BAPTISM_LATE',
    severity: 'notice' as CheckSeverity,
    message: `Dop (${r.bap_year}) sker mer än 10 år efter födseln (${r.birth_year})`,
    messageParams: { baptismYear: r.bap_year, birthYear: r.birth_year },
    personIds: [r.person_id],
    eventIds: [r.baptism_id, r.birth_id],
  }));
}

function checkDeathWithoutBirth(db: Database): CheckResult[] {
  const hasBirth = personIdsWithEvent(db, 'birth');
  const deathRows = queryAll<{ person_id: string; event_id: string }>(db, `
    SELECT ep.person_id, e.id AS event_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
  `);
  return deathRows
    .filter(r => !hasBirth.has(r.person_id))
    .map(r => ({
      code: 'DEATH_WITHOUT_BIRTH',
      severity: 'notice' as CheckSeverity,
      message: `Person har dödshändelse men saknar födelsehändelse`,
      messageParams: {},
      personIds: [r.person_id],
      eventIds: [r.event_id],
    }));
}

function checkNoBirthEvent(db: Database): CheckResult[] {
  const hasBirth = personIdsWithEvent(db, 'birth');
  const allPersonIds = queryAll<{ id: string }>(db, `SELECT id FROM persons`);
  return allPersonIds
    .filter(r => !hasBirth.has(r.id))
    .map(r => ({
      code: 'NO_BIRTH_EVENT',
      severity: 'notice' as CheckSeverity,
      message: `Person saknar födelsehändelse`,
      messageParams: {},
      personIds: [r.id],
    }));
}

// ---------------------------------------------------------------------------
// B. Parenthood Age
// ---------------------------------------------------------------------------

function checkParenthoodAge(db: Database): CheckResult[] {
  // In parent_child relationships: person1_id = parent, person2_id = child
  const rows = queryAll<{
    rel_id: string;
    parent_id: string;
    child_id: string;
    parent_sex: string;
    parent_birth_year: number;
    child_birth_year: number;
    parent_death_year: number | null;
  }>(db, `
    SELECT
      r.id AS rel_id,
      r.person1_id AS parent_id,
      r.person2_id AS child_id,
      p_parent.sex AS parent_sex,
      CAST(SUBSTR(b_parent.date_value, 1, 4) AS INTEGER) AS parent_birth_year,
      CAST(SUBSTR(b_child.date_value, 1, 4) AS INTEGER) AS child_birth_year,
      CAST(SUBSTR(d_parent.date_value, 1, 4) AS INTEGER) AS parent_death_year
    FROM relationships r
    JOIN persons p_parent ON p_parent.id = r.person1_id
    LEFT JOIN event_participants ep_parent_b ON ep_parent_b.person_id = r.person1_id
    LEFT JOIN events b_parent ON b_parent.id = ep_parent_b.event_id AND b_parent.event_type = 'birth'
      AND b_parent.date_type IN ('exact','calculated','about') AND b_parent.date_value IS NOT NULL
    LEFT JOIN event_participants ep_child_b ON ep_child_b.person_id = r.person2_id
    LEFT JOIN events b_child ON b_child.id = ep_child_b.event_id AND b_child.event_type = 'birth'
      AND b_child.date_type IN ('exact','calculated','about') AND b_child.date_value IS NOT NULL
    LEFT JOIN event_participants ep_parent_d ON ep_parent_d.person_id = r.person1_id
    LEFT JOIN events d_parent ON d_parent.id = ep_parent_d.event_id AND d_parent.event_type = 'death'
      AND d_parent.date_type IN ('exact','calculated') AND d_parent.date_value IS NOT NULL
    WHERE r.type = 'parent_child'
      AND r.person1_id IS NOT NULL
      AND r.person2_id IS NOT NULL
      AND b_parent.date_value IS NOT NULL
      AND b_child.date_value IS NOT NULL
  `);

  const results: CheckResult[] = [];

  for (const r of rows) {
    const gap = r.child_birth_year - r.parent_birth_year;

    if (r.parent_birth_year >= r.child_birth_year) {
      results.push({
        code: 'PARENT_BORN_AFTER_CHILD',
        severity: 'error',
        message: `Föräldern (född ${r.parent_birth_year}) är inte äldre än barnet (född ${r.child_birth_year})`,
        messageParams: { parentBirthYear: r.parent_birth_year, childBirthYear: r.child_birth_year },
        personIds: [r.parent_id, r.child_id],
        relationshipIds: [r.rel_id],
      });
    } else if (gap < 10) {
      results.push({
        code: 'PARENT_TOO_YOUNG',
        severity: 'error',
        message: `Föräldern var under 10 år gammal vid barnets födelse (förälder: ${r.parent_birth_year}, barn: ${r.child_birth_year})`,
        messageParams: { parentBirthYear: r.parent_birth_year, childBirthYear: r.child_birth_year },
        personIds: [r.parent_id, r.child_id],
        relationshipIds: [r.rel_id],
      });
    } else if (gap < 15) {
      results.push({
        code: 'PARENT_VERY_YOUNG',
        severity: 'warning',
        message: `Föräldern var under 15 år gammal vid barnets födelse (förälder: ${r.parent_birth_year}, barn: ${r.child_birth_year})`,
        messageParams: { parentBirthYear: r.parent_birth_year, childBirthYear: r.child_birth_year },
        personIds: [r.parent_id, r.child_id],
        relationshipIds: [r.rel_id],
      });
    } else if (gap < 18) {
      results.push({
        code: 'PARENT_YOUNG',
        severity: 'notice',
        message: `Föräldern var under 18 år gammal vid barnets födelse (förälder: ${r.parent_birth_year}, barn: ${r.child_birth_year})`,
        messageParams: { parentBirthYear: r.parent_birth_year, childBirthYear: r.child_birth_year },
        personIds: [r.parent_id, r.child_id],
        relationshipIds: [r.rel_id],
      });
    }

    if (r.parent_sex === 'F' && r.parent_birth_year + 58 < r.child_birth_year) {
      results.push({
        code: 'MOTHER_TOO_OLD',
        severity: 'warning',
        message: `Modern (född ${r.parent_birth_year}) var över 58 år gammal vid barnets födelse (${r.child_birth_year})`,
        messageParams: { parentBirthYear: r.parent_birth_year, childBirthYear: r.child_birth_year },
        personIds: [r.parent_id, r.child_id],
        relationshipIds: [r.rel_id],
      });
    }

    if (r.parent_sex === 'M' && r.parent_birth_year + 90 < r.child_birth_year) {
      results.push({
        code: 'FATHER_TOO_OLD',
        severity: 'warning',
        message: `Fadern (född ${r.parent_birth_year}) var över 90 år gammal vid barnets födelse (${r.child_birth_year})`,
        messageParams: { parentBirthYear: r.parent_birth_year, childBirthYear: r.child_birth_year },
        personIds: [r.parent_id, r.child_id],
        relationshipIds: [r.rel_id],
      });
    }

    if (r.parent_sex === 'F' && r.parent_death_year !== null && r.child_birth_year > r.parent_death_year + 1) {
      results.push({
        code: 'CHILD_BORN_AFTER_PARENT_DEATH',
        severity: 'warning',
        message: `Barnet (född ${r.child_birth_year}) är fött mer än ett år efter moderns död (${r.parent_death_year})`,
        messageParams: { childBirthYear: r.child_birth_year, parentDeathYear: r.parent_death_year },
        personIds: [r.parent_id, r.child_id],
        relationshipIds: [r.rel_id],
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// C. Sibling & Family Structure
// ---------------------------------------------------------------------------

function checkSiblingAgeLarge(db: Database): CheckResult[] {
  // Single query: all parent-child pairs with child birth years
  const rows = queryAll<{ parent_id: string; person_id: string; birth_year: number; rel_id: string }>(db, `
    SELECT r.person1_id AS parent_id, r.person2_id AS person_id,
           CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) AS birth_year,
           r.id AS rel_id
    FROM relationships r
    JOIN event_participants ep ON ep.person_id = r.person2_id
    JOIN events b ON b.id = ep.event_id AND b.event_type = 'birth'
      AND b.date_type IN ('exact','calculated','about') AND b.date_value IS NOT NULL
    WHERE r.type = 'parent_child' AND r.person1_id IS NOT NULL AND r.person2_id IS NOT NULL
  `);

  // Group by parent in JavaScript
  const byParent = new Map<string, Array<{ person_id: string; birth_year: number; rel_id: string }>>();
  for (const r of rows) {
    if (!byParent.has(r.parent_id)) byParent.set(r.parent_id, []);
    byParent.get(r.parent_id)!.push({ person_id: r.person_id, birth_year: r.birth_year, rel_id: r.rel_id });
  }

  const results: CheckResult[] = [];
  for (const [parent_id, children] of byParent) {
    if (children.length < 2) continue;
    const years = children.map(c => c.birth_year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    if (maxYear - minYear > 50) {
      results.push({
        code: 'SIBLING_AGE_GAP_LARGE',
        severity: 'notice',
        message: `Syskon har ett födelseårsintervall på ${maxYear - minYear} år (${minYear}–${maxYear})`,
        messageParams: { span: maxYear - minYear, minYear, maxYear },
        personIds: [parent_id, ...children.map(c => c.person_id)],
        relationshipIds: children.map(c => c.rel_id),
      });
    }
  }
  return results;
}

function checkDuplicateParentChild(db: Database): CheckResult[] {
  const rows = queryAll<{ rel_id: string; person1_id: string; person2_id: string }>(db, `
    SELECT id AS rel_id, person1_id, person2_id
    FROM relationships
    WHERE type = 'parent_child'
      AND person1_id IS NOT NULL
      AND person2_id IS NOT NULL
      AND person1_id = person2_id
  `);

  return rows.map(r => ({
    code: 'DUPLICATE_PARENT_CHILD',
    severity: 'error' as CheckSeverity,
    message: `Person är registrerad som sitt eget barn i ett förälder–barn-förhållande`,
    messageParams: {},
    personIds: [r.person1_id],
    relationshipIds: [r.rel_id],
  }));
}

function checkMultipleBiologicalParents(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; cnt: number }>(db, `
    SELECT person2_id AS person_id, COUNT(*) AS cnt
    FROM relationships
    WHERE type = 'parent_child'
      AND subtype = 'biological'
      AND person2_id IS NOT NULL
    GROUP BY person2_id
    HAVING COUNT(*) > 2
  `);

  return rows.map(r => ({
    code: 'MULTIPLE_BIRTH_PARENTS',
    severity: 'warning' as CheckSeverity,
    message: `Person har ${r.cnt} biologiska föräldrar registrerade (max 2 förväntas)`,
    messageParams: { count: r.cnt },
    personIds: [r.person_id],
  }));
}

function checkNoParents(db: Database): CheckResult[] {
  const hasParents = new Set(
    queryAll<{ person2_id: string }>(db, `
      SELECT DISTINCT person2_id FROM relationships
      WHERE type = 'parent_child' AND person2_id IS NOT NULL
    `).map(r => r.person2_id)
  );
  const allPersonIds = queryAll<{ id: string }>(db, `SELECT id FROM persons`);
  return allPersonIds
    .filter(r => !hasParents.has(r.id))
    .map(r => ({
      code: 'NO_PARENTS',
      severity: 'notice' as CheckSeverity,
      message: `Person har inga registrerade föräldrar`,
      messageParams: {},
      personIds: [r.id],
    }));
}

// ---------------------------------------------------------------------------
// D. Relationship Integrity
// ---------------------------------------------------------------------------

function checkCircularAncestry(db: Database): CheckResult[] {
  // Load all parent_child links once
  const links = queryAll<{ child_id: string; parent_id: string }>(db, `
    SELECT person2_id AS child_id, person1_id AS parent_id
    FROM relationships
    WHERE type = 'parent_child'
      AND person1_id IS NOT NULL
      AND person2_id IS NOT NULL
  `);
  if (links.length === 0) return [];

  // Build child→parents and parent→children maps; collect all nodes
  const parentMap = new Map<string, string[]>();
  const childrenMap = new Map<string, string[]>();
  const allNodes = new Set<string>();
  for (const { child_id, parent_id } of links) {
    if (!parentMap.has(child_id)) parentMap.set(child_id, []);
    parentMap.get(child_id)!.push(parent_id);
    if (!childrenMap.has(parent_id)) childrenMap.set(parent_id, []);
    childrenMap.get(parent_id)!.push(child_id);
    allNodes.add(child_id);
    allNodes.add(parent_id);
  }

  // Kahn's topological sort — O(V+E).
  // In-degree = number of parents for each node.
  // Nodes that cannot be processed (in-degree never reaches 0) are in cycles.
  const inDegree = new Map<string, number>();
  for (const node of allNodes) {
    inDegree.set(node, parentMap.get(node)?.length ?? 0);
  }

  const queue: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  const processed = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    processed.add(node);
    for (const child of (childrenMap.get(node) ?? [])) {
      const newDeg = inDegree.get(child)! - 1;
      inDegree.set(child, newDeg);
      if (newDeg === 0) queue.push(child);
    }
  }

  // Any node not processed is part of a cycle
  return Array.from(allNodes)
    .filter(id => !processed.has(id))
    .map(id => ({
      code: 'CIRCULAR_ANCESTRY',
      severity: 'error' as CheckSeverity,
      message: `Person förekommer som sin egen förfader (cyklisk härstamning)`,
      messageParams: {},
      personIds: [id],
    }));
}

function checkDuplicateRelationship(db: Database): CheckResult[] {
  // Load all relationships once, deduplicate in JS to avoid O(n²) self-join
  const rows = queryAll<{ rel_id: string; type: string; person1_id: string; person2_id: string }>(db, `
    SELECT id AS rel_id, type, person1_id, person2_id
    FROM relationships
    WHERE person1_id IS NOT NULL AND person2_id IS NOT NULL
  `);

  const seen = new Map<string, { rel_id: string; person1_id: string; person2_id: string }>();
  const results: CheckResult[] = [];
  for (const r of rows) {
    const key = r.type + ':' + [r.person1_id, r.person2_id].sort().join(':');
    const first = seen.get(key);
    if (first) {
      results.push({
        code: 'DUPLICATE_RELATIONSHIP',
        severity: 'warning' as CheckSeverity,
        message: `Duplicerat förhållande av typ '${r.type}' mellan samma två personer`,
        messageParams: { type: r.type },
        personIds: [r.person1_id, r.person2_id],
        relationshipIds: [first.rel_id, r.rel_id],
      });
    } else {
      seen.set(key, r);
    }
  }
  return results;
}

function checkMarriageAge(db: Database): CheckResult[] {
  const marriages = loadPersonEvents(db, 'marriage', ['exact', 'calculated']);
  const births = loadPersonEvents(db, 'birth', ['exact', 'calculated', 'about']);

  const results: CheckResult[] = [];
  for (const [personId, personMarriages] of marriages) {
    const personBirths = births.get(personId);
    if (!personBirths) continue;
    for (const m of personMarriages) {
      const marriageYear = parseInt(m.date_value.substring(0, 4), 10);
      if (isNaN(marriageYear)) continue;
      for (const b of personBirths) {
        const birthYear = parseInt(b.date_value.substring(0, 4), 10);
        if (isNaN(birthYear)) continue;
        const age = marriageYear - birthYear;
        if (age < 12) {
          results.push({
            code: 'MARRIED_BEFORE_12',
            severity: 'error',
            message: `Person gifte sig vid ${age} år (${marriageYear}), under 12 år`,
            messageParams: { age, year: marriageYear },
            personIds: [personId],
            eventIds: [m.event_id],
          });
        } else if (age < 16) {
          results.push({
            code: 'MARRIED_BEFORE_16',
            severity: 'warning',
            message: `Person gifte sig vid ${age} år (${marriageYear}), under 16 år`,
            messageParams: { age, year: marriageYear },
            personIds: [personId],
            eventIds: [m.event_id],
          });
        }
      }
    }
  }
  return results;
}

function checkMarriageAfterDeath(db: Database): CheckResult[] {
  const marriages = loadPersonEvents(db, 'marriage', ['exact', 'calculated']);
  const deaths = loadPersonEvents(db, 'death', ['exact', 'calculated']);

  const results: CheckResult[] = [];
  for (const [personId, personMarriages] of marriages) {
    const personDeaths = deaths.get(personId);
    if (!personDeaths) continue;
    for (const m of personMarriages) {
      for (const d of personDeaths) {
        const mYear = m.date_value.substring(0, 4);
        const dYear = d.date_value.substring(0, 4);
        const after = mYear > dYear ||
          (mYear === dYear && m.date_value.length >= 10 && d.date_value.length >= 10 && m.date_value > d.date_value);
        if (after) {
          results.push({
            code: 'MARRIAGE_AFTER_DEATH',
            severity: 'error',
            message: `Giftermål (${m.date_value}) sker efter personens dödsdatum (${d.date_value})`,
            messageParams: { marriageDate: m.date_value, deathDate: d.date_value },
            personIds: [personId],
            eventIds: [m.event_id, d.event_id],
          });
        }
      }
    }
  }
  return results;
}

function checkMarriageBeforeBirth(db: Database): CheckResult[] {
  const marriages = loadPersonEvents(db, 'marriage', ['exact', 'calculated']);
  const births = loadPersonEvents(db, 'birth', ['exact', 'calculated']);

  const results: CheckResult[] = [];
  for (const [personId, personMarriages] of marriages) {
    const personBirths = births.get(personId);
    if (!personBirths) continue;
    for (const m of personMarriages) {
      for (const b of personBirths) {
        const mYear = m.date_value.substring(0, 4);
        const bYear = b.date_value.substring(0, 4);
        const before = mYear < bYear ||
          (mYear === bYear && m.date_value.length >= 10 && b.date_value.length >= 10 && m.date_value < b.date_value);
        if (before) {
          results.push({
            code: 'MARRIAGE_BEFORE_BIRTH',
            severity: 'error',
            message: `Giftermål (${m.date_value}) sker före personens födelsedag (${b.date_value})`,
            messageParams: { marriageDate: m.date_value, birthDate: b.date_value },
            personIds: [personId],
            eventIds: [m.event_id, b.event_id],
          });
        }
      }
    }
  }
  return results;
}

function checkCoupleWithSelf(db: Database): CheckResult[] {
  const rows = queryAll<{ rel_id: string; person1_id: string }>(db, `
    SELECT id AS rel_id, person1_id
    FROM relationships
    WHERE type = 'couple'
      AND person1_id IS NOT NULL
      AND person2_id IS NOT NULL
      AND person1_id = person2_id
  `);

  return rows.map(r => ({
    code: 'COUPLE_WITH_SELF',
    severity: 'error' as CheckSeverity,
    message: `Person är registrerad i ett parförhållande med sig själv`,
    messageParams: {},
    personIds: [r.person1_id],
    relationshipIds: [r.rel_id],
  }));
}

// ---------------------------------------------------------------------------
// E. Geographic
// ---------------------------------------------------------------------------

function checkSimultaneousDistantLocations(db: Database): CheckResult[] {
  // Find events for same person on same exact date with place lat/lon
  const rows = queryAll<{
    person_id: string;
    event1_id: string;
    date_value: string;
    lat1: number;
    lon1: number;
    event2_id: string;
    lat2: number;
    lon2: number;
  }>(db, `
    SELECT ep1.person_id,
           e1.id AS event1_id, e1.date_value,
           p1.latitude AS lat1, p1.longitude AS lon1,
           e2.id AS event2_id,
           p2.latitude AS lat2, p2.longitude AS lon2
    FROM event_participants ep1
    JOIN events e1 ON e1.id = ep1.event_id
      AND e1.date_type = 'exact' AND e1.date_value IS NOT NULL
      AND e1.place_id IS NOT NULL
    JOIN places p1 ON p1.id = e1.place_id
      AND p1.latitude IS NOT NULL AND p1.longitude IS NOT NULL
    JOIN event_participants ep2 ON ep2.person_id = ep1.person_id AND ep2.event_id > ep1.event_id
    JOIN events e2 ON e2.id = ep2.event_id
      AND e2.date_type = 'exact' AND e2.date_value = e1.date_value
      AND e2.place_id IS NOT NULL
    JOIN places p2 ON p2.id = e2.place_id
      AND p2.latitude IS NOT NULL AND p2.longitude IS NOT NULL
  `);

  const results: CheckResult[] = [];

  for (const r of rows) {
    const km = haversineKm(r.lat1, r.lon1, r.lat2, r.lon2);
    if (km > 500) {
      results.push({
        code: 'SIMULTANEOUS_DISTANT_LOCATIONS',
        severity: 'warning',
        message: `Två händelser på samma datum (${r.date_value}) är ${Math.round(km)} km från varandra`,
        messageParams: { date: r.date_value, km: Math.round(km) },
        personIds: [r.person_id],
        eventIds: [r.event1_id, r.event2_id],
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// F. Data Completeness
// ---------------------------------------------------------------------------

function checkNoName(db: Database): CheckResult[] {
  const hasName = new Set(
    queryAll<{ person_id: string }>(db, `SELECT DISTINCT person_id FROM person_names`).map(r => r.person_id)
  );
  const allPersonIds = queryAll<{ id: string }>(db, `SELECT id FROM persons`);
  return allPersonIds
    .filter(r => !hasName.has(r.id))
    .map(r => ({
      code: 'NO_NAME',
      severity: 'notice' as CheckSeverity,
      message: `Person saknar namnuppgifter`,
      messageParams: {},
      personIds: [r.id],
    }));
}

function checkLivingWithDeathEvent(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; death_id: string }>(db, `
    SELECT p.id AS person_id, e.id AS death_id
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
    WHERE p.living = 1
  `);

  return rows.map(r => ({
    code: 'LIVING_WITH_DEATH_EVENT',
    severity: 'warning' as CheckSeverity,
    message: `Person är markerad som levande men har en registrerad dödshändelse`,
    messageParams: {},
    personIds: [r.person_id],
    eventIds: [r.death_id],
  }));
}

function checkNotLivingWithoutDeathEvent(db: Database): CheckResult[] {
  const hasDeath = personIdsWithEvent(db, 'death');
  const notLiving = queryAll<{ id: string }>(db, `SELECT id FROM persons WHERE living = 0`);
  return notLiving
    .filter(r => !hasDeath.has(r.id))
    .map(r => ({
      code: 'NOT_LIVING_WITHOUT_DEATH',
      severity: 'notice' as CheckSeverity,
      message: `Person är markerad som ej levande men saknar dödshändelse`,
      messageParams: {},
      personIds: [r.id],
    }));
}

function checkUnsourcedLifeEvent(db: Database, eventType: 'birth' | 'death'): CheckResult[] {
  const code = eventType === 'birth' ? 'UNSOURCED_BIRTH' : 'UNSOURCED_DEATH';
  const messageLabel = eventType === 'birth' ? 'Födelsehändelsen' : 'Dödshändelsen';

  const rows = queryAll<{ person_id: string; event_id: string }>(db, `
    SELECT ep.person_id, e.id AS event_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id AND e.event_type = ?
    WHERE NOT EXISTS (
      SELECT 1 FROM citations c WHERE c.event_id = e.id
    )
  `, [eventType]);

  return rows.map(r => ({
    code,
    severity: 'notice' as CheckSeverity,
    message: `${messageLabel} saknar källhänvisning`,
    messageParams: {},
    personIds: [r.person_id],
    eventIds: [r.event_id],
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function runAllCheckFunctions(db: Database): CheckResult[] {
  const results: CheckResult[] = [];
  console.log('[checks] runAllCheckFunctions starting');
  const t0 = Date.now();
  function run(name: string, fn: () => CheckResult[]): void {
    const start = Date.now();
    const res = fn();
    const ms = Date.now() - start;
    console.log(`[checks] ${name}: ${ms}ms → ${res.length} result(s)`);
    results.push(...res);
  }

  // A. Chronological — Person
  run('checkBirthAfterDeath',       () => checkBirthAfterDeath(db));
  run('checkEventAfterDeath',       () => checkEventAfterDeath(db));
  run('checkBurialBeforeDeath',     () => checkBurialBeforeDeath(db));
  run('checkLifespan',              () => checkLifespan(db));
  run('checkFutureDates',           () => checkFutureDates(db));
  run('checkBaptismLate',           () => checkBaptismLate(db));
  run('checkDeathWithoutBirth',     () => checkDeathWithoutBirth(db));
  run('checkNoBirthEvent',          () => checkNoBirthEvent(db));

  // B. Parenthood Age
  run('checkParenthoodAge',         () => checkParenthoodAge(db));

  // C. Sibling & Family Structure
  run('checkSiblingAgeLarge',       () => checkSiblingAgeLarge(db));
  run('checkDuplicateParentChild',  () => checkDuplicateParentChild(db));
  run('checkMultipleBiologicalParents', () => checkMultipleBiologicalParents(db));
  run('checkNoParents',             () => checkNoParents(db));

  // D. Relationship Integrity
  run('checkCircularAncestry',      () => checkCircularAncestry(db));
  run('checkDuplicateRelationship', () => checkDuplicateRelationship(db));
  run('checkMarriageAge',           () => checkMarriageAge(db));
  run('checkMarriageAfterDeath',    () => checkMarriageAfterDeath(db));
  run('checkMarriageBeforeBirth',   () => checkMarriageBeforeBirth(db));
  run('checkCoupleWithSelf',        () => checkCoupleWithSelf(db));

  // E. Geographic
  run('checkSimultaneousDistantLocations', () => checkSimultaneousDistantLocations(db));

  // F. Data Completeness
  run('checkNoName',                () => checkNoName(db));
  run('checkLivingWithDeathEvent',  () => checkLivingWithDeathEvent(db));
  run('checkNotLivingWithoutDeathEvent', () => checkNotLivingWithoutDeathEvent(db));
  run('checkUnsourcedLifeEvent(birth)', () => checkUnsourcedLifeEvent(db, 'birth'));
  run('checkUnsourcedLifeEvent(death)', () => checkUnsourcedLifeEvent(db, 'death'));

  console.log(`[checks] total: ${Date.now() - t0}ms`);
  return results;
}

export function runAllChecks(db: Database): CheckResult[] {
  return runAllCheckFunctions(db);
}

export function runChecksForPerson(db: Database, personId: string): CheckResult[] {
  return runAllCheckFunctions(db).filter(r => r.personIds.includes(personId));
}

import type { Database } from 'node-sqlite3-wasm';

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
  const rows = db.prepare(`
    SELECT p.id AS person_id,
           b.id AS birth_id, b.date_value AS birth_date,
           d.id AS death_id, d.date_value AS death_date
    FROM persons p
    JOIN event_participants epb ON epb.person_id = p.id
    JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
      AND b.date_type IN ('exact','calculated') AND b.date_value IS NOT NULL
    JOIN event_participants epd ON epd.person_id = p.id
    JOIN events d ON d.id = epd.event_id AND d.event_type = 'death'
      AND d.date_type IN ('exact','calculated') AND d.date_value IS NOT NULL
    WHERE b.date_value > d.date_value
  `).all([]) as Array<{ person_id: string; birth_id: string; birth_date: string; death_id: string; death_date: string }>;

  return rows.map(r => ({
    code: 'BIRTH_AFTER_DEATH',
    severity: 'error' as CheckSeverity,
    message: `Födelsedag (${r.birth_date}) är efter dödsdatum (${r.death_date})`,
    messageParams: { birthDate: r.birth_date, deathDate: r.death_date },
    personIds: [r.person_id],
    eventIds: [r.birth_id, r.death_id],
  }));
}

function checkEventAfterDeath(db: Database): CheckResult[] {
  const rows = db.prepare(`
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
      AND e.date_value > d.date_value
  `).all([]) as Array<{ person_id: string; event_id: string; event_type: string; event_date: string; death_id: string; death_date: string }>;

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
  const rows = db.prepare(`
    SELECT p.id AS person_id,
           b.id AS burial_id, b.date_value AS burial_date,
           d.id AS death_id, d.date_value AS death_date
    FROM persons p
    JOIN event_participants epb ON epb.person_id = p.id
    JOIN events b ON b.id = epb.event_id AND b.event_type = 'burial'
      AND b.date_type IN ('exact','calculated') AND b.date_value IS NOT NULL
    JOIN event_participants epd ON epd.person_id = p.id
    JOIN events d ON d.id = epd.event_id AND d.event_type = 'death'
      AND d.date_type IN ('exact','calculated') AND d.date_value IS NOT NULL
    WHERE b.date_value < d.date_value
  `).all([]) as Array<{ person_id: string; burial_id: string; burial_date: string; death_id: string; death_date: string }>;

  return rows.map(r => ({
    code: 'BURIAL_BEFORE_DEATH',
    severity: 'error' as CheckSeverity,
    message: `Begravning (${r.burial_date}) sker före dödsdatum (${r.death_date})`,
    messageParams: { burialDate: r.burial_date, deathDate: r.death_date },
    personIds: [r.person_id],
    eventIds: [r.burial_id, r.death_id],
  }));
}

function checkLifespan(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT p.id AS person_id,
           CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) AS birth_year,
           CAST(SUBSTR(d.date_value, 1, 4) AS INTEGER) AS death_year,
           b.id AS birth_id, d.id AS death_id
    FROM persons p
    JOIN event_participants epb ON epb.person_id = p.id
    JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
      AND b.date_type IN ('exact','calculated') AND b.date_value IS NOT NULL
    JOIN event_participants epd ON epd.person_id = p.id
    JOIN events d ON d.id = epd.event_id AND d.event_type = 'death'
      AND d.date_type IN ('exact','calculated') AND d.date_value IS NOT NULL
    WHERE (CAST(SUBSTR(d.date_value, 1, 4) AS INTEGER) - CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER)) > 105
  `).all([]) as Array<{ person_id: string; birth_year: number; death_year: number; birth_id: string; death_id: string }>;

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

  const births = db.prepare(`
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value > ?
  `).all([TODAY]) as Array<{ person_id: string; event_id: string; date_value: string }>;

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

  const deaths = db.prepare(`
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value > ?
  `).all([TODAY]) as Array<{ person_id: string; event_id: string; date_value: string }>;

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
  const rows = db.prepare(`
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
  `).all([]) as Array<{ person_id: string; baptism_id: string; bap_year: number; birth_id: string; birth_year: number }>;

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
  const rows = db.prepare(`
    SELECT p.id AS person_id, e.id AS death_id
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
    WHERE NOT EXISTS (
      SELECT 1 FROM event_participants ep2
      JOIN events e2 ON e2.id = ep2.event_id AND e2.event_type = 'birth'
      WHERE ep2.person_id = p.id
    )
  `).all([]) as Array<{ person_id: string; death_id: string }>;

  return rows.map(r => ({
    code: 'DEATH_WITHOUT_BIRTH',
    severity: 'notice' as CheckSeverity,
    message: `Person har dödshändelse men saknar födelsehändelse`,
    messageParams: {},
    personIds: [r.person_id],
    eventIds: [r.death_id],
  }));
}

function checkNoBirthEvent(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT p.id AS person_id
    FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM event_participants ep
      JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
      WHERE ep.person_id = p.id
    )
  `).all([]) as Array<{ person_id: string }>;

  return rows.map(r => ({
    code: 'NO_BIRTH_EVENT',
    severity: 'notice' as CheckSeverity,
    message: `Person saknar födelsehändelse`,
    messageParams: {},
    personIds: [r.person_id],
  }));
}

// ---------------------------------------------------------------------------
// B. Parenthood Age
// ---------------------------------------------------------------------------

function checkParenthoodAge(db: Database): CheckResult[] {
  // In parent_child relationships: person1_id = parent, person2_id = child
  const rows = db.prepare(`
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
  `).all([]) as Array<{
    rel_id: string;
    parent_id: string;
    child_id: string;
    parent_sex: string;
    parent_birth_year: number;
    child_birth_year: number;
    parent_death_year: number | null;
  }>;

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
  // Group children by parent and check birth year gaps
  const results: CheckResult[] = [];

  // Group children by parent
  const parents = db.prepare(`
    SELECT DISTINCT person1_id AS parent_id FROM relationships
    WHERE type = 'parent_child' AND person1_id IS NOT NULL
  `).all([]) as Array<{ parent_id: string }>;

  for (const { parent_id } of parents) {
    const children = db.prepare(`
      SELECT r.person2_id AS person_id,
             CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) AS birth_year,
             r.id AS rel_id
      FROM relationships r
      JOIN event_participants ep ON ep.person_id = r.person2_id
      JOIN events b ON b.id = ep.event_id AND b.event_type = 'birth'
        AND b.date_type IN ('exact','calculated','about') AND b.date_value IS NOT NULL
      WHERE r.type = 'parent_child' AND r.person1_id = ? AND r.person2_id IS NOT NULL
    `).all([parent_id]) as Array<{ person_id: string; birth_year: number; rel_id: string }>;

    if (children.length < 2) continue;

    const years = children.map(c => c.birth_year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    if (maxYear - minYear > 50) {
      const personIds = [parent_id, ...children.map(c => c.person_id)];
      results.push({
        code: 'SIBLING_AGE_GAP_LARGE',
        severity: 'notice',
        message: `Syskon har ett födelseårsintervall på ${maxYear - minYear} år (${minYear}–${maxYear})`,
        messageParams: { span: maxYear - minYear, minYear, maxYear },
        personIds,
        relationshipIds: children.map(c => c.rel_id),
      });
    }
  }

  return results;
}

function checkDuplicateParentChild(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT id AS rel_id, person1_id, person2_id
    FROM relationships
    WHERE type = 'parent_child'
      AND person1_id IS NOT NULL
      AND person2_id IS NOT NULL
      AND person1_id = person2_id
  `).all([]) as Array<{ rel_id: string; person1_id: string; person2_id: string }>;

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
  const rows = db.prepare(`
    SELECT person2_id AS person_id, COUNT(*) AS cnt
    FROM relationships
    WHERE type = 'parent_child'
      AND subtype = 'biological'
      AND person2_id IS NOT NULL
    GROUP BY person2_id
    HAVING COUNT(*) > 2
  `).all([]) as Array<{ person_id: string; cnt: number }>;

  return rows.map(r => ({
    code: 'MULTIPLE_BIRTH_PARENTS',
    severity: 'warning' as CheckSeverity,
    message: `Person har ${r.cnt} biologiska föräldrar registrerade (max 2 förväntas)`,
    messageParams: { count: r.cnt },
    personIds: [r.person_id],
  }));
}

function checkNoParents(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT p.id AS person_id
    FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM relationships r
      WHERE r.type = 'parent_child' AND r.person2_id = p.id
    )
  `).all([]) as Array<{ person_id: string }>;

  return rows.map(r => ({
    code: 'NO_PARENTS',
    severity: 'notice' as CheckSeverity,
    message: `Person har inga registrerade föräldrar`,
    messageParams: {},
    personIds: [r.person_id],
  }));
}

// ---------------------------------------------------------------------------
// D. Relationship Integrity
// ---------------------------------------------------------------------------

function checkCircularAncestry(db: Database): CheckResult[] {
  // Load all parent_child links into memory for DFS
  const links = db.prepare(`
    SELECT person2_id AS child_id, person1_id AS parent_id
    FROM relationships
    WHERE type = 'parent_child'
      AND person1_id IS NOT NULL
      AND person2_id IS NOT NULL
  `).all([]) as Array<{ child_id: string; parent_id: string }>;

  // Build child→parents map
  const parentMap = new Map<string, string[]>();
  for (const { child_id, parent_id } of links) {
    if (!parentMap.has(child_id)) parentMap.set(child_id, []);
    parentMap.get(child_id)!.push(parent_id);
  }

  const persons = db.prepare(`SELECT id FROM persons`).all([]) as Array<{ id: string }>;
  const results: CheckResult[] = [];
  const cyclePersons = new Set<string>();

  for (const { id } of persons) {
    // Iterative DFS upward from this person
    const visited = new Set<string>();
    const stack = [id];
    let foundCycle = false;

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) {
        if (current === id) {
          foundCycle = true;
          break;
        }
        continue;
      }
      visited.add(current);
      const parents = parentMap.get(current) ?? [];
      for (const p of parents) {
        if (p === id) {
          foundCycle = true;
          break;
        }
        stack.push(p);
      }
      if (foundCycle) break;
    }

    if (foundCycle && !cyclePersons.has(id)) {
      cyclePersons.add(id);
      results.push({
        code: 'CIRCULAR_ANCESTRY',
        severity: 'error',
        message: `Person förekommer som sin egen förfader (cyklisk härstamning)`,
        messageParams: {},
        personIds: [id],
      });
    }
  }

  return results;
}

function checkDuplicateRelationship(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT r1.id AS rel1_id, r2.id AS rel2_id,
           r1.type, r1.person1_id, r1.person2_id
    FROM relationships r1
    JOIN relationships r2 ON r1.id < r2.id
      AND r1.type = r2.type
      AND (
        (r1.person1_id = r2.person1_id AND r1.person2_id = r2.person2_id)
        OR (r1.person1_id = r2.person2_id AND r1.person2_id = r2.person1_id)
      )
    WHERE r1.person1_id IS NOT NULL AND r1.person2_id IS NOT NULL
  `).all([]) as Array<{ rel1_id: string; rel2_id: string; type: string; person1_id: string; person2_id: string }>;

  return rows.map(r => ({
    code: 'DUPLICATE_RELATIONSHIP',
    severity: 'warning' as CheckSeverity,
    message: `Duplicerat förhållande av typ '${r.type}' mellan samma två personer`,
    messageParams: { type: r.type },
    personIds: [r.person1_id, r.person2_id],
    relationshipIds: [r.rel1_id, r.rel2_id],
  }));
}

function checkMarriageAge(db: Database): CheckResult[] {
  // Find marriage events and get each participant's birth year
  const marriages = db.prepare(`
    SELECT e.id AS event_id,
           CAST(SUBSTR(e.date_value, 1, 4) AS INTEGER) AS marriage_year,
           ep.person_id
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'marriage'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
  `).all([]) as Array<{ event_id: string; marriage_year: number; person_id: string }>;

  const results: CheckResult[] = [];

  for (const m of marriages) {
    const birthRow = db.prepare(`
      SELECT CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) AS birth_year
      FROM event_participants ep
      JOIN events b ON b.id = ep.event_id AND b.event_type = 'birth'
        AND b.date_type IN ('exact','calculated','about') AND b.date_value IS NOT NULL
      WHERE ep.person_id = ?
      LIMIT 1
    `).get([m.person_id]) as { birth_year: number } | undefined;

    if (!birthRow) continue;

    const age = m.marriage_year - birthRow.birth_year;

    if (age < 12) {
      results.push({
        code: 'MARRIED_BEFORE_12',
        severity: 'error',
        message: `Person gifte sig vid ${age} år (${m.marriage_year}), under 12 år`,
        messageParams: { age, year: m.marriage_year },
        personIds: [m.person_id],
        eventIds: [m.event_id],
      });
    } else if (age < 16) {
      results.push({
        code: 'MARRIED_BEFORE_16',
        severity: 'warning',
        message: `Person gifte sig vid ${age} år (${m.marriage_year}), under 16 år`,
        messageParams: { age, year: m.marriage_year },
        personIds: [m.person_id],
        eventIds: [m.event_id],
      });
    }
  }

  return results;
}

function checkMarriageAfterDeath(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT e.id AS marriage_id, e.date_value AS marriage_date,
           ep.person_id,
           d.id AS death_id, d.date_value AS death_date
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN event_participants epd ON epd.person_id = ep.person_id
    JOIN events d ON d.id = epd.event_id AND d.event_type = 'death'
      AND d.date_type IN ('exact','calculated') AND d.date_value IS NOT NULL
    WHERE e.event_type = 'marriage'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value > d.date_value
  `).all([]) as Array<{ marriage_id: string; marriage_date: string; person_id: string; death_id: string; death_date: string }>;

  return rows.map(r => ({
    code: 'MARRIAGE_AFTER_DEATH',
    severity: 'error' as CheckSeverity,
    message: `Giftermål (${r.marriage_date}) sker efter personens dödsdatum (${r.death_date})`,
    messageParams: { marriageDate: r.marriage_date, deathDate: r.death_date },
    personIds: [r.person_id],
    eventIds: [r.marriage_id, r.death_id],
  }));
}

function checkMarriageBeforeBirth(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT e.id AS marriage_id, e.date_value AS marriage_date,
           ep.person_id,
           b.id AS birth_id, b.date_value AS birth_date
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN event_participants epb ON epb.person_id = ep.person_id
    JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
      AND b.date_type IN ('exact','calculated') AND b.date_value IS NOT NULL
    WHERE e.event_type = 'marriage'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value < b.date_value
  `).all([]) as Array<{ marriage_id: string; marriage_date: string; person_id: string; birth_id: string; birth_date: string }>;

  return rows.map(r => ({
    code: 'MARRIAGE_BEFORE_BIRTH',
    severity: 'error' as CheckSeverity,
    message: `Giftermål (${r.marriage_date}) sker före personens födelsedag (${r.birth_date})`,
    messageParams: { marriageDate: r.marriage_date, birthDate: r.birth_date },
    personIds: [r.person_id],
    eventIds: [r.marriage_id, r.birth_id],
  }));
}

function checkCoupleWithSelf(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT id AS rel_id, person1_id
    FROM relationships
    WHERE type = 'couple'
      AND person1_id IS NOT NULL
      AND person2_id IS NOT NULL
      AND person1_id = person2_id
  `).all([]) as Array<{ rel_id: string; person1_id: string }>;

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
  const rows = db.prepare(`
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
  `).all([]) as Array<{
    person_id: string;
    event1_id: string;
    date_value: string;
    lat1: number;
    lon1: number;
    event2_id: string;
    lat2: number;
    lon2: number;
  }>;

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
  const rows = db.prepare(`
    SELECT p.id AS person_id
    FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM person_names pn WHERE pn.person_id = p.id
    )
  `).all([]) as Array<{ person_id: string }>;

  return rows.map(r => ({
    code: 'NO_NAME',
    severity: 'notice' as CheckSeverity,
    message: `Person saknar namnuppgifter`,
    messageParams: {},
    personIds: [r.person_id],
  }));
}

function checkLivingWithDeathEvent(db: Database): CheckResult[] {
  const rows = db.prepare(`
    SELECT p.id AS person_id, e.id AS death_id
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
    WHERE p.living = 1
  `).all([]) as Array<{ person_id: string; death_id: string }>;

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
  const rows = db.prepare(`
    SELECT p.id AS person_id
    FROM persons p
    WHERE p.living = 0
      AND NOT EXISTS (
        SELECT 1 FROM event_participants ep
        JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
        WHERE ep.person_id = p.id
      )
  `).all([]) as Array<{ person_id: string }>;

  return rows.map(r => ({
    code: 'NOT_LIVING_WITHOUT_DEATH',
    severity: 'notice' as CheckSeverity,
    message: `Person är markerad som ej levande men saknar dödshändelse`,
    messageParams: {},
    personIds: [r.person_id],
  }));
}

function checkUnsourcedLifeEvent(db: Database, eventType: 'birth' | 'death'): CheckResult[] {
  const code = eventType === 'birth' ? 'UNSOURCED_BIRTH' : 'UNSOURCED_DEATH';
  const messageLabel = eventType === 'birth' ? 'Födelsehändelsen' : 'Dödshändelsen';

  const rows = db.prepare(`
    SELECT ep.person_id, e.id AS event_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id AND e.event_type = ?
    WHERE NOT EXISTS (
      SELECT 1 FROM citations c WHERE c.event_id = e.id
    )
  `).all([eventType]) as Array<{ person_id: string; event_id: string }>;

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

  // A. Chronological — Person
  results.push(...checkBirthAfterDeath(db));
  results.push(...checkEventAfterDeath(db));
  results.push(...checkBurialBeforeDeath(db));
  results.push(...checkLifespan(db));
  results.push(...checkFutureDates(db));
  results.push(...checkBaptismLate(db));
  results.push(...checkDeathWithoutBirth(db));
  results.push(...checkNoBirthEvent(db));

  // B. Parenthood Age
  results.push(...checkParenthoodAge(db));

  // C. Sibling & Family Structure
  results.push(...checkSiblingAgeLarge(db));
  results.push(...checkDuplicateParentChild(db));
  results.push(...checkMultipleBiologicalParents(db));
  results.push(...checkNoParents(db));

  // D. Relationship Integrity
  results.push(...checkCircularAncestry(db));
  results.push(...checkDuplicateRelationship(db));
  results.push(...checkMarriageAge(db));
  results.push(...checkMarriageAfterDeath(db));
  results.push(...checkMarriageBeforeBirth(db));
  results.push(...checkCoupleWithSelf(db));

  // E. Geographic
  results.push(...checkSimultaneousDistantLocations(db));

  // F. Data Completeness
  results.push(...checkNoName(db));
  results.push(...checkLivingWithDeathEvent(db));
  results.push(...checkNotLivingWithoutDeathEvent(db));
  results.push(...checkUnsourcedLifeEvent(db, 'birth'));
  results.push(...checkUnsourcedLifeEvent(db, 'death'));

  return results;
}

export function runAllChecks(db: Database): CheckResult[] {
  return runAllCheckFunctions(db);
}

export function runChecksForPerson(db: Database, personId: string): CheckResult[] {
  return runAllCheckFunctions(db).filter(r => r.personIds.includes(personId));
}

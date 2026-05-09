import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { loadPersonEvents, extractYear } from './check-utils';

export function checkParenthoodAge(db: Database): CheckResult[] {
  // In parent_child relationships: person1_id = parent, person2_id = child.
  // Years are extracted in JS via extractYear() so we don't depend on
  // SUBSTR(date_value, 1, 4) returning a numeric prefix — that assumed ISO
  // and silently parsed the day-of-month as the year on free-form strings
  // like "26 Jan 1763". See parseLooseDate in check-utils.ts.
  const rows = queryAll<{
    rel_id: string;
    parent_id: string;
    child_id: string;
    parent_sex: string;
    parent_birth_value: string | null;
    child_birth_value: string | null;
    parent_death_value: string | null;
  }>(db, `
    SELECT
      r.id AS rel_id,
      r.person1_id AS parent_id,
      r.person2_id AS child_id,
      p_parent.sex AS parent_sex,
      b_parent.date_value AS parent_birth_value,
      b_child.date_value AS child_birth_value,
      d_parent.date_value AS parent_death_value
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
  `).map(row => ({
    ...row,
    parent_birth_year: extractYear(row.parent_birth_value),
    child_birth_year: extractYear(row.child_birth_value),
    parent_death_year: extractYear(row.parent_death_value),
  })).filter(row =>
    row.parent_birth_year !== null && row.child_birth_year !== null,
  ) as Array<{
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

export function checkSiblingAgeLarge(db: Database): CheckResult[] {
  // Single query: all parent-child pairs with child birth years
  const rawRows = queryAll<{ parent_id: string; person_id: string; birth_value: string; rel_id: string }>(db, `
    SELECT r.person1_id AS parent_id, r.person2_id AS person_id,
           b.date_value AS birth_value,
           r.id AS rel_id
    FROM relationships r
    JOIN event_participants ep ON ep.person_id = r.person2_id
    JOIN events b ON b.id = ep.event_id AND b.event_type = 'birth'
      AND b.date_type IN ('exact','calculated','about') AND b.date_value IS NOT NULL
    WHERE r.type = 'parent_child' AND r.person1_id IS NOT NULL AND r.person2_id IS NOT NULL
  `);
  const rows = rawRows
    .map(r => ({ ...r, birth_year: extractYear(r.birth_value) }))
    .filter((r): r is typeof r & { birth_year: number } => r.birth_year !== null);

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

export function checkDuplicateParentChild(db: Database): CheckResult[] {
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

export function checkMultipleBiologicalParents(db: Database): CheckResult[] {
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

export function checkNoParents(db: Database): CheckResult[] {
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

export function checkCircularAncestry(db: Database): CheckResult[] {
  // Load all parent_child links once
  const links = queryAll<{ child_id: string; parent_id: string }>(db, `
    SELECT person2_id AS child_id, person1_id AS parent_id
    FROM relationships
    WHERE type = 'parent_child'
      AND person1_id IS NOT NULL
      AND person2_id IS NOT NULL
  `);
  if (links.length === 0) return [];

  // Build child→parents map; collect all nodes
  const parentMap = new Map<string, string[]>();
  const allNodes = new Set<string>();
  for (const { child_id, parent_id } of links) {
    if (!parentMap.has(child_id)) parentMap.set(child_id, []);
    parentMap.get(child_id)!.push(parent_id);
    allNodes.add(child_id);
    allNodes.add(parent_id);
  }

  // Iterative DFS with WHITE/GRAY/BLACK coloring.
  // GRAY = currently on the DFS path. A back edge to a GRAY node means a cycle.
  // Only nodes that form back edges are marked — descendants of cycles are NOT flagged.
  // (Kahn's topo sort also marks descendants of cycles as unprocessed, causing false positives.)
  const UNVISITED = 0, ON_PATH = 1, DONE = 2;
  const state = new Map<string, number>();
  for (const node of allNodes) state.set(node, UNVISITED);

  const cycleNodes = new Set<string>();

  for (const start of allNodes) {
    if (state.get(start) !== UNVISITED) continue;

    const path: string[] = [];
    const pathIdx = new Map<string, number>(); // node → index in path, for O(1) cycle range lookup
    const stack: Array<{ node: string; parentsIdx: number }> = [{ node: start, parentsIdx: 0 }];
    state.set(start, ON_PATH);
    path.push(start);
    pathIdx.set(start, 0);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const parents = parentMap.get(frame.node) ?? [];

      if (frame.parentsIdx < parents.length) {
        const parent = parents[frame.parentsIdx++];
        const parentState = state.get(parent) ?? UNVISITED;

        if (parentState === ON_PATH) {
          // Back edge → cycle. Mark all nodes from cycle entry point to current node.
          const ci = pathIdx.get(parent)!;
          for (let i = ci; i < path.length; i++) cycleNodes.add(path[i]);
        } else if (parentState === UNVISITED) {
          state.set(parent, ON_PATH);
          path.push(parent);
          pathIdx.set(parent, path.length - 1);
          stack.push({ node: parent, parentsIdx: 0 });
        }
        // DONE → already fully processed, no cycle through here
      } else {
        state.set(frame.node, DONE);
        pathIdx.delete(frame.node);
        path.pop();
        stack.pop();
      }
    }
  }

  return Array.from(cycleNodes).map(id => ({
    code: 'CIRCULAR_ANCESTRY',
    severity: 'error' as CheckSeverity,
    message: `Person förekommer som sin egen förfader (cyklisk härstamning)`,
    messageParams: {},
    personIds: [id],
  }));
}

export function checkDuplicateRelationship(db: Database): CheckResult[] {
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

export function checkMarriageAge(db: Database): CheckResult[] {
  const marriages = loadPersonEvents(db, 'marriage', ['exact', 'calculated']);
  const births = loadPersonEvents(db, 'birth', ['exact', 'calculated', 'about']);

  const results: CheckResult[] = [];
  for (const [personId, personMarriages] of marriages) {
    const personBirths = births.get(personId);
    if (!personBirths) continue;
    for (const m of personMarriages) {
      const marriageYear = extractYear(m.date_value);
      if (marriageYear === null) continue;
      for (const b of personBirths) {
        const birthYear = extractYear(b.date_value);
        if (birthYear === null) continue;
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

export function checkMarriageAfterDeath(db: Database): CheckResult[] {
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

export function checkMarriageBeforeBirth(db: Database): CheckResult[] {
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

export function checkCoupleWithSelf(db: Database): CheckResult[] {
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

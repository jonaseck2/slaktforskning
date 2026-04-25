import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runSql } from './db';

export interface DuplicateCandidate {
  person1_id: string;
  person2_id: string;
  person1_name: string;
  person2_name: string;
  person1_birth: string | null;
  person2_birth: string | null;
  score: number; // 0-100 similarity score
  reasons: string[];
}

/**
 * Find potential duplicate persons by comparing names and birth dates.
 * Uses a two-pass approach for performance:
 * 1. Group persons by normalized surname (cheap)
 * 2. Within each group, compare given names and birth dates
 */
export function findDuplicates(db: Database, limit = 100): DuplicateCandidate[] {
  // Load persons, primary names, and birth dates in bulk — the old correlated
  // subquery version was O(N²) on large DBs. Join in JS with Maps.
  const personRows = queryAll<{ id: string; sex: string }>(db, 'SELECT id, sex FROM persons');

  const nameRows = queryAll<{
    person_id: string;
    given_name: string | null;
    surname: string | null;
    sort_order: number;
  }>(db, 'SELECT person_id, given_name, surname, sort_order FROM person_names');
  const primaryName = new Map<string, { given_name: string; surname: string; sort_order: number }>();
  for (const r of nameRows) {
    const existing = primaryName.get(r.person_id);
    if (!existing || r.sort_order < existing.sort_order) {
      primaryName.set(r.person_id, {
        given_name: r.given_name ?? '',
        surname: r.surname ?? '',
        sort_order: r.sort_order,
      });
    }
  }

  const birthRows = queryAll<{ person_id: string; date_value: string }>(db, `
    SELECT ep.person_id, e.date_value
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id
    WHERE e.event_type = 'birth' AND e.date_value IS NOT NULL
  `);
  const birthDate = new Map<string, string>();
  for (const r of birthRows) {
    if (!birthDate.has(r.person_id)) birthDate.set(r.person_id, r.date_value);
  }

  const persons = personRows.map(p => {
    const n = primaryName.get(p.id);
    return {
      id: p.id,
      sex: p.sex,
      given_name: n?.given_name ?? '',
      surname: n?.surname ?? '',
      birth_date: birthDate.get(p.id) ?? null,
    };
  });

  // Group by normalized surname
  const byNormalizedSurname = new Map<string, typeof persons>();
  for (const p of persons) {
    const key = normalizeName(p.surname);
    if (!key) continue;
    if (!byNormalizedSurname.has(key)) byNormalizedSurname.set(key, []);
    byNormalizedSurname.get(key)!.push(p);
  }

  const candidates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  for (const group of byNormalizedSurname.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const pairKey = [a.id, b.id].sort().join(':');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const { score, reasons } = calculateSimilarity(a, b);
        if (score >= 50) {
          candidates.push({
            person1_id: a.id,
            person2_id: b.id,
            person1_name: `${a.given_name} ${a.surname}`.trim(),
            person2_name: `${b.given_name} ${b.surname}`.trim(),
            person1_birth: a.birth_date,
            person2_birth: b.birth_date,
            score,
            reasons,
          });
        }
      }
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-zåäö]/g, '').trim();
}

function calculateSimilarity(
  a: { given_name: string; surname: string; birth_date: string | null; sex: string },
  b: { given_name: string; surname: string; birth_date: string | null; sex: string }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Surname match (already grouped by surname, so this is guaranteed)
  const surnameA = normalizeName(a.surname);
  const surnameB = normalizeName(b.surname);
  if (surnameA === surnameB) {
    score += 30;
    reasons.push('same_surname');
  }

  // Given name match
  const givenA = normalizeName(a.given_name);
  const givenB = normalizeName(b.given_name);
  if (givenA && givenB) {
    if (givenA === givenB) {
      score += 40;
      reasons.push('same_given_name');
    } else if (givenA.startsWith(givenB) || givenB.startsWith(givenA)) {
      // One is a prefix of the other (e.g. "Erik" vs "Erik Johan")
      score += 25;
      reasons.push('given_name_prefix');
    } else {
      // Given names are completely different — strong negative signal
      score -= 20;
    }
  }

  // Birth date match
  if (a.birth_date && b.birth_date) {
    if (a.birth_date === b.birth_date) {
      score += 30;
      reasons.push('same_birth_date');
    } else if (a.birth_date.substring(0, 4) === b.birth_date.substring(0, 4)) {
      // Same year
      score += 15;
      reasons.push('same_birth_year');
    } else {
      // Different birth years — strong negative signal
      score -= 30;
    }
  }

  // Sex mismatch penalty
  if (a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) {
    score -= 40;
    reasons.push('sex_mismatch');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Merge person `sourceId` into person `targetId`.
 * All of source's data is reassigned to target, then source is deleted.
 * Returns the number of records moved.
 */
export function mergePersons(db: Database, targetId: string, sourceId: string): { moved: Record<string, number> } {
  if (targetId === sourceId) throw new Error('Cannot merge a person with themselves');

  // Verify both exist
  const target = queryOne<{ id: string }>(db, 'SELECT id FROM persons WHERE id = ?', [targetId]);
  const source = queryOne<{ id: string }>(db, 'SELECT id FROM persons WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target person not found');
  if (!source) throw new Error('Source person not found');

  const moved: Record<string, number> = {};

  // 1. Person names — move all, re-sort
  const existingNameCount = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM person_names WHERE person_id = ?', [targetId])?.n ?? 0;
  const sourceNames = queryAll<{ id: string; sort_order: number }>(db, 'SELECT id, sort_order FROM person_names WHERE person_id = ?', [sourceId]);
  for (const name of sourceNames) {
    runSql(db, 'UPDATE person_names SET person_id = ?, sort_order = ? WHERE id = ?', [targetId, existingNameCount + name.sort_order, name.id]);
  }
  moved.person_names = sourceNames.length;

  // 2. Person identifiers — move, skip conflicts
  const sourceIdents = queryAll<{ id: string; identifier_type: string; identifier_value: string }>(db, 'SELECT id, identifier_type, identifier_value FROM person_identifiers WHERE person_id = ?', [sourceId]);
  let identMoved = 0;
  for (const ident of sourceIdents) {
    const exists = queryOne<{ id: string }>(db, 'SELECT id FROM person_identifiers WHERE person_id = ? AND identifier_type = ? AND identifier_value = ?', [targetId, ident.identifier_type, ident.identifier_value]);
    if (exists) {
      runSql(db, 'DELETE FROM person_identifiers WHERE id = ?', [ident.id]);
    } else {
      runSql(db, 'UPDATE person_identifiers SET person_id = ? WHERE id = ?', [targetId, ident.id]);
      identMoved++;
    }
  }
  moved.person_identifiers = identMoved;

  // 3. Event participants — reassign, skip if target already participates in same event
  const sourceParticipants = queryAll<{ id: string; event_id: string }>(db, 'SELECT id, event_id FROM event_participants WHERE person_id = ?', [sourceId]);
  let epMoved = 0;
  for (const ep of sourceParticipants) {
    const exists = queryOne<{ id: string }>(db, 'SELECT id FROM event_participants WHERE event_id = ? AND person_id = ?', [ep.event_id, targetId]);
    if (exists) {
      runSql(db, 'DELETE FROM event_participants WHERE id = ?', [ep.id]);
    } else {
      runSql(db, 'UPDATE event_participants SET person_id = ? WHERE id = ?', [targetId, ep.id]);
      epMoved++;
    }
  }
  moved.event_participants = epMoved;

  // 4. Relationships — reassign person1_id/person2_id, skip self-relationships
  const relUpdated = { count: 0 };
  for (const col of ['person1_id', 'person2_id'] as const) {
    const rels = queryAll<{ id: string; person1_id: string | null; person2_id: string | null }>(db, `SELECT id, person1_id, person2_id FROM relationships WHERE ${col} = ?`, [sourceId]);
    for (const rel of rels) {
      const otherCol = col === 'person1_id' ? 'person2_id' : 'person1_id';
      const otherId = rel[otherCol];
      // Would create self-relationship?
      if (otherId === targetId) {
        runSql(db, 'DELETE FROM relationships WHERE id = ?', [rel.id]);
      } else {
        runSql(db, `UPDATE relationships SET ${col} = ? WHERE id = ?`, [targetId, rel.id]);
        relUpdated.count++;
      }
    }
  }
  moved.relationships = relUpdated.count;

  // 5. Citations — reassign person_id
  const citCount = queryAll<{ id: string }>(db, 'SELECT id FROM citations WHERE person_id = ?', [sourceId]);
  for (const c of citCount) {
    runSql(db, 'UPDATE citations SET person_id = ? WHERE id = ?', [targetId, c.id]);
  }
  moved.citations = citCount.length;

  // 6. Group person-links — reassign, skip if target already linked to group
  const sourceGroupLinks = queryAll<{ id: string; group_id: string }>(db,
    `SELECT id, group_id FROM group_links WHERE entity_type = 'person' AND entity_id = ?`, [sourceId]);
  let gmMoved = 0;
  for (const gl of sourceGroupLinks) {
    const exists = queryOne<{ id: string }>(db,
      `SELECT id FROM group_links WHERE group_id = ? AND entity_type = 'person' AND entity_id = ?`, [gl.group_id, targetId]);
    if (exists) {
      runSql(db, 'DELETE FROM group_links WHERE id = ?', [gl.id]);
    } else {
      runSql(db, 'UPDATE group_links SET entity_id = ? WHERE id = ?', [targetId, gl.id]);
      gmMoved++;
    }
  }
  moved.group_members = gmMoved;

  // 8. Research-task person-links — reassign, skip if target already linked
  const sourceTaskLinks = queryAll<{ id: string; task_id: string }>(db,
    `SELECT id, task_id FROM task_links WHERE entity_type = 'person' AND entity_id = ?`, [sourceId]);
  let tlMoved = 0;
  for (const tl of sourceTaskLinks) {
    const exists = queryOne<{ id: string }>(db,
      `SELECT id FROM task_links WHERE task_id = ? AND entity_type = 'person' AND entity_id = ?`, [tl.task_id, targetId]);
    if (exists) {
      runSql(db, 'DELETE FROM task_links WHERE id = ?', [tl.id]);
    } else {
      runSql(db, 'UPDATE task_links SET entity_id = ? WHERE id = ?', [targetId, tl.id]);
      tlMoved++;
    }
  }
  moved.research_tasks = tlMoved;

  // 9. Merge person fields — append notes
  const sourceData = queryOne<{ notes: string; sex: string; living: number }>(db, 'SELECT notes, sex, living FROM persons WHERE id = ?', [sourceId]);
  const targetData = queryOne<{ notes: string; sex: string }>(db, 'SELECT notes, sex FROM persons WHERE id = ?', [targetId]);
  if (sourceData && targetData) {
    const updates: string[] = [];
    const vals: unknown[] = [];
    // If target sex is unknown but source has it, take source's
    if (targetData.sex === 'U' && sourceData.sex !== 'U') {
      updates.push('sex = ?');
      vals.push(sourceData.sex);
    }
    // Append source notes
    if (sourceData.notes) {
      const combined = targetData.notes
        ? `${targetData.notes}\n\n--- Merged from duplicate ---\n${sourceData.notes}`
        : sourceData.notes;
      updates.push('notes = ?');
      vals.push(combined);
    }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      vals.push(targetId);
      runSql(db, `UPDATE persons SET ${updates.join(', ')} WHERE id = ?`, vals);
    }
  }

  // 10. Delete source person (CASCADE handles any remaining FKs like media_links)
  runSql(db, 'DELETE FROM persons WHERE id = ?', [sourceId]);

  return { moved };
}

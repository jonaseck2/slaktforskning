import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runSql } from '../db';

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
export async function findDuplicates(db: Database, limit = 100): Promise<DuplicateCandidate[]> {
  const candidates = await collectDuplicateCandidates(db);
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

/**
 * Paged variant — returns a single slice plus the total count in one scan,
 * so callers can drive infinite-scroll UIs without re-running the O(N²)
 * candidate collection twice (once for `findDuplicates`, once for `count`).
 */
export async function findDuplicatesPage(
  db: Database,
  limit = 100,
  offset = 0,
): Promise<{ items: DuplicateCandidate[]; total: number }> {
  const candidates = await collectDuplicateCandidates(db);
  candidates.sort((a, b) => b.score - a.score);
  return { items: candidates.slice(offset, offset + limit), total: candidates.length };
}

/**
 * Count all duplicate candidates without slicing or sorting — used by the
 * nav badge so the displayed count reflects the true total instead of being
 * pinned at the `findDuplicates` page-size limit.
 */
export async function countDuplicates(db: Database): Promise<number> {
  return (await collectDuplicateCandidates(db)).length;
}

async function collectDuplicateCandidates(db: Database): Promise<DuplicateCandidate[]> {
  // Load persons, primary names, and birth dates in bulk — the old correlated
  // subquery version was O(N²) on large DBs. Join in JS with Maps.
  const personRows = await queryAll<{ id: string; sex: string }>(db, 'SELECT id, sex FROM persons');

  const nameRows = await queryAll<{
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

  const birthRows = await queryAll<{ person_id: string; date_value: string }>(db, `
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

  // Pull the user-ignored pairs once and key them the same way as `seen` so the
  // inner loop can skip them with no per-pair query. Filter to entity_type='person'
  // so a place pair with the same UUIDs (vanishingly unlikely but possible)
  // doesn't accidentally hide a person pair.
  const ignoredRows = await queryAll<{ person1_id: string; person2_id: string }>(
    db, "SELECT person1_id, person2_id FROM ignored_duplicates WHERE entity_type = 'person'"
  );
  const ignored = new Set<string>(ignoredRows.map(r => `${r.person1_id}:${r.person2_id}`));

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
        if (ignored.has(pairKey)) continue;

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

  return candidates;
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
 * Mark a duplicate pair as ignored so it won't reappear in `findDuplicates`.
 * Pair is stored canonically (lower id first) so insertion order doesn't matter.
 * Idempotent — re-ignoring the same pair is a no-op.
 */
export async function ignoreDuplicate(db: Database, personAId: string, personBId: string): Promise<void> {
  if (personAId === personBId) throw new Error('Cannot ignore a person against themselves');
  const [p1, p2] = personAId < personBId ? [personAId, personBId] : [personBId, personAId];
  await runSql(
    db,
    "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('person', ?, ?)",
    [p1, p2]
  );
}

/**
 * Merge person `sourceId` into person `targetId`.
 * All of source's data is reassigned to target, then source is deleted.
 * Returns the number of records moved.
 */
export async function mergePersons(db: Database, targetId: string, sourceId: string): Promise<{ moved: Record<string, number> }> {
  if (targetId === sourceId) throw new Error('Cannot merge a person with themselves');

  // Verify both exist
  const target = await queryOne<{ id: string }>(db, 'SELECT id FROM persons WHERE id = ?', [targetId]);
  const source = await queryOne<{ id: string }>(db, 'SELECT id FROM persons WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target person not found');
  if (!source) throw new Error('Source person not found');

  const moved: Record<string, number> = {};

  // 1. Person names — move all, re-sort. Source rows whose name_type is
  // 'birth' get demoted to 'aka' on transfer because a person can only have
  // one canonical birth name and the target's pre-existing birth name is
  // the canonical one. Without this demotion, two `name_type='birth'` rows
  // ended up on the merged person — surfaced by the 2026-05-09 Bernadotte
  // duplicate test (Karl XIV Johan + "Jean Baptiste Bernadotte" merge).
  const existingNameCount = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM person_names WHERE person_id = ?', [targetId]))?.n ?? 0;
  const targetHasBirthName = ((await queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM person_names WHERE person_id = ? AND name_type = 'birth'", [targetId]))?.n ?? 0) > 0;
  const sourceNames = await queryAll<{ id: string; sort_order: number; name_type: string }>(db, 'SELECT id, sort_order, name_type FROM person_names WHERE person_id = ?', [sourceId]);
  for (const name of sourceNames) {
    if (targetHasBirthName && name.name_type === 'birth') {
      await runSql(db, 'UPDATE person_names SET person_id = ?, sort_order = ?, name_type = ? WHERE id = ?', [targetId, existingNameCount + name.sort_order, 'aka', name.id]);
    } else {
      await runSql(db, 'UPDATE person_names SET person_id = ?, sort_order = ? WHERE id = ?', [targetId, existingNameCount + name.sort_order, name.id]);
    }
  }
  moved.person_names = sourceNames.length;

  // 2. Person identifiers — move, skip conflicts
  const sourceIdents = await queryAll<{ id: string; identifier_type: string; identifier_value: string }>(db, 'SELECT id, identifier_type, identifier_value FROM person_identifiers WHERE person_id = ?', [sourceId]);
  let identMoved = 0;
  for (const ident of sourceIdents) {
    const exists = await queryOne<{ id: string }>(db, 'SELECT id FROM person_identifiers WHERE person_id = ? AND identifier_type = ? AND identifier_value = ?', [targetId, ident.identifier_type, ident.identifier_value]);
    if (exists) {
      await runSql(db, 'DELETE FROM person_identifiers WHERE id = ?', [ident.id]);
    } else {
      await runSql(db, 'UPDATE person_identifiers SET person_id = ? WHERE id = ?', [targetId, ident.id]);
      identMoved++;
    }
  }
  moved.person_identifiers = identMoved;

  // 3. Event participants — reassign, skip if target already participates in same event
  const sourceParticipants = await queryAll<{ id: string; event_id: string }>(db, 'SELECT id, event_id FROM event_participants WHERE person_id = ?', [sourceId]);
  let epMoved = 0;
  for (const ep of sourceParticipants) {
    const exists = await queryOne<{ id: string }>(db, 'SELECT id FROM event_participants WHERE event_id = ? AND person_id = ?', [ep.event_id, targetId]);
    if (exists) {
      await runSql(db, 'DELETE FROM event_participants WHERE id = ?', [ep.id]);
    } else {
      await runSql(db, 'UPDATE event_participants SET person_id = ? WHERE id = ?', [targetId, ep.id]);
      epMoved++;
    }
  }
  moved.event_participants = epMoved;

  // 4. Relationships — reassign person1_id/person2_id, skip self-relationships
  const relUpdated = { count: 0 };
  for (const col of ['person1_id', 'person2_id'] as const) {
    const rels = await queryAll<{ id: string; person1_id: string | null; person2_id: string | null }>(db, `SELECT id, person1_id, person2_id FROM relationships WHERE ${col} = ?`, [sourceId]);
    for (const rel of rels) {
      const otherCol = col === 'person1_id' ? 'person2_id' : 'person1_id';
      const otherId = rel[otherCol];
      // Would create self-relationship?
      if (otherId === targetId) {
        await runSql(db, 'DELETE FROM relationships WHERE id = ?', [rel.id]);
      } else {
        await runSql(db, `UPDATE relationships SET ${col} = ? WHERE id = ?`, [targetId, rel.id]);
        relUpdated.count++;
      }
    }
  }
  moved.relationships = relUpdated.count;

  // 5. Citations — reassign person_id
  const citCount = await queryAll<{ id: string }>(db, 'SELECT id FROM citations WHERE person_id = ?', [sourceId]);
  for (const c of citCount) {
    await runSql(db, 'UPDATE citations SET person_id = ? WHERE id = ?', [targetId, c.id]);
  }
  moved.citations = citCount.length;

  // 6. Group person-links — reassign, skip if target already linked to group
  const sourceGroupLinks = await queryAll<{ id: string; group_id: string }>(db,
    `SELECT id, group_id FROM group_links WHERE entity_type = 'person' AND entity_id = ?`, [sourceId]);
  let gmMoved = 0;
  for (const gl of sourceGroupLinks) {
    const exists = await queryOne<{ id: string }>(db,
      `SELECT id FROM group_links WHERE group_id = ? AND entity_type = 'person' AND entity_id = ?`, [gl.group_id, targetId]);
    if (exists) {
      await runSql(db, 'DELETE FROM group_links WHERE id = ?', [gl.id]);
    } else {
      await runSql(db, 'UPDATE group_links SET entity_id = ? WHERE id = ?', [targetId, gl.id]);
      gmMoved++;
    }
  }
  moved.group_members = gmMoved;

  // 8. Research-task person-links — reassign, skip if target already linked
  const sourceTaskLinks = await queryAll<{ id: string; task_id: string }>(db,
    `SELECT id, task_id FROM task_links WHERE entity_type = 'person' AND entity_id = ?`, [sourceId]);
  let tlMoved = 0;
  for (const tl of sourceTaskLinks) {
    const exists = await queryOne<{ id: string }>(db,
      `SELECT id FROM task_links WHERE task_id = ? AND entity_type = 'person' AND entity_id = ?`, [tl.task_id, targetId]);
    if (exists) {
      await runSql(db, 'DELETE FROM task_links WHERE id = ?', [tl.id]);
    } else {
      await runSql(db, 'UPDATE task_links SET entity_id = ? WHERE id = ?', [targetId, tl.id]);
      tlMoved++;
    }
  }
  moved.research_tasks = tlMoved;

  // 9. Merge person fields — append notes
  const sourceData = await queryOne<{ notes: string; sex: string }>(db, 'SELECT notes, sex FROM persons WHERE id = ?', [sourceId]);
  const targetData = await queryOne<{ notes: string; sex: string }>(db, 'SELECT notes, sex FROM persons WHERE id = ?', [targetId]);
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
      await runSql(db, `UPDATE persons SET ${updates.join(', ')} WHERE id = ?`, vals);
    }
  }

  // 9b. Dedupe single-cardinality events. After step 3 the target person
  // may now own two birth events / two death events / etc. — one from each
  // side of the merge. Keep the older row (target's original) and delete
  // the duplicates, transferring citations + media links to the survivor
  // so no authored data is lost. Without this step, a panel showed Karl
  // XIV Johan with two identical birth events after the duplicate test.
  const SINGLE_CARDINALITY_TYPES = ['birth', 'baptism', 'christening', 'death', 'burial'] as const;
  let eventsDeduped = 0;
  for (const eventType of SINGLE_CARDINALITY_TYPES) {
    const dupes = await queryAll<{ id: string; created_at: string }>(db, `
      SELECT e.id, e.created_at
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE ep.person_id = ? AND e.event_type = ?
      ORDER BY e.created_at ASC
    `, [targetId, eventType]);
    if (dupes.length <= 1) continue;
    // Keep the first (oldest) row; delete the rest, transferring child
    // records onto the survivor.
    const survivor = dupes[0];
    for (let i = 1; i < dupes.length; i++) {
      const stale = dupes[i];
      await runSql(db, 'UPDATE citations SET event_id = ? WHERE event_id = ?', [survivor.id, stale.id]);
      await runSql(db, "UPDATE media_links SET entity_id = ? WHERE entity_type = 'event' AND entity_id = ?", [survivor.id, stale.id]);
      await runSql(db, 'DELETE FROM events WHERE id = ?', [stale.id]);
      eventsDeduped++;
    }
  }
  moved.events_deduped = eventsDeduped;

  // 10. Delete source person (CASCADE handles any remaining FKs like media_links)
  await runSql(db, 'DELETE FROM persons WHERE id = ?', [sourceId]);

  return { moved };
}

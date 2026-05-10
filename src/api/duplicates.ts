import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runSql, runSqlChanges } from './db';
import { undoManager } from './undo';
import type { Media, Place, Source } from './types';

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
  const candidates = collectDuplicateCandidates(db);
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

/**
 * Paged variant — returns a single slice plus the total count in one scan,
 * so callers can drive infinite-scroll UIs without re-running the O(N²)
 * candidate collection twice (once for `findDuplicates`, once for `count`).
 */
export function findDuplicatesPage(
  db: Database,
  limit = 100,
  offset = 0,
): { items: DuplicateCandidate[]; total: number } {
  const candidates = collectDuplicateCandidates(db);
  candidates.sort((a, b) => b.score - a.score);
  return { items: candidates.slice(offset, offset + limit), total: candidates.length };
}

/**
 * Count all duplicate candidates without slicing or sorting — used by the
 * nav badge so the displayed count reflects the true total instead of being
 * pinned at the `findDuplicates` page-size limit.
 */
export function countDuplicates(db: Database): number {
  return collectDuplicateCandidates(db).length;
}

function collectDuplicateCandidates(db: Database): DuplicateCandidate[] {
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

  // Pull the user-ignored pairs once and key them the same way as `seen` so the
  // inner loop can skip them with no per-pair query. Filter to entity_type='person'
  // so a place pair with the same UUIDs (vanishingly unlikely but possible)
  // doesn't accidentally hide a person pair.
  const ignoredRows = queryAll<{ person1_id: string; person2_id: string }>(
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
export function ignoreDuplicate(db: Database, personAId: string, personBId: string): void {
  if (personAId === personBId) throw new Error('Cannot ignore a person against themselves');
  const [p1, p2] = personAId < personBId ? [personAId, personBId] : [personBId, personAId];
  runSql(
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
export function mergePersons(db: Database, targetId: string, sourceId: string): { moved: Record<string, number> } {
  if (targetId === sourceId) throw new Error('Cannot merge a person with themselves');

  // Verify both exist
  const target = queryOne<{ id: string }>(db, 'SELECT id FROM persons WHERE id = ?', [targetId]);
  const source = queryOne<{ id: string }>(db, 'SELECT id FROM persons WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target person not found');
  if (!source) throw new Error('Source person not found');

  const moved: Record<string, number> = {};

  // 1. Person names — move all, re-sort. Source rows whose name_type is
  // 'birth' get demoted to 'aka' on transfer because a person can only have
  // one canonical birth name and the target's pre-existing birth name is
  // the canonical one. Without this demotion, two `name_type='birth'` rows
  // ended up on the merged person — surfaced by the 2026-05-09 Bernadotte
  // duplicate test (Karl XIV Johan + "Jean Baptiste Bernadotte" merge).
  const existingNameCount = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM person_names WHERE person_id = ?', [targetId])?.n ?? 0;
  const targetHasBirthName = (queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM person_names WHERE person_id = ? AND name_type = 'birth'", [targetId])?.n ?? 0) > 0;
  const sourceNames = queryAll<{ id: string; sort_order: number; name_type: string }>(db, 'SELECT id, sort_order, name_type FROM person_names WHERE person_id = ?', [sourceId]);
  for (const name of sourceNames) {
    if (targetHasBirthName && name.name_type === 'birth') {
      runSql(db, 'UPDATE person_names SET person_id = ?, sort_order = ?, name_type = ? WHERE id = ?', [targetId, existingNameCount + name.sort_order, 'aka', name.id]);
    } else {
      runSql(db, 'UPDATE person_names SET person_id = ?, sort_order = ? WHERE id = ?', [targetId, existingNameCount + name.sort_order, name.id]);
    }
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
  const sourceData = queryOne<{ notes: string; sex: string }>(db, 'SELECT notes, sex FROM persons WHERE id = ?', [sourceId]);
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

  // 9b. Dedupe single-cardinality events. After step 3 the target person
  // may now own two birth events / two death events / etc. — one from each
  // side of the merge. Keep the older row (target's original) and delete
  // the duplicates, transferring citations + media links to the survivor
  // so no authored data is lost. Without this step, a panel showed Karl
  // XIV Johan with two identical birth events after the duplicate test.
  const SINGLE_CARDINALITY_TYPES = ['birth', 'baptism', 'christening', 'death', 'burial'] as const;
  let eventsDeduped = 0;
  for (const eventType of SINGLE_CARDINALITY_TYPES) {
    const dupes = queryAll<{ id: string; created_at: string }>(db, `
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
      runSql(db, 'UPDATE citations SET event_id = ? WHERE event_id = ?', [survivor.id, stale.id]);
      runSql(db, "UPDATE media_links SET entity_id = ? WHERE entity_type = 'event' AND entity_id = ?", [survivor.id, stale.id]);
      runSql(db, 'DELETE FROM events WHERE id = ?', [stale.id]);
      eventsDeduped++;
    }
  }
  moved.events_deduped = eventsDeduped;

  // 10. Delete source person (CASCADE handles any remaining FKs like media_links)
  runSql(db, 'DELETE FROM persons WHERE id = ?', [sourceId]);

  return { moved };
}

// ---------------------------------------------------------------------------
// Places duplicate find + merge
// ---------------------------------------------------------------------------

export interface DuplicatePlaceCandidate {
  place1_id: string;
  place2_id: string;
  place1_name: string;
  place2_name: string;
  place1_parent_id: string | null;
  place2_parent_id: string | null;
  score: number; // 0-100 similarity ratio
  reasons: string[];
}

/**
 * Levenshtein edit distance. Pure function; used to fuzz-match place names
 * (e.g. "Stockholm " vs "Stockholm" — one whitespace = distance 1; "Stocholm"
 * vs "Stockholm" — one missing letter = distance 1).
 *
 * O(m·n) time, O(min(m,n)) memory. Adequate for place names.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Make sure `a` is the shorter string so the row buffer stays small.
  if (a.length > b.length) { const tmp = a; a = b; b = tmp; }
  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

function placeNormalize(name: string): string {
  // Mirror src/api/places.ts normalize() so equality matches normalized_name.
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Find candidate duplicate places.
 *
 * Heuristic: a pair (a, b) is a candidate when
 *   - they share the same parent_place_id (both null counts as same), AND
 *   - their normalized names are equal OR Levenshtein distance ≤ 2.
 *
 * Score is a string-similarity ratio in [0, 100]:
 *   100 — normalized names equal
 *    else round((1 - distance / max(len)) * 100), capped to [0,100].
 *
 * Pairs are returned sorted by descending score, sliced by limit/offset.
 * Pairs already recorded in `ignored_duplicates` (entity_type='place') are
 * skipped so the user's "ignore" choice persists across runs.
 */
export function findDuplicatePlaces(
  db: Database,
  limit = 100,
  offset = 0,
): DuplicatePlaceCandidate[] {
  const places = queryAll<{
    id: string;
    name: string;
    normalized_name: string;
    parent_place_id: string | null;
  }>(db, 'SELECT id, name, normalized_name, parent_place_id FROM places');

  // Group by parent_place_id (null normalised to empty string for keying).
  const byParent = new Map<string, typeof places>();
  for (const p of places) {
    const key = p.parent_place_id ?? '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(p);
  }

  const ignoredRows = queryAll<{ person1_id: string; person2_id: string }>(
    db, "SELECT person1_id, person2_id FROM ignored_duplicates WHERE entity_type = 'place'"
  );
  const ignored = new Set<string>(ignoredRows.map(r => `${r.person1_id}:${r.person2_id}`));

  const candidates: DuplicatePlaceCandidate[] = [];
  const seen = new Set<string>();

  for (const group of byParent.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const pairKey = `${low}:${high}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        if (ignored.has(pairKey)) continue;

        // Use normalized_name from the DB if present, else compute from name.
        // Some legacy rows have empty normalized_name even when name is set.
        const na = a.normalized_name || placeNormalize(a.name);
        const nb = b.normalized_name || placeNormalize(b.name);
        if (!na || !nb) continue;

        const reasons: string[] = [];
        let score: number;
        if (na === nb) {
          score = 100;
          reasons.push('same_normalized_name');
        } else {
          const dist = levenshtein(na, nb);
          if (dist > 2) continue;
          const maxLen = Math.max(na.length, nb.length);
          score = Math.max(0, Math.min(100, Math.round((1 - dist / maxLen) * 100)));
          reasons.push(`levenshtein_${dist}`);
        }
        if (a.parent_place_id === b.parent_place_id) {
          reasons.push(a.parent_place_id ? 'same_parent' : 'both_top_level');
        }

        candidates.push({
          place1_id: a.id,
          place2_id: b.id,
          place1_name: a.name,
          place2_name: b.name,
          place1_parent_id: a.parent_place_id,
          place2_parent_id: b.parent_place_id,
          score,
          reasons,
        });
      }
    }
  }

  candidates.sort((x, y) => y.score - x.score);
  return candidates.slice(offset, offset + limit);
}

/** Total candidate count, used for the duplicates badge. */
export function countDuplicatePlaces(db: Database): number {
  // Re-uses the find machinery without the limit slice; cheap enough for
  // typical DBs because the parent-grouping prunes the O(N²) pair space.
  return findDuplicatePlaces(db, Number.MAX_SAFE_INTEGER, 0).length;
}

/**
 * Mark a duplicate place pair as ignored. Idempotent.
 *
 * Pair is stored canonically (lower id first) so insertion order doesn't
 * matter. The CHECK (person1_id < person2_id) constraint on ignored_duplicates
 * also enforces this; we sort defensively.
 */
export function ignoreDuplicatePlace(db: Database, placeAId: string, placeBId: string): void {
  if (placeAId === placeBId) throw new Error('Cannot ignore a place against itself');
  const [p1, p2] = placeAId < placeBId ? [placeAId, placeBId] : [placeBId, placeAId];
  runSql(
    db,
    "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('place', ?, ?)",
    [p1, p2]
  );
}

/**
 * Repoint every reference to `sourceId` to `targetId`, then delete the source
 * place row. Reversible via the registered UndoAction.
 *
 * Tables this function repoints (must match every FK to places.id in
 * src/api/schema.ts — see the FK self-check unit test):
 *   - events.place_id            (REFERENCES places(id) ON DELETE SET NULL)
 *   - places.parent_place_id     (self-reference, ON DELETE SET NULL)
 *   - citations.place_id         (REFERENCES places(id) ON DELETE SET NULL)
 *
 * Plus polymorphic links (entity_type filter, no SQL FK):
 *   - group_links WHERE entity_type='place'
 *   - task_links  WHERE entity_type='place'
 *
 * Plus polymorphic ignored-duplicate rows that mention the source so the
 * pair doesn't reappear pointing at a deleted id:
 *   - ignored_duplicates WHERE entity_type='place'
 *     AND (person1_id = source OR person2_id = source)
 *
 * NB: media_links is *not* listed because the entity_type CHECK constraint on
 * media_links only allows 'person' | 'event' | 'relationship' | 'place' |
 * 'source' but the column does not currently include 'place' as a writable
 * value in our app's media flows… actually it DOES include 'place'. So we
 * also handle:
 *   - media_links WHERE entity_type='place'
 *
 * Returns counts per moved kind. Skips rows where moving would create a
 * duplicate against an existing target row (UNIQUE constraint protection on
 * group_links / task_links / media_links).
 */
export function mergePlaces(
  db: Database,
  targetId: string,
  sourceId: string,
): { moved: Record<string, number> } {
  if (targetId === sourceId) throw new Error('Cannot merge a place with itself');
  const target = queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [targetId]);
  const source = queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target place not found');
  if (!source) throw new Error('Source place not found');

  // --- snapshot pre-mutation state for undo ---
  // Children that referenced the source via a non-polymorphic FK
  const eventsTouched = queryAll<{ id: string; place_id: string | null }>(
    db, 'SELECT id, place_id FROM events WHERE place_id = ?', [sourceId]
  );
  const childPlacesTouched = queryAll<{ id: string; parent_place_id: string | null }>(
    db, 'SELECT id, parent_place_id FROM places WHERE parent_place_id = ?', [sourceId]
  );
  const citationsTouched = queryAll<{ id: string; place_id: string | null }>(
    db, 'SELECT id, place_id FROM citations WHERE place_id = ?', [sourceId]
  );
  // Polymorphic link rows where the source was the entity. We snapshot
  // every row that may be either updated to point at target OR deleted as a
  // duplicate of an existing target-link.
  const sourceGroupLinks = queryAll<{ id: string; group_id: string }>(db,
    "SELECT id, group_id FROM group_links WHERE entity_type = 'place' AND entity_id = ?", [sourceId]);
  const sourceTaskLinks = queryAll<{ id: string; task_id: string }>(db,
    "SELECT id, task_id FROM task_links WHERE entity_type = 'place' AND entity_id = ?", [sourceId]);
  const sourceMediaLinks = queryAll<{ id: string; media_id: string }>(db,
    "SELECT id, media_id FROM media_links WHERE entity_type = 'place' AND entity_id = ?", [sourceId]);
  // Ignored-duplicate rows mentioning the source (any pair, since `place_id`
  // is stored in either column once canonically sorted — it can be person1_id
  // or person2_id depending on UUID order).
  const ignoredRows = queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
    db,
    "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'place' AND (person1_id = ? OR person2_id = ?)",
    [sourceId, sourceId]
  );

  // --- perform the merge inside an immediate transaction ---
  // BEGIN IMMEDIATE acquires the write lock upfront, matching the api/ rule
  // for any multi-write operation.
  const moved: Record<string, number> = {};
  // Track which polymorphic link rows were *deleted* (because moving them
  // would have duplicated an existing target-link) vs *updated* — undo
  // re-INSERTs the deleted ones and reverts the updated ones.
  const deletedGroupLinks: Array<{ id: string; group_id: string; sort_order: number; created_at: string }> = [];
  const updatedGroupLinks: string[] = [];
  const deletedTaskLinks: Array<{ id: string; task_id: string; sort_order: number; created_at: string }> = [];
  const updatedTaskLinks: string[] = [];
  const deletedMediaLinks: Array<{
    id: string; media_id: string; link_type: number | null;
    sort_order: number; created_at: string;
  }> = [];
  const updatedMediaLinks: string[] = [];

  runSql(db, 'BEGIN IMMEDIATE');
  try {
    // 1. events.place_id
    for (const e of eventsTouched) {
      runSql(db, 'UPDATE events SET place_id = ? WHERE id = ?', [targetId, e.id]);
    }
    moved.events = eventsTouched.length;

    // 2. places.parent_place_id (self-reference). If a child of source has
    // target as ancestor we still just repoint to target — we do not detect
    // cycles here because a place merge by construction collapses the source
    // *into* the target; any "child" pointing at source becomes a child of
    // target which cannot reintroduce a cycle unless the user is merging a
    // descendant into an ancestor (which would violate the surface contract
    // before reaching this layer; we still guard).
    for (const cp of childPlacesTouched) {
      if (cp.id === targetId) {
        // Defensive: would set target.parent = target. Leave the row untouched
        // and let the source delete cascade (ON DELETE SET NULL) to NULL it.
        // We don't count it as moved.
        continue;
      }
      runSql(db, 'UPDATE places SET parent_place_id = ? WHERE id = ?', [targetId, cp.id]);
    }
    moved.child_places = childPlacesTouched.filter(cp => cp.id !== targetId).length;

    // 3. citations.place_id
    for (const c of citationsTouched) {
      runSql(db, 'UPDATE citations SET place_id = ? WHERE id = ?', [targetId, c.id]);
    }
    moved.citations = citationsTouched.length;

    // 4. group_links — UNIQUE(group_id, entity_type, entity_id) means we
    // must skip when target already in same group.
    for (const gl of sourceGroupLinks) {
      const exists = queryOne<{ id: string; sort_order: number; created_at: string }>(db,
        "SELECT id, sort_order, created_at FROM group_links WHERE group_id = ? AND entity_type = 'place' AND entity_id = ?",
        [gl.group_id, targetId]);
      if (exists) {
        const full = queryOne<{ id: string; group_id: string; sort_order: number; created_at: string }>(db,
          'SELECT id, group_id, sort_order, created_at FROM group_links WHERE id = ?', [gl.id]);
        if (full) deletedGroupLinks.push(full);
        runSql(db, 'DELETE FROM group_links WHERE id = ?', [gl.id]);
      } else {
        runSql(db, 'UPDATE group_links SET entity_id = ? WHERE id = ?', [targetId, gl.id]);
        updatedGroupLinks.push(gl.id);
      }
    }
    moved.group_links = updatedGroupLinks.length;

    // 5. task_links — same pattern
    for (const tl of sourceTaskLinks) {
      const exists = queryOne<{ id: string }>(db,
        "SELECT id FROM task_links WHERE task_id = ? AND entity_type = 'place' AND entity_id = ?",
        [tl.task_id, targetId]);
      if (exists) {
        const full = queryOne<{ id: string; task_id: string; sort_order: number; created_at: string }>(db,
          'SELECT id, task_id, sort_order, created_at FROM task_links WHERE id = ?', [tl.id]);
        if (full) deletedTaskLinks.push(full);
        runSql(db, 'DELETE FROM task_links WHERE id = ?', [tl.id]);
      } else {
        runSql(db, 'UPDATE task_links SET entity_id = ? WHERE id = ?', [targetId, tl.id]);
        updatedTaskLinks.push(tl.id);
      }
    }
    moved.task_links = updatedTaskLinks.length;

    // 6. media_links — no UNIQUE constraint at the SQL level today, but a
    // (media, place) pair appearing twice is meaningless. Mirror the dedupe.
    for (const ml of sourceMediaLinks) {
      const exists = queryOne<{ id: string }>(db,
        "SELECT id FROM media_links WHERE media_id = ? AND entity_type = 'place' AND entity_id = ?",
        [ml.media_id, targetId]);
      if (exists) {
        const full = queryOne<{
          id: string; media_id: string; link_type: number | null;
          sort_order: number; created_at: string;
        }>(db,
          'SELECT id, media_id, link_type, sort_order, created_at FROM media_links WHERE id = ?', [ml.id]);
        if (full) deletedMediaLinks.push(full);
        runSql(db, 'DELETE FROM media_links WHERE id = ?', [ml.id]);
      } else {
        runSql(db, 'UPDATE media_links SET entity_id = ? WHERE id = ?', [targetId, ml.id]);
        updatedMediaLinks.push(ml.id);
      }
    }
    moved.media_links = updatedMediaLinks.length;

    // 7. ignored_duplicates rows that mention the source — drop them so the
    // pair doesn't reappear pointing at a deleted id. Snapshot taken above.
    runSql(db,
      "DELETE FROM ignored_duplicates WHERE entity_type = 'place' AND (person1_id = ? OR person2_id = ?)",
      [sourceId, sourceId]
    );
    moved.ignored_duplicates = ignoredRows.length;

    // 8. Delete the source place
    runSql(db, 'DELETE FROM places WHERE id = ?', [sourceId]);

    runSql(db, 'COMMIT');
  } catch (err) {
    try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  // --- register undo ---
  // The closure captures the *snapshot*, never re-reads "current state".
  const sourceSnapshot: Place = source;
  undoManager.push({
    label: 'undo.mergePlaces',
    undo: () => {
      runSql(db, 'BEGIN IMMEDIATE');
      try {
        // Recreate the source place row exactly as it was.
        runSql(db, `
          INSERT INTO places (id, name, normalized_name, place_type, latitude, longitude,
                              parent_place_id, date_from, date_to, notes,
                              street, postal_code, city, country)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sourceSnapshot.id, sourceSnapshot.name, sourceSnapshot.normalized_name,
          sourceSnapshot.place_type, sourceSnapshot.latitude, sourceSnapshot.longitude,
          sourceSnapshot.parent_place_id, sourceSnapshot.date_from, sourceSnapshot.date_to,
          sourceSnapshot.notes, sourceSnapshot.street, sourceSnapshot.postal_code,
          sourceSnapshot.city, sourceSnapshot.country,
        ]);

        // Revert events.place_id
        for (const e of eventsTouched) {
          runSql(db, 'UPDATE events SET place_id = ? WHERE id = ?', [e.place_id, e.id]);
        }
        // Revert places.parent_place_id
        for (const cp of childPlacesTouched) {
          if (cp.id === sourceSnapshot.id) continue; // wouldn't have been moved
          runSql(db, 'UPDATE places SET parent_place_id = ? WHERE id = ?', [cp.parent_place_id, cp.id]);
        }
        // Revert citations.place_id
        for (const c of citationsTouched) {
          runSql(db, 'UPDATE citations SET place_id = ? WHERE id = ?', [c.place_id, c.id]);
        }
        // Revert moved group_links
        for (const id of updatedGroupLinks) {
          runSql(db, 'UPDATE group_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Re-insert deleted group_links (the duplicates we collapsed)
        for (const gl of deletedGroupLinks) {
          runSql(db, `
            INSERT INTO group_links (id, group_id, entity_type, entity_id, sort_order, created_at)
            VALUES (?, ?, 'place', ?, ?, ?)
          `, [gl.id, gl.group_id, sourceSnapshot.id, gl.sort_order, gl.created_at]);
        }
        // Revert moved task_links
        for (const id of updatedTaskLinks) {
          runSql(db, 'UPDATE task_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        for (const tl of deletedTaskLinks) {
          runSql(db, `
            INSERT INTO task_links (id, task_id, entity_type, entity_id, sort_order, created_at)
            VALUES (?, ?, 'place', ?, ?, ?)
          `, [tl.id, tl.task_id, sourceSnapshot.id, tl.sort_order, tl.created_at]);
        }
        // Revert moved media_links
        for (const id of updatedMediaLinks) {
          runSql(db, 'UPDATE media_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        for (const ml of deletedMediaLinks) {
          runSql(db, `
            INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order, created_at)
            VALUES (?, ?, 'place', ?, ?, ?, ?)
          `, [ml.id, ml.media_id, sourceSnapshot.id, ml.link_type, ml.sort_order, ml.created_at]);
        }
        // Restore ignored_duplicates rows
        for (const ig of ignoredRows) {
          runSql(db,
            "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id, created_at) VALUES ('place', ?, ?, ?)",
            [ig.person1_id, ig.person2_id, ig.created_at]
          );
        }
        runSql(db, 'COMMIT');
      } catch (err) {
        try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
    },
    redo: () => { mergePlaces(db, targetId, sourceId); },
  });

  return { moved };
}

/**
 * Hook called from `deletePlace`: clean up any `ignored_duplicates` rows
 * that mention the deleted place id. Mirrors the polymorphic cleanup pattern
 * used by `deletePerson` so a tombstoned id doesn't keep an "ignored" pair
 * stuck in the DB forever.
 */
export function deleteIgnoredDuplicatesForPlace(db: Database, placeId: string): number {
  return runSqlChanges(db,
    "DELETE FROM ignored_duplicates WHERE entity_type = 'place' AND (person1_id = ? OR person2_id = ?)",
    [placeId, placeId]
  );
}

// ---------------------------------------------------------------------------
// Sources duplicate find + merge
// ---------------------------------------------------------------------------

export interface DuplicateSourceCandidate {
  source1_id: string;
  source2_id: string;
  source1_title: string;
  source2_title: string;
  source1_author: string;
  source2_author: string;
  score: number; // 0-100 similarity ratio
  reasons: string[];
}

function sourceNormalize(value: string | null | undefined): string {
  // Lowercase, collapse runs of whitespace, trim. Mirrors the placeNormalize
  // shape — used both for grouping by author and for title equality matching.
  return (value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Find candidate duplicate sources.
 *
 * Heuristic: a pair (a, b) is a candidate when
 *   - they share the same normalised author (NULL == NULL counts as a match), AND
 *   - their normalised titles are equal OR Levenshtein distance ≤ 2.
 *
 * Score is a string-similarity ratio in [0, 100]:
 *   100 — normalised titles equal
 *    else round((1 - distance / max(len)) * 100), capped to [0, 100].
 *
 * Pairs are returned sorted by descending score, sliced by limit/offset.
 * Pairs already recorded in `ignored_duplicates` (entity_type='source') are
 * skipped so the user's "ignore" choice persists across runs.
 *
 * The user-goal canary this function exists for: a genealogist who imports
 * "Adolf Fredrik C:I:6, 1798-1812" twice (e.g. one with a hyphen, one with an
 * en-dash) under the same author should see both rows surfaced as a high-score
 * candidate pair.
 */
export function findDuplicateSources(
  db: Database,
  limit = 100,
  offset = 0,
): DuplicateSourceCandidate[] {
  const sources = queryAll<{
    id: string;
    title: string;
    author: string;
  }>(db, 'SELECT id, title, author FROM sources');

  // Group by normalised author. NULL or empty author counts as its own bucket
  // ('') so two NULL-author sources can pair, but a NULL-author and a
  // 'Doe, J.' source cannot.
  const byAuthor = new Map<string, typeof sources>();
  for (const s of sources) {
    const key = sourceNormalize(s.author);
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key)!.push(s);
  }

  const ignoredRows = queryAll<{ person1_id: string; person2_id: string }>(
    db, "SELECT person1_id, person2_id FROM ignored_duplicates WHERE entity_type = 'source'"
  );
  const ignored = new Set<string>(ignoredRows.map(r => `${r.person1_id}:${r.person2_id}`));

  const candidates: DuplicateSourceCandidate[] = [];
  const seen = new Set<string>();

  for (const group of byAuthor.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const pairKey = `${low}:${high}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        if (ignored.has(pairKey)) continue;

        const na = sourceNormalize(a.title);
        const nb = sourceNormalize(b.title);
        if (!na || !nb) continue;

        const reasons: string[] = [];
        let score: number;
        if (na === nb) {
          score = 100;
          reasons.push('same_normalized_title');
        } else {
          const dist = levenshtein(na, nb);
          if (dist > 2) continue;
          const maxLen = Math.max(na.length, nb.length);
          score = Math.max(0, Math.min(100, Math.round((1 - dist / maxLen) * 100)));
          reasons.push(`levenshtein_${dist}`);
        }
        // Author-grouping is implicit (we only iterate within author buckets).
        // Surface a reason so the UI can label it.
        const authorKey = sourceNormalize(a.author);
        reasons.push(authorKey ? 'same_author' : 'both_no_author');

        candidates.push({
          source1_id: a.id,
          source2_id: b.id,
          source1_title: a.title,
          source2_title: b.title,
          source1_author: a.author,
          source2_author: b.author,
          score,
          reasons,
        });
      }
    }
  }

  candidates.sort((x, y) => y.score - x.score);
  return candidates.slice(offset, offset + limit);
}

/** Total candidate count, used for the duplicates badge. */
export function countDuplicateSources(db: Database): number {
  // Re-uses the find machinery without the limit slice; cheap enough for
  // typical DBs because the author-grouping prunes the O(N²) pair space.
  return findDuplicateSources(db, Number.MAX_SAFE_INTEGER, 0).length;
}

/**
 * Mark a duplicate source pair as ignored. Idempotent.
 *
 * Pair is stored canonically (lower id first) so insertion order doesn't
 * matter. The CHECK (person1_id < person2_id) constraint on ignored_duplicates
 * also enforces this; we sort defensively.
 */
export function ignoreDuplicateSource(db: Database, sourceAId: string, sourceBId: string): void {
  if (sourceAId === sourceBId) throw new Error('Cannot ignore a source against itself');
  const [p1, p2] = sourceAId < sourceBId ? [sourceAId, sourceBId] : [sourceBId, sourceAId];
  runSql(
    db,
    "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('source', ?, ?)",
    [p1, p2]
  );
}

/**
 * Repoint every reference to `sourceId` to `targetId`, then delete the source
 * row. Reversible via the registered UndoAction.
 *
 * Tables this function repoints (must match every FK to sources.id in
 * src/api/schema.ts — see the FK self-check unit test):
 *   - citations.source_id            (REFERENCES sources(id) ON DELETE CASCADE)
 *   - source_repositories.source_id  (REFERENCES sources(id) ON DELETE CASCADE,
 *                                     composite PK with repository_id — must
 *                                     dedupe on merge)
 *
 * Plus polymorphic links (entity_type filter, no SQL FK):
 *   - media_links WHERE entity_type='source'
 *
 * Plus polymorphic ignored-duplicate rows that mention the source so the
 * pair doesn't reappear pointing at a deleted id:
 *   - ignored_duplicates WHERE entity_type='source'
 *     AND (person1_id = source OR person2_id = source)
 *
 * Returns counts per moved kind. Skips rows where moving would create a
 * duplicate against an existing target row (UNIQUE / PK constraint protection
 * on source_repositories / media_links).
 *
 * NB: the parameter name `sourceId` is the *id of the source-side participant
 * in the merge*, not the entity type. The entity type is "source" throughout.
 */
export function mergeSources(
  db: Database,
  targetId: string,
  sourceId: string,
): { moved: Record<string, number> } {
  if (targetId === sourceId) throw new Error('Cannot merge a source with itself');
  const target = queryOne<Source>(db, 'SELECT * FROM sources WHERE id = ?', [targetId]);
  const source = queryOne<Source>(db, 'SELECT * FROM sources WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target source not found');
  if (!source) throw new Error('Source source not found');

  // --- snapshot pre-mutation state for undo ---
  const citationsTouched = queryAll<{ id: string; source_id: string }>(
    db, 'SELECT id, source_id FROM citations WHERE source_id = ?', [sourceId]
  );
  // source_repositories has composite PK (source_id, repository_id) — snapshot
  // both (source_id, repository_id) tuples so undo can re-insert the deleted
  // join rows verbatim.
  const sourceRepoLinks = queryAll<{ source_id: string; repository_id: string }>(
    db, 'SELECT source_id, repository_id FROM source_repositories WHERE source_id = ?', [sourceId]
  );
  const sourceMediaLinks = queryAll<{ id: string; media_id: string }>(db,
    "SELECT id, media_id FROM media_links WHERE entity_type = 'source' AND entity_id = ?", [sourceId]);
  const ignoredRows = queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
    db,
    "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'source' AND (person1_id = ? OR person2_id = ?)",
    [sourceId, sourceId]
  );

  // --- perform the merge inside an immediate transaction ---
  const moved: Record<string, number> = {};
  // Track which join rows were *deleted* (because moving them would have
  // duplicated an existing target-link) vs *updated* — undo re-INSERTs the
  // deleted ones and reverts the updated ones.
  const deletedRepoLinks: Array<{ source_id: string; repository_id: string }> = [];
  const updatedRepoLinks: string[] = []; // repository_ids whose source_id was repointed
  const deletedMediaLinks: Array<{
    id: string; media_id: string; link_type: number | null;
    sort_order: number; created_at: string;
  }> = [];
  const updatedMediaLinks: string[] = [];

  runSql(db, 'BEGIN IMMEDIATE');
  try {
    // 1. citations.source_id — straight repoint, no UNIQUE constraint.
    for (const c of citationsTouched) {
      runSql(db, 'UPDATE citations SET source_id = ? WHERE id = ?', [targetId, c.id]);
    }
    moved.citations = citationsTouched.length;

    // 2. source_repositories — PK is (source_id, repository_id). If the target
    // is already linked to the same repository, drop the source row instead of
    // attempting an UPDATE that would violate the PK.
    for (const sr of sourceRepoLinks) {
      const exists = queryOne<{ source_id: string }>(db,
        'SELECT source_id FROM source_repositories WHERE source_id = ? AND repository_id = ?',
        [targetId, sr.repository_id]);
      if (exists) {
        deletedRepoLinks.push({ source_id: sr.source_id, repository_id: sr.repository_id });
        runSql(db, 'DELETE FROM source_repositories WHERE source_id = ? AND repository_id = ?',
          [sr.source_id, sr.repository_id]);
      } else {
        runSql(db, 'UPDATE source_repositories SET source_id = ? WHERE source_id = ? AND repository_id = ?',
          [targetId, sr.source_id, sr.repository_id]);
        updatedRepoLinks.push(sr.repository_id);
      }
    }
    moved.source_repositories = updatedRepoLinks.length;

    // 3. media_links — no UNIQUE constraint at the SQL level today, but a
    // (media, source) pair appearing twice is meaningless. Mirror the dedupe.
    for (const ml of sourceMediaLinks) {
      const exists = queryOne<{ id: string }>(db,
        "SELECT id FROM media_links WHERE media_id = ? AND entity_type = 'source' AND entity_id = ?",
        [ml.media_id, targetId]);
      if (exists) {
        const full = queryOne<{
          id: string; media_id: string; link_type: number | null;
          sort_order: number; created_at: string;
        }>(db,
          'SELECT id, media_id, link_type, sort_order, created_at FROM media_links WHERE id = ?', [ml.id]);
        if (full) deletedMediaLinks.push(full);
        runSql(db, 'DELETE FROM media_links WHERE id = ?', [ml.id]);
      } else {
        runSql(db, 'UPDATE media_links SET entity_id = ? WHERE id = ?', [targetId, ml.id]);
        updatedMediaLinks.push(ml.id);
      }
    }
    moved.media_links = updatedMediaLinks.length;

    // 4. ignored_duplicates rows that mention the source — drop them.
    runSql(db,
      "DELETE FROM ignored_duplicates WHERE entity_type = 'source' AND (person1_id = ? OR person2_id = ?)",
      [sourceId, sourceId]
    );
    moved.ignored_duplicates = ignoredRows.length;

    // 5. Delete the source source-row.
    runSql(db, 'DELETE FROM sources WHERE id = ?', [sourceId]);

    runSql(db, 'COMMIT');
  } catch (err) {
    try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  // --- register undo ---
  // The closure captures the *snapshot*, never re-reads "current state".
  const sourceSnapshot: Source = source;
  undoManager.push({
    label: 'undo.mergeSources',
    undo: () => {
      runSql(db, 'BEGIN IMMEDIATE');
      try {
        // Recreate the source source-row exactly as it was.
        runSql(db, `
          INSERT INTO sources (id, title, author, publication_info, repository, url, source_type,
                               call_number, abstract, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sourceSnapshot.id, sourceSnapshot.title, sourceSnapshot.author,
          sourceSnapshot.publication_info, sourceSnapshot.repository, sourceSnapshot.url,
          sourceSnapshot.source_type, sourceSnapshot.call_number, sourceSnapshot.abstract,
          sourceSnapshot.created_at, sourceSnapshot.updated_at,
        ]);

        // Revert citations.source_id
        for (const c of citationsTouched) {
          runSql(db, 'UPDATE citations SET source_id = ? WHERE id = ?', [c.source_id, c.id]);
        }
        // Revert moved source_repositories rows
        for (const repoId of updatedRepoLinks) {
          runSql(db, 'UPDATE source_repositories SET source_id = ? WHERE source_id = ? AND repository_id = ?',
            [sourceSnapshot.id, targetId, repoId]);
        }
        // Re-insert deleted source_repositories duplicates
        for (const sr of deletedRepoLinks) {
          runSql(db, 'INSERT OR IGNORE INTO source_repositories (source_id, repository_id) VALUES (?, ?)',
            [sr.source_id, sr.repository_id]);
        }
        // Revert moved media_links
        for (const id of updatedMediaLinks) {
          runSql(db, 'UPDATE media_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Re-insert deleted media_links duplicates
        for (const ml of deletedMediaLinks) {
          runSql(db, `
            INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order, created_at)
            VALUES (?, ?, 'source', ?, ?, ?, ?)
          `, [ml.id, ml.media_id, sourceSnapshot.id, ml.link_type, ml.sort_order, ml.created_at]);
        }
        // Restore ignored_duplicates rows
        for (const ig of ignoredRows) {
          runSql(db,
            "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id, created_at) VALUES ('source', ?, ?, ?)",
            [ig.person1_id, ig.person2_id, ig.created_at]
          );
        }
        runSql(db, 'COMMIT');
      } catch (err) {
        try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
    },
    redo: () => { mergeSources(db, targetId, sourceId); },
  });

  return { moved };
}

/**
 * Hook called from `deleteSource`: clean up any `ignored_duplicates` rows
 * that mention the deleted source id. Mirrors `deleteIgnoredDuplicatesForPlace`.
 */
export function deleteIgnoredDuplicatesForSource(db: Database, sourceId: string): number {
  return runSqlChanges(db,
    "DELETE FROM ignored_duplicates WHERE entity_type = 'source' AND (person1_id = ? OR person2_id = ?)",
    [sourceId, sourceId]
  );
}

// ---------------------------------------------------------------------------
// Media duplicate find + merge
// ---------------------------------------------------------------------------

export interface DuplicateMediaCandidate {
  media1_id: string;
  media2_id: string;
  media1_title: string;
  media2_title: string;
  media1_file_ref: string | null;
  media2_file_ref: string | null;
  score: number; // 0-100 similarity ratio
  reasons: string[];
}

function mediaNormalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Find candidate duplicate media rows.
 *
 * Heuristic — two paths surface a candidate:
 *   1. Same `file_ref` (both non-null, exact string equality after trimming):
 *      score = 100, near-certain duplicate (same scan attached twice).
 *   2. Same normalised title (both non-empty) OR title within Levenshtein 2:
 *      score derived from string similarity, lower-confidence — typically two
 *      scans of the same record where the title was typed slightly differently
 *      ("Birth record - Petrus" vs "Petrus - Birth record" would NOT match
 *      under Levenshtein 2; "Photo 1942" vs "Photo 1942 " would).
 *
 * The pair-finder does NOT verify byte-equality of the underlying files —
 * that's a per-byte read which belongs in the compare-modal where the user
 * has chosen to look. The API surfaces candidates; the user picks.
 *
 * Pairs already recorded in `ignored_duplicates` (entity_type='media') are
 * skipped so the user's "ignore" choice persists across runs.
 *
 * The user-goal canary: a genealogist who imports the same scan twice ends
 * up with two `media` rows pointing at the same `file_ref` — this function
 * surfaces that pair at score 100 every time.
 */
export function findDuplicateMedia(
  db: Database,
  limit = 100,
  offset = 0,
): DuplicateMediaCandidate[] {
  const mediaRows = queryAll<{
    id: string;
    title: string;
    file_ref: string | null;
  }>(db, 'SELECT id, title, file_ref FROM media');

  const ignoredRows = queryAll<{ person1_id: string; person2_id: string }>(
    db, "SELECT person1_id, person2_id FROM ignored_duplicates WHERE entity_type = 'media'"
  );
  const ignored = new Set<string>(ignoredRows.map(r => `${r.person1_id}:${r.person2_id}`));

  const candidates: DuplicateMediaCandidate[] = [];
  const seen = new Set<string>();

  function addCandidate(
    a: { id: string; title: string; file_ref: string | null },
    b: { id: string; title: string; file_ref: string | null },
    score: number,
    reasons: string[],
  ) {
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const pairKey = `${low}:${high}`;
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    if (ignored.has(pairKey)) return;
    candidates.push({
      media1_id: a.id,
      media2_id: b.id,
      media1_title: a.title,
      media2_title: b.title,
      media1_file_ref: a.file_ref,
      media2_file_ref: b.file_ref,
      score,
      reasons,
    });
  }

  // Path 1: group by trimmed file_ref. Both sides must be non-null/non-empty;
  // a NULL file_ref is "no file at all" and pairing two NULLs is meaningless.
  const byFileRef = new Map<string, typeof mediaRows>();
  for (const m of mediaRows) {
    const key = (m.file_ref ?? '').trim();
    if (!key) continue;
    if (!byFileRef.has(key)) byFileRef.set(key, []);
    byFileRef.get(key)!.push(m);
  }
  for (const group of byFileRef.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addCandidate(group[i], group[j], 100, ['same_file_ref']);
      }
    }
  }

  // Path 2: title equality / near-equality. Skip rows with empty title (we
  // have nothing to compare on) and skip pairs already added by path 1.
  const titled = mediaRows.filter(m => mediaNormalize(m.title));
  for (let i = 0; i < titled.length; i++) {
    for (let j = i + 1; j < titled.length; j++) {
      const a = titled[i];
      const b = titled[j];
      const na = mediaNormalize(a.title);
      const nb = mediaNormalize(b.title);

      const reasons: string[] = [];
      let score: number;
      if (na === nb) {
        score = 99; // capped below 100 — only same_file_ref reaches 100
        reasons.push('same_normalized_title');
      } else {
        const dist = levenshtein(na, nb);
        if (dist > 2) continue;
        const maxLen = Math.max(na.length, nb.length);
        // Cap title-only matches below 100 so file-ref matches always sort first.
        score = Math.min(99, Math.max(0, Math.round((1 - dist / maxLen) * 100)));
        reasons.push(`levenshtein_${dist}`);
      }
      addCandidate(a, b, score, reasons);
    }
  }

  candidates.sort((x, y) => y.score - x.score);
  return candidates.slice(offset, offset + limit);
}

/** Total candidate count, used for the duplicates badge. */
export function countDuplicateMedia(db: Database): number {
  return findDuplicateMedia(db, Number.MAX_SAFE_INTEGER, 0).length;
}

/**
 * Mark a duplicate media pair as ignored. Idempotent.
 * Pair is stored canonically (lower id first).
 */
export function ignoreDuplicateMedia(db: Database, mediaAId: string, mediaBId: string): void {
  if (mediaAId === mediaBId) throw new Error('Cannot ignore a media against itself');
  const [p1, p2] = mediaAId < mediaBId ? [mediaAId, mediaBId] : [mediaBId, mediaAId];
  runSql(
    db,
    "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('media', ?, ?)",
    [p1, p2]
  );
}

/**
 * Resolve a media row's `file_ref` to an absolute path on disk, given the
 * database file path. Mirrors how the renderer resolves refs at read time:
 * relative refs are joined against `dirname(dbPath)`; absolute refs are
 * returned as-is (transient state — should be consolidated post-import).
 *
 * Returns null when file_ref is null/empty.
 */
function resolveFileRef(fileRef: string | null, dbPath: string): string | null {
  if (!fileRef) return null;
  if (path.isAbsolute(fileRef)) return fileRef;
  return path.resolve(path.dirname(dbPath), fileRef);
}

/**
 * Merge two media rows. The user has decided which file on disk to keep —
 * `keepFile` is mandatory and the function never picks for them.
 *
 * Behaviour:
 *   - `keepFile === 'target'` (UI shows target on the left, source on the right):
 *     the target row survives unchanged (its file_ref / title / notes / etc.
 *     stay put). The source row is deleted, and the source's file on disk is
 *     deleted IFF it differs from target's file_ref. (Same file_ref → no file
 *     to delete; the bytes on disk are still referenced by target.)
 *
 *   - `keepFile === 'source'`: the target row survives but its `file_ref`
 *     is rewritten to the source's value, then the target's PRIOR file is
 *     deleted IFF it differs from the source's file_ref. The source row is
 *     then deleted. Net effect: target's authored fields (title, notes,
 *     is_printable, format) are preserved; only file_ref is replaced.
 *     This is by design — the user picked "keep this file", not "keep this
 *     row entirely". Authored metadata on the survivor stays.
 *
 * Throws if `keepFile` is omitted or invalid — file-on-disk decisions
 * cannot be defaulted (Prime Directive: silently deleting a file is bad).
 *
 * Tables this function repoints (must match every FK to media.id in
 * src/api/schema.ts — see the FK self-check unit test):
 *   - media_links.media_id    (REFERENCES media(id) ON DELETE CASCADE)
 *   - media_regions.media_id  (REFERENCES media(id) ON DELETE CASCADE)
 *
 * Plus polymorphic ignored-duplicate rows that mention the source id so the
 * pair doesn't reappear pointing at a deleted id:
 *   - ignored_duplicates WHERE entity_type='media'
 *     AND (person1_id = source OR person2_id = source)
 *
 * Note: media_links.entity_type CHECK does NOT include 'media' — a media row
 * is never a host for another media row, so no polymorphic 'media' filter
 * is needed (mirroring sources, unlike places/persons).
 *
 * The undo closure captures every touched DB row pre-mutation AND the bytes
 * of the deleted file (read into a Buffer before deletion). Undo restores
 * the row, the link/region rows, the ignored_duplicates rows, AND writes
 * the file bytes back to their original path.
 */
export function mergeMedia(
  db: Database,
  targetId: string,
  sourceId: string,
  keepFile: 'target' | 'source',
  opts: { dbPath: string },
): { moved: Record<string, number> } {
  if (targetId === sourceId) throw new Error('Cannot merge a media with itself');
  if (keepFile !== 'target' && keepFile !== 'source') {
    throw new Error(`mergeMedia: keepFile must be 'target' or 'source', got ${JSON.stringify(keepFile)}`);
  }
  const target = queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [targetId]);
  const source = queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target media not found');
  if (!source) throw new Error('Source media not found');

  // --- snapshot pre-mutation state for undo ---
  const sourceMediaLinks = queryAll<{
    id: string; media_id: string; entity_type: string; entity_id: string;
    link_type: number | null; sort_order: number; created_at: string;
  }>(
    db, 'SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links WHERE media_id = ?',
    [sourceId]
  );
  const sourceMediaRegions = queryAll<{
    id: string; media_id: string; person_id: string | null;
    x: number; y: number; width: number; height: number; label: string | null; created_at: string;
  }>(
    db, 'SELECT id, media_id, person_id, x, y, width, height, label, created_at FROM media_regions WHERE media_id = ?',
    [sourceId]
  );
  const ignoredRows = queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
    db,
    "SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates WHERE entity_type = 'media' AND (person1_id = ? OR person2_id = ?)",
    [sourceId, sourceId]
  );

  // --- decide which file (if any) to delete on disk and snapshot its bytes ---
  // Both file_refs may be null; both may match. We delete a file only when:
  //   (a) the to-be-deleted row's file_ref is non-null/non-empty, AND
  //   (b) it is different from the survivor's file_ref (or the survivor has none).
  // Otherwise we'd be deleting the only copy of bytes the survivor still needs.
  const targetFileRef = (target.file_ref ?? '').trim() || null;
  const sourceFileRef = (source.file_ref ?? '').trim() || null;
  // The "survivor's file_ref AFTER the merge" depends on keepFile:
  //   keepFile='target' → survivor file_ref is target's existing value
  //   keepFile='source' → survivor file_ref is source's value (we rewrite target)
  const survivingFileRef = keepFile === 'target' ? targetFileRef : sourceFileRef;
  // The "doomed file_ref" — if non-null AND different from survivor, we delete.
  const doomedFileRef = keepFile === 'target' ? sourceFileRef : targetFileRef;

  let fileToDeleteAbs: string | null = null;
  let fileBytesSnapshot: Buffer | null = null;
  if (doomedFileRef && doomedFileRef !== survivingFileRef) {
    const abs = resolveFileRef(doomedFileRef, opts.dbPath);
    if (abs && fs.existsSync(abs)) {
      fileToDeleteAbs = abs;
      // Snapshot bytes BEFORE we touch the DB — a read failure aborts the merge
      // before any state changes.
      fileBytesSnapshot = fs.readFileSync(abs);
    }
  }

  // --- perform the merge inside an immediate transaction ---
  const moved: Record<string, number> = {};
  // Track which media_links / media_regions were *deleted* (because moving them
  // would have duplicated an existing target-link) vs *updated* — undo
  // re-INSERTs the deleted ones and reverts the updated ones.
  const deletedMediaLinks: typeof sourceMediaLinks = [];
  const updatedMediaLinks: string[] = [];
  // media_regions has no UNIQUE constraint, so all are straight repoints —
  // but track ids for symmetric undo.
  const updatedMediaRegions: string[] = [];

  // Snapshot target's current file_ref for undo when keepFile='source'.
  const targetFileRefBeforeMerge = target.file_ref;

  runSql(db, 'BEGIN IMMEDIATE');
  try {
    // 0. If keepFile='source', rewrite target's file_ref to source's value
    // BEFORE deleting source. The user chose to keep source's file; target's
    // authored title/notes/etc. stay put.
    if (keepFile === 'source') {
      runSql(db, 'UPDATE media SET file_ref = ? WHERE id = ?', [source.file_ref, targetId]);
    }

    // 1. media_links — repoint. media_links has no SQL UNIQUE constraint
    // covering (media_id, entity_type, entity_id), but a (target_media,
    // entity) pair appearing twice is meaningless. Mirror the dedupe pattern
    // from mergePlaces / mergeSources.
    for (const ml of sourceMediaLinks) {
      const exists = queryOne<{ id: string }>(db,
        'SELECT id FROM media_links WHERE media_id = ? AND entity_type = ? AND entity_id = ?',
        [targetId, ml.entity_type, ml.entity_id]);
      if (exists) {
        deletedMediaLinks.push(ml);
        runSql(db, 'DELETE FROM media_links WHERE id = ?', [ml.id]);
      } else {
        runSql(db, 'UPDATE media_links SET media_id = ? WHERE id = ?', [targetId, ml.id]);
        updatedMediaLinks.push(ml.id);
      }
    }
    moved.media_links = updatedMediaLinks.length;

    // 2. media_regions — repoint. No UNIQUE, no dedupe (a face tag is bound
    // to a coordinate box; collapsing them would lose authored geometry).
    for (const mr of sourceMediaRegions) {
      runSql(db, 'UPDATE media_regions SET media_id = ? WHERE id = ?', [targetId, mr.id]);
      updatedMediaRegions.push(mr.id);
    }
    moved.media_regions = updatedMediaRegions.length;

    // 3. ignored_duplicates rows that mention the source — drop them.
    runSql(db,
      "DELETE FROM ignored_duplicates WHERE entity_type = 'media' AND (person1_id = ? OR person2_id = ?)",
      [sourceId, sourceId]
    );
    moved.ignored_duplicates = ignoredRows.length;

    // 4. Delete the source media row. CASCADE handles any remaining FK-bound
    // child rows (defensively — by step 1 and 2 we've moved them all).
    runSql(db, 'DELETE FROM media WHERE id = ?', [sourceId]);

    runSql(db, 'COMMIT');
  } catch (err) {
    try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  // --- delete the file on disk ---
  // Only AFTER the DB transaction commits — if DB ops fail, the file stays.
  // The bytes are already in `fileBytesSnapshot`, so undo can restore them.
  if (fileToDeleteAbs) {
    try {
      fs.unlinkSync(fileToDeleteAbs);
      moved.file_deleted = 1;
    } catch (err) {
      // File deletion failure is non-fatal — the DB merge already succeeded.
      // The user can clean up the orphan manually. Surface it via moved counters.
      moved.file_delete_failed = 1;
      // eslint-disable-next-line no-console
      console.warn(`mergeMedia: failed to delete ${fileToDeleteAbs}: ${(err as Error).message}`);
    }
  }

  // --- register undo ---
  const sourceSnapshot: Media = source;
  const fileBytesForUndo = fileBytesSnapshot;
  const fileToRestoreAbs = fileToDeleteAbs;
  undoManager.push({
    label: 'undo.mergeMedia',
    undo: () => {
      runSql(db, 'BEGIN IMMEDIATE');
      try {
        // Recreate the source media row exactly as it was.
        runSql(db, `
          INSERT INTO media (id, file_ref, title, format, notes, is_printable, is_missing, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sourceSnapshot.id, sourceSnapshot.file_ref, sourceSnapshot.title,
          sourceSnapshot.format, sourceSnapshot.notes,
          sourceSnapshot.is_printable ? 1 : 0,
          sourceSnapshot.is_missing ? 1 : 0,
          sourceSnapshot.created_at,
        ]);

        // If we rewrote target.file_ref (keepFile='source'), revert it.
        if (keepFile === 'source') {
          runSql(db, 'UPDATE media SET file_ref = ? WHERE id = ?', [targetFileRefBeforeMerge, targetId]);
        }

        // Revert moved media_links
        for (const id of updatedMediaLinks) {
          runSql(db, 'UPDATE media_links SET media_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Re-insert deleted media_links duplicates
        for (const ml of deletedMediaLinks) {
          runSql(db, `
            INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [ml.id, sourceSnapshot.id, ml.entity_type, ml.entity_id, ml.link_type, ml.sort_order, ml.created_at]);
        }
        // Revert moved media_regions
        for (const id of updatedMediaRegions) {
          runSql(db, 'UPDATE media_regions SET media_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Restore ignored_duplicates rows
        for (const ig of ignoredRows) {
          runSql(db,
            "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id, created_at) VALUES ('media', ?, ?, ?)",
            [ig.person1_id, ig.person2_id, ig.created_at]
          );
        }
        runSql(db, 'COMMIT');
      } catch (err) {
        try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }

      // Restore the deleted file on disk, AFTER the DB undo commits.
      if (fileToRestoreAbs && fileBytesForUndo) {
        try {
          fs.mkdirSync(path.dirname(fileToRestoreAbs), { recursive: true });
          fs.writeFileSync(fileToRestoreAbs, fileBytesForUndo);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`mergeMedia undo: failed to restore ${fileToRestoreAbs}: ${(err as Error).message}`);
        }
      }
    },
    redo: () => { mergeMedia(db, targetId, sourceId, keepFile, opts); },
  });

  return { moved };
}

/**
 * Hook called from `deleteMedia`: clean up any `ignored_duplicates` rows
 * that mention the deleted media id. Mirrors `deleteIgnoredDuplicatesForPlace`.
 */
export function deleteIgnoredDuplicatesForMedia(db: Database, mediaId: string): number {
  return runSqlChanges(db,
    "DELETE FROM ignored_duplicates WHERE entity_type = 'media' AND (person1_id = ? OR person2_id = ?)",
    [mediaId, mediaId]
  );
}

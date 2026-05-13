import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runSql, runSqlChanges } from '../db';
import { undoManager } from '../undo';
import type { Place } from '../types';
import { levenshtein } from './shared';

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
export async function findDuplicatePlaces(
  db: Database,
  limit = 100,
  offset = 0,
): Promise<DuplicatePlaceCandidate[]> {
  const places = await queryAll<{
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

  const ignoredRows = await queryAll<{ person1_id: string; person2_id: string }>(
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
export async function countDuplicatePlaces(db: Database): Promise<number> {
  // Re-uses the find machinery without the limit slice; cheap enough for
  // typical DBs because the parent-grouping prunes the O(N²) pair space.
  return (await findDuplicatePlaces(db, Number.MAX_SAFE_INTEGER, 0)).length;
}

/**
 * Mark a duplicate place pair as ignored. Idempotent.
 *
 * Pair is stored canonically (lower id first) so insertion order doesn't
 * matter. The CHECK (person1_id < person2_id) constraint on ignored_duplicates
 * also enforces this; we sort defensively.
 */
export async function ignoreDuplicatePlace(db: Database, placeAId: string, placeBId: string): Promise<void> {
  if (placeAId === placeBId) throw new Error('Cannot ignore a place against itself');
  const [p1, p2] = placeAId < placeBId ? [placeAId, placeBId] : [placeBId, placeAId];
  await runSql(
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
export async function mergePlaces(
  db: Database,
  targetId: string,
  sourceId: string,
): Promise<{ moved: Record<string, number> }> {
  if (targetId === sourceId) throw new Error('Cannot merge a place with itself');
  const target = await queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [targetId]);
  const source = await queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target place not found');
  if (!source) throw new Error('Source place not found');

  // --- snapshot pre-mutation state for undo ---
  // Children that referenced the source via a non-polymorphic FK
  const eventsTouched = await queryAll<{ id: string; place_id: string | null }>(
    db, 'SELECT id, place_id FROM events WHERE place_id = ?', [sourceId]
  );
  const childPlacesTouched = await queryAll<{ id: string; parent_place_id: string | null }>(
    db, 'SELECT id, parent_place_id FROM places WHERE parent_place_id = ?', [sourceId]
  );
  const citationsTouched = await queryAll<{ id: string; place_id: string | null }>(
    db, 'SELECT id, place_id FROM citations WHERE place_id = ?', [sourceId]
  );
  // Polymorphic link rows where the source was the entity. We snapshot
  // every row that may be either updated to point at target OR deleted as a
  // duplicate of an existing target-link.
  const sourceGroupLinks = await queryAll<{ id: string; group_id: string }>(db,
    "SELECT id, group_id FROM group_links WHERE entity_type = 'place' AND entity_id = ?", [sourceId]);
  const sourceTaskLinks = await queryAll<{ id: string; task_id: string }>(db,
    "SELECT id, task_id FROM task_links WHERE entity_type = 'place' AND entity_id = ?", [sourceId]);
  const sourceMediaLinks = await queryAll<{ id: string; media_id: string }>(db,
    "SELECT id, media_id FROM media_links WHERE entity_type = 'place' AND entity_id = ?", [sourceId]);
  // Ignored-duplicate rows mentioning the source (any pair, since `place_id`
  // is stored in either column once canonically sorted — it can be person1_id
  // or person2_id depending on UUID order).
  const ignoredRows = await queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
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

  await runSql(db, 'BEGIN IMMEDIATE');
  try {
    // 1. events.place_id
    for (const e of eventsTouched) {
      await runSql(db, 'UPDATE events SET place_id = ? WHERE id = ?', [targetId, e.id]);
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
      await runSql(db, 'UPDATE places SET parent_place_id = ? WHERE id = ?', [targetId, cp.id]);
    }
    moved.child_places = childPlacesTouched.filter(cp => cp.id !== targetId).length;

    // 3. citations.place_id
    for (const c of citationsTouched) {
      await runSql(db, 'UPDATE citations SET place_id = ? WHERE id = ?', [targetId, c.id]);
    }
    moved.citations = citationsTouched.length;

    // 4. group_links — UNIQUE(group_id, entity_type, entity_id) means we
    // must skip when target already in same group.
    for (const gl of sourceGroupLinks) {
      const exists = await queryOne<{ id: string; sort_order: number; created_at: string }>(db,
        "SELECT id, sort_order, created_at FROM group_links WHERE group_id = ? AND entity_type = 'place' AND entity_id = ?",
        [gl.group_id, targetId]);
      if (exists) {
        const full = await queryOne<{ id: string; group_id: string; sort_order: number; created_at: string }>(db,
          'SELECT id, group_id, sort_order, created_at FROM group_links WHERE id = ?', [gl.id]);
        if (full) deletedGroupLinks.push(full);
        await runSql(db, 'DELETE FROM group_links WHERE id = ?', [gl.id]);
      } else {
        await runSql(db, 'UPDATE group_links SET entity_id = ? WHERE id = ?', [targetId, gl.id]);
        updatedGroupLinks.push(gl.id);
      }
    }
    moved.group_links = updatedGroupLinks.length;

    // 5. task_links — same pattern
    for (const tl of sourceTaskLinks) {
      const exists = await queryOne<{ id: string }>(db,
        "SELECT id FROM task_links WHERE task_id = ? AND entity_type = 'place' AND entity_id = ?",
        [tl.task_id, targetId]);
      if (exists) {
        const full = await queryOne<{ id: string; task_id: string; sort_order: number; created_at: string }>(db,
          'SELECT id, task_id, sort_order, created_at FROM task_links WHERE id = ?', [tl.id]);
        if (full) deletedTaskLinks.push(full);
        await runSql(db, 'DELETE FROM task_links WHERE id = ?', [tl.id]);
      } else {
        await runSql(db, 'UPDATE task_links SET entity_id = ? WHERE id = ?', [targetId, tl.id]);
        updatedTaskLinks.push(tl.id);
      }
    }
    moved.task_links = updatedTaskLinks.length;

    // 6. media_links — no UNIQUE constraint at the SQL level today, but a
    // (media, place) pair appearing twice is meaningless. Mirror the dedupe.
    for (const ml of sourceMediaLinks) {
      const exists = await queryOne<{ id: string }>(db,
        "SELECT id FROM media_links WHERE media_id = ? AND entity_type = 'place' AND entity_id = ?",
        [ml.media_id, targetId]);
      if (exists) {
        const full = await queryOne<{
          id: string; media_id: string; link_type: number | null;
          sort_order: number; created_at: string;
        }>(db,
          'SELECT id, media_id, link_type, sort_order, created_at FROM media_links WHERE id = ?', [ml.id]);
        if (full) deletedMediaLinks.push(full);
        await runSql(db, 'DELETE FROM media_links WHERE id = ?', [ml.id]);
      } else {
        await runSql(db, 'UPDATE media_links SET entity_id = ? WHERE id = ?', [targetId, ml.id]);
        updatedMediaLinks.push(ml.id);
      }
    }
    moved.media_links = updatedMediaLinks.length;

    // 7. ignored_duplicates rows that mention the source — drop them so the
    // pair doesn't reappear pointing at a deleted id. Snapshot taken above.
    await runSql(db,
      "DELETE FROM ignored_duplicates WHERE entity_type = 'place' AND (person1_id = ? OR person2_id = ?)",
      [sourceId, sourceId]
    );
    moved.ignored_duplicates = ignoredRows.length;

    // 8. Delete the source place
    await runSql(db, 'DELETE FROM places WHERE id = ?', [sourceId]);

    await runSql(db, 'COMMIT');
  } catch (err) {
    try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  // --- register undo ---
  // The closure captures the *snapshot*, never re-reads "current state".
  const sourceSnapshot: Place = source;
  undoManager.push({
    label: 'undo.mergePlaces',
    undo: async () => {
      await runSql(db, 'BEGIN IMMEDIATE');
      try {
        // Recreate the source place row exactly as it was.
        await runSql(db, `
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
          await runSql(db, 'UPDATE events SET place_id = ? WHERE id = ?', [e.place_id, e.id]);
        }
        // Revert places.parent_place_id
        for (const cp of childPlacesTouched) {
          if (cp.id === sourceSnapshot.id) continue; // wouldn't have been moved
          await runSql(db, 'UPDATE places SET parent_place_id = ? WHERE id = ?', [cp.parent_place_id, cp.id]);
        }
        // Revert citations.place_id
        for (const c of citationsTouched) {
          await runSql(db, 'UPDATE citations SET place_id = ? WHERE id = ?', [c.place_id, c.id]);
        }
        // Revert moved group_links
        for (const id of updatedGroupLinks) {
          await runSql(db, 'UPDATE group_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Re-insert deleted group_links (the duplicates we collapsed)
        for (const gl of deletedGroupLinks) {
          await runSql(db, `
            INSERT INTO group_links (id, group_id, entity_type, entity_id, sort_order, created_at)
            VALUES (?, ?, 'place', ?, ?, ?)
          `, [gl.id, gl.group_id, sourceSnapshot.id, gl.sort_order, gl.created_at]);
        }
        // Revert moved task_links
        for (const id of updatedTaskLinks) {
          await runSql(db, 'UPDATE task_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        for (const tl of deletedTaskLinks) {
          await runSql(db, `
            INSERT INTO task_links (id, task_id, entity_type, entity_id, sort_order, created_at)
            VALUES (?, ?, 'place', ?, ?, ?)
          `, [tl.id, tl.task_id, sourceSnapshot.id, tl.sort_order, tl.created_at]);
        }
        // Revert moved media_links
        for (const id of updatedMediaLinks) {
          await runSql(db, 'UPDATE media_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        for (const ml of deletedMediaLinks) {
          await runSql(db, `
            INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order, created_at)
            VALUES (?, ?, 'place', ?, ?, ?, ?)
          `, [ml.id, ml.media_id, sourceSnapshot.id, ml.link_type, ml.sort_order, ml.created_at]);
        }
        // Restore ignored_duplicates rows
        for (const ig of ignoredRows) {
          await runSql(db,
            "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id, created_at) VALUES ('place', ?, ?, ?)",
            [ig.person1_id, ig.person2_id, ig.created_at]
          );
        }
        await runSql(db, 'COMMIT');
      } catch (err) {
        try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
    },
    redo: async () => { await mergePlaces(db, targetId, sourceId); },
  });

  return { moved };
}

/**
 * Hook called from `deletePlace`: clean up any `ignored_duplicates` rows
 * that mention the deleted place id. Mirrors the polymorphic cleanup pattern
 * used by `deletePerson` so a tombstoned id doesn't keep an "ignored" pair
 * stuck in the DB forever.
 */
export async function deleteIgnoredDuplicatesForPlace(db: Database, placeId: string): Promise<number> {
  return await runSqlChanges(db,
    "DELETE FROM ignored_duplicates WHERE entity_type = 'place' AND (person1_id = ? OR person2_id = ?)",
    [placeId, placeId]
  );
}

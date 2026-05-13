import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runSql, runSqlChanges } from '../db';
import { undoManager } from '../undo';
import type { Source } from '../types';
import { levenshtein } from './shared';

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
export async function findDuplicateSources(
  db: Database,
  limit = 100,
  offset = 0,
): Promise<DuplicateSourceCandidate[]> {
  const sources = await queryAll<{
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

  const ignoredRows = await queryAll<{ person1_id: string; person2_id: string }>(
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
export async function countDuplicateSources(db: Database): Promise<number> {
  // Re-uses the find machinery without the limit slice; cheap enough for
  // typical DBs because the author-grouping prunes the O(N²) pair space.
  return (await findDuplicateSources(db, Number.MAX_SAFE_INTEGER, 0)).length;
}

/**
 * Mark a duplicate source pair as ignored. Idempotent.
 *
 * Pair is stored canonically (lower id first) so insertion order doesn't
 * matter. The CHECK (person1_id < person2_id) constraint on ignored_duplicates
 * also enforces this; we sort defensively.
 */
export async function ignoreDuplicateSource(db: Database, sourceAId: string, sourceBId: string): Promise<void> {
  if (sourceAId === sourceBId) throw new Error('Cannot ignore a source against itself');
  const [p1, p2] = sourceAId < sourceBId ? [sourceAId, sourceBId] : [sourceBId, sourceAId];
  await runSql(
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
export async function mergeSources(
  db: Database,
  targetId: string,
  sourceId: string,
): Promise<{ moved: Record<string, number> }> {
  if (targetId === sourceId) throw new Error('Cannot merge a source with itself');
  const target = await queryOne<Source>(db, 'SELECT * FROM sources WHERE id = ?', [targetId]);
  const source = await queryOne<Source>(db, 'SELECT * FROM sources WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target source not found');
  if (!source) throw new Error('Source source not found');

  // --- snapshot pre-mutation state for undo ---
  const citationsTouched = await queryAll<{ id: string; source_id: string }>(
    db, 'SELECT id, source_id FROM citations WHERE source_id = ?', [sourceId]
  );
  // source_repositories has composite PK (source_id, repository_id) — snapshot
  // both (source_id, repository_id) tuples so undo can re-insert the deleted
  // join rows verbatim.
  const sourceRepoLinks = await queryAll<{ source_id: string; repository_id: string }>(
    db, 'SELECT source_id, repository_id FROM source_repositories WHERE source_id = ?', [sourceId]
  );
  const sourceMediaLinks = await queryAll<{ id: string; media_id: string }>(db,
    "SELECT id, media_id FROM media_links WHERE entity_type = 'source' AND entity_id = ?", [sourceId]);
  const ignoredRows = await queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
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

  await runSql(db, 'BEGIN IMMEDIATE');
  try {
    // 1. citations.source_id — straight repoint, no UNIQUE constraint.
    for (const c of citationsTouched) {
      await runSql(db, 'UPDATE citations SET source_id = ? WHERE id = ?', [targetId, c.id]);
    }
    moved.citations = citationsTouched.length;

    // 2. source_repositories — PK is (source_id, repository_id). If the target
    // is already linked to the same repository, drop the source row instead of
    // attempting an UPDATE that would violate the PK.
    for (const sr of sourceRepoLinks) {
      const exists = await queryOne<{ source_id: string }>(db,
        'SELECT source_id FROM source_repositories WHERE source_id = ? AND repository_id = ?',
        [targetId, sr.repository_id]);
      if (exists) {
        deletedRepoLinks.push({ source_id: sr.source_id, repository_id: sr.repository_id });
        await runSql(db, 'DELETE FROM source_repositories WHERE source_id = ? AND repository_id = ?',
          [sr.source_id, sr.repository_id]);
      } else {
        await runSql(db, 'UPDATE source_repositories SET source_id = ? WHERE source_id = ? AND repository_id = ?',
          [targetId, sr.source_id, sr.repository_id]);
        updatedRepoLinks.push(sr.repository_id);
      }
    }
    moved.source_repositories = updatedRepoLinks.length;

    // 3. media_links — no UNIQUE constraint at the SQL level today, but a
    // (media, source) pair appearing twice is meaningless. Mirror the dedupe.
    for (const ml of sourceMediaLinks) {
      const exists = await queryOne<{ id: string }>(db,
        "SELECT id FROM media_links WHERE media_id = ? AND entity_type = 'source' AND entity_id = ?",
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

    // 4. ignored_duplicates rows that mention the source — drop them.
    await runSql(db,
      "DELETE FROM ignored_duplicates WHERE entity_type = 'source' AND (person1_id = ? OR person2_id = ?)",
      [sourceId, sourceId]
    );
    moved.ignored_duplicates = ignoredRows.length;

    // 5. Delete the source source-row.
    await runSql(db, 'DELETE FROM sources WHERE id = ?', [sourceId]);

    await runSql(db, 'COMMIT');
  } catch (err) {
    try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  // --- register undo ---
  // The closure captures the *snapshot*, never re-reads "current state".
  const sourceSnapshot: Source = source;
  undoManager.push({
    label: 'undo.mergeSources',
    undo: async () => {
      await runSql(db, 'BEGIN IMMEDIATE');
      try {
        // Recreate the source source-row exactly as it was.
        await runSql(db, `
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
          await runSql(db, 'UPDATE citations SET source_id = ? WHERE id = ?', [c.source_id, c.id]);
        }
        // Revert moved source_repositories rows
        for (const repoId of updatedRepoLinks) {
          await runSql(db, 'UPDATE source_repositories SET source_id = ? WHERE source_id = ? AND repository_id = ?',
            [sourceSnapshot.id, targetId, repoId]);
        }
        // Re-insert deleted source_repositories duplicates
        for (const sr of deletedRepoLinks) {
          await runSql(db, 'INSERT OR IGNORE INTO source_repositories (source_id, repository_id) VALUES (?, ?)',
            [sr.source_id, sr.repository_id]);
        }
        // Revert moved media_links
        for (const id of updatedMediaLinks) {
          await runSql(db, 'UPDATE media_links SET entity_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Re-insert deleted media_links duplicates
        for (const ml of deletedMediaLinks) {
          await runSql(db, `
            INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order, created_at)
            VALUES (?, ?, 'source', ?, ?, ?, ?)
          `, [ml.id, ml.media_id, sourceSnapshot.id, ml.link_type, ml.sort_order, ml.created_at]);
        }
        // Restore ignored_duplicates rows
        for (const ig of ignoredRows) {
          await runSql(db,
            "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id, created_at) VALUES ('source', ?, ?, ?)",
            [ig.person1_id, ig.person2_id, ig.created_at]
          );
        }
        await runSql(db, 'COMMIT');
      } catch (err) {
        try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
    },
    redo: async () => { await mergeSources(db, targetId, sourceId); },
  });

  return { moved };
}

/**
 * Hook called from `deleteSource`: clean up any `ignored_duplicates` rows
 * that mention the deleted source id. Mirrors `deleteIgnoredDuplicatesForPlace`.
 */
export async function deleteIgnoredDuplicatesForSource(db: Database, sourceId: string): Promise<number> {
  return await runSqlChanges(db,
    "DELETE FROM ignored_duplicates WHERE entity_type = 'source' AND (person1_id = ? OR person2_id = ?)",
    [sourceId, sourceId]
  );
}

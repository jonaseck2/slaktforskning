import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runSql, runSqlChanges } from './db';
import { undoManager } from './undo';
import type { Media } from './types';
import { levenshtein } from './duplicates/shared';

// Person dedup lives in src/api/duplicates/persons.ts.
export {
  type DuplicateCandidate,
  findDuplicates,
  findDuplicatesPage,
  countDuplicates,
  ignoreDuplicate,
  mergePersons,
} from './duplicates/persons';

// Place dedup lives in src/api/duplicates/places.ts.
export {
  type DuplicatePlaceCandidate,
  findDuplicatePlaces,
  countDuplicatePlaces,
  ignoreDuplicatePlace,
  mergePlaces,
  deleteIgnoredDuplicatesForPlace,
} from './duplicates/places';

// Source dedup lives in src/api/duplicates/sources.ts.
export {
  type DuplicateSourceCandidate,
  findDuplicateSources,
  countDuplicateSources,
  ignoreDuplicateSource,
  mergeSources,
  deleteIgnoredDuplicatesForSource,
} from './duplicates/sources';

// Shared dedup helpers (Levenshtein etc.) live in src/api/duplicates/shared.ts.
export { levenshtein } from './duplicates/shared';


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
export async function findDuplicateMedia(
  db: Database,
  limit = 100,
  offset = 0,
): Promise<DuplicateMediaCandidate[]> {
  const mediaRows = await queryAll<{
    id: string;
    title: string;
    file_ref: string | null;
  }>(db, 'SELECT id, title, file_ref FROM media');

  const ignoredRows = await queryAll<{ person1_id: string; person2_id: string }>(
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
export async function countDuplicateMedia(db: Database): Promise<number> {
  return (await findDuplicateMedia(db, Number.MAX_SAFE_INTEGER, 0)).length;
}

/**
 * Mark a duplicate media pair as ignored. Idempotent.
 * Pair is stored canonically (lower id first).
 */
export async function ignoreDuplicateMedia(db: Database, mediaAId: string, mediaBId: string): Promise<void> {
  if (mediaAId === mediaBId) throw new Error('Cannot ignore a media against itself');
  const [p1, p2] = mediaAId < mediaBId ? [mediaAId, mediaBId] : [mediaBId, mediaAId];
  await runSql(
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
export async function mergeMedia(
  db: Database,
  targetId: string,
  sourceId: string,
  keepFile: 'target' | 'source',
  opts: { dbPath: string },
): Promise<{ moved: Record<string, number> }> {
  if (targetId === sourceId) throw new Error('Cannot merge a media with itself');
  if (keepFile !== 'target' && keepFile !== 'source') {
    throw new Error(`mergeMedia: keepFile must be 'target' or 'source', got ${JSON.stringify(keepFile)}`);
  }
  const target = await queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [targetId]);
  const source = await queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [sourceId]);
  if (!target) throw new Error('Target media not found');
  if (!source) throw new Error('Source media not found');

  // --- snapshot pre-mutation state for undo ---
  const sourceMediaLinks = await queryAll<{
    id: string; media_id: string; entity_type: string; entity_id: string;
    link_type: number | null; sort_order: number; created_at: string;
  }>(
    db, 'SELECT id, media_id, entity_type, entity_id, link_type, sort_order, created_at FROM media_links WHERE media_id = ?',
    [sourceId]
  );
  const sourceMediaRegions = await queryAll<{
    id: string; media_id: string; person_id: string | null;
    x: number; y: number; width: number; height: number; label: string | null; created_at: string;
  }>(
    db, 'SELECT id, media_id, person_id, x, y, width, height, label, created_at FROM media_regions WHERE media_id = ?',
    [sourceId]
  );
  const ignoredRows = await queryAll<{ entity_type: string; person1_id: string; person2_id: string; created_at: string }>(
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

  await runSql(db, 'BEGIN IMMEDIATE');
  try {
    // 0. If keepFile='source', rewrite target's file_ref to source's value
    // BEFORE deleting source. The user chose to keep source's file; target's
    // authored title/notes/etc. stay put.
    if (keepFile === 'source') {
      await runSql(db, 'UPDATE media SET file_ref = ? WHERE id = ?', [source.file_ref, targetId]);
    }

    // 1. media_links — repoint. media_links has no SQL UNIQUE constraint
    // covering (media_id, entity_type, entity_id), but a (target_media,
    // entity) pair appearing twice is meaningless. Mirror the dedupe pattern
    // from mergePlaces / mergeSources.
    for (const ml of sourceMediaLinks) {
      const exists = await queryOne<{ id: string }>(db,
        'SELECT id FROM media_links WHERE media_id = ? AND entity_type = ? AND entity_id = ?',
        [targetId, ml.entity_type, ml.entity_id]);
      if (exists) {
        deletedMediaLinks.push(ml);
        await runSql(db, 'DELETE FROM media_links WHERE id = ?', [ml.id]);
      } else {
        await runSql(db, 'UPDATE media_links SET media_id = ? WHERE id = ?', [targetId, ml.id]);
        updatedMediaLinks.push(ml.id);
      }
    }
    moved.media_links = updatedMediaLinks.length;

    // 2. media_regions — repoint. No UNIQUE, no dedupe (a face tag is bound
    // to a coordinate box; collapsing them would lose authored geometry).
    for (const mr of sourceMediaRegions) {
      await runSql(db, 'UPDATE media_regions SET media_id = ? WHERE id = ?', [targetId, mr.id]);
      updatedMediaRegions.push(mr.id);
    }
    moved.media_regions = updatedMediaRegions.length;

    // 3. ignored_duplicates rows that mention the source — drop them.
    await runSql(db,
      "DELETE FROM ignored_duplicates WHERE entity_type = 'media' AND (person1_id = ? OR person2_id = ?)",
      [sourceId, sourceId]
    );
    moved.ignored_duplicates = ignoredRows.length;

    // 4. Delete the source media row. CASCADE handles any remaining FK-bound
    // child rows (defensively — by step 1 and 2 we've moved them all).
    await runSql(db, 'DELETE FROM media WHERE id = ?', [sourceId]);

    await runSql(db, 'COMMIT');
  } catch (err) {
    try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
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
    undo: async () => {
      await runSql(db, 'BEGIN IMMEDIATE');
      try {
        // Recreate the source media row exactly as it was.
        await runSql(db, `
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
          await runSql(db, 'UPDATE media SET file_ref = ? WHERE id = ?', [targetFileRefBeforeMerge, targetId]);
        }

        // Revert moved media_links
        for (const id of updatedMediaLinks) {
          await runSql(db, 'UPDATE media_links SET media_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Re-insert deleted media_links duplicates
        for (const ml of deletedMediaLinks) {
          await runSql(db, `
            INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [ml.id, sourceSnapshot.id, ml.entity_type, ml.entity_id, ml.link_type, ml.sort_order, ml.created_at]);
        }
        // Revert moved media_regions
        for (const id of updatedMediaRegions) {
          await runSql(db, 'UPDATE media_regions SET media_id = ? WHERE id = ?', [sourceSnapshot.id, id]);
        }
        // Restore ignored_duplicates rows
        for (const ig of ignoredRows) {
          await runSql(db,
            "INSERT OR IGNORE INTO ignored_duplicates (entity_type, person1_id, person2_id, created_at) VALUES ('media', ?, ?, ?)",
            [ig.person1_id, ig.person2_id, ig.created_at]
          );
        }
        await runSql(db, 'COMMIT');
      } catch (err) {
        try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
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
    redo: async () => { await mergeMedia(db, targetId, sourceId, keepFile, opts); },
  });

  return { moved };
}

/**
 * Hook called from `deleteMedia`: clean up any `ignored_duplicates` rows
 * that mention the deleted media id. Mirrors `deleteIgnoredDuplicatesForPlace`.
 */
export async function deleteIgnoredDuplicatesForMedia(db: Database, mediaId: string): Promise<number> {
  return await runSqlChanges(db,
    "DELETE FROM ignored_duplicates WHERE entity_type = 'media' AND (person1_id = ? OR person2_id = ?)",
    [mediaId, mediaId]
  );
}

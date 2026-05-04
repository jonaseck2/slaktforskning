import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { getMediaDir, getMediaFolderName } from './media';

export interface ConsolidateResult {
  /** Files copied + ref rewritten (or already at dest with same name — counted as copied) */
  copied: number;
  /** Refs left untouched (null, relative-already, etc.) */
  skipped: number;
  /** Source path didn't exist on disk */
  missing: number;
}

/** Concurrency for parallel file copies. Saturates libuv's default UV_THREADPOOL_SIZE. */
const COPY_CONCURRENCY = 8;

/**
 * Bulk-copy a source media folder tree into the database's `<dbname>-media/`
 * folder up-front, before any per-row consolidation. Uses `fsp.cp` recursive,
 * which dispatches the entire walk + copy through libuv — much faster than
 * 12k sequential `copyFile` calls.
 *
 * Idempotent — `force: false` keeps existing dest files. Safe to call before
 * `consolidateMediaFolder`, which fast-paths any file already at dest.
 */
export async function bulkCopyMediaFolder(srcDir: string, destDir: string): Promise<{ ms: number }> {
  const t = Date.now();
  await fsp.mkdir(destDir, { recursive: true });
  await fsp.cp(srcDir, destDir, { recursive: true, force: false, errorOnExist: false });
  return { ms: Date.now() - t };
}

/**
 * Walk all media rows; for any `file_ref` that is an absolute path, copy the
 * file into `<dbname>-media/` and rewrite the row to the relative form.
 *
 * One `fsp.copyFile(..., COPYFILE_EXCL)` per row — no separate stat/exists
 * checks. The kernel atomically handles "dest already exists" (EEXIST) and
 * "source missing" (ENOENT). Each copy round-trips to libuv's threadpool;
 * a small worker pool saturates that pool so wall time scales with disk
 * bandwidth, not awaits-per-file.
 *
 * Idempotent: re-running on a populated `<dbname>-media/` is safe — EEXIST
 * is treated as "already there, keep going." Same-basename collisions across
 * different sources keep the first-written file (acceptable for genealogy
 * imports where source folders namespace by ID).
 */
export async function consolidateMediaFolder(db: Database, dbPath: string): Promise<ConsolidateResult> {
  const result: ConsolidateResult = { copied: 0, skipped: 0, missing: 0 };
  const folderName = getMediaFolderName(dbPath);
  const mediaDir = getMediaDir(dbPath);

  const rows = db.all('SELECT id, file_ref FROM media') as Array<{ id: string; file_ref: string | null }>;
  console.log(`[import-timing]   consolidateMediaFolder: ${rows.length} media rows to walk, dest=${mediaDir}, concurrency=${COPY_CONCURRENCY}`);
  if (rows.length === 0) return result;

  // Eagerly create the dest folder once (no per-row guard needed).
  await fsp.mkdir(mediaDir, { recursive: true });

  // Snapshot dest folder contents once. If the bulk-copy step ran first, every
  // file is already here and the per-row loop never has to call `copyFile` —
  // it just rewrites the DB ref. Recursive scan because bulk-copy preserves
  // subfolders (e.g. Holger's P12/photo.jpg).
  const existingDestFiles = new Set<string>();
  async function indexDestRecursive(dir: string): Promise<void> {
    let entries: import('fs').Dirent[];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await indexDestRecursive(full);
      else existingDestFiles.add(e.name);
    }
  }
  await indexDestRecursive(mediaDir);
  console.log(`[import-timing]   consolidateMediaFolder: ${existingDestFiles.size} files already in dest folder (fast-path candidates)`);

  // Single transaction over all the file_ref rewrites. Without this, each
  // update.run() is its own autocommit → its own WAL fsync (~1–5 ms on APFS),
  // turning 12k rewrites into 30+ seconds. With it, the whole consolidate's
  // DB work commits in a single fsync. BEGIN IMMEDIATE acquires the write
  // lock upfront so we don't race a worker-thread reader for the upgrade.
  // Holding a long transaction is fine in WAL mode — readers continue.
  db.prepare('BEGIN IMMEDIATE').run([]);
  let committed = false;

  const update = db.prepare('UPDATE media SET file_ref = ? WHERE id = ?');
  let processed = 0;
  let fastPathHits = 0;
  let slowPathCopies = 0;
  const tStart = Date.now();

  async function processRow(row: { id: string; file_ref: string | null }): Promise<void> {
    const ref = row.file_ref;
    if (!ref) { result.skipped++; return; }
    if (!path.isAbsolute(ref)) { result.skipped++; return; }

    const filename = path.basename(ref);

    // Fast path: bulk-copy already put the file in dest. Skip the syscall
    // entirely, just rewrite the ref. Per-row cost: one Set lookup + one DB
    // update — completes in microseconds when batched in a transaction.
    if (existingDestFiles.has(filename)) {
      update.run([path.join(folderName, filename), row.id]);
      fastPathHits++;
      result.copied++;
      return;
    }

    // Slow path: source is outside the bulk-copied tree (or no bulk copy ran).
    // Single COPYFILE_EXCL — kernel handles "dest exists" / "source missing"
    // atomically without a separate stat round-trip.
    const dest = path.join(mediaDir, filename);
    try {
      await fsp.copyFile(ref, dest, fs.constants.COPYFILE_EXCL);
      slowPathCopies++;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        // Dest already present — keep it, still rewrite the ref to relative.
      } else if (code === 'ENOENT') {
        // Source path doesn't exist on disk — leave the row's absolute ref
        // alone so the missing-file diagnostic still points at where it
        // tried to look.
        result.missing++;
        return;
      } else {
        throw err;
      }
    }
    update.run([path.join(folderName, filename), row.id]);
    result.copied++;
  }

  // Bounded-concurrency worker pool — each worker pulls the next index off a
  // shared cursor until the queue is drained.
  let cursor = 0;
  async function worker(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      await processRow(rows[i]);
      processed++;
      if (processed % 1000 === 0) {
        const elapsed = Date.now() - tStart;
        const rate = processed / (elapsed / 1000);
        console.log(`[import-timing]     consolidate progress: ${processed}/${rows.length} (fastPath=${fastPathHits} copied=${slowPathCopies} skipped=${result.skipped} missing=${result.missing}) — ${elapsed}ms — ${rate.toFixed(0)} rows/s`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: COPY_CONCURRENCY }, () => worker()));
    db.prepare('COMMIT').run([]);
    committed = true;
  } finally {
    update.finalize();
    if (!committed) {
      try { db.prepare('ROLLBACK').run([]); } catch { /* ignore */ }
    }
  }
  const elapsed = Date.now() - tStart;
  const rate = processed / (elapsed / 1000);
  console.log(`[import-timing]   consolidateMediaFolder finished: fastPath=${fastPathHits} slowCopied=${slowPathCopies} skipped=${result.skipped} missing=${result.missing} in ${elapsed}ms (${rate.toFixed(0)} rows/s)`);
  return result;
}

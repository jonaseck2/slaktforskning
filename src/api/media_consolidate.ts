import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { Database } from 'node-sqlite3-wasm';
import { getMediaDir, getMediaFolderName } from './media';
import { runSql, runBatchOnStatement } from './db';

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
 * Two paths:
 *  - **Fast path (bulk-copy already ran for the row's source dir):** the file
 *    has the same relative position under `<dbname>-media/` that it had under
 *    the source media dir. We compute that relative path, verify it's in the
 *    pre-walked `existingDestFiles` set, and rewrite the DB ref. No syscall.
 *    Posix subdirs from the source (e.g. Holger's `P12/photo.jpg`) are
 *    preserved — both in the on-disk layout AND in the DB ref. Without this,
 *    the recursive `fsp.cp` would create nested files but the consolidate
 *    would write `photo.jpg` (basename only) to the DB, leaving the row
 *    pointing at a non-existent flat path while the actual file sat at
 *    `P12/photo.jpg`. (See: bengt-media import session, 2026-05-04.)
 *  - **Slow path (no bulk copy, or file outside the bulk-copied tree):** one
 *    `fsp.copyFile(..., COPYFILE_EXCL)` per row. The kernel atomically handles
 *    "dest already exists" (EEXIST) and "source missing" (ENOENT). Same-
 *    basename collisions across different sources keep the first-written file
 *    (acceptable for genealogy imports where source folders namespace by ID).
 *
 * `bulkCopiedFromDir` (optional): the source media dir that was just
 * `bulkCopyMediaFolder`'d into `<dbname>-media/`. Pass it from any import
 * handler that called bulk copy — without it, every row falls through to the
 * slow path (one syscall each), which is correct but ~10× slower for large
 * imports.
 *
 * A `BEGIN IMMEDIATE / COMMIT` wraps every `update.run`; without it each
 * `UPDATE media SET file_ref = ?` is its own autocommit → its own WAL fsync
 * (~1–5 ms on APFS), turning 12k rewrites into 30+ seconds.
 */
export async function consolidateMediaFolder(
  db: Database,
  dbPath: string,
  bulkCopiedFromDir?: string,
): Promise<ConsolidateResult> {
  const result: ConsolidateResult = { copied: 0, skipped: 0, missing: 0 };
  const folderName = getMediaFolderName(dbPath);
  const mediaDir = getMediaDir(dbPath);

  const rows = await db.all('SELECT id, file_ref FROM media') as Array<{ id: string; file_ref: string | null }>;
  console.log(`[import-timing]   consolidateMediaFolder: ${rows.length} media rows to walk, dest=${mediaDir}, bulkCopiedFromDir=${bulkCopiedFromDir ?? '(none)'}, concurrency=${COPY_CONCURRENCY}`);
  if (rows.length === 0) return result;

  // Eagerly create the dest folder once (no per-row guard needed).
  await fsp.mkdir(mediaDir, { recursive: true });

  // Snapshot dest folder contents once, indexed by RELATIVE path (e.g.
  // `P12/photo.jpg`). The fast path checks this set before rewriting the DB
  // ref, so a file that wasn't actually bulk-copied (source missing in the
  // user's wetransfer bundle, etc.) falls through to the slow path's ENOENT
  // accounting instead of silently writing a broken ref.
  const existingDestRelPaths = new Set<string>();
  async function indexDestRecursive(dir: string, prefix = ''): Promise<void> {
    let entries: import('fs').Dirent[];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch (err) {
      // Missing dir just means no fast-path candidates (slow path re-copies,
      // idempotent). Anything else (EACCES, ENOTDIR) is worth a trace —
      // the consolidate still succeeds via the slow path, but silently
      // degraded indexing has masked permission problems before.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(`[media-consolidate] could not index dest folder ${dir}: ${String(err)}`);
      }
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = prefix ? path.join(prefix, e.name) : e.name;
      if (e.isDirectory()) await indexDestRecursive(full, rel);
      else existingDestRelPaths.add(rel);
    }
  }
  await indexDestRecursive(mediaDir);
  console.log(`[import-timing]   consolidateMediaFolder: ${existingDestRelPaths.size} files already in dest folder (fast-path candidates)`);

  // Single transaction over all the file_ref rewrites. Without this, each
  // update.run() is its own autocommit → its own WAL fsync (~1–5 ms on APFS),
  // turning 12k rewrites into 30+ seconds. With it, the whole consolidate's
  // DB work commits in a single fsync. BEGIN IMMEDIATE acquires the write
  // lock upfront so we don't race a worker-thread reader for the upgrade.
  // The DB uses DELETE journaling (WAL is incompatible with the test-time
  // node-sqlite3-wasm VFS and intentionally disabled in production too —
  // see .claude/skills/sqlite-wal/), so a long write transaction blocks
  // concurrent writers but not readers; that trade is acceptable here
  // because consolidate runs at end-of-import when no UI is querying.
  await runSql(db, 'BEGIN IMMEDIATE');
  let committed = false;

  const update = db.prepare('UPDATE media SET file_ref = ? WHERE id = ?');
  let processed = 0;
  let fastPathHits = 0;
  let slowPathCopies = 0;
  const tStart = Date.now();

  // Each worker accumulates its own (file_ref, id) buffer; we flush once per
  // worker on completion. Under Tauri this collapses ~12k per-row IPC writes
  // into 8 batched runs. The DB write order is irrelevant — every row is an
  // independent (id-keyed) UPDATE, so concurrent buffers can merge in any
  // order. Cap each buffer to UPDATE_FLUSH_SIZE so very large dest-folder
  // imports don't sit on tens of thousands of pending params before flushing.
  const UPDATE_FLUSH_SIZE = 1000;
  const buffers: unknown[][][] = Array.from({ length: COPY_CONCURRENCY }, () => []);
  async function flushBuffer(buf: unknown[][]): Promise<void> {
    if (buf.length === 0) return;
    await runBatchOnStatement(update, buf);
    buf.length = 0;
  }

  async function processRow(row: { id: string; file_ref: string | null }, buf: unknown[][]): Promise<void> {
    const ref = row.file_ref;
    if (!ref) { result.skipped++; return; }
    if (!path.isAbsolute(ref)) { result.skipped++; return; }

    // Fast path: row's file_ref is under the bulk-copy source dir, so it
    // landed in dest with the same relative position. Compute that relative
    // path, verify the file is actually present in dest (bulk copy could have
    // skipped a missing source file), then rewrite the ref to the nested
    // relative form (e.g. `<dbname>-media/P12/photo.jpg`, NOT `…/photo.jpg`).
    if (bulkCopiedFromDir && isPathUnder(ref, bulkCopiedFromDir)) {
      const rel = path.relative(bulkCopiedFromDir, ref);
      if (existingDestRelPaths.has(rel)) {
        buf.push([path.join(folderName, rel), row.id]);
        fastPathHits++;
        result.copied++;
        if (buf.length >= UPDATE_FLUSH_SIZE) await flushBuffer(buf);
        return;
      }
      // Source file wasn't in the bulk-copy tree — bulk copy is async + best-
      // effort, skipped this one. Counts as missing; leave the ref alone.
      result.missing++;
      return;
    }

    // Slow path: source is outside the bulk-copied tree (or no bulk copy ran).
    // Flat copy: dest filename is the source basename. The fast path is the
    // only place that preserves subdirs — slow-path callers historically used
    // flat layouts and basename-collision detection (now `_n` suffixing is
    // gone; same-basename collisions across different sources keep the first).
    const filename = path.basename(ref);
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
    buf.push([path.join(folderName, filename), row.id]);
    result.copied++;
    if (buf.length >= UPDATE_FLUSH_SIZE) await flushBuffer(buf);
  }

  // Bounded-concurrency worker pool — each worker pulls the next index off a
  // shared cursor until the queue is drained, accumulating updates in its
  // own buffer for batched flush.
  let cursor = 0;
  async function worker(workerIdx: number): Promise<void> {
    const buf = buffers[workerIdx];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = cursor++;
      if (i >= rows.length) {
        await flushBuffer(buf);
        return;
      }
      await processRow(rows[i], buf);
      processed++;
      if (processed % 1000 === 0) {
        const elapsed = Date.now() - tStart;
        const rate = processed / (elapsed / 1000);
        console.log(`[import-timing]     consolidate progress: ${processed}/${rows.length} (fastPath=${fastPathHits} copied=${slowPathCopies} skipped=${result.skipped} missing=${result.missing}) — ${elapsed}ms — ${rate.toFixed(0)} rows/s`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: COPY_CONCURRENCY }, (_, idx) => worker(idx)));
    await runSql(db, 'COMMIT');
    committed = true;
  } finally {
    update.finalize();
    if (!committed) {
      try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    }
  }
  const elapsed = Date.now() - tStart;
  const rate = processed / (elapsed / 1000);
  console.log(`[import-timing]   consolidateMediaFolder finished: fastPath=${fastPathHits} slowCopied=${slowPathCopies} skipped=${result.skipped} missing=${result.missing} in ${elapsed}ms (${rate.toFixed(0)} rows/s)`);
  return result;
}

/** True when `p` is the same as `dir` or any descendant of it (no `..` escapes). */
function isPathUnder(p: string, dir: string): boolean {
  const rel = path.relative(dir, p);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { getMediaDir, getMediaFolderName } from './media';

export interface ConsolidateResult {
  /** Files newly copied + ref rewritten */
  copied: number;
  /** Refs left untouched (already inside dbDir, null, relative-external, etc.) */
  skipped: number;
  /** Absolute refs whose target file does not exist */
  missing: number;
}

/**
 * Walk all media rows; for any `file_ref` that is an absolute path to an existing
 * file, copy it into `<dbname>-media/` (creating the folder if needed) and rewrite
 * the row to the relative `<dbname>-media/<filename>` form.
 *
 * Async to keep the main thread responsive during large imports — copyFile and
 * stat go through libuv's threadpool so IPC traffic from the renderer (list
 * loads, undo, etc.) is serviced between file ops instead of being queued
 * behind tens of seconds of synchronous I/O. Idempotent. Safe to call
 * multiple times.
 */
export async function consolidateMediaFolder(db: Database, dbPath: string): Promise<ConsolidateResult> {
  const result: ConsolidateResult = { copied: 0, skipped: 0, missing: 0 };
  const folderName = getMediaFolderName(dbPath);
  const mediaDir = getMediaDir(dbPath);

  const rows = db.all('SELECT id, file_ref FROM media') as Array<{ id: string; file_ref: string | null }>;
  if (rows.length === 0) return result;

  let folderEnsured = false;
  const ensureFolder = async () => {
    if (folderEnsured) return;
    await fsp.mkdir(mediaDir, { recursive: true });
    folderEnsured = true;
  };

  const update = db.prepare('UPDATE media SET file_ref = ? WHERE id = ?');
  try {
    for (const row of rows) {
      const ref = row.file_ref;
      if (!ref) { result.skipped++; continue; }
      if (!path.isAbsolute(ref)) { result.skipped++; continue; }
      if (!(await exists(ref))) { result.missing++; continue; }

      await ensureFolder();
      const filename = path.basename(ref);
      let dest = path.join(mediaDir, filename);
      if (await exists(dest) && !(await sameFile(ref, dest))) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let n = 1;
        while (await exists(dest = path.join(mediaDir, `${base}_${n}${ext}`))) n++;
      }
      if (!(await exists(dest))) await fsp.copyFile(ref, dest);
      const newRef = path.join(folderName, path.basename(dest));
      update.run([newRef, row.id]);
      result.copied++;
    }
  } finally {
    update.finalize();
  }
  return result;
}

async function exists(p: string): Promise<boolean> {
  try { await fsp.access(p, fs.constants.F_OK); return true; }
  catch { return false; }
}

async function sameFile(a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
    return sa.size === sb.size && sa.ino === sb.ino && sa.dev === sb.dev;
  } catch { return false; }
}

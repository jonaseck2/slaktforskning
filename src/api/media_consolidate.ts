import * as fs from 'fs';
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
 * Idempotent. Safe to call multiple times.
 */
export function consolidateMediaFolder(db: Database, dbPath: string): ConsolidateResult {
  const result: ConsolidateResult = { copied: 0, skipped: 0, missing: 0 };
  const folderName = getMediaFolderName(dbPath);
  const mediaDir = getMediaDir(dbPath);

  const rows = db.all('SELECT id, file_ref FROM media') as Array<{ id: string; file_ref: string | null }>;
  if (rows.length === 0) return result;

  let folderEnsured = false;
  const ensureFolder = () => {
    if (folderEnsured) return;
    fs.mkdirSync(mediaDir, { recursive: true });
    folderEnsured = true;
  };

  const update = db.prepare('UPDATE media SET file_ref = ? WHERE id = ?');
  try {
    for (const row of rows) {
      const ref = row.file_ref;
      if (!ref) { result.skipped++; continue; }
      if (!path.isAbsolute(ref)) { result.skipped++; continue; }
      if (!fs.existsSync(ref)) { result.missing++; continue; }

      ensureFolder();
      const filename = path.basename(ref);
      let dest = path.join(mediaDir, filename);
      if (fs.existsSync(dest) && !sameFile(ref, dest)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let n = 1;
        while (fs.existsSync(dest = path.join(mediaDir, `${base}_${n}${ext}`))) n++;
      }
      if (!fs.existsSync(dest)) fs.copyFileSync(ref, dest);
      const newRef = path.join(folderName, path.basename(dest));
      update.run([newRef, row.id]);
      result.copied++;
    }
  } finally {
    update.finalize();
  }
  return result;
}

function sameFile(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.size === sb.size && sa.ino === sb.ino && sa.dev === sb.dev;
  } catch { return false; }
}

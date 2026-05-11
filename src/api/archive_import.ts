import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { unzipSync } from 'fflate';
import { parseGedcom, importGedcom } from '../gedcom';
import { decodeGedcomBytes } from '../gedcom/encoding';
import type { ImportOptions, ValidationReport } from '../import/gedcom';
import { queryAll, runSql } from './db';

export interface ArchiveImportReport {
  gedcomReport: ValidationReport;
  mediaImported: number;
  mediaSkipped: string[];
}

/**
 * Writer callback signature: given a relative path inside the target
 * media folder (just the basename, e.g. `photo.jpg`) and the file bytes,
 * persist them. Used by `importArchiveFromBytes` so the pure function
 * doesn't reach for `fs` directly — Electron supplies a Node-fs writer,
 * Tauri supplies an `invoke('fs_write_bytes_base64', ...)` writer.
 *
 * The writer is responsible for resolving the destination — it knows the
 * target media folder. The caller of `importArchiveFromBytes` only sees
 * the in-archive entry name (post-basename); collision handling
 * (overwrite vs rename-with-suffix) is up to the writer.
 */
export type ArchiveMediaWriter = (filename: string, bytes: Uint8Array) => Promise<void>;

/**
 * Pure-function variant of `importArchive` — extracts the zip in memory
 * (no temp dir) and pipes media bytes to the supplied writer. The .ged
 * inside the zip is decoded via `decodeGedcomBytes` (encoding-aware,
 * BOM/CHAR/UTF-8 heuristic). Used by both Electron's wrapper below and
 * the Tauri renderer-side polyfill.
 *
 * The `mediaFolderName` arg is the folder name (e.g. `family-media`)
 * that the resulting `media.file_ref` rows should reference. After the
 * function returns, all `file_ref LIKE 'media/%'` entries are rewritten
 * to `<mediaFolderName>/...` so they match the user's actual sibling
 * folder convention (`<dbname>-media/`).
 */
export async function importArchiveFromBytes(
  db: Database,
  zipBytes: Uint8Array,
  mediaFolderName: string,
  mediaWriter: ArchiveMediaWriter,
  options?: ImportOptions,
): Promise<ArchiveImportReport> {
  const entries = unzipSync(zipBytes);

  // Find the .ged file (prefer one at the root, fall back to any depth)
  const gedName =
    Object.keys(entries).find(
      (name) => name.toLowerCase().endsWith('.ged') && !name.includes('/'),
    ) ??
    Object.keys(entries).find((name) => name.toLowerCase().endsWith('.ged'));

  if (!gedName) {
    throw new Error('No .ged file found in archive.');
  }

  // Decode + parse + import GEDCOM in memory (no temp file).
  const text = decodeGedcomBytes(entries[gedName]);
  const tree = parseGedcom(text);
  const gedcomReport = await importGedcom(db, tree, options);

  // Extract media files via the supplied writer.
  let mediaImported = 0;
  const mediaSkipped: string[] = [];

  const mediaEntries = Object.keys(entries).filter(
    (name) => name.startsWith('media/') && name !== 'media/',
  );

  for (const entryName of mediaEntries) {
    const filename = path.basename(entryName);
    if (!filename) continue;
    try {
      await mediaWriter(filename, entries[entryName]);
      mediaImported++;
    } catch (err) {
      mediaSkipped.push(`${entryName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Rewrite file_ref paths to match the target media folder name.
  // The exporter wrote refs as `media/<basename>`; the importer needs to
  // point them at the actual sibling folder (e.g. `family-media/`).
  if (mediaFolderName !== 'media') {
    const mediaPaths = await queryAll<{ id: string; file_ref: string }>(
      db,
      `SELECT id, file_ref FROM media WHERE file_ref IS NOT NULL AND file_ref LIKE 'media/%'`,
    );
    for (const row of mediaPaths) {
      const newRef = row.file_ref.replace(/^media\//, `${mediaFolderName}/`);
      await runSql(db, 'UPDATE media SET file_ref = ? WHERE id = ?', [newRef, row.id]);
    }
  }

  return { gedcomReport, mediaImported, mediaSkipped };
}

/**
 * Import a .zip archive containing a GEDCOM file and optional media/ directory.
 *
 * 1. Extract the zip
 * 2. Find .ged file at the root
 * 3. Import GEDCOM into the database
 * 4. Copy media files from archive to mediaDir
 * 5. Update media file_ref paths to point to copied files
 *
 * Thin Node-fs wrapper around `importArchiveFromBytes` — reads the zip
 * via `fs.readFileSync` and supplies a writer that persists each media
 * entry into `mediaDir`. Used by the Electron worker-thread channel and
 * the MCP `import_archive` tool. The Tauri build calls
 * `importArchiveFromBytes` directly with an
 * `invoke('fs_write_bytes_base64')`-backed writer.
 */
export async function importArchive(
  db: Database,
  archivePath: string,
  mediaDir: string,
  options?: ImportOptions,
): Promise<ArchiveImportReport> {
  const zipBytes = new Uint8Array(fs.readFileSync(archivePath));

  await fsp.mkdir(mediaDir, { recursive: true });

  const mediaWriter: ArchiveMediaWriter = async (filename, bytes) => {
    let destPath = path.join(mediaDir, filename);
    // Avoid overwriting existing files
    try {
      await fsp.access(destPath, fs.constants.F_OK);
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const suffix = Date.now();
      destPath = path.join(mediaDir, `${base}_${suffix}${ext}`);
    } catch {
      // ENOENT — destPath is free, no rename needed.
    }
    await fsp.writeFile(destPath, bytes);
  };

  const mediaFolderName = path.basename(mediaDir);
  return importArchiveFromBytes(db, zipBytes, mediaFolderName, mediaWriter, options);
}

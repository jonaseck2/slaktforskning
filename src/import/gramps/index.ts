/**
 * Gramps .gramps / .gpkg import orchestrator.
 *
 * `.gramps` is XML (optionally gzipped). `.gpkg` is a gzipped USTAR tar of
 * the XML plus a `media/` folder — `extractGrampsArchive` (archive.ts) pulls
 * both apart. Media bytes are written through a caller-supplied
 * `GrampsMediaWriter` (renderer → fs_write_bytes_base64; MCP → Node fs), then
 * each media `file_ref` is rewritten to `<mediaFolderName>/<basename>` so the
 * refs are relative per .claude/rules/media.md.
 */

import * as fs from 'node:fs';
import { queryAll, runSql } from '../../api/db';
import type { Database } from 'node-sqlite3-wasm';
import { transformGramps, emptyGrampsSummary, type GrampsImportSummary } from './transform';
import { extractGrampsArchive, type GrampsMediaEntry } from './archive';

export type GrampsMediaWriter = (filename: string, bytes: Uint8Array) => Promise<void>;

export interface GrampsImportOptions {
  onProgress?: (msg: string) => void;
  /** Persist a bundled media file. Omit for plain `.gramps` (no media). */
  mediaWriter?: GrampsMediaWriter;
  /** Sibling media folder name (e.g. `family-media`) for file_ref rewrite. */
  mediaFolderName?: string;
}

export interface GrampsImportResult {
  summary: GrampsImportSummary;
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

async function applyGrampsMedia(
  db: Database,
  media: GrampsMediaEntry[],
  mediaFolderName: string,
  writer: GrampsMediaWriter,
  onProgress: (msg: string) => void,
): Promise<void> {
  onProgress('Writing media…');
  const written = new Set<string>();
  for (const { name, bytes } of media) {
    try {
      await writer(name, bytes);
      written.add(name);
    } catch {
      // Tolerate a failed write; consolidateMediaFolder is the safety net.
    }
  }
  if (written.size === 0) return;
  const rows = await queryAll<{ id: string; file_ref: string }>(
    db,
    'SELECT id, file_ref FROM media WHERE file_ref IS NOT NULL',
  );
  for (const row of rows) {
    const base = baseName(row.file_ref);
    const target = `${mediaFolderName}/${base}`;
    if (written.has(base) && row.file_ref !== target) {
      await runSql(db, 'UPDATE media SET file_ref = ? WHERE id = ?', [target, row.id]);
    }
  }
}

async function runGrampsImport(
  db: Database,
  fileBytes: Uint8Array,
  options: GrampsImportOptions,
): Promise<GrampsImportResult> {
  const { onProgress = () => { /* noop */ }, mediaWriter, mediaFolderName } = options;

  onProgress('Importing…');
  const { xml, media } = extractGrampsArchive(fileBytes);

  let summary = emptyGrampsSummary();
  await runSql(db, 'BEGIN IMMEDIATE');
  try {
    summary = await transformGramps(db, xml);
    await runSql(db, 'COMMIT');
  } catch (err) {
    try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  if (media.length > 0 && mediaWriter && mediaFolderName) {
    await applyGrampsMedia(db, media, mediaFolderName, mediaWriter, onProgress);
  }
  return { summary };
}

export async function importFromGrampsBytes(
  db: Database,
  bytes: Uint8Array,
  options: GrampsImportOptions = {},
): Promise<GrampsImportResult> {
  return runGrampsImport(db, bytes, options);
}

export async function importFromGramps(
  db: Database,
  filePath: string,
  options: GrampsImportOptions = {},
): Promise<GrampsImportResult> {
  const { onProgress = () => { /* noop */ } } = options;
  onProgress('Reading Gramps file…');
  const fileBytes = new Uint8Array(fs.readFileSync(filePath));
  return runGrampsImport(db, fileBytes, options);
}

/**
 * Gramps .gramps / .gpkg import orchestrator.
 *
 * `.gramps` is plain XML (sometimes gzipped despite the bare extension —
 * the auto-magic-byte sniff handles that). `.gpkg` is a tar.gz bundle of
 * the XML plus a media folder; for the first cut we read the XML out
 * via the XML-only path and let media file_refs resolve later via the
 * existing media-consolidate pipeline.
 */

import * as fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runSql } from '../../api/db';
import type { Database } from 'node-sqlite3-wasm';
import { transformGramps, emptyGrampsSummary, type GrampsImportSummary } from './transform';

export interface GrampsImportOptions {
  onProgress?: (msg: string) => void;
}

export interface GrampsImportResult {
  summary: GrampsImportSummary;
}

export async function importFromGramps(
  ourDb: Database,
  filePath: string,
  options: GrampsImportOptions = {},
): Promise<GrampsImportResult> {
  const { onProgress = () => { /* noop */ } } = options;

  onProgress('Reading Gramps file…');
  const buf = fs.readFileSync(filePath);
  // Gzip-magic check: 1f 8b. Gramps writes plain XML by default but the
  // bigger reference databases (and .gpkg bundles) are gzipped.
  const xml = (buf[0] === 0x1f && buf[1] === 0x8b)
    ? gunzipSync(buf).toString('utf-8')
    : buf.toString('utf-8');

  onProgress('Importing…');
  let summary = emptyGrampsSummary();
  await runSql(ourDb, 'BEGIN IMMEDIATE');
  try {
    summary = await transformGramps(ourDb, xml);
    await runSql(ourDb, 'COMMIT');
  } catch (err) {
    try { await runSql(ourDb, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
  return { summary };
}

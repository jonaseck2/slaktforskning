/**
 * Source-coverage event emitter — T02 scaffold; filled by T08.
 *
 * GEDCOM 5.5.1 + 7.0: `SOUR.DATA.EVEN <event-types>` with `DATE FROM..TO`
 * and a `PLAC` sub-tag records what events / date ranges / places a source
 * covers — distinct from `citations`, which attach a source to a specific
 * authored event.
 */

import type { Database } from 'node-sqlite3-wasm';

/**
 * Emit `${baseLevel} DATA / ${baseLevel+1} EVEN <type>` blocks for every
 * `source_coverage_events` row attached to `sourceId`. Each row produces:
 *
 *     <baseLevel>   DATA
 *     <baseLevel+1> EVEN <event_type>                  (comma-joined if many)
 *     <baseLevel+2> DATE FROM <from> TO <to>           (optional)
 *     <baseLevel+2> PLAC <place name>                  (optional)
 *     <baseLevel+1> NOTE <notes>                       (optional)
 *
 * **T02 stub:** no emission. T08 implements.
 */
export async function emitSourceCoverageEvents(
  _db: Database,
  _sourceId: string,
  _baseLevel: number,
  _version: '5.5.1' | '7.0',
  _lines: string[],
): Promise<void> {
  // T08 implements.
}

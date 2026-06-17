/**
 * Source-coverage event emitter — T08 (GEDCOM alignment plan).
 *
 * GEDCOM 5.5.1 + 7.0: `SOUR.DATA.EVEN <event-types>` with `DATE FROM..TO`
 * and a `PLAC` sub-tag records what events / date ranges / places a source
 * covers — distinct from `citations`, which attach a source to a specific
 * authored event. The spec is identical across both versions for this
 * substructure; emission is lossless on both.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { Place, SourceCoverageEvent } from '../../api/types';
import { getCoverageForSource } from '../../api/source_coverage';
import { getPlace } from '../../api/places';

/**
 * Emit `${baseLevel} DATA / ${baseLevel+1} EVEN <type>` blocks for every
 * `source_coverage_events` row attached to `sourceId`. All rows for a given
 * source are grouped under a single `1 DATA` parent — one `2 EVEN <type>`
 * substructure per row:
 *
 *     <baseLevel>   DATA
 *     <baseLevel+1> EVEN <event_type>
 *     <baseLevel+2> DATE FROM <from> TO <to>         (optional — emitted when set)
 *     <baseLevel+2> PLAC <place name>                (optional — resolved via place_id)
 *     <baseLevel+2> NOTE <notes>                     (optional — emitted when set)
 *
 * Lossless on both 5.5.1 and 7.0 (spec is identical).
 */
export async function emitSourceCoverageEvents(
  db: Database,
  sourceId: string,
  baseLevel: number,
  _version: '5.5.1' | '7.0',
  lines: string[],
  prefetchedRows?: SourceCoverageEvent[],
  prefetchedPlaceById?: Map<string, Place>,
): Promise<void> {
  const rows = prefetchedRows ?? await getCoverageForSource(db, sourceId);
  if (rows.length === 0) return;

  lines.push(`${baseLevel} DATA`);
  for (const row of rows) {
    lines.push(`${baseLevel + 1} EVEN ${row.event_type}`);
    if (row.date_value_from && row.date_value_to) {
      lines.push(`${baseLevel + 2} DATE FROM ${row.date_value_from} TO ${row.date_value_to}`);
    } else if (row.date_value_from) {
      lines.push(`${baseLevel + 2} DATE FROM ${row.date_value_from}`);
    } else if (row.date_value_to) {
      lines.push(`${baseLevel + 2} DATE TO ${row.date_value_to}`);
    }
    if (row.place_id) {
      const place = prefetchedPlaceById
        ? (prefetchedPlaceById.get(row.place_id) ?? null)
        : await getPlace(db, row.place_id);
      if (place?.name) {
        lines.push(`${baseLevel + 2} PLAC ${place.name}`);
      }
    }
    if (row.notes) {
      const noteLines = row.notes.split(/\r?\n/);
      lines.push(`${baseLevel + 2} NOTE ${noteLines[0]}`);
      for (let i = 1; i < noteLines.length; i++) {
        lines.push(`${baseLevel + 3} CONT ${noteLines[i]}`);
      }
    }
  }
}

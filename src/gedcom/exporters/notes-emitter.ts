/**
 * Notes (shared-note) emitter — T02 scaffold; filled by T04.
 *
 * GEDCOM 7.0: shared `SNOTE` records are emitted at top level; references
 * from owning entities use `SNOTE @Nx@` pointers.
 *
 * GEDCOM 5.5.1: no SNOTE concept exists. The emitter degrades to inline
 * `NOTE` values directly under the owning entity. A multi-attached note
 * therefore duplicates on a 5.5.1 export and re-merges on import only when
 * the importer can identify identical text — the fidelity registry
 * documents this as `lossy:5.5.1-shared-degrades-to-inline`.
 *
 * Per-concept module so T04's exporter changes don't conflict with T05/T06
 * /T07/T08's modules on the same `src/gedcom/exporter.ts` source file.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { NoteEntityType } from '../../api/types';

/**
 * Emit NOTE / SNOTE structures attached to a single entity.
 *
 * Reads `note_links` joined with `notes` for the given (entity_type,
 * entity_id) pair, ordered by `sort_order`. The 7.0 path emits `${baseLevel}
 * SNOTE @Nx@` pointers and lets `emitSharedNoteRecords` produce the records
 * at top level. The 5.5.1 path emits `${baseLevel} NOTE <text>` directly,
 * splitting multi-line text across `CONT` continuation lines.
 *
 * `lines` is the in-progress GEDCOM line accumulator from the exporter
 * orchestrator (matches the pattern used by `emitMediaBlocks` and
 * `emitPlaceSubTags`).
 *
 * **T02 stub:** no emission. T04 implements.
 */
export async function emitNotesForEntity(
  _db: Database,
  _entityType: NoteEntityType,
  _entityId: string,
  _baseLevel: number,
  _version: '5.5.1' | '7.0',
  _lines: string[],
): Promise<void> {
  // T04 implements.
}

/**
 * Emit the top-level SNOTE record block (7.0) or no-op (5.5.1, where shared
 * notes are inlined per-entity instead).
 *
 * Called once at the appropriate point in the exporter orchestrator (after
 * REPO and SOUR records, mirroring the existing structured-record ordering).
 *
 * **T02 stub:** no emission. T04 implements.
 */
export async function emitSharedNoteRecords(
  _db: Database,
  _version: '5.5.1' | '7.0',
  _lines: string[],
): Promise<void> {
  // T04 implements.
}

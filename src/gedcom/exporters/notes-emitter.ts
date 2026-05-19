/**
 * Notes (shared-note) emitter — T04 implementation.
 *
 * GEDCOM 7.0: shared `SNOTE` records are emitted at top level; references
 * from owning entities use `SNOTE @Nx@` pointers.
 *
 * GEDCOM 5.5.1: no SNOTE concept exists. The emitter degrades to inline
 * `NOTE` values directly under the owning entity. A multi-attached note
 * therefore duplicates on a 5.5.1 export and re-merges on import only when
 * the importer can identify identical text — the fidelity registry
 * documents this as `lossy:5.5.1-shared-degrades-to-inline`. Each shared
 * note (more than one link) generates exactly one disclosure warning on
 * the export report so the user sees what was duplicated.
 *
 * Per-concept module so T04's exporter changes don't conflict with T05/T06
 * /T07/T08's modules on the same `src/gedcom/exporter.ts` source file.
 *
 * Module-level state (`noteXref` / `noteIdx`) is intentional and scoped per
 * export call via `resetNoteXrefs()`, which the exporter MUST invoke once
 * at the top of `exportGedcom`. The 7.0 emission flow is:
 *   1. resetNoteXrefs() at start of export.
 *   2. emitNotesForEntity() called per entity — allocates @Nx@ xrefs lazily
 *      and pushes `${level} SNOTE @Nx@` pointer lines.
 *   3. emitSharedNoteRecords() called once before TRLR — emits the
 *      `0 @Nx@ SNOTE <text>` records for every allocated xref.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { NoteEntityType } from '../../api/types';
import { getNotesForEntity, listNotes, getEntitiesForNote, getNote } from '../../api/notes';

// ── Module-scoped xref allocation (per export call, reset by caller) ────────

const noteXref = new Map<string, string>();
let noteIdx = 0;

/** Reset the xref allocator. Called by the exporter at the top of each run
 *  so back-to-back exports don't share state. */
export function resetNoteXrefs(): void {
  noteXref.clear();
  noteIdx = 0;
}

/** Splits multi-line text across CONT continuation lines, matching the
 *  pattern used elsewhere in the exporter (group notes, repo notes). */
function emitNoteText(lines: string[], baseLevel: number, tag: string, text: string): void {
  const noteLines = text.split(/\r?\n/);
  lines.push(`${baseLevel} ${tag} ${noteLines[0]}`);
  for (let i = 1; i < noteLines.length; i++) {
    lines.push(`${baseLevel + 1} CONT ${noteLines[i]}`);
  }
}

/**
 * Emit NOTE / SNOTE sub-structures attached to a single entity.
 *
 * 7.0: emits `${baseLevel} SNOTE @Nx@` pointer per linked note (xref
 * allocated lazily on first reference).
 *
 * 5.5.1: emits `${baseLevel} NOTE <text>` inline per linked note (with CONT
 * continuation for multi-line text).
 *
 * `lines` is the in-progress GEDCOM line accumulator from the exporter
 * orchestrator.
 */
export async function emitNotesForEntity(
  db: Database,
  entityType: NoteEntityType,
  entityId: string,
  baseLevel: number,
  version: '5.5.1' | '7.0',
  lines: string[],
): Promise<void> {
  const notes = await getNotesForEntity(db, entityType, entityId);
  for (const note of notes) {
    if (version === '7.0') {
      let xr = noteXref.get(note.id);
      if (!xr) {
        xr = `@N${++noteIdx}@`;
        noteXref.set(note.id, xr);
      }
      lines.push(`${baseLevel} SNOTE ${xr}`);
    } else {
      // 5.5.1: inline (lossy on shared — disclosure happens in
      // emitSharedNoteRecords below).
      emitNoteText(lines, baseLevel, 'NOTE', note.text);
    }
  }
}

/**
 * Emit the top-level SNOTE record block (7.0) or push disclosure warnings
 * (5.5.1).
 *
 * Called once at the appropriate point in the exporter orchestrator —
 * AFTER every per-entity emitNotesForEntity call has run, so the xref
 * allocator has seen every referenced note. Place this just before the
 * `0 TRLR` line.
 *
 * 7.0: emits `0 @Nx@ SNOTE <text>` + optional `1 LANG <lang>` for every
 * allocated xref.
 *
 * 5.5.1: pushes one warning per shared note (>1 link) into `report.warnings`
 * so the user sees what was duplicated on inline emission. Emits no lines.
 */
export async function emitSharedNoteRecords(
  db: Database,
  version: '5.5.1' | '7.0',
  lines: string[],
  report: { warnings: string[] },
): Promise<void> {
  if (version === '5.5.1') {
    // Walk every notes row and disclose shared ones.
    const allNotes = await listNotes(db);
    for (const note of allNotes) {
      const links = await getEntitiesForNote(db, note.id);
      if (links.length > 1) {
        report.warnings.push(
          `Shared note "${note.text.slice(0, 40)}${note.text.length > 40 ? '…' : ''}" `
          + `(linked to ${links.length} entities) was duplicated as inline NOTE on each — `
          + `GEDCOM 5.5.1 has no SNOTE record concept (lossy:5.5.1-shared-degrades-to-inline). `
          + `Export to GEDCOM 7.0 to preserve the sharing.`,
        );
      }
    }
    return;
  }
  // 7.0: emit one SNOTE record per allocated xref.
  for (const [noteId, xr] of noteXref) {
    const note = await getNote(db, noteId);
    if (!note) continue;
    emitNoteText(lines, 0, `${xr} SNOTE`, note.text);
    if (note.language) lines.push(`1 LANG ${note.language}`);
  }
}

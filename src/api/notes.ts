/**
 * Shared notes (T04 — GEDCOM alignment plan).
 *
 * `notes` are first-class entities — a single row may be linked to many
 * persons / events / places / sources / repositories / media / relationships
 * via `note_links` (mirrors the `groups` + `group_links` shape). The shared-
 * note model directly mirrors GEDCOM 7.0 SNOTE: one top-level SNOTE record
 * referenced from many entities. GEDCOM 5.5.1 has no SNOTE concept, so on
 * 5.5.1 export the same authored row degrades to repeated inline NOTEs under
 * each owning entity (lossy, disclosed via report.warnings).
 *
 * Surface mirrors src/api/groups.ts and src/api/group_links.ts.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { Note, NoteLink, NoteEntityType } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

// ── Notes CRUD ──────────────────────────────────────────────────────────────

export async function createNote(
  db: Database,
  data: { text: string; language?: string },
): Promise<Note> {
  const id = crypto.randomUUID();
  await runSql(db,
    'INSERT INTO notes (id, text, language) VALUES (?, ?, ?)',
    [id, data.text, data.language ?? ''],
  );
  return (await queryOne<Note>(db, 'SELECT * FROM notes WHERE id = ?', [id]))!;
}

export async function getNote(db: Database, id: string): Promise<Note | null> {
  return (await queryOne<Note>(db, 'SELECT * FROM notes WHERE id = ?', [id])) ?? null;
}

export async function listNotes(db: Database): Promise<Note[]> {
  return await queryAll<Note>(db, 'SELECT * FROM notes ORDER BY created_at DESC');
}

export async function updateNote(
  db: Database,
  id: string,
  updates: Partial<Pick<Note, 'text' | 'language'>>,
): Promise<Note | null> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('text' in updates) { fields.push('text = ?'); vals.push(updates.text); }
  if ('language' in updates) { fields.push('language = ?'); vals.push(updates.language ?? ''); }
  if (fields.length === 0) return await getNote(db, id);
  fields.push("updated_at = datetime('now')");
  await runSql(db, `UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, [...vals, id]);
  return await getNote(db, id);
}

export async function deleteNote(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM notes WHERE id = ?', [id])) > 0;
}

// ── note_links (polymorphic attachment) ─────────────────────────────────────

export async function linkNoteToEntity(
  db: Database,
  noteId: string,
  entityType: NoteEntityType,
  entityId: string,
): Promise<NoteLink> {
  // Sort-order is per-entity, mirroring group_links / media_links.
  const next = await queryOne<{ m: number | null }>(db,
    'SELECT MAX(sort_order) AS m FROM note_links WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId],
  );
  const sort = (next?.m ?? -1) + 1;
  const id = crypto.randomUUID();
  await runSql(db,
    'INSERT OR IGNORE INTO note_links (id, note_id, entity_type, entity_id, sort_order) VALUES (?, ?, ?, ?, ?)',
    [id, noteId, entityType, entityId, sort],
  );
  return (await queryOne<NoteLink>(db,
    'SELECT * FROM note_links WHERE note_id = ? AND entity_type = ? AND entity_id = ?',
    [noteId, entityType, entityId],
  ))!;
}

export async function unlinkNoteFromEntity(
  db: Database,
  noteId: string,
  entityType: NoteEntityType,
  entityId: string,
): Promise<boolean> {
  return (await runSqlChanges(db,
    'DELETE FROM note_links WHERE note_id = ? AND entity_type = ? AND entity_id = ?',
    [noteId, entityType, entityId],
  )) > 0;
}

export async function getNotesForEntity(
  db: Database,
  entityType: NoteEntityType,
  entityId: string,
): Promise<Note[]> {
  return await queryAll<Note>(db,
    `SELECT n.* FROM notes n
     JOIN note_links nl ON nl.note_id = n.id
     WHERE nl.entity_type = ? AND nl.entity_id = ?
     ORDER BY nl.sort_order, n.created_at`,
    [entityType, entityId],
  );
}

export async function getEntitiesForNote(
  db: Database,
  noteId: string,
): Promise<NoteLink[]> {
  return await queryAll<NoteLink>(db,
    'SELECT * FROM note_links WHERE note_id = ? ORDER BY entity_type, sort_order, created_at',
    [noteId],
  );
}

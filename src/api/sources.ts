import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Source, Citation } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createSource(
  db: Database,
  data: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>
): Source {
  const id = uuid();
  runSql(db, `
    INSERT INTO sources (id, title, author, publication_info, repository, url, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, data.title ?? '', data.author ?? '', data.publication_info ?? '', data.repository ?? '', data.url ?? '', data.source_type ?? '']);
  return getSource(db, id)!;
}

export function getSource(db: Database, id: string): Source | null {
  return queryOne<Source>(db, `SELECT * FROM sources WHERE id = ?`, [id]) ?? null;
}

export function listSources(db: Database): Source[] {
  return queryAll<Source>(db, `SELECT * FROM sources ORDER BY title`);
}

export function updateSource(
  db: Database,
  id: string,
  data: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>
): Source | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value ?? '');
  }
  if (fields.length === 0) return getSource(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  runSql(db, `UPDATE sources SET ${fields.join(', ')} WHERE id = ?`, values);
  return getSource(db, id);
}

export function searchSources(db: Database, query: string): Source[] {
  const like = `%${query}%`;
  return queryAll<Source>(db, `
    SELECT * FROM sources
    WHERE title LIKE ? OR author LIKE ? OR publication_info LIKE ?
    ORDER BY title
  `, [like, like, like]);
}

export function deleteSource(db: Database, id: string): boolean {
  return runSqlChanges(db, `DELETE FROM sources WHERE id = ?`, [id]) > 0;
}

export function createCitation(
  db: Database,
  data: {
    source_id: string;
    event_id?: string | null;
    person_id?: string | null;
    relationship_id?: string | null;
    place_id?: string | null;
    page?: string;
    confidence?: number;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  }
): Citation {
  const id = uuid();
  runSql(db, `
    INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.source_id, data.page ?? '', data.date_accessed ?? '', data.confidence ?? 0,
    data.transcription ?? '', data.notes ?? '', data.event_id ?? null, data.person_id ?? null,
    data.relationship_id ?? null, data.place_id ?? null
  ]);
  return getCitation(db, id)!;
}

export function getCitation(db: Database, id: string): Citation | null {
  return queryOne<Citation>(db, `SELECT * FROM citations WHERE id = ?`, [id]) ?? null;
}

export function getCitationsForSource(db: Database, sourceId: string): Citation[] {
  return queryAll<Citation>(db, `SELECT * FROM citations WHERE source_id = ?`, [sourceId]);
}

export function getCitationsForEvent(db: Database, eventId: string): Citation[] {
  return queryAll<Citation>(db, `SELECT * FROM citations WHERE event_id = ?`, [eventId]);
}

export function getCitationsForPerson(db: Database, personId: string): Citation[] {
  return queryAll<Citation>(db, `SELECT * FROM citations WHERE person_id = ?`, [personId]);
}

export function getCitationsForRelationship(db: Database, relationshipId: string): Citation[] {
  return queryAll<Citation>(db, `SELECT * FROM citations WHERE relationship_id = ?`, [relationshipId]);
}

export function getCitationsForPlace(db: Database, placeId: string): Citation[] {
  return queryAll<Citation>(db, `SELECT * FROM citations WHERE place_id = ?`, [placeId]);
}

export function deleteCitation(db: Database, id: string): boolean {
  return runSqlChanges(db, `DELETE FROM citations WHERE id = ?`, [id]) > 0;
}

export function updateCitation(
  db: Database,
  id: string,
  updates: Partial<Pick<Citation, 'page' | 'confidence' | 'transcription' | 'notes' | 'date_accessed'>>
): Citation | null {
  const allowed = ['page', 'confidence', 'transcription', 'notes', 'date_accessed'] as const;
  const fields = allowed.filter(k => k in updates);
  if (fields.length === 0) return getCitation(db, id);
  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => (updates as Record<string, unknown>)[f]);
  runSql(db, `UPDATE citations SET ${setClauses} WHERE id = ?`, [...vals, id]);
  return getCitation(db, id);
}

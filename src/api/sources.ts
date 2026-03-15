import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Source, Citation } from './types';

export function createSource(
  db: Database.Database,
  data: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>
): Source {
  const id = uuid();
  db.prepare(`
    INSERT INTO sources (id, title, author, publication_info, repository, url, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title ?? '', data.author ?? '', data.publication_info ?? '', data.repository ?? '', data.url ?? '', data.source_type ?? '');
  return getSource(db, id)!;
}

export function getSource(db: Database.Database, id: string): Source | null {
  return (db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source) ?? null;
}

export function listSources(db: Database.Database): Source[] {
  return db.prepare(`SELECT * FROM sources ORDER BY title`).all() as Source[];
}

export function updateSource(
  db: Database.Database,
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
  db.prepare(`UPDATE sources SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSource(db, id);
}

export function deleteSource(db: Database.Database, id: string): boolean {
  return db.prepare(`DELETE FROM sources WHERE id = ?`).run(id).changes > 0;
}

export function createCitation(
  db: Database.Database,
  data: { source_id: string; event_id?: string | null; person_id?: string | null; page?: string; confidence?: number; transcription?: string; notes?: string; date_accessed?: string }
): Citation {
  const id = uuid();
  db.prepare(`
    INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.source_id, data.page ?? '', data.date_accessed ?? '', data.confidence ?? 0,
    data.transcription ?? '', data.notes ?? '', data.event_id ?? null, data.person_id ?? null
  );
  return getCitation(db, id)!;
}

export function getCitation(db: Database.Database, id: string): Citation | null {
  return (db.prepare(`SELECT * FROM citations WHERE id = ?`).get(id) as Citation) ?? null;
}

export function getCitationsForSource(db: Database.Database, sourceId: string): Citation[] {
  return db.prepare(`SELECT * FROM citations WHERE source_id = ?`).all(sourceId) as Citation[];
}

export function getCitationsForEvent(db: Database.Database, eventId: string): Citation[] {
  return db.prepare(`SELECT * FROM citations WHERE event_id = ?`).all(eventId) as Citation[];
}

export function deleteCitation(db: Database.Database, id: string): boolean {
  return db.prepare(`DELETE FROM citations WHERE id = ?`).run(id).changes > 0;
}

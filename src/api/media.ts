import type { Database } from 'node-sqlite3-wasm';
import type { Media, MediaLink, MediaLinkEntityType } from './types';

export function createMedia(db: Database, data: {
  file_ref?: string | null;
  title?: string;
  format?: string | null;
  notes?: string;
  is_printable?: boolean;
}): Media {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO media (id, file_ref, title, format, notes, is_printable)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run([
    id, data.file_ref ?? null, data.title ?? '',
    data.format ?? null, data.notes ?? '',
    data.is_printable ? 1 : 0,
  ]);
  return db.prepare('SELECT * FROM media WHERE id = ?').get([id]) as Media;
}

export function getMedia(db: Database, id: string): Media | null {
  return (db.prepare('SELECT * FROM media WHERE id = ?').get([id]) ?? null) as Media | null;
}

export function listMedia(db: Database): Media[] {
  return db.prepare('SELECT * FROM media ORDER BY title').all([]) as Media[];
}

export function deleteMedia(db: Database, id: string): boolean {
  return ((db.prepare('DELETE FROM media WHERE id = ?').run([id]) as { changes: number }).changes) > 0;
}

export function addMediaLink(db: Database, data: {
  media_id: string;
  entity_type: MediaLinkEntityType;
  entity_id: string;
  link_type?: number | null;
}): MediaLink {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type)
    VALUES (?, ?, ?, ?, ?)
  `).run([id, data.media_id, data.entity_type, data.entity_id, data.link_type ?? null]);
  return db.prepare('SELECT * FROM media_links WHERE id = ?').get([id]) as MediaLink;
}

export function getMediaForEntity(db: Database, entityType: MediaLinkEntityType, entityId: string): (Media & { link_id: string; link_type: number | null })[] {
  return db.prepare(`
    SELECT m.*, ml.id AS link_id, ml.link_type
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id
    WHERE ml.entity_type = ? AND ml.entity_id = ?
    ORDER BY m.title
  `).all([entityType, entityId]) as (Media & { link_id: string; link_type: number | null })[];
}

export function removeMediaLink(db: Database, linkId: string): boolean {
  return ((db.prepare('DELETE FROM media_links WHERE id = ?').run([linkId]) as { changes: number }).changes) > 0;
}

import type { Database } from 'node-sqlite3-wasm';
import type { Media, MediaLink, MediaLinkEntityType } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createMedia(db: Database, data: {
  file_ref?: string | null;
  title?: string;
  format?: string | null;
  notes?: string;
  is_printable?: boolean;
}): Media {
  const id = crypto.randomUUID();
  runSql(db, `
    INSERT INTO media (id, file_ref, title, format, notes, is_printable)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    id, data.file_ref ?? null, data.title ?? '',
    data.format ?? null, data.notes ?? '',
    data.is_printable ? 1 : 0,
  ]);
  return queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [id])!;
}

export function getMedia(db: Database, id: string): Media | null {
  return queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [id]) ?? null;
}

export function listMedia(db: Database): Media[] {
  return queryAll<Media>(db, 'SELECT * FROM media ORDER BY title');
}

export function deleteMedia(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM media WHERE id = ?', [id]) > 0;
}

export function addMediaLink(db: Database, data: {
  media_id: string;
  entity_type: MediaLinkEntityType;
  entity_id: string;
  link_type?: number | null;
}): MediaLink {
  const id = crypto.randomUUID();
  runSql(db, `
    INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type)
    VALUES (?, ?, ?, ?, ?)
  `, [id, data.media_id, data.entity_type, data.entity_id, data.link_type ?? null]);
  return queryOne<MediaLink>(db, 'SELECT * FROM media_links WHERE id = ?', [id])!;
}

export function getMediaForEntity(db: Database, entityType: MediaLinkEntityType, entityId: string): (Media & { link_id: string; link_type: number | null })[] {
  return queryAll<Media & { link_id: string; link_type: number | null }>(db, `
    SELECT m.*, ml.id AS link_id, ml.link_type
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id
    WHERE ml.entity_type = ? AND ml.entity_id = ?
    ORDER BY m.title
  `, [entityType, entityId]);
}

export function removeMediaLink(db: Database, linkId: string): boolean {
  return runSqlChanges(db, 'DELETE FROM media_links WHERE id = ?', [linkId]) > 0;
}

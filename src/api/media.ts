import type { Database } from 'node-sqlite3-wasm';
import type { Media, MediaLink, MediaLinkEntityType } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createMedia(db: Database, data: {
  file_ref?: string | null;
  title?: string;
  format?: string | null;
  notes?: string;
  is_printable?: boolean;
  is_missing?: boolean;
}): Media {
  const id = crypto.randomUUID();
  runSql(db, `
    INSERT INTO media (id, file_ref, title, format, notes, is_printable, is_missing)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.file_ref ?? null, data.title ?? '',
    data.format ?? null, data.notes ?? '',
    data.is_printable ? 1 : 0,
    data.is_missing ? 1 : 0,
  ]);
  return queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [id])!;
}

export function getMedia(db: Database, id: string): Media | null {
  return queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [id]) ?? null;
}

export function listMedia(db: Database): Media[] {
  return queryAll<Media>(db, 'SELECT * FROM media ORDER BY title');
}

export interface MediaListItem extends Media {
  link_count: number;
}

export function listMediaPage(db: Database, limit: number, offset: number): MediaListItem[] {
  return queryAll<MediaListItem>(db, `
    SELECT m.*,
           (SELECT COUNT(*) FROM media_links ml WHERE ml.media_id = m.id) AS link_count
    FROM media m
    ORDER BY m.title
    LIMIT ? OFFSET ?
  `, [limit, offset]);
}

export function countMedia(db: Database): number {
  return queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM media')?.n ?? 0;
}

export function deleteMedia(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM media WHERE id = ?', [id]) > 0;
}

export function addMediaLink(db: Database, data: {
  media_id: string;
  entity_type: MediaLinkEntityType;
  entity_id: string;
  link_type?: number | null;
  sort_order?: number;
}): MediaLink {
  const id = crypto.randomUUID();
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const max = queryOne<{ m: number | null }>(db,
      'SELECT MAX(sort_order) AS m FROM media_links WHERE entity_type = ? AND entity_id = ?',
      [data.entity_type, data.entity_id]);
    sortOrder = (max?.m ?? -1) + 1;
  }
  runSql(db, `
    INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, data.media_id, data.entity_type, data.entity_id, data.link_type ?? null, sortOrder]);
  return queryOne<MediaLink>(db, 'SELECT * FROM media_links WHERE id = ?', [id])!;
}

export function getMediaForEntity(db: Database, entityType: MediaLinkEntityType, entityId: string): (Media & { link_id: string; link_type: number | null; sort_order: number })[] {
  return queryAll<Media & { link_id: string; link_type: number | null; sort_order: number }>(db, `
    SELECT m.*, ml.id AS link_id, ml.link_type, ml.sort_order
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id
    WHERE ml.entity_type = ? AND ml.entity_id = ?
    ORDER BY ml.sort_order, ml.created_at
  `, [entityType, entityId]);
}

export function reorderMediaLinks(db: Database, linkIds: string[]): void {
  const stmt = db.prepare('UPDATE media_links SET sort_order = ? WHERE id = ?');
  for (let i = 0; i < linkIds.length; i++) {
    stmt.run([i, linkIds[i]]);
  }
  stmt.finalize();
}

export function getLinksForMedia(db: Database, mediaId: string): MediaLink[] {
  return queryAll<MediaLink>(db, 'SELECT * FROM media_links WHERE media_id = ? ORDER BY entity_type, sort_order', [mediaId]);
}

export function removeMediaLink(db: Database, linkId: string): boolean {
  return runSqlChanges(db, 'DELETE FROM media_links WHERE id = ?', [linkId]) > 0;
}

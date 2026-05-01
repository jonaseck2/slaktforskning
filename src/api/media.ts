import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import type { Media, MediaLink, MediaLinkEntityType } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

/** Folder name convention: `foo.db` -> `foo-media`. Pure function of dbPath. */
export function getMediaFolderName(dbPath: string): string {
  const base = path.basename(dbPath, path.extname(dbPath));
  return `${base}-media`;
}

/** Absolute path to the per-database media folder, sibling to the .db file. */
export function getMediaDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), getMediaFolderName(dbPath));
}

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
  face_tag_count: number;
}

export type ListMediaSortBy = 'title' | 'format' | 'created_at';
export type ListMediaSortDir = 'asc' | 'desc';

export type MediaTypeFilter = 'image' | 'document' | 'audio' | 'video';
export type MediaStatusFilter = 'missing' | 'orphan';
export type MediaFaceTagFilter = 'tagged' | 'untagged';
export interface MediaListFilters {
  type?: MediaTypeFilter;
  status?: MediaStatusFilter;
  faceTag?: MediaFaceTagFilter;
}

const MEDIA_TYPE_FORMATS: Record<MediaTypeFilter, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'heic', 'heif'],
  document: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
  video: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'],
};

function buildMediaFilterClause(
  query: string | undefined,
  filters: MediaListFilters | undefined,
): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const q = (query ?? '').trim();
  if (q) {
    const like = `%${q}%`;
    clauses.push(`(m.title LIKE ? OR COALESCE(m.notes,'') LIKE ? OR COALESCE(m.format,'') LIKE ? OR COALESCE(m.file_ref,'') LIKE ?)`);
    params.push(like, like, like, like);
  }

  if (filters?.type) {
    const exts = MEDIA_TYPE_FORMATS[filters.type];
    const placeholders = exts.map(() => '?').join(', ');
    clauses.push(`LOWER(COALESCE(m.format,'')) IN (${placeholders})`);
    params.push(...exts);
  }

  if (filters?.status === 'missing') {
    clauses.push(`m.is_missing = 1`);
  } else if (filters?.status === 'orphan') {
    clauses.push(`(SELECT COUNT(*) FROM media_links ml WHERE ml.media_id = m.id) = 0`);
  }

  if (filters?.faceTag === 'tagged') {
    clauses.push(`EXISTS (SELECT 1 FROM media_regions mr WHERE mr.media_id = m.id)`);
  } else if (filters?.faceTag === 'untagged') {
    clauses.push(`NOT EXISTS (SELECT 1 FROM media_regions mr WHERE mr.media_id = m.id)`);
  }

  if (clauses.length === 0) return { where: '', params: [] };
  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

export function listMediaPage(
  db: Database,
  limit: number,
  offset: number,
  sortBy: ListMediaSortBy = 'title',
  sortDir: ListMediaSortDir = 'asc',
  query?: string,
  filters?: MediaListFilters,
): MediaListItem[] {
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const col = sortBy === 'format' ? 'format' : sortBy === 'created_at' ? 'created_at' : 'title';
  const orderBy = `COALESCE(m.${col},'') ${dir}, m.title ASC`;
  const filter = buildMediaFilterClause(query, filters);
  return queryAll<MediaListItem>(db, `
    SELECT m.*,
           (SELECT COUNT(*) FROM media_links ml WHERE ml.media_id = m.id) AS link_count,
           (SELECT COUNT(*) FROM media_regions mr WHERE mr.media_id = m.id) AS face_tag_count
    FROM media m
    ${filter.where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...filter.params, limit, offset]);
}

export function countMedia(db: Database, query?: string, filters?: MediaListFilters): number {
  const filter = buildMediaFilterClause(query, filters);
  if (!filter.where) {
    return queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM media')?.n ?? 0;
  }
  return queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM media m ${filter.where}`, filter.params)?.n ?? 0;
}

export function countMissingMedia(db: Database, query?: string, filters?: MediaListFilters): number {
  const filter = buildMediaFilterClause(query, filters);
  const missingClause = filter.where
    ? `${filter.where} AND m.is_missing = 1`
    : 'WHERE m.is_missing = 1';
  return queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM media m ${missingClause}`, filter.params)?.n ?? 0;
}

export function deleteMedia(db: Database, id: string): boolean {
  runSqlChanges(db, `DELETE FROM task_links WHERE entity_type = 'media' AND entity_id = ?`, [id]);
  runSqlChanges(db, `DELETE FROM group_links WHERE entity_type = 'media' AND entity_id = ?`, [id]);
  return runSqlChanges(db, 'DELETE FROM media WHERE id = ?', [id]) > 0;
}

export function updateMedia(db: Database, id: string, data: {
  title?: string;
  notes?: string;
  format?: string | null;
  is_printable?: boolean;
}): Media | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (data.format !== undefined) { fields.push('format = ?'); values.push(data.format); }
  if (data.is_printable !== undefined) { fields.push('is_printable = ?'); values.push(data.is_printable ? 1 : 0); }

  if (fields.length === 0) return getMedia(db, id);

  values.push(id);
  const changes = runSqlChanges(db, `UPDATE media SET ${fields.join(', ')} WHERE id = ?`, values);
  if (changes === 0) return null;
  return getMedia(db, id);
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

export interface ProfilePicRef {
  mediaId: string;
  region: { x: number; y: number; width: number; height: number } | null;
}

export function getPersonProfilePicRef(db: Database, personId: string): ProfilePicRef | null {
  // Avatar fallback chain:
  //   1. Any face-tagged region for this person  → cropped face wins
  //   2. Else the starred linked media (first by sort_order) → raw image
  //   3. Else null → initials placeholder
  const tagged = queryOne<{ media_id: string; x: number; y: number; width: number; height: number }>(db, `
    SELECT media_id, x, y, width, height FROM media_regions
    WHERE person_id = ?
    ORDER BY created_at
    LIMIT 1
  `, [personId]);
  if (tagged) {
    return {
      mediaId: tagged.media_id,
      region: { x: tagged.x, y: tagged.y, width: tagged.width, height: tagged.height },
    };
  }
  const link = queryOne<{ media_id: string }>(db, `
    SELECT media_id FROM media_links
    WHERE entity_type = 'person' AND entity_id = ?
    ORDER BY sort_order, created_at
    LIMIT 1
  `, [personId]);
  if (!link) return null;
  return { mediaId: link.media_id, region: null };
}

export function getPersonProfilePicRefs(db: Database, personIds: string[]): Record<string, ProfilePicRef | null> {
  const result: Record<string, ProfilePicRef | null> = {};
  for (const id of personIds) {
    result[id] = getPersonProfilePicRef(db, id);
  }
  return result;
}

export function getLinksForMedia(db: Database, mediaId: string): MediaLink[] {
  return queryAll<MediaLink>(db, 'SELECT * FROM media_links WHERE media_id = ? ORDER BY entity_type, sort_order', [mediaId]);
}

export function removeMediaLink(db: Database, linkId: string): boolean {
  return runSqlChanges(db, 'DELETE FROM media_links WHERE id = ?', [linkId]) > 0;
}

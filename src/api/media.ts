import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import type { Media, MediaLink, MediaLinkEntityType } from './types';
import { queryOne, queryAll, runSql, runSqlChanges, runBatch } from './db';
import { deleteIgnoredDuplicatesForMedia } from './duplicates';

/** Folder name convention: `foo.db` -> `foo-media`. Pure function of dbPath. */
export function getMediaFolderName(dbPath: string): string {
  const base = path.basename(dbPath, path.extname(dbPath));
  return `${base}-media`;
}

/** Absolute path to the per-database media folder, sibling to the .db file. */
export function getMediaDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), getMediaFolderName(dbPath));
}

export async function createMedia(db: Database, data: {
  file_ref?: string | null;
  title?: string;
  format?: string | null;
  notes?: string;
  is_printable?: boolean;
  is_missing?: boolean;
}): Promise<Media> {
  const id = crypto.randomUUID();
  await runSql(db, `
    INSERT INTO media (id, file_ref, title, format, notes, is_printable, is_missing)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.file_ref ?? null, data.title ?? '',
    data.format ?? null, data.notes ?? '',
    data.is_printable ? 1 : 0,
    data.is_missing ? 1 : 0,
  ]);
  return (await queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [id]))!;
}

/**
 * Bulk-insert media rows. One batched INSERT for N rows — used by the
 * GEDCOM importer's phaseObje when files reference thousands of OBJE
 * records, collapsing N IPC roundtrips to one.
 *
 * Each row may supply its own `id`; otherwise a v4 UUID is generated. Caller
 * needing the id ahead of time (importer xref maps) MUST supply it.
 */
export async function bulkCreateMedia(
  db: Database,
  rows: Array<{
    id?: string;
    file_ref?: string | null;
    title?: string;
    format?: string | null;
    notes?: string;
    is_printable?: boolean;
    is_missing?: boolean;
  }>,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const ids: string[] = new Array(rows.length);
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.id ?? crypto.randomUUID();
    ids[i] = id;
    params[i] = [
      id,
      r.file_ref ?? null,
      r.title ?? '',
      r.format ?? null,
      r.notes ?? '',
      r.is_printable ? 1 : 0,
      r.is_missing ? 1 : 0,
    ];
  }
  await runBatch(
    db,
    'INSERT INTO media (id, file_ref, title, format, notes, is_printable, is_missing) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params,
  );
  return ids;
}

export async function getMedia(db: Database, id: string): Promise<Media | null> {
  return (await queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [id])) ?? null;
}

export async function listMedia(db: Database): Promise<Media[]> {
  return await queryAll<Media>(db, 'SELECT * FROM media ORDER BY title');
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

export async function listMediaPage(
  db: Database,
  limit: number,
  offset: number,
  sortBy: ListMediaSortBy = 'title',
  sortDir: ListMediaSortDir = 'asc',
  query?: string,
  filters?: MediaListFilters,
): Promise<MediaListItem[]> {
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const col = sortBy === 'format' ? 'format' : sortBy === 'created_at' ? 'created_at' : 'title';
  const orderBy = `COALESCE(m.${col},'') ${dir}, m.title ASC`;
  const filter = buildMediaFilterClause(query, filters);
  return await queryAll<MediaListItem>(db, `
    SELECT m.*,
           (SELECT COUNT(*) FROM media_links ml WHERE ml.media_id = m.id) AS link_count,
           (SELECT COUNT(*) FROM media_regions mr WHERE mr.media_id = m.id) AS face_tag_count
    FROM media m
    ${filter.where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...filter.params, limit, offset]);
}

export async function countMedia(db: Database, query?: string, filters?: MediaListFilters): Promise<number> {
  const filter = buildMediaFilterClause(query, filters);
  if (!filter.where) {
    return (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM media'))?.n ?? 0;
  }
  return (await queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM media m ${filter.where}`, filter.params))?.n ?? 0;
}

export async function countMissingMedia(db: Database, query?: string, filters?: MediaListFilters): Promise<number> {
  const filter = buildMediaFilterClause(query, filters);
  const missingClause = filter.where
    ? `${filter.where} AND m.is_missing = 1`
    : 'WHERE m.is_missing = 1';
  return (await queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM media m ${missingClause}`, filter.params))?.n ?? 0;
}

export async function deleteMedia(db: Database, id: string): Promise<boolean> {
  await runSqlChanges(db, `DELETE FROM task_links WHERE entity_type = 'media' AND entity_id = ?`, [id]);
  await runSqlChanges(db, `DELETE FROM group_links WHERE entity_type = 'media' AND entity_id = ?`, [id]);
  // v0.220.0: ignored_duplicates is polymorphic — clean media-typed pairs so
  // a tombstoned id doesn't keep an "ignored" entry pointing at nothing.
  // Mirrors deletePerson / deletePlace / deleteSource.
  await deleteIgnoredDuplicatesForMedia(db, id);
  return (await runSqlChanges(db, 'DELETE FROM media WHERE id = ?', [id])) > 0;
}

export async function updateMedia(db: Database, id: string, data: {
  title?: string;
  notes?: string;
  format?: string | null;
  is_printable?: boolean;
  file_ref?: string | null;
}): Promise<Media | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (data.format !== undefined) { fields.push('format = ?'); values.push(data.format); }
  if (data.is_printable !== undefined) { fields.push('is_printable = ?'); values.push(data.is_printable ? 1 : 0); }
  if (data.file_ref !== undefined) { fields.push('file_ref = ?'); values.push(data.file_ref); }

  if (fields.length === 0) return await getMedia(db, id);

  values.push(id);
  const changes = await runSqlChanges(db, `UPDATE media SET ${fields.join(', ')} WHERE id = ?`, values);
  if (changes === 0) return null;
  return await getMedia(db, id);
}

export async function addMediaLink(db: Database, data: {
  media_id: string;
  entity_type: MediaLinkEntityType;
  entity_id: string;
  link_type?: number | null;
  sort_order?: number;
}): Promise<MediaLink> {
  const id = crypto.randomUUID();
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const max = await queryOne<{ m: number | null }>(db,
      'SELECT MAX(sort_order) AS m FROM media_links WHERE entity_type = ? AND entity_id = ?',
      [data.entity_type, data.entity_id]);
    sortOrder = (max?.m ?? -1) + 1;
  }
  await runSql(db, `
    INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, data.media_id, data.entity_type, data.entity_id, data.link_type ?? null, sortOrder]);
  return (await queryOne<MediaLink>(db, 'SELECT * FROM media_links WHERE id = ?', [id]))!;
}

/**
 * Bulk-insert media_links rows. Caller supplies `sort_order` per row (the
 * importer iterates per-entity and assigns dense order 0,1,2,...). No
 * per-row MAX(sort_order) query — caller knows the entity is freshly
 * created in this same batch.
 */
export async function bulkAddMediaLinks(
  db: Database,
  rows: Array<{
    media_id: string;
    entity_type: MediaLinkEntityType;
    entity_id: string;
    link_type?: number | null;
    sort_order: number;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    params[i] = [
      crypto.randomUUID(),
      r.media_id,
      r.entity_type,
      r.entity_id,
      r.link_type ?? null,
      r.sort_order,
    ];
  }
  await runBatch(
    db,
    'INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    params,
  );
}

export async function getMediaForEntity(db: Database, entityType: MediaLinkEntityType, entityId: string): Promise<(Media & { link_id: string; link_type: number | null; sort_order: number })[]> {
  return await queryAll<Media & { link_id: string; link_type: number | null; sort_order: number }>(db, `
    SELECT m.*, ml.id AS link_id, ml.link_type, ml.sort_order
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id
    WHERE ml.entity_type = ? AND ml.entity_id = ?
    ORDER BY ml.sort_order, ml.created_at
  `, [entityType, entityId]);
}

export async function reorderMediaLinks(db: Database, linkIds: string[]): Promise<void> {
  const stmt = db.prepare('UPDATE media_links SET sort_order = ? WHERE id = ?');
  try {
    for (let i = 0; i < linkIds.length; i++) {
      await stmt.run([i, linkIds[i]]);
    }
  } finally {
    stmt.finalize();
  }
}

export interface ProfilePicRef {
  mediaId: string;
  region: { x: number; y: number; width: number; height: number } | null;
}

export async function getPersonProfilePicRef(db: Database, personId: string): Promise<ProfilePicRef | null> {
  // Avatar fallback chain:
  //   1. Any face-tagged region for this person  → cropped face wins
  //   2. Else the starred linked media (first by sort_order) → raw image
  //   3. Else null → initials placeholder
  const tagged = await queryOne<{ media_id: string; x: number; y: number; width: number; height: number }>(db, `
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
  const link = await queryOne<{ media_id: string }>(db, `
    SELECT media_id FROM media_links
    WHERE entity_type = 'person' AND entity_id = ?
    ORDER BY sort_order, created_at
    LIMIT 1
  `, [personId]);
  if (!link) return null;
  return { mediaId: link.media_id, region: null };
}

/**
 * Bulk variant of getPersonProfilePicRef. Two SQL queries total regardless of N
 * (vs the per-id loop's 2N). Uses ROW_NUMBER() OVER (PARTITION BY ...) so the
 * "first" row per person is selected inside SQLite — no JS-side dedup. The
 * same fallback chain applies (face tag → first linked media → null).
 */
export async function getPersonProfilePicRefs(db: Database, personIds: string[]): Promise<Record<string, ProfilePicRef | null>> {
  const result: Record<string, ProfilePicRef | null> = {};
  if (personIds.length === 0) return result;
  for (const id of personIds) result[id] = null;

  const placeholders = personIds.map(() => '?').join(',');

  // Best face tag per person — first by created_at.
  const faceTags = await queryAll<{
    person_id: string; media_id: string; x: number; y: number; width: number; height: number;
  }>(db, `
    SELECT person_id, media_id, x, y, width, height FROM (
      SELECT person_id, media_id, x, y, width, height,
             ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY created_at) AS rn
      FROM media_regions
      WHERE person_id IN (${placeholders})
    )
    WHERE rn = 1
  `, personIds);

  for (const ft of faceTags) {
    result[ft.person_id] = {
      mediaId: ft.media_id,
      region: { x: ft.x, y: ft.y, width: ft.width, height: ft.height },
    };
  }

  // For persons without a face tag, fall back to the first linked media.
  const remaining = personIds.filter(id => result[id] === null);
  if (remaining.length === 0) return result;

  const placeholders2 = remaining.map(() => '?').join(',');
  const links = await queryAll<{ entity_id: string; media_id: string }>(db, `
    SELECT entity_id, media_id FROM (
      SELECT entity_id, media_id,
             ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY sort_order, created_at) AS rn
      FROM media_links
      WHERE entity_type = 'person' AND entity_id IN (${placeholders2})
    )
    WHERE rn = 1
  `, remaining);

  for (const l of links) {
    result[l.entity_id] = { mediaId: l.media_id, region: null };
  }

  return result;
}

export async function getLinksForMedia(db: Database, mediaId: string): Promise<MediaLink[]> {
  return await queryAll<MediaLink>(db, 'SELECT * FROM media_links WHERE media_id = ? ORDER BY entity_type, sort_order', [mediaId]);
}

export async function removeMediaLink(db: Database, linkId: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM media_links WHERE id = ?', [linkId])) > 0;
}

import type { Database } from 'node-sqlite3-wasm';
import type { MediaRegion } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export async function createMediaRegion(db: Database, data: {
  media_id: string;
  person_id?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string | null;
}): Promise<MediaRegion> {
  const id = crypto.randomUUID();
  await runSql(db, `
    INSERT INTO media_regions (id, media_id, person_id, x, y, width, height, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.media_id, data.person_id ?? null,
    data.x, data.y, data.width, data.height,
    data.label ?? null,
  ]);
  return (await queryOne<MediaRegion>(db, 'SELECT * FROM media_regions WHERE id = ?', [id]))!;
}

export async function getMediaRegions(db: Database, mediaId: string): Promise<MediaRegion[]> {
  return await queryAll<MediaRegion>(db, 'SELECT * FROM media_regions WHERE media_id = ? ORDER BY created_at', [mediaId]);
}

export async function getRegionsForPerson(db: Database, personId: string): Promise<(MediaRegion & { media_title: string })[]> {
  return await queryAll<MediaRegion & { media_title: string }>(db, `
    SELECT mr.*, m.title AS media_title
    FROM media_regions mr
    JOIN media m ON m.id = mr.media_id
    WHERE mr.person_id = ?
    ORDER BY mr.created_at
  `, [personId]);
}

export async function updateMediaRegion(db: Database, id: string, data: {
  person_id?: string | null;
  label?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): Promise<MediaRegion | null> {
  const existing = await queryOne<MediaRegion>(db, 'SELECT * FROM media_regions WHERE id = ?', [id]);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if ('person_id' in data) {
    updates.push('person_id = ?');
    params.push(data.person_id ?? null);
  }
  if ('label' in data) {
    updates.push('label = ?');
    params.push(data.label ?? null);
  }
  if ('x' in data) { updates.push('x = ?'); params.push(data.x); }
  if ('y' in data) { updates.push('y = ?'); params.push(data.y); }
  if ('width' in data) { updates.push('width = ?'); params.push(data.width); }
  if ('height' in data) { updates.push('height = ?'); params.push(data.height); }

  if (updates.length === 0) return existing;

  params.push(id);
  await runSql(db, `UPDATE media_regions SET ${updates.join(', ')} WHERE id = ?`, params);
  return (await queryOne<MediaRegion>(db, 'SELECT * FROM media_regions WHERE id = ?', [id])) ?? null;
}

export async function deleteMediaRegion(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM media_regions WHERE id = ?', [id])) > 0;
}

import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkMediaFileMissing(db: Database, _dbDir?: string): CheckResult[] {
  const rows = queryAll<{ id: string; file_ref: string }>(db, `
    SELECT id, file_ref FROM media
    WHERE is_missing = 1 AND file_ref IS NOT NULL AND file_ref != ''
  `);

  return rows.map(row => ({
    code: 'MEDIA_FILE_MISSING' as const,
    severity: 'warning' as CheckSeverity,
    message: `Mediafil saknas: ${row.file_ref}`,
    messageParams: { filePath: row.file_ref },
    personIds: [],
    mediaIds: [row.id],
  }));
}

export function checkOrphanedMedia(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; title: string | null }>(db, `
    SELECT m.id, m.title
    FROM media m
    WHERE NOT EXISTS (SELECT 1 FROM media_links ml WHERE ml.media_id = m.id)
  `);
  return rows.map(r => ({
    code: 'ORPHANED_MEDIA',
    severity: 'notice' as CheckSeverity,
    message: `Mediafil "${r.title || '(utan titel)'}" saknar kopplingar`,
    messageParams: { title: r.title || '' },
    personIds: [],
    mediaIds: [r.id],
  }));
}

export function checkMediaRegionOutOfBounds(db: Database): CheckResult[] {
  const rows = queryAll<{
    id: string; media_id: string; x: number; y: number; width: number; height: number;
  }>(db, `
    SELECT id, media_id, x, y, width, height FROM media_regions
    WHERE x < 0 OR y < 0 OR (x + width) > 1 OR (y + height) > 1
  `);
  return rows.map(r => ({
    code: 'MEDIA_REGION_OUT_OF_BOUNDS',
    severity: 'warning' as CheckSeverity,
    message: `Mediaregion ligger utanför bilden (${r.x.toFixed(2)}, ${r.y.toFixed(2)} + ${r.width.toFixed(2)}×${r.height.toFixed(2)})`,
    messageParams: { x: r.x, y: r.y, width: r.width, height: r.height },
    personIds: [],
    mediaIds: [r.media_id],
  }));
}

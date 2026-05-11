import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { dateDefinitelyAfter } from './check-utils';

export async function checkMediaFileMissing(db: Database, _dbDir?: string): Promise<CheckResult[]> {
  const rows = await queryAll<{ id: string; file_ref: string }>(db, `
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

export async function checkOrphanedMedia(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ id: string; title: string | null }>(db, `
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

export async function checkMediaRegionOutOfBounds(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{
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

export async function checkPhotoAfterSubjectDeath(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{
    media_id: string; person_id: string; event_date: string; death_date: string;
  }>(db, `
    SELECT mr.media_id, mr.person_id,
           e.date_value AS event_date,
           de.date_value AS death_date
    FROM media_regions mr
    JOIN media_links ml
      ON ml.media_id = mr.media_id AND ml.entity_type = 'event'
    JOIN events e
      ON e.id = ml.entity_id
      AND e.date_value IS NOT NULL
      AND e.date_type IN ('exact', 'calculated')
    JOIN event_participants dep
      ON dep.person_id = mr.person_id
    JOIN events de
      ON de.id = dep.event_id
      AND de.event_type = 'death'
      AND de.date_value IS NOT NULL
      AND de.date_type IN ('exact', 'calculated')
    WHERE mr.person_id IS NOT NULL
  `);
  const results: CheckResult[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!dateDefinitelyAfter(r.event_date, r.death_date)) continue;
    const key = `${r.media_id}:${r.person_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      code: 'PHOTO_AFTER_SUBJECT_DEATH',
      severity: 'warning' as CheckSeverity,
      message: `Bilden är daterad (${r.event_date}) efter den taggade personens död (${r.death_date})`,
      messageParams: { eventDate: r.event_date, deathDate: r.death_date },
      personIds: [r.person_id],
      mediaIds: [r.media_id],
    });
  }
  return results;
}

export async function checkPhotoBeforeSubjectBirth(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{
    media_id: string; person_id: string; event_date: string; birth_date: string;
  }>(db, `
    SELECT mr.media_id, mr.person_id,
           e.date_value AS event_date,
           be.date_value AS birth_date
    FROM media_regions mr
    JOIN media_links ml
      ON ml.media_id = mr.media_id AND ml.entity_type = 'event'
    JOIN events e
      ON e.id = ml.entity_id
      AND e.date_value IS NOT NULL
      AND e.date_type IN ('exact', 'calculated')
    JOIN event_participants bep
      ON bep.person_id = mr.person_id
    JOIN events be
      ON be.id = bep.event_id
      AND be.event_type = 'birth'
      AND be.date_value IS NOT NULL
      AND be.date_type IN ('exact', 'calculated')
    WHERE mr.person_id IS NOT NULL
  `);
  const results: CheckResult[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!dateDefinitelyAfter(r.birth_date, r.event_date)) continue;
    const key = `${r.media_id}:${r.person_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      code: 'PHOTO_BEFORE_SUBJECT_BIRTH',
      severity: 'warning' as CheckSeverity,
      message: `Bilden är daterad (${r.event_date}) före den taggade personens födelse (${r.birth_date})`,
      messageParams: { eventDate: r.event_date, birthDate: r.birth_date },
      personIds: [r.person_id],
      mediaIds: [r.media_id],
    });
  }
  return results;
}

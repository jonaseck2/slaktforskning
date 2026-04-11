import type { Database } from 'node-sqlite3-wasm';
import { existsSync } from 'fs';
import { queryAll } from '../db';
import type { CheckResult } from './check-utils';
import { haversineKm } from './check-utils';

export function checkSimultaneousDistantLocations(db: Database): CheckResult[] {
  // Find events for same person on same exact date with place lat/lon
  const rows = queryAll<{
    person_id: string;
    event1_id: string;
    date_value: string;
    lat1: number;
    lon1: number;
    event2_id: string;
    lat2: number;
    lon2: number;
  }>(db, `
    SELECT ep1.person_id,
           e1.id AS event1_id, e1.date_value,
           p1.latitude AS lat1, p1.longitude AS lon1,
           e2.id AS event2_id,
           p2.latitude AS lat2, p2.longitude AS lon2
    FROM event_participants ep1
    JOIN events e1 ON e1.id = ep1.event_id
      AND e1.date_type = 'exact' AND e1.date_value IS NOT NULL
      AND e1.place_id IS NOT NULL
    JOIN places p1 ON p1.id = e1.place_id
      AND p1.latitude IS NOT NULL AND p1.longitude IS NOT NULL
    JOIN event_participants ep2 ON ep2.person_id = ep1.person_id AND ep2.event_id > ep1.event_id
    JOIN events e2 ON e2.id = ep2.event_id
      AND e2.date_type = 'exact' AND e2.date_value = e1.date_value
      AND e2.place_id IS NOT NULL
    JOIN places p2 ON p2.id = e2.place_id
      AND p2.latitude IS NOT NULL AND p2.longitude IS NOT NULL
  `);

  const results: CheckResult[] = [];

  for (const r of rows) {
    const km = haversineKm(r.lat1, r.lon1, r.lat2, r.lon2);
    if (km > 500) {
      results.push({
        code: 'SIMULTANEOUS_DISTANT_LOCATIONS',
        severity: 'warning',
        message: `Två händelser på samma datum (${r.date_value}) är ${Math.round(km)} km från varandra`,
        messageParams: { date: r.date_value, km: Math.round(km) },
        personIds: [r.person_id],
        eventIds: [r.event1_id, r.event2_id],
      });
    }
  }

  return results;
}

export function checkMediaFileMissing(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; file_ref: string }>(db, `
    SELECT id, file_ref FROM media WHERE file_ref IS NOT NULL AND file_ref != ''
  `);

  const results: CheckResult[] = [];
  for (const row of rows) {
    if (!existsSync(row.file_ref)) {
      // Find linked persons
      const links = queryAll<{ entity_type: string; entity_id: string }>(db, `
        SELECT entity_type, entity_id FROM media_links WHERE media_id = ?
      `, [row.id]);
      const personIds = links.filter(l => l.entity_type === 'person').map(l => l.entity_id);

      results.push({
        code: 'MEDIA_FILE_MISSING',
        severity: 'warning',
        message: `Mediafil saknas: ${row.file_ref}`,
        messageParams: { filePath: row.file_ref },
        personIds,
      });
    }
  }

  return results;
}

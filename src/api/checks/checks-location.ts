import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { resolvePlace } from '../place-gazetteers/resolver';
import type { Gazetteer } from '../place-gazetteers/types';
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

export function checkGazetteerMatchQuality(db: Database, gazetteers: Gazetteer[]): CheckResult[] {
  if (gazetteers.length === 0) return [];

  // Places used in events that have no manual coordinates
  const places = queryAll<{ id: string; name: string }>(db, `
    SELECT DISTINCT p.id, p.name
    FROM places p
    JOIN events e ON e.place_id = p.id
    WHERE p.latitude IS NULL OR p.longitude IS NULL
  `);

  if (places.length === 0) return [];

  // Only check places that are actually referenced by at least one event
  // (an unused place with a dubious name isn't worth flagging).
  const placeIds = places.map(p => p.id);
  const placeholders = placeIds.map(() => '?').join(',');
  const usedRows = queryAll<{ place_id: string }>(db, `
    SELECT DISTINCT e.place_id
    FROM events e
    WHERE e.place_id IN (${placeholders})
  `, placeIds);
  const placesInUse = new Set(usedRows.map(r => r.place_id));

  // Bulk-load all place hierarchy data for path building (avoids N+1 getPlacePath)
  const allPlaceRows = queryAll<{ id: string; name: string; parent_place_id: string | null }>(db,
    'SELECT id, name, parent_place_id FROM places'
  );
  const placeMap = new Map(allPlaceRows.map(r => [r.id, r]));
  function buildPlacePath(id: string): string {
    const parts: string[] = [];
    let currentId: string | null = id;
    while (currentId) {
      const row = placeMap.get(currentId);
      if (!row) break;
      parts.push(row.name);
      currentId = row.parent_place_id;
    }
    return parts.join(', ');
  }

  const results: CheckResult[] = [];
  // Cache resolutions by name to avoid re-resolving duplicates
  const cache = new Map<string, ReturnType<typeof resolvePlace>>();

  for (const place of places) {
    if (!placesInUse.has(place.id)) continue;

    // Build full place path from in-memory map
    const fullPath = buildPlacePath(place.id);

    // Resolve with caching
    if (!cache.has(fullPath)) {
      cache.set(fullPath, resolvePlace(fullPath, gazetteers));
    }
    const resolved = cache.get(fullPath)!;

    if (!resolved) {
      results.push({
        code: 'PLACE_MATCH_NONE',
        severity: 'notice',
        message: `Platsen "${place.name}" kunde inte matchas mot något ortregister`,
        messageParams: { placeName: place.name },
        personIds: [],
        placeIds: [place.id],
      });
      continue;
    }

    const deepestNode = resolved.matchedNode;
    const isLeaf = !deepestNode.children || deepestNode.children.length === 0;
    const components = place.name.split(',').map(p => p.trim()).filter(Boolean);
    // Wrong-level: single-word input matched a deep leaf — likely a country/region
    // name that happened to match a village with the same name
    const isWrongLevel = components.length === 1 && isLeaf && resolved.matchDepth > 2;

    if (isWrongLevel) {
      results.push({
        code: 'PLACE_MATCH_WRONG_LEVEL',
        severity: 'warning',
        message: `Platsen "${place.name}" verkar matcha en specifik ort (${resolved.matchedPath.join(', ')}) snarare än det angivna området`,
        messageParams: { placeName: place.name, matchedPath: resolved.matchedPath.join(', ') },
        personIds: [],
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(', '),
      });
    } else if (resolved.matchQuality === 'ambiguous') {
      results.push({
        code: 'PLACE_MATCH_AMBIGUOUS',
        severity: 'warning',
        message: `Platsen "${place.name}" är tvetydig — flera möjliga platser hittades`,
        messageParams: { placeName: place.name },
        personIds: [],
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(', '),
      });
    } else if (resolved.matchQuality === 'partial') {
      results.push({
        code: 'PLACE_MATCH_PARTIAL',
        severity: 'notice',
        message: `Platsen "${place.name}" matchades delvis (ej matchade delar: ${resolved.unmatchedComponents.join(', ')})`,
        messageParams: { placeName: place.name, unmatched: resolved.unmatchedComponents.join(', ') },
        personIds: [],
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(', '),
      });
    }
    // matchQuality === 'exact' → no result
  }

  return results;
}

export function checkMediaFileMissing(db: Database, _dbDir?: string): CheckResult[] {
  // Use the is_missing flag set during import instead of calling existsSync per file.
  // This avoids thousands of synchronous filesystem checks that block the event loop.
  const rows = queryAll<{ id: string; file_ref: string }>(db, `
    SELECT id, file_ref FROM media
    WHERE is_missing = 1 AND file_ref IS NOT NULL AND file_ref != ''
  `);

  return rows.map(row => ({
    code: 'MEDIA_FILE_MISSING' as const,
    severity: 'warning' as const,
    message: `Mediafil saknas: ${row.file_ref}`,
    messageParams: { filePath: row.file_ref },
    personIds: [],
    mediaIds: [row.id],
  }));
}

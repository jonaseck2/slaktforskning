import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkOrphanedPlace(db: Database): CheckResult[] {
  // Four bulk set-membership queries instead of four correlated NOT EXISTS
  // subqueries (which went O(places × references) on large DBs).
  const places = queryAll<{ id: string; name: string }>(db, 'SELECT id, name FROM places');
  const usedByEvents = new Set(
    queryAll<{ id: string }>(db, 'SELECT DISTINCT place_id AS id FROM events WHERE place_id IS NOT NULL').map(r => r.id),
  );
  const usedByCitations = new Set(
    queryAll<{ id: string }>(db, 'SELECT DISTINCT place_id AS id FROM citations WHERE place_id IS NOT NULL').map(r => r.id),
  );
  const usedByChildPlaces = new Set(
    queryAll<{ id: string }>(db, 'SELECT DISTINCT parent_place_id AS id FROM places WHERE parent_place_id IS NOT NULL').map(r => r.id),
  );
  const usedByMedia = new Set(
    queryAll<{ id: string }>(
      db,
      "SELECT DISTINCT entity_id AS id FROM media_links WHERE entity_type = 'place'",
    ).map(r => r.id),
  );
  const rows = places.filter(
    p =>
      !usedByEvents.has(p.id) &&
      !usedByCitations.has(p.id) &&
      !usedByChildPlaces.has(p.id) &&
      !usedByMedia.has(p.id),
  );
  return rows.map(r => ({
    code: 'ORPHANED_PLACE',
    severity: 'notice' as CheckSeverity,
    message: `Platsen "${r.name}" används inte någonstans`,
    messageParams: { name: r.name },
    personIds: [],
    placeIds: [r.id],
  }));
}

export function checkCircularPlaceHierarchy(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; parent_place_id: string | null; name: string }>(db,
    'SELECT id, parent_place_id, name FROM places'
  );
  const parentOf = new Map<string, string | null>();
  const nameOf = new Map<string, string>();
  for (const r of rows) {
    parentOf.set(r.id, r.parent_place_id);
    nameOf.set(r.id, r.name);
  }

  const results: CheckResult[] = [];
  const cleared = new Set<string>();          // known acyclic
  const reportedCycles = new Set<string>();   // canonical cycle fingerprints

  for (const start of parentOf.keys()) {
    if (cleared.has(start)) continue;
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | null = start;
    while (current) {
      if (cleared.has(current)) break;
      if (onPath.has(current)) {
        // Cycle: slice the path from the revisit point
        const cycleStart = path.indexOf(current);
        const cycleNodes = path.slice(cycleStart);
        const key = [...cycleNodes].sort().join(',');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          results.push({
            code: 'CIRCULAR_PLACE_HIERARCHY',
            severity: 'error' as CheckSeverity,
            message: `Platshierarkin innehåller en cykel: ${cycleNodes.map(id => nameOf.get(id) ?? id).join(' → ')}`,
            messageParams: { chain: cycleNodes.map(id => nameOf.get(id) ?? id).join(' → ') },
            personIds: [],
            placeIds: cycleNodes,
          });
        }
        break;
      }
      onPath.add(current);
      path.push(current);
      current = parentOf.get(current) ?? null;
    }
    if (!current || cleared.has(current)) {
      for (const id of path) cleared.add(id);
    }
  }

  return results;
}

export function checkPlaceCoordinatesInvalid(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string; latitude: number; longitude: number }>(db, `
    SELECT id, name, latitude, longitude FROM places
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `);
  const results: CheckResult[] = [];
  for (const r of rows) {
    const outOfRange = r.latitude < -90 || r.latitude > 90 || r.longitude < -180 || r.longitude > 180;
    const nullIsland = r.latitude === 0 && r.longitude === 0;
    if (!outOfRange && !nullIsland) continue;
    const reason = outOfRange ? 'utanför giltigt intervall' : 'null-island (0, 0)';
    results.push({
      code: 'PLACE_COORDINATES_INVALID',
      severity: 'warning' as CheckSeverity,
      message: `Platsen "${r.name}" har ogiltiga koordinater (${r.latitude}, ${r.longitude}) — ${reason}`,
      messageParams: {
        name: r.name,
        lat: r.latitude,
        lon: r.longitude,
        reason,
      },
      personIds: [],
      placeIds: [r.id],
    });
  }
  return results;
}

export function checkPlaceDatesInverted(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string; date_from: string; date_to: string }>(db, `
    SELECT id, name, date_from, date_to FROM places
    WHERE date_from IS NOT NULL AND date_to IS NOT NULL AND date_from > date_to
  `);
  return rows.map(r => ({
    code: 'PLACE_DATES_INVERTED',
    severity: 'error' as CheckSeverity,
    message: `Platsen "${r.name}" har omvänt datumintervall (${r.date_from} → ${r.date_to})`,
    messageParams: { name: r.name, dateFrom: r.date_from, dateTo: r.date_to },
    personIds: [],
    placeIds: [r.id],
  }));
}

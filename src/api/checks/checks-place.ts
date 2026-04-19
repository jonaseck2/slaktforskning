import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkOrphanedPlace(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string }>(db, `
    SELECT p.id, p.name
    FROM places p
    WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.place_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM citations c WHERE c.place_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM places p2 WHERE p2.parent_place_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM media_links ml
        WHERE ml.entity_type = 'place' AND ml.entity_id = p.id
      )
  `);
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

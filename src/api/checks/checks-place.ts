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

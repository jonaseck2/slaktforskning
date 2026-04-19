import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkOrphanedSource(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; title: string }>(db, `
    SELECT s.id, s.title
    FROM sources s
    WHERE NOT EXISTS (
      SELECT 1 FROM citations c WHERE c.source_id = s.id
    )
  `);

  return rows.map(r => ({
    code: 'ORPHANED_SOURCE',
    severity: 'notice' as CheckSeverity,
    message: `Källa "${r.title || '(utan titel)'}" har inga källhänvisningar`,
    messageParams: { title: r.title || '' },
    personIds: [],
    sourceIds: [r.id],
  }));
}

import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export async function checkOrphanedSource(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ id: string; title: string }>(db, `
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

export async function checkSourceMissingTitle(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ id: string }>(db, `
    SELECT id FROM sources WHERE title IS NULL OR title = ''
  `);
  return rows.map(r => ({
    code: 'SOURCE_MISSING_TITLE',
    severity: 'warning' as CheckSeverity,
    message: 'Källa saknar titel',
    messageParams: {},
    personIds: [],
    sourceIds: [r.id],
  }));
}

export async function checkOrphanedRepository(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ id: string; name: string }>(db, `
    SELECT r.id, r.name
    FROM repositories r
    WHERE NOT EXISTS (
      SELECT 1 FROM source_repositories sr WHERE sr.repository_id = r.id
    )
  `);
  return rows.map(r => ({
    code: 'ORPHANED_REPOSITORY',
    severity: 'notice' as CheckSeverity,
    message: `Arkivet "${r.name}" är inte kopplat till någon källa`,
    messageParams: { name: r.name, repositoryId: r.id },
    personIds: [],
  }));
}

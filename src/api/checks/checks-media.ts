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

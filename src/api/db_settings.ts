import type { Database } from 'node-sqlite3-wasm';

export function getDbSetting(db: Database, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM db_settings WHERE key = ?');
  try {
    const row = stmt.get([key]) as { value: string } | undefined;
    return row?.value ?? null;
  } finally {
    (stmt as unknown as { finalize(): void }).finalize();
  }
}

export function setDbSetting(db: Database, key: string, value: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO db_settings (key, value) VALUES (?, ?)');
  try {
    stmt.run([key, value]);
  } finally {
    (stmt as unknown as { finalize(): void }).finalize();
  }
}

export function deleteDbSetting(db: Database, key: string): void {
  const stmt = db.prepare('DELETE FROM db_settings WHERE key = ?');
  try {
    stmt.run([key]);
  } finally {
    (stmt as unknown as { finalize(): void }).finalize();
  }
}

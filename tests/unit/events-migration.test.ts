import { describe, it, expect } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../../src/api/schema';
import { runSql, queryAll } from '../../src/api/db';

describe('events migration v0.203.0', async () => {
  it('preserves description content as notes after migration', async () => {
    const db = new Database(':memory:');
    // Build a pre-migration schema manually (mimics a pre-v0.203 database)
    await runSql(db, `
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        date_type TEXT NOT NULL DEFAULT 'unknown',
        date_value TEXT,
        date_value_end TEXT,
        date_original TEXT NOT NULL DEFAULT '',
        place_id TEXT,
        description TEXT NOT NULL DEFAULT '',
        cause TEXT,
        place_address TEXT,
        relationship_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await runSql(db, "INSERT INTO events (id, event_type, description, cause) VALUES ('e1', 'death', 'He died peacefully.', 'old age')");
    await runSql(db, "INSERT INTO events (id, event_type, description) VALUES ('e2', 'occupation', 'Carpenter — apprenticed at 14')");

    // Run the full schema initialization (which includes the migration block)
    await initializeSchema(db);

    const rows = await queryAll<{ id: string; notes: string; value: string | null; cause: string | null }>(
      db, 'SELECT id, notes, value, cause FROM events ORDER BY id', []
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'e1', notes: 'He died peacefully.', value: null, cause: 'old age' });
    expect(rows[1]).toMatchObject({ id: 'e2', notes: 'Carpenter — apprenticed at 14', value: null });
  });

  it('is idempotent (running twice does not error)', async () => {
    const db = new Database(':memory:');
    await initializeSchema(db);
    await initializeSchema(db);  // second run must not throw
    const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(events)', [])).map(c => c.name);
    expect(cols).toContain('value');
    expect(cols).toContain('notes');
    expect(cols).not.toContain('description');
  });

  it('fresh DB has value and notes columns from CREATE TABLE', async () => {
    const db = new Database(':memory:');
    await initializeSchema(db);
    const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(events)', [])).map(c => c.name);
    expect(cols).toContain('value');
    expect(cols).toContain('notes');
    expect(cols).not.toContain('description');
  });
});

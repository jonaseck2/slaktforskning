/**
 * Schema migration coverage.
 *
 * The risk this test guards against: a developer adds a column to a
 * `CREATE TABLE IF NOT EXISTS` block in `src/api/schema.ts` but forgets to
 * also add a `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` migration block
 * for users with pre-existing databases. Fresh installs work; users who
 * upgrade silently get a runtime crash on first read of the missing column.
 *
 * We assert three things:
 *  1. Idempotency — running `initializeSchema` twice on a fresh DB never
 *     throws (catches `ALTER TABLE` calls that aren't column-existence-guarded).
 *  2. Migration coverage — a synthesised pre-v0.3 schema (the original CREATE
 *     TABLE shapes from before any migrations were added) gets every current
 *     column after `initializeSchema` runs, AND sample data survives.
 *  3. Schema fingerprint — the snapshot of expected columns lives in this file.
 *     Adding a new column to schema.ts without updating the snapshot fails the
 *     test, forcing the developer to either (a) confirm the column has a
 *     migration block, or (b) consciously add it to the fingerprint.
 */
import { describe, it, expect } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../../src/api/schema';
import { runSql, queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

/** Columns expected on each table after `initializeSchema` runs.
 *  Update this snapshot whenever you add a new column to schema.ts.
 *  If you forget the migration block for an existing-DB upgrade, the
 *  pre-v0.3 fixture test will fail. */
const EXPECTED_COLUMNS: Record<string, string[]> = {
  persons:           ['id', 'sex', 'notes', 'display_id', 'created_at', 'updated_at'],
  person_names:      ['id', 'person_id', 'given_name', 'surname', 'name_type', 'date_from', 'date_to',
                      'sort_order', 'name_prefix', 'name_suffix', 'patronymic_base', 'name_qualifier',
                      'preferred_name', 'nickname'],
  person_identifiers:['id', 'person_id', 'identifier_type', 'identifier_value', 'created_at'],
  relationships:     ['id', 'type', 'person1_id', 'person2_id', 'subtype', 'notes', 'created_at', 'updated_at'],
  places:            ['id', 'name', 'normalized_name', 'place_type', 'latitude', 'longitude',
                      'parent_place_id', 'date_from', 'date_to', 'notes', 'street', 'postal_code',
                      'city', 'country'],
  events:            ['id', 'event_type', 'date_type', 'date_value', 'date_value_end', 'date_original',
                      'place_id', 'value', 'notes', 'created_at', 'updated_at',
                      'cause', 'place_address', 'relationship_id'],
  event_participants:['id', 'event_id', 'person_id', 'role'],
  sources:           ['id', 'title', 'author', 'publication_info', 'repository', 'url', 'source_type',
                      'created_at', 'updated_at', 'call_number', 'abstract'],
  citations:         ['id', 'source_id', 'page', 'date_accessed', 'confidence', 'transcription', 'notes',
                      'event_id', 'person_id', 'person_name_id', 'created_at',
                      'relationship_id', 'place_id'],
  groups:            ['id', 'name', 'notes', 'created_at'],
  group_links:       ['id', 'group_id', 'entity_type', 'entity_id', 'sort_order', 'created_at'],
  repositories:      ['id', 'name', 'address', 'city', 'postal_code', 'state', 'country',
                      'phone', 'email', 'web', 'call_number', 'notes', 'created_at'],
  source_repositories:['source_id', 'repository_id'],
  research_tasks:    ['id', 'priority', 'status', 'task', 'notes', 'result', 'created_at', 'updated_at'],
  task_links:        ['id', 'task_id', 'entity_type', 'entity_id', 'sort_order', 'created_at'],
  media:             ['id', 'file_ref', 'title', 'format', 'notes', 'is_printable', 'is_missing', 'created_at'],
  media_links:       ['id', 'media_id', 'entity_type', 'entity_id', 'link_type', 'sort_order', 'created_at'],
  media_regions:     ['id', 'media_id', 'person_id', 'x', 'y', 'width', 'height', 'label', 'created_at'],
  db_settings:       ['key', 'value'],
  gazetteers:        ['id', 'name', 'locale', 'description', 'source_json', 'data', 'created_at'],
  ignored_duplicates:['person1_id', 'person2_id', 'created_at'],
};

function tableCols(db: Database, table: string): string[] {
  return queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`).map(c => c.name);
}

describe('schema migrations', () => {
  it('initializeSchema is idempotent on a fresh DB', () => {
    const db = createTestDb();
    expect(() => initializeSchema(db)).not.toThrow();
    expect(() => initializeSchema(db)).not.toThrow();
    // After three runs no extra junk should accumulate.
    expect(tableCols(db, 'persons')).toEqual(expect.arrayContaining(EXPECTED_COLUMNS.persons));
  });

  it('current schema matches the fingerprint snapshot', () => {
    // If this fails, you added a column to schema.ts without updating
    // EXPECTED_COLUMNS above. Confirm the column has a migration block in
    // schema.ts (search for `ALTER TABLE <table> ADD COLUMN <col>`), then
    // add it to EXPECTED_COLUMNS.
    const db = createTestDb();
    for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
      const actual = tableCols(db, table).sort();
      const want = [...expected].sort();
      expect(actual, `Mismatch in table ${table}`).toEqual(want);
    }
  });

  it('upgrades a synthesised pre-v0.3 database — every current column exists after init', () => {
    const db = new Database(':memory:');

    // Build the v0.2-era schema by hand. These CREATE TABLE statements
    // intentionally OMIT all columns added by later migration blocks.
    runSql(db, `
      CREATE TABLE persons (
        id TEXT PRIMARY KEY,
        sex TEXT NOT NULL DEFAULT 'U',
        living INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE person_names (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        given_name TEXT,
        surname TEXT,
        name_type TEXT NOT NULL DEFAULT 'birth' CHECK(name_type IN ('birth', 'married', 'alias', 'aka')),
        date_from TEXT,
        date_to TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);
    runSql(db, `
      CREATE TABLE person_identifiers (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        identifier_type TEXT NOT NULL,
        identifier_value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE relationships (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        person1_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
        person2_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
        subtype TEXT,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE places (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL
      )
    `);
    runSql(db, `
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        date_type TEXT NOT NULL DEFAULT 'unknown',
        date_value TEXT,
        date_value_end TEXT,
        date_original TEXT NOT NULL DEFAULT '',
        place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE event_participants (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'primary',
        UNIQUE(event_id, person_id)
      )
    `);
    runSql(db, `
      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        publication_info TEXT NOT NULL DEFAULT '',
        repository TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE citations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        page TEXT NOT NULL DEFAULT '',
        date_accessed TEXT NOT NULL DEFAULT '',
        confidence INTEGER NOT NULL DEFAULT 0,
        transcription TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
        person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Legacy group_members table — should be dropped and migrated to group_links.
    runSql(db, `
      CREATE TABLE group_members (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, person_id)
      )
    `);
    runSql(db, `
      CREATE TABLE research_tasks (
        id TEXT PRIMARY KEY,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'done', 'stopped')),
        task TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL DEFAULT '',
        person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE media (
        id TEXT PRIMARY KEY,
        file_ref TEXT,
        title TEXT NOT NULL DEFAULT '',
        format TEXT,
        notes TEXT NOT NULL DEFAULT '',
        is_printable INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    runSql(db, `
      CREATE TABLE media_links (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        link_type INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Seed data that we expect to survive every migration.
    runSql(db, `INSERT INTO persons (id, sex, living, notes) VALUES ('p1', 'M', 1, 'pre-migration person')`);
    runSql(db, `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order) VALUES ('n1', 'p1', 'Anders', 'Persson', 'birth', 0)`);
    runSql(db, `INSERT INTO places (id, name, normalized_name) VALUES ('pl1', 'Stockholm', 'stockholm')`);
    runSql(db, `INSERT INTO events (id, event_type, description, place_id) VALUES ('e1', 'birth', 'born at home', 'pl1')`);
    runSql(db, `INSERT INTO events (id, event_type, description) VALUES ('e2', 'baptism', 'old type — should collapse to christening')`);
    runSql(db, `INSERT INTO sources (id, title) VALUES ('s1', 'Parish book')`);
    runSql(db, `INSERT INTO citations (id, source_id, page) VALUES ('c1', 's1', '12')`);
    runSql(db, `INSERT INTO groups (id, name) VALUES ('g1', 'Family')`);
    runSql(db, `INSERT INTO group_members (group_id, person_id) VALUES ('g1', 'p1')`);
    runSql(db, `INSERT INTO research_tasks (id, priority, status, task, person_id) VALUES ('t1', 0, 'open', 'Find death record', 'p1')`);

    // Run the full migration ladder.
    initializeSchema(db);

    // Every expected column from the fingerprint must now exist.
    for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
      const actual = tableCols(db, table);
      for (const col of expected) {
        expect(actual, `${table}.${col} missing after migration`).toContain(col);
      }
    }

    // Data preserved.
    const persons = queryAll<{ id: string; sex: string; notes: string }>(db, 'SELECT id, sex, notes FROM persons');
    expect(persons).toEqual([{ id: 'p1', sex: 'M', notes: 'pre-migration person' }]);

    // `living` column must have been dropped (derived at read time now).
    expect(tableCols(db, 'persons')).not.toContain('living');

    // `description` rename: events row must surface its old value as `notes`.
    const events = queryAll<{ id: string; event_type: string; notes: string }>(
      db, 'SELECT id, event_type, notes FROM events ORDER BY id'
    );
    expect(events[0]).toMatchObject({ id: 'e1', event_type: 'birth', notes: 'born at home' });
    // `baptism` collapsed to `christening` (v0.162.6 migration).
    expect(events[1]).toMatchObject({ id: 'e2', event_type: 'christening' });

    // `group_members` must have been migrated to `group_links` and dropped.
    const groupMembersExists = queryAll<{ name: string }>(
      db, `SELECT name FROM sqlite_master WHERE type='table' AND name='group_members'`
    );
    expect(groupMembersExists).toHaveLength(0);
    const links = queryAll<{ group_id: string; entity_type: string; entity_id: string }>(
      db, `SELECT group_id, entity_type, entity_id FROM group_links`
    );
    expect(links).toEqual([{ group_id: 'g1', entity_type: 'person', entity_id: 'p1' }]);

    // `research_tasks.person_id` must have moved to task_links and the column dropped.
    expect(tableCols(db, 'research_tasks')).not.toContain('person_id');
    const taskLinks = queryAll<{ task_id: string; entity_type: string; entity_id: string }>(
      db, `SELECT task_id, entity_type, entity_id FROM task_links`
    );
    expect(taskLinks).toEqual([{ task_id: 't1', entity_type: 'person', entity_id: 'p1' }]);

    // display_id backfill must have run.
    const displayIds = queryAll<{ display_id: number | null }>(
      db, 'SELECT display_id FROM persons WHERE id = ?', ['p1']
    );
    expect(displayIds[0].display_id).toBe(1);

    // Re-running initializeSchema on an already-migrated DB must be a no-op.
    expect(() => initializeSchema(db)).not.toThrow();
  });
});

import type { Database } from 'node-sqlite3-wasm';

export function initializeSchema(db: Database): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY,
      sex TEXT NOT NULL DEFAULT 'U' CHECK(sex IN ('M', 'F', 'U')),
      living INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS person_names (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      given_name TEXT,
      surname TEXT,
      name_type TEXT NOT NULL DEFAULT 'birth' CHECK(name_type IN ('birth', 'married', 'alias', 'aka')),
      date_from TEXT,
      date_to TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name_prefix TEXT,
      name_suffix TEXT,
      patronymic_base TEXT,
      name_qualifier TEXT CHECK(name_qualifier IN ('patronymic', 'matronymic', 'particle', 'married', 'alias'))
    );
    CREATE INDEX IF NOT EXISTS idx_person_names_person_id ON person_names(person_id);

    CREATE TABLE IF NOT EXISTS person_identifiers (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      identifier_type TEXT NOT NULL CHECK(identifier_type IN ('familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'other')),
      identifier_value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(person_id, identifier_type, identifier_value)
    );
    CREATE INDEX IF NOT EXISTS idx_person_identifiers_person_id ON person_identifiers(person_id);

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('couple', 'parent_child', 'sibling', 'godparent', 'other')),
      person1_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
      person2_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
      subtype TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_relationships_person1_id ON relationships(person1_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_person2_id ON relationships(person2_id);

    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL DEFAULT '',
      place_type TEXT,
      latitude REAL,
      longitude REAL,
      parent_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      date_from TEXT,
      date_to TEXT,
      notes TEXT NOT NULL DEFAULT '',
      street TEXT,
      postal_code TEXT,
      city TEXT,
      country TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      date_type TEXT NOT NULL DEFAULT 'unknown' CHECK(date_type IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown')),
      date_value TEXT,
      date_value_end TEXT,
      date_original TEXT NOT NULL DEFAULT '',
      place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_participants (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'primary',
      UNIQUE(event_id, person_id)
    );
    CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_participants_person_id ON event_participants(person_id);

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      publication_info TEXT NOT NULL DEFAULT '',
      repository TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS citations (
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
    );
    CREATE INDEX IF NOT EXISTS idx_citations_source_id ON citations(source_id);
    CREATE INDEX IF NOT EXISTS idx_citations_event_id ON citations(event_id);

    CREATE TABLE IF NOT EXISTS assertions (
      id TEXT PRIMARY KEY,
      citation_id TEXT NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      attribute TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      value_original TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 0,
      is_accepted INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_assertions_citation_id ON assertions(citation_id);
  `);

  // v0.3.0 column migrations — idempotent (skips if column already present)
  const eventCols = (db.prepare('PRAGMA table_info(events)').all([]) as Array<{ name: string }>).map(c => c.name);
  if (!eventCols.includes('relationship_id')) {
    db.exec(`ALTER TABLE events ADD COLUMN relationship_id TEXT REFERENCES relationships(id) ON DELETE SET NULL`);
  }

  const citationCols = (db.prepare('PRAGMA table_info(citations)').all([]) as Array<{ name: string }>).map(c => c.name);
  if (!citationCols.includes('relationship_id')) {
    db.exec(`ALTER TABLE citations ADD COLUMN relationship_id TEXT REFERENCES relationships(id) ON DELETE SET NULL`);
  }
  if (!citationCols.includes('place_id')) {
    db.exec(`ALTER TABLE citations ADD COLUMN place_id TEXT REFERENCES places(id) ON DELETE SET NULL`);
  }

  // v0.4.0 places column migrations — idempotent
  // v0.3.1 migration: person_names gained name_prefix, name_suffix, patronymic_base, name_qualifier
  const personNamesCols = (db.prepare('PRAGMA table_info(person_names)').all([]) as Array<{ name: string }>).map(c => c.name);
  if (!personNamesCols.includes('name_prefix')) {
    db.exec(`ALTER TABLE person_names ADD COLUMN name_prefix TEXT`);
  }
  if (!personNamesCols.includes('name_suffix')) {
    db.exec(`ALTER TABLE person_names ADD COLUMN name_suffix TEXT`);
  }
  if (!personNamesCols.includes('patronymic_base')) {
    db.exec(`ALTER TABLE person_names ADD COLUMN patronymic_base TEXT`);
  }
  if (!personNamesCols.includes('name_qualifier')) {
    db.exec(`ALTER TABLE person_names ADD COLUMN name_qualifier TEXT CHECK(name_qualifier IN ('patronymic', 'matronymic', 'particle', 'married', 'alias'))`);
  }

  const placesCols = (db.prepare('PRAGMA table_info(places)').all([]) as Array<{ name: string }>).map(c => c.name);
  if (!placesCols.includes('place_type')) {
    db.exec(`ALTER TABLE places ADD COLUMN place_type TEXT`);
  }
  if (!placesCols.includes('parent_place_id')) {
    db.exec(`ALTER TABLE places ADD COLUMN parent_place_id TEXT REFERENCES places(id) ON DELETE SET NULL`);
  }
  if (!placesCols.includes('date_from')) {
    db.exec(`ALTER TABLE places ADD COLUMN date_from TEXT`);
  }
  if (!placesCols.includes('date_to')) {
    db.exec(`ALTER TABLE places ADD COLUMN date_to TEXT`);
  }
  if (!placesCols.includes('notes')) {
    db.exec(`ALTER TABLE places ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
  }
  // v0.5.3 address fields
  if (!placesCols.includes('street')) {
    db.exec('ALTER TABLE places ADD COLUMN street TEXT');
  }
  if (!placesCols.includes('postal_code')) {
    db.exec('ALTER TABLE places ADD COLUMN postal_code TEXT');
  }
  if (!placesCols.includes('city')) {
    db.exec('ALTER TABLE places ADD COLUMN city TEXT');
  }
  if (!placesCols.includes('country')) {
    db.exec('ALTER TABLE places ADD COLUMN country TEXT');
  }

  // Indexes that depend on migrated columns — run after migrations
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_relationship_id ON events(relationship_id);
  `);
}

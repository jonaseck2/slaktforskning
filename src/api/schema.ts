import type { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runSql } from './db';

export async function initializeSchema(db: Database): Promise<void> {
  // node-sqlite3-wasm's custom VFS implements sqlite3_io_methods.iVersion=1,
  // which omits the shared-memory hooks WAL requires (xShmMap/xShmLock/...).
  // PRAGMA journal_mode=WAL silently downgrades to DELETE under this build —
  // see .claude/skills/sqlite-wal/. Running in DELETE mode (the SQLite
  // default) is fine; the only loss is concurrent reader-while-writer,
  // which we don't depend on. Don't add the pragma back: any .db file that
  // becomes WAL-tagged (e.g. touched by a real-SQLite tool like rusqlite or
  // the sqlite3 CLI) becomes unreadable to this build with bare
  // SQLITE_CANTOPEN. `scripts/walfix.mjs` recovers such files.
  await db.exec('PRAGMA foreign_keys = ON');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY,
      sex TEXT NOT NULL DEFAULT 'U' CHECK(sex IN ('M', 'F', 'U', 'X')),
      notes TEXT NOT NULL DEFAULT '',
      display_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS person_names (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      given_name TEXT,
      surname TEXT,
      name_type TEXT NOT NULL DEFAULT 'birth' CHECK(name_type IN ('birth', 'married', 'name_change', 'alias', 'aka')),
      date_from TEXT,
      date_to TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name_prefix TEXT,
      name_suffix TEXT,
      patronymic_base TEXT,
      name_qualifier TEXT CHECK(name_qualifier IN ('patronymic', 'matronymic', 'particle', 'married', 'alias')),
      preferred_name TEXT,
      nickname TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_person_names_person_id ON person_names(person_id);

    CREATE TABLE IF NOT EXISTS person_identifiers (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      identifier_type TEXT NOT NULL CHECK(identifier_type IN ('familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'uid', 'afn', 'ssn', 'other')),
      identifier_value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(person_id, identifier_type, identifier_value)
    );
    CREATE INDEX IF NOT EXISTS idx_person_identifiers_person_id ON person_identifiers(person_id);

    -- External identifiers for non-person entities. Round-trip storage for
    -- source-format ids (ArkivDigital _AID / _PARISH_AID, Gramps handles,
    -- Genney RIDs). No REFERENCES: five entity types, no polymorphic FK in
    -- SQLite. Nothing reads these to make a decision.
    CREATE TABLE IF NOT EXISTS external_identifiers (
      id          TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('source','place','citation','media','repository')),
      entity_id   TEXT NOT NULL,
      system      TEXT NOT NULL,
      value       TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_id, system, value)
    );
    CREATE INDEX IF NOT EXISTS idx_external_identifiers_entity ON external_identifiers(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_external_identifiers_lookup ON external_identifiers(system, value);

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
      date_type TEXT NOT NULL DEFAULT 'unknown' CHECK(date_type IN ('exact', 'about', 'before', 'after', 'between', 'from_to', 'interpreted', 'calculated', 'unknown')),
      date_value TEXT,
      date_value_end TEXT,
      date_original TEXT NOT NULL DEFAULT '',
      place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      value TEXT,
      notes TEXT NOT NULL DEFAULT '',
      is_negation INTEGER NOT NULL DEFAULT 0,
      negation_event_type TEXT NOT NULL DEFAULT '',
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
      person_name_id TEXT REFERENCES person_names(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_citations_source_id ON citations(source_id);
    CREATE INDEX IF NOT EXISTS idx_citations_event_id ON citations(event_id);

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_links (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('person', 'place', 'media')),
      entity_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_group_links_group_id ON group_links(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_links_entity ON group_links(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      postal_code TEXT,
      state TEXT,
      country TEXT,
      phone TEXT,
      email TEXT,
      web TEXT,
      call_number TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS source_repositories (
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      PRIMARY KEY (source_id, repository_id)
    );

    CREATE TABLE IF NOT EXISTS research_tasks (
      id TEXT PRIMARY KEY,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'done', 'stopped')),
      task TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_links (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('person', 'place', 'media')),
      entity_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(task_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_links_task_id ON task_links(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_links_entity ON task_links(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      file_ref TEXT,
      title TEXT NOT NULL DEFAULT '',
      format TEXT,
      notes TEXT NOT NULL DEFAULT '',
      is_printable INTEGER NOT NULL DEFAULT 0,
      is_missing INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_links (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('person', 'event', 'relationship', 'place', 'source')),
      entity_id TEXT NOT NULL,
      link_type INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_media_links_media_id ON media_links(media_id);
    CREATE INDEX IF NOT EXISTS idx_media_links_entity ON media_links(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS db_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_regions (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_media_regions_media_id ON media_regions(media_id);
    CREATE INDEX IF NOT EXISTS idx_media_regions_person_id ON media_regions(person_id);

    CREATE TABLE IF NOT EXISTS gazetteers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      locale TEXT NOT NULL,
      description TEXT,
      source_json TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- v0.220.0: ignored_duplicates is polymorphic. The pair columns keep
    -- their legacy names (person1_id/person2_id) but no longer carry an
    -- FK to persons; they hold whichever entity ids match entity_type.
    -- Cleanup on row delete is done in deletePerson/deletePlace/deleteSource/
    -- deleteMedia, mirroring the pattern used by group_links / task_links.
    CREATE TABLE IF NOT EXISTS ignored_duplicates (
      entity_type TEXT NOT NULL DEFAULT 'person' CHECK(entity_type IN ('person', 'place', 'source', 'media')),
      person1_id TEXT NOT NULL,
      person2_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity_type, person1_id, person2_id),
      CHECK (person1_id < person2_id)
    );

    -- ── T02 GEDCOM-alignment schema additions ─────────────────────────────
    -- Shared notes (GEDCOM 7.0 SNOTE / 5.5.1 inline NOTE). Filled by T04.
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Polymorphic note-to-entity attachments. Mirrors group_links / task_links.
    CREATE TABLE IF NOT EXISTS note_links (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('person', 'event', 'relationship', 'place', 'source', 'repository', 'media', 'family')),
      entity_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(note_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_note_links_note_id ON note_links(note_id);
    CREATE INDEX IF NOT EXISTS idx_note_links_entity ON note_links(entity_type, entity_id);

    -- Person-to-person associations (GEDCOM ASSO/RELA). Distinct from
    -- relationships table — these are non-family roles (godparent, friend,
    -- colleague, etc.) carried on an INDI. Filled by T05.
    CREATE TABLE IF NOT EXISTS person_associations (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      related_person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'other' CHECK(role IN ('godparent', 'friend', 'colleague', 'enemy', 'neighbor', 'other')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(person_id, related_person_id, role)
    );
    CREATE INDEX IF NOT EXISTS idx_person_associations_person_id ON person_associations(person_id);
    CREATE INDEX IF NOT EXISTS idx_person_associations_related_person_id ON person_associations(related_person_id);

    -- Translation / transliteration of a person name (GEDCOM 7.0 TRAN).
    -- Filled by T07.
    CREATE TABLE IF NOT EXISTS name_translations (
      id TEXT PRIMARY KEY,
      person_name_id TEXT NOT NULL REFERENCES person_names(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT '',
      transliteration_scheme TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_name_translations_person_name_id ON name_translations(person_name_id);

    -- Translation / transliteration of a place name (GEDCOM 7.0 PLAC/TRAN).
    -- Filled by T07.
    CREATE TABLE IF NOT EXISTS place_translations (
      id TEXT PRIMARY KEY,
      place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT '',
      transliteration_scheme TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_place_translations_place_id ON place_translations(place_id);

    -- Source coverage events — what events / date ranges / places a source
    -- covers (e.g. parish register covers births 1850-1900 in Råda parish).
    -- Distinct from citations (which attach a source to a specific authored
    -- event). Filled by T08.
    CREATE TABLE IF NOT EXISTS source_coverage_events (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      date_value_from TEXT NOT NULL DEFAULT '',
      date_value_to TEXT NOT NULL DEFAULT '',
      place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_source_coverage_events_source_id ON source_coverage_events(source_id);
  `);

  // v0.3.0 column migrations — idempotent (skips if column already present)
  const eventCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(events)')).map(c => c.name);
  if (!eventCols.includes('relationship_id')) {
    await db.exec(`ALTER TABLE events ADD COLUMN relationship_id TEXT REFERENCES relationships(id) ON DELETE SET NULL`);
  }

  const citationCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(citations)')).map(c => c.name);
  if (!citationCols.includes('relationship_id')) {
    await db.exec(`ALTER TABLE citations ADD COLUMN relationship_id TEXT REFERENCES relationships(id) ON DELETE SET NULL`);
  }
  if (!citationCols.includes('place_id')) {
    await db.exec(`ALTER TABLE citations ADD COLUMN place_id TEXT REFERENCES places(id) ON DELETE SET NULL`);
  }
  // v0.219.0: citations can now attach to person_names rows so a name change
  // (or any name record) can carry its own source. ON DELETE CASCADE matches
  // the parent → name FK semantics: deleting the name takes its citations
  // with it. See docs/plans/2026-05-06-name-citation-and-validity.md.
  if (!citationCols.includes('person_name_id')) {
    await runSql(db, 'ALTER TABLE citations ADD COLUMN person_name_id TEXT REFERENCES person_names(id) ON DELETE CASCADE');
  }

  // v0.4.0 places column migrations — idempotent
  // v0.3.1 migration: person_names gained name_prefix, name_suffix, patronymic_base, name_qualifier
  const personNamesCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(person_names)')).map(c => c.name);
  if (!personNamesCols.includes('name_prefix')) {
    await db.exec(`ALTER TABLE person_names ADD COLUMN name_prefix TEXT`);
  }
  if (!personNamesCols.includes('name_suffix')) {
    await db.exec(`ALTER TABLE person_names ADD COLUMN name_suffix TEXT`);
  }
  if (!personNamesCols.includes('patronymic_base')) {
    await db.exec(`ALTER TABLE person_names ADD COLUMN patronymic_base TEXT`);
  }
  if (!personNamesCols.includes('name_qualifier')) {
    await db.exec(`ALTER TABLE person_names ADD COLUMN name_qualifier TEXT CHECK(name_qualifier IN ('patronymic', 'matronymic', 'particle', 'married', 'alias'))`);
  }
  // v0.5.4 preferred_name (tilltalsnamn)
  if (!personNamesCols.includes('preferred_name')) {
    await db.exec('ALTER TABLE person_names ADD COLUMN preferred_name TEXT');
  }
  // v0.6.8 nickname (smeknamn)
  if (!personNamesCols.includes('nickname')) {
    await db.exec('ALTER TABLE person_names ADD COLUMN nickname TEXT');
  }

  const placesCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(places)')).map(c => c.name);
  if (!placesCols.includes('place_type')) {
    await db.exec(`ALTER TABLE places ADD COLUMN place_type TEXT`);
  }
  if (!placesCols.includes('parent_place_id')) {
    await db.exec(`ALTER TABLE places ADD COLUMN parent_place_id TEXT REFERENCES places(id) ON DELETE SET NULL`);
  }
  if (!placesCols.includes('date_from')) {
    await db.exec(`ALTER TABLE places ADD COLUMN date_from TEXT`);
  }
  if (!placesCols.includes('date_to')) {
    await db.exec(`ALTER TABLE places ADD COLUMN date_to TEXT`);
  }
  if (!placesCols.includes('notes')) {
    await db.exec(`ALTER TABLE places ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
  }
  // v0.5.3 address fields
  if (!placesCols.includes('street')) {
    await db.exec('ALTER TABLE places ADD COLUMN street TEXT');
  }
  if (!placesCols.includes('postal_code')) {
    await db.exec('ALTER TABLE places ADD COLUMN postal_code TEXT');
  }
  if (!placesCols.includes('city')) {
    await db.exec('ALTER TABLE places ADD COLUMN city TEXT');
  }
  if (!placesCols.includes('country')) {
    await db.exec('ALTER TABLE places ADD COLUMN country TEXT');
  }

  // v0.7.0 events: cause + place_address
  if (!eventCols.includes('cause')) {
    await db.exec('ALTER TABLE events ADD COLUMN cause TEXT');
  }
  if (!eventCols.includes('place_address')) {
    await db.exec('ALTER TABLE events ADD COLUMN place_address TEXT');
  }
  // T02 GEDCOM-alignment: events.is_negation + events.negation_event_type
  // for GEDCOM 7.0 NO X negative-assertion support. Idempotent — the main
  // CREATE TABLE block above includes them; this guard upgrades pre-T02 DBs
  // and is exercised by tests/unit/schema-migrations.test.ts.
  if (!eventCols.includes('is_negation')) {
    await runSql(db, "ALTER TABLE events ADD COLUMN is_negation INTEGER NOT NULL DEFAULT 0");
  }
  if (!eventCols.includes('negation_event_type')) {
    await runSql(db, "ALTER TABLE events ADD COLUMN negation_event_type TEXT NOT NULL DEFAULT ''");
  }

  // v0.7.0 sources: call_number + abstract
  const sourcesCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(sources)')).map(c => c.name);
  if (!sourcesCols.includes('call_number')) {
    await db.exec('ALTER TABLE sources ADD COLUMN call_number TEXT');
  }
  if (!sourcesCols.includes('abstract')) {
    await db.exec('ALTER TABLE sources ADD COLUMN abstract TEXT');
  }
  // T02 GEDCOM-alignment: drop legacy free-text `sources.repository` column.
  // Idempotent — the main CREATE TABLE block above omits it; this guard
  // strips it from pre-T02 DBs. Repository affiliation now rides the
  // structured `source_repositories` junction. Free-text values that were
  // present are preserved as synthesized Repository rows.
  if (sourcesCols.includes('repository')) {
    // Backfill: for every source with a non-empty repository value that
    // isn't already linked to a Repository, synthesize a Repository row and
    // link it. Idempotent: a source already linked to a repository with the
    // same name is left alone.
    const rowsWithRepoText = await queryAll<{ id: string; repository: string }>(
      db,
      "SELECT id, repository FROM sources WHERE repository IS NOT NULL AND TRIM(repository) != ''",
    );
    // Deduplicate by case-insensitive name within this migration batch.
    const synthByName = new Map<string, string>();
    for (const row of rowsWithRepoText) {
      const key = row.repository.trim().toLowerCase();
      let repoId = synthByName.get(key);
      if (!repoId) {
        // Look for an existing Repository with the same name (case-insensitive).
        const existing = await queryOne<{ id: string }>(db,
          'SELECT id FROM repositories WHERE LOWER(name) = ?', [key]);
        if (existing) {
          repoId = existing.id;
        } else {
          repoId = crypto.randomUUID();
          await runSql(db,
            "INSERT INTO repositories (id, name, notes) VALUES (?, ?, '')",
            [repoId, row.repository.trim()]);
        }
        synthByName.set(key, repoId);
      }
      // Link if not already linked.
      const alreadyLinked = await queryOne<{ source_id: string }>(db,
        'SELECT source_id FROM source_repositories WHERE source_id = ? AND repository_id = ?',
        [row.id, repoId]);
      if (!alreadyLinked) {
        await runSql(db,
          'INSERT INTO source_repositories (source_id, repository_id) VALUES (?, ?)',
          [row.id, repoId]);
      }
    }
    // Drop the column. node-sqlite3-wasm supports DROP COLUMN (SQLite 3.35+).
    await runSql(db, 'ALTER TABLE sources DROP COLUMN repository');
  }

  // v0.8.0 media: is_missing flag for files that couldn't be found/extracted
  const mediaCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(media)')).map(c => c.name);
  if (!mediaCols.includes('is_missing')) {
    await db.exec('ALTER TABLE media ADD COLUMN is_missing INTEGER NOT NULL DEFAULT 0');
  }

  // v0.9.0 media_links: sort_order for user-controlled ordering
  const mediaLinkCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(media_links)')).map(c => c.name);
  if (!mediaLinkCols.includes('sort_order')) {
    await db.exec('ALTER TABLE media_links ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }

  // v0.79.0 name_type: add 'name_change' to CHECK constraint
  // SQLite CHECK constraints are baked into the schema — must recreate the table to relax them.
  const nameTypeCheck = (await queryOne<{ sql: string }>(db,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='person_names'`
  ))?.sql ?? '';
  if (!nameTypeCheck.includes('name_change')) {
    // SQLite quirk: with foreign_keys=ON, DROP TABLE issues an implicit
    // DELETE that cascades into child rows (citations.person_name_id with
    // ON DELETE CASCADE). The table redefinition pattern must run with FKs
    // disabled — this is the SQLite-recommended approach (sqlite.org/lang_altertable.html
    // step 12). Children re-bind to the renamed table.
    await runSql(db, 'DROP TABLE IF EXISTS person_names_new');
    await runSql(db, 'PRAGMA foreign_keys = OFF');
    try {
      await runSql(db, `
        CREATE TABLE person_names_new (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
          given_name TEXT,
          surname TEXT,
          name_type TEXT NOT NULL DEFAULT 'birth' CHECK(name_type IN ('birth', 'married', 'name_change', 'alias', 'aka')),
          date_from TEXT,
          date_to TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          name_prefix TEXT,
          name_suffix TEXT,
          patronymic_base TEXT,
          name_qualifier TEXT CHECK(name_qualifier IN ('patronymic', 'matronymic', 'particle', 'married', 'alias')),
          preferred_name TEXT,
          nickname TEXT
        )
      `);
      await runSql(db, 'INSERT INTO person_names_new SELECT id, person_id, given_name, surname, name_type, date_from, date_to, sort_order, name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname FROM person_names');
      await runSql(db, 'DROP TABLE person_names');
      await runSql(db, 'ALTER TABLE person_names_new RENAME TO person_names');
    } finally {
      await runSql(db, 'PRAGMA foreign_keys = ON');
    }
  }

  // v0.80.0: research_tasks.person_id → task_links; group_members → group_links
  // Generic link tables let tasks and groups attach persons, places, and media.
  const researchTaskCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(research_tasks)')).map(c => c.name);
  if (researchTaskCols.includes('person_id')) {
    const existingTasks = await queryAll<{ id: string; person_id: string | null }>(
      db, 'SELECT id, person_id FROM research_tasks WHERE person_id IS NOT NULL'
    );
    for (const t of existingTasks) {
      await runSql(db,
        `INSERT OR IGNORE INTO task_links (id, task_id, entity_type, entity_id, sort_order) VALUES (?, ?, 'person', ?, 0)`,
        [crypto.randomUUID(), t.id, t.person_id!]
      );
    }
    // FK toggle protects task_links rows we just inserted from being
    // cascade-deleted by `DROP TABLE research_tasks` (SQLite issues an
    // implicit DELETE during DROP when foreign_keys=ON; task_links.task_id
    // → research_tasks(id) ON DELETE CASCADE would wipe them).
    await runSql(db, 'PRAGMA foreign_keys = OFF');
    try {
      await runSql(db, 'DROP INDEX IF EXISTS idx_research_tasks_person_id');
      await runSql(db, `
        CREATE TABLE research_tasks_new (
          id TEXT PRIMARY KEY,
          priority INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'done', 'stopped')),
          task TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          result TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await runSql(db, `
        INSERT INTO research_tasks_new (id, priority, status, task, notes, result, created_at, updated_at)
          SELECT id, priority, status, task, notes, result, created_at, updated_at FROM research_tasks
      `);
      await runSql(db, 'DROP TABLE research_tasks');
      await runSql(db, 'ALTER TABLE research_tasks_new RENAME TO research_tasks');
    } finally {
      await runSql(db, 'PRAGMA foreign_keys = ON');
    }
  }

  const groupMembersExists = await queryOne<{ name: string }>(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='group_members'`
  );
  if (groupMembersExists) {
    const existingMembers = await queryAll<{ group_id: string; person_id: string }>(
      db, 'SELECT group_id, person_id FROM group_members'
    );
    for (const m of existingMembers) {
      await runSql(db,
        `INSERT OR IGNORE INTO group_links (id, group_id, entity_type, entity_id, sort_order) VALUES (?, ?, 'person', ?, 0)`,
        [crypto.randomUUID(), m.group_id, m.person_id]
      );
    }
    await runSql(db, 'DROP TABLE group_members');
  }

  // Indexes that depend on migrated columns — run after migrations
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_relationship_id ON events(relationship_id);
    CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_type_datetype ON events(event_type, date_type);
    CREATE INDEX IF NOT EXISTS idx_person_names_person_sort ON person_names(person_id, sort_order);
  `);

  // Drop bad index that confuses the query planner on listPersonsPage
  await runSql(db, 'DROP INDEX IF EXISTS idx_person_names_sort_name');

  // Living flag is no longer stored — derived from birth/death events at read time.
  // GEDCOM standard has no LIVING tag (the old _LIVING was a non-standard extension).
  const personsCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(persons)')).map(c => c.name);
  if (personsCols.includes('living')) {
    await runSql(db, 'ALTER TABLE persons DROP COLUMN living');
  }

  // v0.162.6: collapse 'baptism' and 'christening' event types into 'christening'.
  // The two were duplicates in Swedish ("Dop") and a single canonical type avoids
  // double-listing in event-type pickers (BENGT #28d). Idempotent — no-op once
  // all rows already say 'christening'.
  await runSql(db, "UPDATE events SET event_type='christening' WHERE event_type='baptism'");

  // v0.203.0 events: add `value` column (GEDCOM-X Fact.value / GEDCOM 5.5.1 line value)
  // and rename `description` -> `notes` so the column name reflects what it always
  // semantically held (free-form notes), now distinct from the fact's primary value.
  // See docs/plans/archive/2026-05-02-events-fact-value-design.md
  const eventColsV203 = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(events)')).map(c => c.name);
  if (!eventColsV203.includes('value')) {
    await runSql(db, 'ALTER TABLE events ADD COLUMN value TEXT');
  }
  if (eventColsV203.includes('description') && !eventColsV203.includes('notes')) {
    await runSql(db, 'ALTER TABLE events RENAME COLUMN description TO notes');
  }

  // v0.211.0: place lookup indexes. findOrCreatePlace and findOrCreatePlaceWithChain
  // run thousands of `SELECT … WHERE normalized_name = ?` (and `WHERE parent_place_id
  // = ? AND normalized_name = ?`) per import. Without these indexes each lookup is a
  // full table scan, making large imports O(n²).
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_places_normalized_name ON places(normalized_name)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_places_parent_normalized ON places(parent_place_id, normalized_name)');

  // v0.218.0: persons.display_id — per-database integer ordering label, visible
  // to genealogists in the panel header and the persons list. Stable, sortable,
  // never recycled. Not GEDCOM-representable; re-assigned on import per
  // gedcom_fidelity_registry. See plan 2026-05-05-person-id-visibility.md.
  const personsColsV218 = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(persons)')).map(c => c.name);
  if (!personsColsV218.includes('display_id')) {
    await runSql(db, 'ALTER TABLE persons ADD COLUMN display_id INTEGER');
  }
  // Index creation must run unconditionally (idempotent via IF NOT EXISTS) so
  // both fresh DBs and pre-v0.218 DBs end up with it. Keeping the index inside
  // the inline CREATE TABLE block crashes initializeSchema on a pre-v0.218 DB
  // because the column doesn't exist yet at that point.
  await runSql(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_display_id ON persons(display_id) WHERE display_id IS NOT NULL');
  // Backfill any rows missing display_id. Runs on startup so importers that
  // bypass createPerson (Genney, restore-from-undo) get backfilled the next
  // time the database is opened. Cheap when nothing is missing — the WHERE
  // EXISTS check short-circuits and the UPDATE is skipped.
  const missingDisplayId = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons WHERE display_id IS NULL'))?.n ?? 0;
  if (missingDisplayId > 0) {
    await runSql(db, 'BEGIN IMMEDIATE');
    try {
      const maxRow = await queryOne<{ m: number | null }>(db, 'SELECT MAX(display_id) as m FROM persons');
      const startFrom = (maxRow?.m ?? 0) + 1;
      const rows = await queryAll<{ id: string }>(db, `
        SELECT id FROM persons
        WHERE display_id IS NULL
        ORDER BY created_at, id
      `);
      for (let i = 0; i < rows.length; i++) {
        await runSql(db, 'UPDATE persons SET display_id = ? WHERE id = ?', [startFrom + i, rows[i].id]);
      }
      await runSql(db, 'COMMIT');
    } catch (err) {
      try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  // v0.235.0: extend person_identifiers.identifier_type CHECK with 'uid', 'afn', 'ssn'.
  // Real-world testing against RootsMagic / FTM / FamilyOrigins / PAF exports surfaced
  // these widely-used identifier tags being silently dropped on import. SQLite CHECK
  // constraints are baked in — must recreate the table to relax them.
  const identifierCheck = (await queryOne<{ sql: string }>(db,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='person_identifiers'`
  ))?.sql ?? '';
  if (identifierCheck && !identifierCheck.includes("'uid'")) {
    await runSql(db, 'DROP TABLE IF EXISTS person_identifiers_new');
    await runSql(db, 'PRAGMA foreign_keys = OFF');
    try {
      await runSql(db, `
        CREATE TABLE person_identifiers_new (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
          identifier_type TEXT NOT NULL CHECK(identifier_type IN ('familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'uid', 'afn', 'ssn', 'other')),
          identifier_value TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(person_id, identifier_type, identifier_value)
        )
      `);
      await runSql(db, 'INSERT INTO person_identifiers_new SELECT id, person_id, identifier_type, identifier_value, created_at FROM person_identifiers');
      await runSql(db, 'DROP TABLE person_identifiers');
      await runSql(db, 'ALTER TABLE person_identifiers_new RENAME TO person_identifiers');
      await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_person_identifiers_person_id ON person_identifiers(person_id)');
    } finally {
      await runSql(db, 'PRAGMA foreign_keys = ON');
    }
  }

  // v0.236.0: quality_issue_counts cache table for the persons-list
  // `Kvalitet` column. Refreshed by App.vue's loadQualityBadge debounce
  // path (and by an explicit refresher when the column is enabled). The
  // table holds derived data — a count of unresolved quality issues per
  // person — and is therefore exempt from the GEDCOM fidelity registry
  // (registered as `excluded` because it's a render-time cache, not
  // authored). See plan 2026-05-09-persons-list-aggregate-columns.
  await runSql(db, `
    CREATE TABLE IF NOT EXISTS quality_issue_counts (
      person_id TEXT PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
      issue_count INTEGER NOT NULL DEFAULT 0,
      refreshed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // v0.236.0: indexes that speed up the persons-list aggregate-column query.
  // Each subquery in the new SELECT (event_count, relationship_count,
  // media_count, group_count, task_count, name_count) hits one of these.
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_event_participants_person_id ON event_participants(person_id)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_relationships_person1_id ON relationships(person1_id)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_relationships_person2_id ON relationships(person2_id)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_media_links_entity ON media_links(entity_type, entity_id)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_group_links_entity ON group_links(entity_type, entity_id)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_task_links_entity ON task_links(entity_type, entity_id)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_person_names_person_id ON person_names(person_id)');

  // v0.249.0: ignored_duplicates polymorphism. Older databases keyed the pair
  // on (person1_id, person2_id) only and carried a hard FK to persons(id).
  // The new shape adds an `entity_type` column (default 'person') and drops
  // the persons FK so place/source/media pairs can also be ignored. Existing
  // rows are preserved with entity_type='person' (the column DEFAULT). The
  // FK drop requires a table rebuild — SQLite doesn't support DROP CONSTRAINT.
  const ignoredCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(ignored_duplicates)')).map(c => c.name);
  const ignoredSql = (await queryOne<{ sql: string }>(db,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='ignored_duplicates'`
  ))?.sql ?? '';
  // Two triggers for migration:
  //   (a) entity_type column missing — pre-polymorphic shape
  //   (b) the table sql still has the old FK to persons (REFERENCES persons)
  // Either condition means we need to rebuild. The fresh CREATE above already
  // produces the new shape, but on an upgraded DB CREATE IF NOT EXISTS is a
  // no-op so this rebuild block is the only path to the new shape.
  const needsIgnoredRebuild = !ignoredCols.includes('entity_type') || ignoredSql.includes('REFERENCES persons');
  if (needsIgnoredRebuild) {
    await runSql(db, 'DROP TABLE IF EXISTS ignored_duplicates_new');
    await runSql(db, 'PRAGMA foreign_keys = OFF');
    try {
      await runSql(db, `
        CREATE TABLE ignored_duplicates_new (
          entity_type TEXT NOT NULL DEFAULT 'person' CHECK(entity_type IN ('person', 'place', 'source', 'media')),
          person1_id TEXT NOT NULL,
          person2_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (entity_type, person1_id, person2_id),
          CHECK (person1_id < person2_id)
        )
      `);
      // Carry every existing row forward as entity_type='person' (the only
      // entity type the pre-polymorphic table supported).
      if (ignoredCols.includes('entity_type')) {
        await runSql(db, `
          INSERT INTO ignored_duplicates_new (entity_type, person1_id, person2_id, created_at)
          SELECT entity_type, person1_id, person2_id, created_at FROM ignored_duplicates
        `);
      } else {
        await runSql(db, `
          INSERT INTO ignored_duplicates_new (entity_type, person1_id, person2_id, created_at)
          SELECT 'person', person1_id, person2_id, created_at FROM ignored_duplicates
        `);
      }
      await runSql(db, 'DROP TABLE ignored_duplicates');
      await runSql(db, 'ALTER TABLE ignored_duplicates_new RENAME TO ignored_duplicates');
    } finally {
      await runSql(db, 'PRAGMA foreign_keys = ON');
    }
  }

  // T09 GEDCOM-alignment: extend events.date_type CHECK to include 'from_to'
  // (GEDCOM FROM..TO directional range, distinct from BET..AND) and
  // 'interpreted' (GEDCOM INT keyword for an interpreted date with a
  // user-authored phrase). Idempotent — the main CREATE TABLE block above
  // already includes them; this guard rebuilds the table on pre-T09 DBs to
  // relax the CHECK constraint. SQLite CHECK constraints are baked in;
  // ALTER cannot change them — table redefinition is the SQLite-recommended
  // approach. See SQL pattern docs at sqlite.org/lang_altertable.html step 12.
  const eventsCheck = (await queryOne<{ sql: string }>(db,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='events'`
  ))?.sql ?? '';
  if (!eventsCheck.includes("'from_to'") || !eventsCheck.includes("'interpreted'")) {
    await runSql(db, 'DROP TABLE IF EXISTS events_new');
    await runSql(db, 'PRAGMA foreign_keys = OFF');
    try {
      // Pull current column list from the live table to assemble a SELECT that
      // works whether the DB has every late-migration column or not.
      const liveCols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(events)')).map(c => c.name);
      const has = (c: string): boolean => liveCols.includes(c);
      await runSql(db, `
        CREATE TABLE events_new (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          date_type TEXT NOT NULL DEFAULT 'unknown' CHECK(date_type IN ('exact', 'about', 'before', 'after', 'between', 'from_to', 'interpreted', 'calculated', 'unknown')),
          date_value TEXT,
          date_value_end TEXT,
          date_original TEXT NOT NULL DEFAULT '',
          place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
          place_address TEXT,
          cause TEXT,
          value TEXT,
          notes TEXT NOT NULL DEFAULT '',
          relationship_id TEXT REFERENCES relationships(id) ON DELETE SET NULL,
          is_negation INTEGER NOT NULL DEFAULT 0,
          negation_event_type TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      const selectCols = [
        'id', 'event_type', 'date_type', 'date_value', 'date_value_end', 'date_original',
        'place_id',
        has('place_address') ? 'place_address' : 'NULL AS place_address',
        has('cause') ? 'cause' : 'NULL AS cause',
        has('value') ? 'value' : 'NULL AS value',
        'notes',
        has('relationship_id') ? 'relationship_id' : 'NULL AS relationship_id',
        has('is_negation') ? 'is_negation' : '0 AS is_negation',
        has('negation_event_type') ? 'negation_event_type' : "'' AS negation_event_type",
        'created_at', 'updated_at',
      ].join(', ');
      await runSql(db, `INSERT INTO events_new SELECT ${selectCols} FROM events`);
      await runSql(db, 'DROP TABLE events');
      await runSql(db, 'ALTER TABLE events_new RENAME TO events');
      // Re-create indexes on the rebuilt table (the originals were dropped
      // with the old table).
      await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_events_relationship_id ON events(relationship_id)');
      await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type)');
      await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_events_type_datetype ON events(event_type, date_type)');
    } finally {
      await runSql(db, 'PRAGMA foreign_keys = ON');
    }
  }
}

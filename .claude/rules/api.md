---
paths:
  - "src/api/**/*.ts"
  - "src/main/db-worker.ts"
  - "tests/unit/**/*.test.ts"
---

# API Layer Rules

Loads when working in `src/api/`, the DB worker, or unit tests.

## Domain Types (`src/api/types.ts`)

```typescript
Person           { id, sex: 'M'|'F'|'U', living: boolean, notes, created_at, updated_at }
PersonName       { id, person_id, given_name, surname, name_type: 'birth'|'married'|'alias'|'aka', date_from?, date_to?, sort_order, name_prefix?, name_suffix?, patronymic_base?, name_qualifier?, preferred_name?, nickname? }
PersonIdentifier { id, person_id, identifier_type: 'familysearch'|'ancestry'|'riksarkivet'|'personnummer'|'refn'|'rin'|'other', identifier_value, created_at }
Relationship     { id, type: 'couple'|'parent_child'|'sibling'|'godparent'|'other', person1_id?, person2_id?, subtype?, notes, created_at, updated_at }
EventParticipant { id, event_id, person_id, role: 'primary'|'spouse'|'parent'|'child'|'witness'|'godparent'|'officiant'|'other' }
GenealogyEvent   { id, event_type, date_type, date_value?, date_value_end?, date_original, place_id?, place_address?, cause?, value?, notes, relationship_id?, created_at, updated_at }
Place            { id, name, normalized_name, place_type?, parent_place_id?, latitude?, longitude?, date_from?, date_to?, notes, street?, postal_code?, city?, country? }
Source           { id, title, author, publication_info, repository, url, source_type, call_number?, abstract?, created_at, updated_at }
Citation         { id, source_id, page, date_accessed, confidence: 0-3, transcription, notes, event_id?, person_id?, relationship_id?, place_id?, created_at }
Group            { id, name, notes, created_at }
GroupLink        { id, group_id, entity_type: 'person'|'place'|'media', entity_id, sort_order, created_at }
Repository       { id, name, address?, city?, postal_code?, state?, country?, phone?, email?, web?, call_number?, notes, created_at }
ResearchTask     { id, priority: number, status: 'open'|'in_progress'|'done'|'stopped', task, notes, result, created_at, updated_at }
TaskLink         { id, task_id, entity_type: 'person'|'place'|'media', entity_id, sort_order, created_at }
Media            { id, file_ref?, title, format?, notes, is_printable: boolean, created_at }
MediaLink        { id, media_id, entity_type: 'person'|'event'|'relationship'|'place'|'source', entity_id, link_type?, sort_order: number, created_at }
MediaRegion      { id, media_id, person_id?, x: number, y: number, width: number, height: number, label?, created_at }
```

## Database Schema

16 tables with foreign keys and cascade deletes. Schema in `src/api/schema.ts`, applied via `initializeSchema(db)` (idempotent).

| Table | Key Columns | FK Cascades |
|-------|-------------|-------------|
| `persons` | id, sex, notes (living is derived from events at read time) | — |
| `person_names` | person_id, given_name, surname, name_type, sort_order, preferred_name, nickname | person_id → CASCADE |
| `relationships` | type, person1_id, person2_id, subtype, notes | person1/person2 → CASCADE |
| `events` | event_type, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes, relationship_id | relationship → SET NULL, place → SET NULL |
| `event_participants` | event_id, person_id, role (UNIQUE event+person) | both → CASCADE |
| `places` | name, normalized_name, place_type, latitude, longitude, parent_place_id, date_from, date_to, notes, street, postal_code, city, country | parent → SET NULL |
| `sources` | title, author, publication_info, repository, url, source_type, call_number, abstract | — |
| `citations` | source_id, page, confidence, transcription, notes, event_id, person_id, relationship_id, place_id | source → CASCADE, event/person/relationship → SET NULL |
| `groups` | name, notes | — |
| `group_links` | group_id, entity_type ∈ {person\|place\|media}, entity_id, sort_order (UNIQUE on triple) | group → CASCADE; entity_id polymorphic — cleaned up by `deletePerson`/`deletePlace`/`deleteMedia` |
| `repositories` | name, address, city, postal_code, state, country, phone, email, web, call_number, notes | — |
| `source_repositories` | source_id, repository_id (UNIQUE) | both → CASCADE |
| `research_tasks` | priority, status, task, notes, result | — |
| `task_links` | task_id, entity_type ∈ {person\|place\|media}, entity_id, sort_order (UNIQUE on triple) | task → CASCADE; entity_id polymorphic |
| `media` | file_ref, title, format, notes, is_printable | — |
| `media_links` | media_id, entity_type, entity_id, link_type, sort_order | media → CASCADE |
| `media_regions` | media_id, person_id, x, y, width, height, label | media → CASCADE, person → SET NULL |
| `gazetteers` | id, name, locale, description, source_json, data (BLOB), created_at | — |

## API function pattern

Every function takes `db: Database` as its first argument and returns domain types from `types.ts` — **no global DB singletons; always pass `db` as a parameter.** One file per entity domain following CRUD naming (`create*`, `get*`, `list*`, `update*`, `delete*`, plus per-relationship helpers like `getCitationsForPerson`, `addEventParticipant`, `findOrCreatePlace`, `mergePersons`).

## Storage conventions

- **UUIDs (v4)** for all primary keys
- **ISO date strings** in DB; genealogy dates use `date_type` + `date_original` to preserve uncertainty (see Domain Types above)
- **WAL mode** with **foreign keys enforced** — set in `src/main/database.ts` on connection open

`docs/IPC_REFERENCE.md` is the authoritative function-by-function reference; the source files are the truth.

## SQLite Quirks (node-sqlite3-wasm)

- Parameter binding uses arrays: `stmt.run([a, b])` not `stmt.run(a, b)`
- `db.get()` returns `undefined` not `null` — api/ functions use `?? null`
- No `.pragma()` method — run a `PRAGMA` statement via `runSql(db, 'PRAGMA ...')` instead
- Emscripten creates `.db.lock` directories that go stale on crash — auto-cleaned on startup
- Always finalize prepared statements — use `queryOne` / `queryAll` / `runSql` from `src/api/db.ts`. The `/sqlite-finalize` skill has the full WASM-heap-leak rationale and the `withStatementCache` pattern for bulk operations.
- **Project security hook flags the SQLite `Database.exec` method name as potential command injection (false positive).** Use `db.prepare('...').run([])` or `runSql(db, '...')` in source code — works identically. Avoid writing the flagged literal string in plan files and commit messages too.

## Database migrations — adding columns to existing tables

`CREATE TABLE IF NOT EXISTS` only creates the table if it doesn't exist — it **never** adds missing columns to an existing database. Any new column on an existing table requires a migration guard at the end of `initializeSchema()` in `src/api/schema.ts`:

```typescript
// v0.5.0 migrations
const thingsCols = (db.prepare('PRAGMA table_info(things)').all([]) as Array<{ name: string }>).map(c => c.name);
if (!thingsCols.includes('new_column')) {
  runSql(db, 'ALTER TABLE things ADD COLUMN new_column TEXT');
}
```

One `PRAGMA table_info` call per table, then check each new column separately. Match the column definition exactly (type, DEFAULT, constraints) to the `CREATE TABLE` statement above. Never skip — a missing migration is a runtime crash for any user with a pre-existing database.

## Per-database settings

`src/api/db_settings.ts` provides `getDbSetting(db, key)`, `setDbSetting(db, key, value)`, `deleteDbSetting(db, key)` backed by the `db_settings` table. Known keys: `default_person_id`, `link_rules_config`, `gazetteer_config`, `event_defaults_config`, `researcher_name` / `address` / `phone` / `email`, `report_show_header_footer`. Exposed to renderer via `window.api.db.getSetting / setSetting / deleteSetting`.

## SQLite bulk-write performance — mandatory rules

Any operation that writes more than ~50 rows **must** use a single transaction. Without this, each prepared `.run()` is its own autocommit, triggering an individual WAL flush — for large imports this produces hundreds of MB of disk writes and takes minutes instead of seconds.

```typescript
runSql(db, 'BEGIN IMMEDIATE');
try {
  for (const row of rows) createThing(db, row);
  runSql(db, 'COMMIT');
} catch (err) {
  try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
  throw err;
}
```

`BEGIN IMMEDIATE` acquires the write lock upfront (avoids upgrade deadlocks). Use it for any import or migration that writes multiple rows. For bulk imports, also use `withStatementCache` to avoid re-compiling the same SQL thousands of times — see `/sqlite-finalize`.

## Import/export data integrity

`import_file` and the underlying import functions return a report object with `warnings: string[]` and `unmappedData` / `skipped` arrays documenting what data was lost and why (LDS ordinances, TRAN translations, NO negative assertions, dropped ASSO associations, orphaned events/citations, unknown event types). `ImportReport` includes `repositories`, `groups`, and `researchTasks` counts. SUBM records are matched to persons and stored as `default_person_id`. `export_gedcom` returns `{ ged: string; report: ExportReport }` with `excluded[]` for entities that cannot be represented in GEDCOM 5.5.1 (Research Tasks, Groups, place_address fields).

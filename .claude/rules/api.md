---
paths:
  - "src/api/**/*.ts"
  - "tests/unit/**/*.test.ts"
---

# API Layer Rules

Loads when working in `src/api/` or unit tests. `src/api/` is runtime-neutral TypeScript over SQLite. Renderer + MCP route through rusqlite via `src/renderer/db-shim.ts`; Vitest tests route through `node-sqlite3-wasm` in-memory via `createTestDb()`. Same `Database` shape on both sides.

## Domain Types (`src/api/types.ts`)

```typescript
Person              { id, sex: 'M'|'F'|'U'|'X', living: boolean, notes, created_at, updated_at }
PersonName          { id, person_id, given_name, surname, name_type: 'birth'|'married'|'alias'|'aka', date_from?, date_to?, sort_order, name_prefix?, name_suffix?, patronymic_base?, name_qualifier?, preferred_name?, nickname? }
PersonIdentifier    { id, person_id, identifier_type: 'familysearch'|'ancestry'|'riksarkivet'|'personnummer'|'refn'|'rin'|'other', identifier_value, created_at }
ExternalIdentifier  { id, entity_type: 'source'|'place'|'citation'|'media'|'repository', entity_id, system, value, created_at }
Relationship        { id, type: 'couple'|'parent_child'|'sibling'|'godparent'|'other', person1_id?, person2_id?, subtype?, notes, created_at, updated_at }
PersonAssociation   { id, person_id, related_person_id, role: 'godparent'|'friend'|'colleague'|'enemy'|'neighbor'|'other', notes, created_at }
EventParticipant    { id, event_id, person_id, role: 'primary'|'spouse'|'parent'|'child'|'witness'|'godparent'|'officiant'|'other' }
GenealogyEvent      { id, event_type, date_type, date_value?, date_value_end?, date_original, place_id?, place_address?, cause?, value?, notes, relationship_id?, is_negation: boolean, negation_event_type?, created_at, updated_at }
Place               { id, name, normalized_name, place_type?, parent_place_id?, latitude?, longitude?, date_from?, date_to?, notes, street?, postal_code?, city?, country? }
PlaceTranslation    { id, place_id, value, language, transliteration_scheme, created_at }
Source              { id, title, author, publication_info, url, source_type, call_number?, abstract?, created_at, updated_at }
SourceCoverageEvent { id, source_id, event_type, date_value_from, date_value_to, place_id?, notes, created_at }
Citation            { id, source_id, page, date_accessed, confidence: 0-3, transcription, notes, event_id?, person_id?, relationship_id?, place_id?, person_name_id?, created_at }
Note                { id, text, language, created_at, updated_at }
NoteLink            { id, note_id, entity_type: 'person'|'event'|'relationship'|'place'|'source'|'repository'|'media'|'family', entity_id, sort_order, created_at }
NameTranslation     { id, person_name_id, value, language, transliteration_scheme, created_at }
Group               { id, name, notes, created_at }
GroupLink           { id, group_id, entity_type: 'person'|'place'|'media', entity_id, sort_order, created_at }
Repository          { id, name, address?, city?, postal_code?, state?, country?, phone?, email?, web?, call_number?, notes, created_at }
ResearchTask        { id, priority: number, status: 'open'|'in_progress'|'done'|'stopped', task, notes, result, created_at, updated_at }
TaskLink            { id, task_id, entity_type: 'person'|'place'|'media', entity_id, sort_order, created_at }
Media               { id, file_ref?, title, format?, notes, is_printable: boolean, created_at }
MediaLink           { id, media_id, entity_type: 'person'|'event'|'relationship'|'place'|'source', entity_id, link_type?, sort_order: number, created_at }
MediaRegion         { id, media_id, person_id?, x: number, y: number, width: number, height: number, label?, created_at }
```

**`Source.repository` (free-text string column) was DROPPED in T02 of the GEDCOM alignment plan.** Source ↔ Repository linkage is FK-only via `source_repositories`. Importers synthesize a structured Repository from any legacy `_REPO_TEXT` / unbracketed REPO value on import.

**GEDCOM 7.0 alignment context.** Six tables — `notes` + `note_links` (SNOTE), `person_associations` (ASSO without event), `name_translations` (NAME/TRAN), `place_translations` (PLAC/TRAN), `source_coverage_events` (SOUR/DATA/EVEN) — plus `events.is_negation` + `events.negation_event_type` (NO X) and `persons.sex='X'` (intersex), are GEDCOM 7.0 concepts the schema didn't model before T02. See `docs/GEDCOM_AUDIT.md` for per-version round-trip status.

## Database Schema

22 tables with foreign keys and cascade deletes. Schema in `src/api/schema.ts`, applied via `initializeSchema(db)` (idempotent). Canonical per-table comparison against GEDCOM 5.5.1 / 7.0 / Holger / Genney / RootsMagic / Gramps lives in `docs/GEDCOM_AUDIT.md` §1.

| Table | Key Columns | FK Cascades |
|-------|-------------|-------------|
| `persons` | id, sex (M/F/U/X), notes (living is derived from events at read time) | — |
| `person_names` | person_id, given_name, surname, name_type, sort_order, preferred_name, nickname | person_id → CASCADE |
| `person_identifiers` | person_id, identifier_type, identifier_value | person → CASCADE |
| `relationships` | type, person1_id, person2_id, subtype, notes | person1/person2 → CASCADE |
| `person_associations` | person_id, related_person_id, role, notes (UNIQUE on triple) | both → CASCADE |
| `events` | event_type, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes, relationship_id, **is_negation, negation_event_type** | relationship → SET NULL, place → SET NULL |
| `event_participants` | event_id, person_id, role (UNIQUE event+person) | both → CASCADE |
| `places` | name, normalized_name, place_type, latitude, longitude, parent_place_id, date_from, date_to, notes, street, postal_code, city, country | parent → SET NULL |
| `place_translations` | place_id, value, language, transliteration_scheme | place → CASCADE |
| `sources` | title, author, publication_info, url, source_type, call_number, abstract (legacy `repository` DROPPED in T02) | — |
| `source_coverage_events` | source_id, event_type, date_value_from, date_value_to, place_id, notes | source → CASCADE, place → SET NULL |
| `citations` | source_id, page, confidence, transcription, notes, event_id, person_id, relationship_id, place_id, person_name_id | source → CASCADE, event/person/relationship → SET NULL, person_name → CASCADE |
| `notes` | text, language | — |
| `note_links` | note_id, entity_type ∈ {person\|event\|relationship\|place\|source\|repository\|media\|family}, entity_id, sort_order (UNIQUE on triple) | note → CASCADE; entity_id polymorphic |
| `name_translations` | person_name_id, value, language, transliteration_scheme | person_name → CASCADE |
| `groups` | name, notes | — |
| `group_links` | group_id, entity_type ∈ {person\|place\|media}, entity_id, sort_order (UNIQUE on triple) | group → CASCADE; entity_id polymorphic — cleaned up by `deletePerson`/`deletePlace`/`deleteMedia` |
| `repositories` | name, address, city, postal_code, state, country, phone, email, web, call_number, notes | — |
| `source_repositories` | source_id, repository_id (UNIQUE) — **the only Source ↔ Repository link mechanism** | both → CASCADE |
| `research_tasks` | priority, status, task, notes, result | — |
| `task_links` | task_id, entity_type ∈ {person\|place\|media}, entity_id, sort_order (UNIQUE on triple) | task → CASCADE; entity_id polymorphic |
| `media` | file_ref, title, format, notes, is_printable | — |
| `media_links` | media_id, entity_type, entity_id, link_type, sort_order | media → CASCADE |
| `media_regions` | media_id, person_id, x, y, width, height, label | media → CASCADE, person → SET NULL |
| `external_identifiers` | entity_type ∈ {source\|place\|citation\|media\|repository}, entity_id, system, value (UNIQUE on the four) — round-trip only, never read to decide anything | none; entity_id polymorphic |
| `gazetteers` | id, name, locale, description, source_json, data (BLOB), created_at | — |

Tables added in T02 (v0.262.0): `person_associations`, `notes`, `note_links`, `name_translations`, `place_translations`, `source_coverage_events`. Columns added to `events`: `is_negation`, `negation_event_type`. `persons.sex` CHECK extended to accept `'X'`. Column dropped: `sources.repository`.

## API function pattern

Every function takes `db: Database` as its first argument and returns domain types from `types.ts` — **no global DB singletons; always pass `db` as a parameter.** One file per entity domain. CRUD naming (`create*`, `get*`, `list*`, `update*`, `delete*`), plus per-relationship helpers (`getCitationsForPerson`, `addEventParticipant`, `findOrCreatePlace`, `mergePersons`).

## Storage conventions

- **UUIDs (v4)** for all primary keys.
- **ISO date strings** in DB; genealogy dates use `date_type` + `date_original` to preserve uncertainty.
- **`PRAGMA foreign_keys = ON`** in `src/api/schema.ts` on connection open. **DELETE journaling** is canonical (not WAL). Reasons + recovery for externally-WAL-tagged files: `sqlite-wal` skill.

`docs/IPC_REFERENCE.md` is the authoritative function-by-function reference; source files are the truth.

## SQLite quirks (both runtimes)

Renderer/MCP on rusqlite; Vitest on `node-sqlite3-wasm`. Shared `Database` shape papers over differences; quirks that bleed through:

- Parameter binding uses arrays: `stmt.run([a, b])` — never `stmt.run(a, b)`.
- `db.get()` returns `undefined`, not `null`. Api functions use `?? null`.
- No `.pragma()` method — issue `PRAGMA …` via `runSql(db, 'PRAGMA …')`.
- Always go through `queryOne` / `queryAll` / `runSql` / `runBatch` from `src/api/db.ts`. These handle finalization and shape both backends consistently. Never call `db.prepare(...).run(...)` raw.
- Security hook flags SQLite's bulk-statement method `Database.<x>` (where `<x>` is `e-x-e-c`, the four-letter substring also used by `child_process.<x>`) as command injection — false positive. Use `runSql` or `db.prepare('...').run([])`. Avoid the literal four-letter substring in source, plans, and commit messages.

## Database migrations — adding columns to existing tables

`CREATE TABLE IF NOT EXISTS` never adds missing columns to an existing DB. Any new column on an existing table requires a migration guard at the end of `initializeSchema()` in `src/api/schema.ts`:

```typescript
// v0.5.0 migrations
const thingsCols = (db.prepare('PRAGMA table_info(things)').all([]) as Array<{ name: string }>).map(c => c.name);
if (!thingsCols.includes('new_column')) {
  runSql(db, 'ALTER TABLE things ADD COLUMN new_column TEXT');
}
```

One `PRAGMA table_info` per table, check each new column separately, match the column definition exactly (type, DEFAULT, constraints) to the `CREATE TABLE`. A missing migration is a runtime crash for any user with a pre-existing database.

## Per-database settings

`src/api/db_settings.ts` provides `getDbSetting(db, key)`, `setDbSetting(db, key, value)`, `deleteDbSetting(db, key)` backed by the `db_settings` table. Known keys: `default_person_id`, `link_rules_config`, `gazetteer_config`, `event_defaults_config`, `researcher_name` / `address` / `phone` / `email`, `report_show_header_footer`. Renderer access via `window.api.db.getSetting / setSetting / deleteSetting`.

## SQLite bulk-write performance — mandatory rules

Any operation writing more than ~50 rows **must** use a single transaction. Without this, each prepared `.run()` is its own autocommit, triggering a per-row WAL flush — hundreds of MB of disk writes, minutes instead of seconds.

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

`BEGIN IMMEDIATE` acquires the write lock upfront (avoids upgrade deadlocks). Applies to **any writes-in-loop**, not just imports or migrations. Audit any new `for (const row of rows) <DB-write>` loop. For bulk imports, also use `runBatch` (below).

**Use `runBatch` instead of `for (const row of rows) await stmt.run([...])` whenever row count is unbounded or > ~50.** Under Tauri, every `await stmt.run([...])` pays ~1 ms of IPC roundtrip (renderer → Rust → rusqlite → return). For a 1.5 GB Holger import (millions of rows), that's hours of IPC. `runBatch` collapses N IPC roundtrips into one: Rust prepares the SQL once, holds the connection mutex for the whole batch, iterates rows under the lock. Mid-batch failures propagate so the surrounding `BEGIN/COMMIT` ROLLBACKs.

```typescript
import { runBatch, runBatchOnStatement } from '../api/db';

// Single SQL across many rows: use runBatch (creates+finalizes the statement).
await runBatch(db, 'INSERT INTO things (id, name) VALUES (?, ?)', rows.map(r => [r.id, r.name]));

// Inside an importer with a cached prepared statement:
const stmt = db.prepare('INSERT INTO things (id, name) VALUES (?, ?)');
try {
  await runBatchOnStatement(stmt, rowsBuffer);
} finally {
  stmt.finalize();
}
```

Same surface in Vitest (node-sqlite3-wasm has no IPC cost; `runBatch` is a sync per-row loop, but the API shape is identical so importer code stays single-sourced). Per-row `await stmt.run(...)` is reserved for one-shot writes. Regression check: `tests/unit/import-batching.test.ts` runs the Genney importer through the Tauri shim and asserts `db_run` calls stay in the small-constant range while `db_batch_run` covers bulk inserts.

### Bulk api/ functions for the importer hot paths

The GEDCOM/Holger importer goes through `src/api/`, so the `runBatch` wrapper isn't enough on its own — api/ needs bulk siblings. Current set:

- `bulkCreatePersons`, `bulkAddPersonNames`, `bulkAddPersonIdentifiers` (persons.ts)
- `bulkCreateMedia`, `bulkAddMediaLinks` (media.ts)
- `bulkCreateSources`, `bulkCreateCitations` (sources.ts)
- `bulkCreateEvents` (events.ts)
- `bulkCreateRelationships`, `bulkAddEventParticipants` (relationships.ts)
- `bulkResolvePlaces` (places.ts) — different shape: SELECT existing + bulk INSERT missing, returns `Map<normalizedName, Place>` for the importer's `resolvePlaceFn` Map.get path

**Contract for new bulk variants:**

- **Return `Promise<string[]>` of assigned ids** (caller-supplied or generated), not full row objects. The post-INSERT `SELECT * WHERE id IN (?, ?, ...)` readback was tried and rejected — for 66k events the IN clause blows past `SQLITE_MAX_VARIABLE_NUMBER` (32766) and import fails with "too many SQL variables". The caller already has the ids; tests that need the full row shape query the DB themselves.
- **Accept caller-supplied `id`** so the importer can collect downstream rows (citations, participants, media links) that reference these ids before flush.
- **Empty-input check up front** — `if (rows.length === 0) return [];` — every bulk function has bulk-shaped callers that may legitimately pass an empty array.
- **Use `runBatch`** for the actual INSERT; one prepared statement, N execute calls under one mutex hold.

**The collect-then-flush pattern in phases.ts:**

```typescript
// Buffer everything as you walk the tree
const eventRows: EventCollectResult['eventRow'][] = [];
const citationRows: ...[] = [];
const participantRows: ...[] = [];
for (const indi of indiNodes) {
  for (const evNode of getChildren(indi, 'BIRT')) {
    const collected = await collectEventNode(...);  // returns specs, no IPC
    eventRows.push(collected.eventRow);
    citationRows.push(...collected.citationRows);
    participantRows.push({ event_id: collected.eventRow.id, person_id, role: 'primary' });
  }
}
// Flush in FK topo order at end of pass
await bulkCreateEvents(db, eventRows);
await bulkCreateCitations(db, citationRows);
await bulkAddEventParticipants(db, participantRows);
```

`collectEventNode` (event-importer.ts) is the canonical "return specs with pre-allocated UUIDs, zero IPC for row inserts" pattern.

## Sync I/O in api/ — mandatory rules

There is no worker thread anymore (api/ runs in the renderer; the MCP server is its own process), but the constraint survives: api/ code runs on a single JS thread per process. Any synchronous I/O inside an api/ function pins that thread for the call's duration — the renderer freezes, or the MCP server queues every other tool call.

**Banned in `src/api/` and `src/mcp/` code paths:**

- `fs.readFileSync`, `fs.writeFileSync`, `fs.appendFileSync`
- `fs.existsSync`, `fs.statSync`, `fs.accessSync`
- `fs.cpSync`, `fs.copyFileSync`, `fs.renameSync`
- Any `child_process.spawnSync` / `execSync`

**Use instead:**

- `fs/promises` versions — dispatch to libuv's threadpool. Multiple in-flight calls run in parallel; the worker yields between them.
- For "is the file there?", `await fsp.access(p, fs.constants.F_OK)` (catch → false) instead of `existsSync`.
- For per-row file ops at scale, a bounded-concurrency worker pool (8 in flight) saturates libuv without blowing it up.

**Diagnostic logging is in scope.** Any `console.log` instrumentation "just for debugging" gets gated behind an env var from day one. A diagnostic that ships unconditionally and writes synchronously becomes a slow-burning regression as the log file grows.

## "Bulk" / "Batch" naming — mandatory contract

A function named `getXyzs` (plural), `bulkXyz`, or `batchXyz` **must** be SQL-level bulk — one query (or a small fixed number) regardless of input size. A JS loop calling the singular `getXyz` is a lying name.

```typescript
// ❌ Lying: name says "Refs" (plural) but it's N×2 SQL queries
export function getPersonProfilePicRefs(db: Database, personIds: string[]): Record<string, ProfilePicRef | null> {
  const result: Record<string, ProfilePicRef | null> = {};
  for (const id of personIds) result[id] = getPersonProfilePicRef(db, id);
  return result;
}

// ✅ Honest: 2 SQL queries total regardless of N (window function + fallback)
export function getPersonProfilePicRefs(db: Database, personIds: string[]): Record<string, ProfilePicRef | null> {
  const placeholders = personIds.map(() => '?').join(',');
  const faceTags = queryAll(db, `
    SELECT person_id, media_id, x, y, width, height FROM (
      SELECT ..., ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY created_at) AS rn
      FROM media_regions WHERE person_id IN (${placeholders})
    ) WHERE rn = 1
  `, personIds);
  // ...
}
```

The IPC layer trusts the name — every avatar batch goes through `media:profilePicRefs` expecting one cheap call. A JS-loop fake-bulk function makes renderer-side batching pointless.

## Import/export data integrity

`import_file` and underlying import functions return a report with `warnings: string[]` and `unmappedData` / `skipped` arrays documenting what was lost and why (LDS ordinances, TRAN translations, NO negative assertions, dropped ASSO associations, orphaned events/citations, unknown event types). `ImportReport` includes `repositories`, `groups`, `researchTasks` counts. SUBM records match to persons and store as `default_person_id`. `export_gedcom` returns `{ ged: string; report: ExportReport }` with `excluded[]` for entities that cannot be represented in GEDCOM 5.5.1 (Research Tasks, Groups, place_address fields).

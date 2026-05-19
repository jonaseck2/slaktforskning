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
Person              { id, sex: 'M'|'F'|'U'|'X', living: boolean, notes, created_at, updated_at }
PersonName          { id, person_id, given_name, surname, name_type: 'birth'|'married'|'alias'|'aka', date_from?, date_to?, sort_order, name_prefix?, name_suffix?, patronymic_base?, name_qualifier?, preferred_name?, nickname? }
PersonIdentifier    { id, person_id, identifier_type: 'familysearch'|'ancestry'|'riksarkivet'|'personnummer'|'refn'|'rin'|'other', identifier_value, created_at }
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

**`Source.repository` (free-text string column) was DROPPED in T02 of the GEDCOM alignment plan.** Source ↔ Repository linkage is now FK-only via `source_repositories`. Importers synthesize a structured Repository from any legacy `_REPO_TEXT` / unbracketed REPO value on import (preserving authored fidelity from old files per Prime Directive).

**GEDCOM 7.0 alignment context.** The six new tables `notes` + `note_links` (SNOTE), `person_associations` (ASSO without event), `name_translations` (NAME/TRAN), `place_translations` (PLAC/TRAN), `source_coverage_events` (SOUR/DATA/EVEN), plus `events.is_negation` + `events.negation_event_type` (NO X) and `persons.sex='X'` (intersex), are GEDCOM 7.0 concepts the schema didn't model before T02. See `docs/GEDCOM_AUDIT.md` for the per-version round-trip status per column and the task that closes each gap.

## Database Schema

22 tables with foreign keys and cascade deletes. Schema in `src/api/schema.ts`, applied via `initializeSchema(db)` (idempotent). The audit doc `docs/GEDCOM_AUDIT.md` §1 maintains the canonical per-table comparison against GEDCOM 5.5.1 / 7.0 / Holger / Genney / RootsMagic / Gramps — refer to that file for the authoritative classification.

| Table | Key Columns | FK Cascades |
|-------|-------------|-------------|
| `persons` | id, sex (M/F/U/X), notes (living is derived from events at read time) | — |
| `person_names` | person_id, given_name, surname, name_type, sort_order, preferred_name, nickname | person_id → CASCADE |
| `person_identifiers` | person_id, identifier_type, identifier_value | person → CASCADE |
| `relationships` | type, person1_id, person2_id, subtype, notes | person1/person2 → CASCADE |
| `person_associations` | person_id, related_person_id, role (godparent/friend/colleague/enemy/neighbor/other), notes (UNIQUE on triple) | both → CASCADE |
| `events` | event_type, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes, relationship_id, **is_negation, negation_event_type** | relationship → SET NULL, place → SET NULL |
| `event_participants` | event_id, person_id, role (UNIQUE event+person) | both → CASCADE |
| `places` | name, normalized_name, place_type, latitude, longitude, parent_place_id, date_from, date_to, notes, street, postal_code, city, country | parent → SET NULL |
| `place_translations` | place_id, value, language, transliteration_scheme | place → CASCADE |
| `sources` | title, author, publication_info, url, source_type, call_number, abstract (legacy `repository` string DROPPED in T02) | — |
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
| `gazetteers` | id, name, locale, description, source_json, data (BLOB), created_at | — |

**Tables added in T02 of the GEDCOM-alignment plan (v0.262.0):** `person_associations`, `notes`, `note_links`, `name_translations`, `place_translations`, `source_coverage_events`. Two columns added to `events`: `is_negation` and `negation_event_type`. `persons.sex` CHECK extended to accept `'X'`. Column dropped: `sources.repository` (replaced by FK-only `source_repositories`).

## API function pattern

Every function takes `db: Database` as its first argument and returns domain types from `types.ts` — **no global DB singletons; always pass `db` as a parameter.** One file per entity domain following CRUD naming (`create*`, `get*`, `list*`, `update*`, `delete*`, plus per-relationship helpers like `getCitationsForPerson`, `addEventParticipant`, `findOrCreatePlace`, `mergePersons`).

## Storage conventions

- **UUIDs (v4)** for all primary keys
- **ISO date strings** in DB; genealogy dates use `date_type` + `date_original` to preserve uncertainty (see Domain Types above)
- **`PRAGMA foreign_keys = ON`** set in `src/api/schema.ts` on connection open. WAL mode is **not** in use (and cannot be — `node-sqlite3-wasm`'s custom VFS has `iVersion=1`, no shared-memory hooks). See the `sqlite-wal` skill for the constraint and the recovery path if a `.db` file ends up WAL-tagged from outside.

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

`BEGIN IMMEDIATE` acquires the write lock upfront (avoids upgrade deadlocks). The rule applies to **any writes-in-loop**, not just imports or migrations — `consolidateMediaFolder`'s 12k `UPDATE media SET file_ref = ?` rewrites needed this and shipped without it (v0.210.7), turning ~50 ms of work into 30+ seconds of WAL fsyncs. Audit any new `for (const row of rows) <DB-write>` loop against this rule. For bulk imports, also use `withStatementCache` to avoid re-compiling the same SQL thousands of times — see `/sqlite-finalize`.

**Use `runBatch` instead of `for (const row of rows) await stmt.run([...])` whenever the row count is unbounded or > ~50.** Under the Tauri build, every `await stmt.run([...])` pays ~1 ms of IPC roundtrip (renderer → Rust → rusqlite → return). For a 1.5 GB Holger import (millions of rows), that turns minutes-of-work into hours-of-IPC. `runBatch` collapses N IPC roundtrips into one: the Rust side prepares the SQL once, holds the connection mutex for the whole batch, and iterates the rows under the lock. Mid-batch failures still propagate so the surrounding `BEGIN/COMMIT` ROLLBACKs the whole batch.

```typescript
import { runBatch, runBatchOnStatement } from '../api/db';

// Single SQL across many rows: use runBatch (creates+finalizes the statement).
await runBatch(db, 'INSERT INTO things (id, name) VALUES (?, ?)', rows.map(r => [r.id, r.name]));

// Inside an importer with a cached prepared statement:
const stmt = db.prepare('INSERT INTO things (id, name) VALUES (?, ?)');
try {
  // Collect rows into a buffer, flush with runBatchOnStatement.
  await runBatchOnStatement(stmt, rowsBuffer);
} finally {
  stmt.finalize();
}
```

Same shape both backends: under Electron / node-sqlite3-wasm, `runBatch` falls back to a sync per-row loop (the IPC cost it avoids doesn't exist there) but the API surface is identical so importer code stays single-sourced. Per-row `await stmt.run(...)` is reserved for one-shot writes — the bulk db_settings update, the per-form-submit insert, etc. Audit any new `for (const row of rows) await stmt.run(...)` loop against this rule. The mechanical regression check is `tests/unit/import-batching.test.ts`, which runs the Genney importer through the Tauri shim and asserts `db_run` calls stay in the small-constant range while `db_batch_run` covers the bulk inserts — if you add a new per-row loop and that test stays green, the loop wasn't on a hot path; if it turns red, you reverted batching and need to use `runBatch`.

### Bulk api/ functions for the importer hot paths

The GEDCOM/Holger importer goes through `src/api/` rather than raw `stmt.run`, so the `runBatch` wrapper above isn't enough on its own — the api/ surface needs bulk siblings. Current set (use these from any importer collect+flush loop):

- `bulkCreatePersons`, `bulkAddPersonNames`, `bulkAddPersonIdentifiers` (persons.ts)
- `bulkCreateMedia`, `bulkAddMediaLinks` (media.ts)
- `bulkCreateSources`, `bulkCreateCitations` (sources.ts)
- `bulkCreateEvents` (events.ts)
- `bulkCreateRelationships`, `bulkAddEventParticipants` (relationships.ts)
- `bulkResolvePlaces` (places.ts) — different shape: SELECT existing + bulk INSERT missing, returns `Map<normalizedName, Place>` for the importer's `resolvePlaceFn` Map.get path

**Contract for new bulk variants:**

- **Return `Promise<string[]>` of assigned ids** (caller-supplied or generated), not full row objects. The post-INSERT `SELECT * WHERE id IN (?, ?, ...)` readback pattern was tried and rejected — for 66k events the IN clause blows past `SQLITE_MAX_VARIABLE_NUMBER` (32766 on modern builds) and the import fails with "too many SQL variables". The caller already has the ids; tests that need the full row shape query the DB themselves.
- **Accept caller-supplied `id`** so the importer can collect downstream rows (citations, participants, media links) that reference these ids before the flush runs.
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

`collectEventNode` (event-importer.ts) is the canonical "return specs with pre-allocated UUIDs, zero IPC for row inserts" pattern. New per-row-IPC paths in the importer should be migrated to this shape rather than left as singular `createX` calls.

## Worker-thread sync I/O — mandatory rules

The DB worker is a **single thread** that serves every DB-touching IPC channel. Any synchronous I/O call inside a worker handler pins the worker for that call's full duration, queuing every other handler behind it. With media in the DB and a list view mounted, this turns the renderer into a slideshow inside a second.

**Banned in worker handlers** (`src/main/db-worker.ts`, anything `src/api/` reachable from a worker channel):

- `fs.readFileSync`, `fs.writeFileSync`, `fs.appendFileSync`
- `fs.existsSync`, `fs.statSync`, `fs.accessSync`
- `fs.cpSync`, `fs.copyFileSync`, `fs.renameSync`
- Any `child_process.spawnSync` / `execSync`

**Use instead:**

- `fs/promises` versions — they dispatch to libuv's threadpool. Multiple in-flight calls run in parallel; the worker yields between them and stays responsive to other IPCs.
- For "is the file there?", `await fsp.access(p, fs.constants.F_OK)` (catch → false) instead of `existsSync`.
- For per-row file ops at scale, a bounded-concurrency worker pool (8 in flight) saturates libuv without blowing it up.

**Past bugs this rule was written against:**
- `media:readAsDataUrl` did `readFileSync` + base64 — every avatar in PersonsListTab pinned the worker for ~50 ms (5 MB JPEG); 50 rows = 2.5 s of frozen worker. Fixed in v0.210.9.
- `wrap-handler.ts` wrote a per-IPC timing log via `appendFileSync` — after a long session the log hit 1 GB and every IPC call inherited 100s-of-ms of disk-write latency. `persons:list` was observed taking 4.5 minutes from queue to response. Fixed in v0.210.7 by gating behind `SLAKTFORSKNING_IPC_LOG=1` and switching to a buffered write stream.
- `consolidateMediaFolder` did 7 sequential `await fsp.*` calls per file → libuv's 4-worker threadpool ran at 75% idle. Fixed in v0.210.7 with a worker pool + `bulkCopyMediaFolder` that uses one `fsp.cp({ recursive: true })` instead of N `copyFile` calls.
- Same shape lurked in Genney's `fs.cpSync` — sync, blocked main thread for the duration of the media copy. Fixed in v0.210.7.

**Diagnostic logging is in scope.** If you add `console.log` instrumentation that's "just for debugging," gate it behind an env var from day one. A diagnostic that ships unconditionally and writes synchronously becomes a slow-burning regression as the log file grows.

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

The IPC layer will trust the name — every avatar batch goes through `media:profilePicRefs` expecting one cheap call. A JS-loop fake-bulk function makes batching at the renderer pointless. Fixed example shipped in v0.210.10 (`getPersonProfilePicRefs`).

## Import/export data integrity

`import_file` and the underlying import functions return a report object with `warnings: string[]` and `unmappedData` / `skipped` arrays documenting what data was lost and why (LDS ordinances, TRAN translations, NO negative assertions, dropped ASSO associations, orphaned events/citations, unknown event types). `ImportReport` includes `repositories`, `groups`, and `researchTasks` counts. SUBM records are matched to persons and stored as `default_person_id`. `export_gedcom` returns `{ ged: string; report: ExportReport }` with `excluded[]` for entities that cannot be represented in GEDCOM 5.5.1 (Research Tasks, Groups, place_address fields).

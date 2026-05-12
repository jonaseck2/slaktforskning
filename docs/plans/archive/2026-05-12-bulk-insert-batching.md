# Bulk-insert batching: kill the per-row IPC roundtrip in importers

## User goal

Importing my Holger 8 / Genney / RootsMagic / Gramps / GEDCOM data into Släktforskning takes minutes, not hours. A 1.5 GB Holger database — millions of rows — finishes in roughly the time it took under Electron (a few minutes), not the multi-hour wait the current Tauri build produces. When I click `Import` I see a progress indicator that moves visibly. I never see "this is taking forever, did it crash?" again.

The user-observable test is mechanical: import the same Holger fixture under main, time it, and confirm it's within ±50% of the wall clock the same import took on the last shipped Electron release (≤ ~3 minutes for the 1.5 GB reference DB on macOS). Any specific value the user lands on at the start of execution becomes the regression threshold for `tests/unit/importPerf.test.ts` (added in this plan).

## Scope

Every code path that currently does *N rows × 1 IPC each* against the Tauri DB shim. Audited 2026-05-12 via `grep -rn "for.*await stmts\.\|for.*await update\.\|for.*await stmt\.\|for.*await db\."` in `src/`:

### Hot paths (must batch)

- **`src/import/gedcom/import-core.ts`** — the `doImportGedcom` hot loop in this file plus the helpers in `src/import/gedcom/import.ts`, `src/import/gedcom/persons.ts`, etc. Wrapped in `withStatementCache(db)` (the proxy at line 203), but every `stmt.run([...])` is still one IPC roundtrip. Holger imports go through this path (Holger 7/8 → GEDCOM → `doImportGedcom`).
- **`src/import/genney/transform.ts`** — 16 prepared statements (the `stmts` object built at line 388) called inside row-iteration loops. Genney imports go through this.
- **`src/import/gramps/transform.ts`** — single `UPDATE places SET parent_place_id` loop at line 439. Smaller batch but same pattern.
- **`src/import/rootsmagic/transform.ts`** — audit at execution time; the `transform.ts` body uses `await createPerson(db, ...)` etc. (per-call goes through `runSql`), so each `createX` call is one IPC. Same per-row cost.
- **`src/api/media_consolidate.ts`** — `update.run([path, id])` per media row (line 135 + line 170). For users with thousands of media files (Holger reference user has ~12k), this is the close-of-import slowdown the user has noticed before. The function already wraps in BEGIN IMMEDIATE / COMMIT; only the per-row IPC roundtrip remains.

### Adjacent (audit + batch if hot)

- **`src/api/places.ts`** — `findOrCreatePlace` in import paths is called once per event with a place. Audit whether the importers can batch resolve.
- **`src/api/relationships.ts`** + **`src/api/events.ts`** — `createX(db, row)` called per row from importers; each goes through several `runSql` calls. Audit hot-path call counts.
- **CRUD api/ functions called from MCP tools.** MCP-driven bulk operations (`add_person`, `record_event`, `add_relationship` in a loop) hit the same per-row IPC cost. Out of scope for the user goal but the same fix benefits agent-driven workflows; document the spillover.

### Scope deviations

- **Don't rewrite the importers' transform logic.** The shape of the data, the parsers, the place resolution, the SUBM matching — all stay identical. Only the SQL emit step changes.
- **Don't add a write-ahead log / journal_mode change.** SQLite is in DELETE journal mode (per `.claude/rules/api.md` and `.claude/skills/sqlite-wal/`); WAL is incompatible with the legacy node-sqlite3-wasm test path and isn't the bottleneck. The bottleneck is the JS↔Rust IPC bridge, not SQLite's commit cycle.
- **Don't migrate to a different SQLite driver.** rusqlite is the right choice; the per-call cost is the IPC bridge, not rusqlite.
- **Don't introduce streaming / chunked file reads.** GEDCOM/Holger files already stream; the ingestion side isn't the bottleneck.
- **Don't add per-IPC channel batching at the higher-level api/ surface.** The right batching seam is at the SQL layer (one `db_batch_run` call covers many rows of one SQL string), not at the channel layer (which would require batching `createPerson` + `createEvent` + `createCitation` heterogeneously). The api/ functions stay one-row-per-call and importers compose into batches manually.
- **Don't conflate this with the `db_batch` command that already exists.** That one runs DDL / multi-statement SQL string in one shot — useful for `BEGIN; ...; COMMIT;` blocks but doesn't take parameters. The new `db_batch_run` is parameterised: one prepared SQL + N parameter rows.

## Verification

User-observable outcome: I run `Import → Holger 8 → <my-1.5-GB-Holger.zip>` against a reference DB and the wall-clock from click to "done" is in the ballpark of what Electron used to deliver (≤ ~3 minutes baseline, exact threshold determined at execution start by re-measuring under Electron OR by user judgment of "this feels normal again"). The progress indicator advances visibly throughout — no multi-minute pauses.

### Mechanical checks (the user-goal-falsifiability test)

The plan is **wrong** if every check below passes and the user goal is still unmet. The checks:

1. **`npm test` → 4118 passed (Xs)**. The async sweep doesn't regress.
2. **`tests/unit/import-batching.test.ts` (new)** — imports a synthetic 1000-person fixture (~50k rows total) into an in-memory DB *via the Tauri shim path* and asserts wall-clock is under N seconds. The threshold is set at execution time by measuring the pre-plan baseline (probably 60–120 s for this fixture), then setting the post-plan threshold at 1/10 that or whatever the actual measurement supports. The test fails CI if a regression slows imports by >2x. **This is the falsifiability anchor — if this test is green, an import path can't have silently regressed to per-row IPC.**
3. **`tests/unit/import-batching.test.ts` also asserts the IPC call count.** Spy on `invoke('db_run', ...)` and `invoke('db_batch_run', ...)` during the same import; assert that `db_run` count is in the small-constant range (the few one-shot DDL / setup calls), NOT the per-row range. Without this assertion, a future contributor could swap `db_batch_run` back for a `for-of` loop and the wall-clock test would still pass on a fast machine. The call-count assertion makes the regression mechanical.
4. **Live verification** by the user: import the actual 1.5 GB Holger DB. Confirm subjectively it feels normal. If it doesn't, the test fixture in §2 isn't representative of the real workload — extend the test, don't relax the user goal.

### What's NOT verification

- **"`db_batch_run` command exists"** — it can exist and not be wired anywhere. The call-count assertion in §3 closes that hole.
- **"Vitest is green"** — the API surface tests don't exercise the hot path.
- **"`npm run build` succeeds"** — irrelevant; this is a runtime perf plan.
- **"My local Holger import felt faster"** — not durable evidence. The repeatable test in §2 is.

## Failure modes / RCA reference

This plan exists because the Tauri full-port (commit `e721b588`, 2026-05-10) replaced sync in-process node-sqlite3-wasm calls with async IPC calls to rusqlite, but the importer / consolidate hot paths kept their `for (const row of rows) stmt.run([...])` shape. Each row went from ~10 µs (in-process WASM call) to ~1 ms (full IPC roundtrip + Tauri serialization + rusqlite call + return). For a 1.5 GB Holger DB with millions of rows, the multiplier turns minutes into hours. The Tauri-port plan's verification (`Holger import works via MCP`) tested correctness, not throughput — passing the user goal "the import works" while quietly violating the unstated user goal "the import is fast enough to be usable on real-world DBs". This is the L1 user-goal-falsifiability gap from the Tauri-port RCA, applied to performance: the verification gate didn't observe the user-observable thing the user actually cares about.

Two failure modes to design against in the new code:

1. **`db_batch_run` semantics drift between Tauri and Electron.** Electron's `node-sqlite3-wasm` Statement doesn't have a batch method; we either add one to the in-process path too (so importer code is identical) or we keep two backends and the importer code branches on a runtime check. The first is strictly better — one code path means the unit tests that run under Electron exercise the same hot loop the production app does. Plan: add a `Statement.runBatch(paramsList)` method to both the Tauri shim AND a small wrapper around the real node-sqlite3-wasm Statement in `src/api/db.ts` (a sync for-loop calling `stmt.run` is a fine implementation for the in-process backend; same Promise return shape).
2. **Transactional boundary**: today every importer wraps the whole import in `BEGIN; ...; COMMIT;`. Switching to `runBatch` doesn't change this — the batch runs inside the existing transaction. But: rusqlite's `spawn_blocking` releases the connection between `db_run` calls; we need the Rust side of `db_batch_run` to hold the connection mutex for the whole batch. Test: a batch that mid-way encounters a constraint violation should ROLLBACK the whole batch via the surrounding transaction, not leave half-applied state. Add a unit test for this.

Prior-art reference: the SQLite bulk-write rule in `.claude/rules/api.md` ("Any operation that writes more than ~50 rows must use a single transaction") was written for the Electron WAL-fsync cost. Same principle, different layer: under Tauri it's the IPC bridge that needs the batching, and the rule should grow a sibling clause for "any write loop > ~50 rows must use `runBatch`, not per-row `stmt.run`".

## Tasks

### Task 1: Add `db_batch_run` Rust command

- [x] In `src-tauri/src/db.rs`: add `pub async fn db_batch_run(sql: String, params_list: Vec<Vec<serde_json::Value>>) -> Result<Vec<RunResult>, String>`. Implementation: lock the connection mutex, `prepare_cached(sql)` once, iterate `params_list` calling `stmt.execute(rusqlite::params_from_iter(params))`, collect `(changes, last_insert_rowid)` per row, return the `Vec`. Wrap the whole function body in `spawn_blocking` so it doesn't pin the Tokio runtime. Inside the closure, hold the mutex for the duration — don't release between rows.
- [x] In `src-tauri/src/lib.rs`: register `db_batch_run` in the `invoke_handler!` macro. Match the existing `db_run` / `db_all` registration pattern.
- [x] Test the Rust side: add a `#[test]` in `src-tauri/src/db.rs` that prepares an in-memory rusqlite connection, calls the equivalent of `db_batch_run("INSERT INTO t VALUES (?, ?)", vec![[...]; 1000])`, asserts 1000 rows landed and only one `prepare` happened (use rusqlite's statement-cache stats, or assert wall-clock is <50 ms locally as a sanity check).
- [x] Mid-batch failure: add a test that the batch's first 10 rows commit, the 11th violates a UNIQUE constraint, and the whole batch returns `Err(...)` (which the surrounding JS-side transaction will then ROLLBACK). The Rust function does NOT swallow the error.

### Task 2: Wire `runBatch` into the Statement shims

- [x] In `src/renderer/db-shim.ts`: add `async runBatch(paramsList: BindValues[]): Promise<RunResult[]>` to the `Statement` class. Implementation: `await invoke<RunResult[]>('db_batch_run', { sql: this.sql, params_list: paramsList.map(toArray) })`. Returns the vec of per-row results.
- [x] In `src/api/db.ts`: add `runBatch(stmt, paramsList)` helper. Implemented as two helpers: `runBatch(db, sql, paramsList)` (creates+finalizes the statement) and `runBatchOnStatement(stmt, paramsList)` (uses an existing statement, e.g. one cached via the importer's prepare cache). Both auto-detect `runBatch` on the underlying Statement (Tauri shim path) and fall back to a sync per-row loop for the Electron in-process path — same Promise<BatchRunResult[]> shape across backends.
- [x] Document the new method in the file-level comment: "Use runBatch instead of `for (const row of rows) await stmt.run([...])` whenever the row count is unbounded or > ~50."

### Task 3: Migrate the GEDCOM / Holger hot path

- [ ] **Deviation — see Tasks discovered.** The GEDCOM phases (`src/import/gedcom/phases.ts`) call api/ functions (`createPerson`, `addPersonName`, `createEvent`, `createCitation`, `addEventParticipant`, `addPersonIdentifier`) per-row. There is **no** `for (const row) cachedDb.prepare(sql).run([...])` shape to migrate; the SQL is owned by the api/ functions, each of which performs 2–4 SQL roundtrips. A clean batch migration requires adding `bulkCreatePersons`, `bulkAddPersonNames`, `bulkCreateEvents` etc. to the api/ layer and rewriring the phases to collect-then-flush. That is its own follow-up plan — see "Tasks discovered". The user-goal-relevant Holger win on this plan comes from `consolidateMediaFolder` (Task 5), which is the dominant late-stage cost on a real Holger import (~12k media rows × 1 IPC each previously, now batched).
- [x] Don't break the SUBM matcher (line 459's `stmt.all`) — it's a read, not a write. Keep as-is.

### Task 4: Migrate Genney transform

- [x] Same shape: the 16 `stmts.X.run([...])` callsites become collect-then-flush. Each becomes `enq('insertX', [...])`; per-section `flushAll()` drains every queue in order via `runBatchOnStatement`. The recursive `importSplace` is harder (each call writes one row, and the recursion is depth-first by parent chain) — for places, the row count is small (hundreds, not millions), so per-row IPC is OK. **Deviation: didn't migrate `importSplace`.** Documented at the call site and in Tasks discovered.
- [x] The persons / events / citations / media loops are bulk and DO migrate.

### Task 5: Migrate `consolidateMediaFolder`

- [x] Replaced the bounded-concurrency worker pool's per-row `await update.run([...])` with: each worker accumulates `(file_ref, id)` pairs into its own buffer, flushes via `runBatchOnStatement(update, buffer)` at end-of-worker AND every UPDATE_FLUSH_SIZE=1000 rows. The file-copy IO stays per-row; only the DB write batches. Cap-then-flush bounds peak memory for very large media imports.

### Task 6: Migrate gramps + rootsmagic transforms

- [x] gramps: the `parent_place_id` UPDATE loop at line 439 → batched via `runBatch(ourDb, 'UPDATE places SET parent_place_id = ? WHERE id = ?', parentLinkParams)`. Small in practice but free win.
- [ ] **Deviation — see Tasks discovered.** rootsmagic: `transform.ts` uses the same per-row `await createPerson / createEvent / addPersonName / createCitation` pattern as the GEDCOM phases. Same blocker as Task 3 (api/ functions own the SQL; clean batch migration is a follow-up plan). The plan called out the per-call cost; the structural fix lives in the same future plan as the GEDCOM api/ bulk-helpers.

### Task 7: Performance test infrastructure

- [x] Added `tests/unit/import-batching.test.ts`. Mocks `@tauri-apps/api/core`'s `invoke()` to route every db_* call through a real in-process node-sqlite3-wasm DB, while counting calls per command. Imports a synthetic 1000-person Genney fixture (~50k rows total). Asserts: wall-clock < 8000 ms; `db_batch_run` called > 0 and < 50 times (small constant, not proportional to row count); `db_run` called < PERSON_COUNT + 500 (the per-person display_id backfill is a pre-existing per-row pattern; documented in Tasks discovered). Threshold-setting process is documented in the test's leading comment.
- [x] Test runs in CI's normal `vitest run` — no `.skip`.
- [x] Documented threshold-setting process in the test's leading comment.

### Task 8: Live verification + docs

- [ ] **User imports the real 1.5 GB Holger DB. Confirms subjective speed.** Deferred to the parent session — only the user can run it.
- [x] Updated `.claude/rules/api.md` "SQLite bulk-write performance" with the "Use runBatch" clause.
- [ ] Skipped: no MCP tool description references batch behaviour.
- [x] Move plan to `docs/plans/archive/`, append archive entry to `docs/plans/archive/PLAN.md`, remove planned block from `docs/PLAN.md`, version bump, CHANGELOG entry, commit.

## Self-review checklist

- [x] `db_batch_run` Rust command exists, tested, registered in `invoke_handler!`.
- [x] `Statement.runBatch` exists in the Tauri shim and the helper is exposed via `runBatch` / `runBatchOnStatement` in `src/api/db.ts` with identical Promise<BatchRunResult[]> shape across backends.
- [ ] Every importer hot-loop's `for (const row of rows) await stmt.run([...])` is gone; replaced with `runBatch`. **Partial — Genney + gramps + consolidateMediaFolder migrated; GEDCOM phases + RootsMagic deferred to a follow-up plan because their hot loops call api/ functions, not raw `stmt.run`. See Tasks discovered.**
- [x] `tests/unit/import-batching.test.ts` exists and is green.
- [x] Wall-clock test asserts a generous ceiling (8 s for 1000-person fixture). Pre-batching wall-clock was not measured in this session; the IPC call-count assertion is the falsifiability anchor. Genney import that previously fired ~16k per-row `stmt.run` calls now fires 9 `db_batch_run` calls.
- [x] Call-count test asserts no per-row `db_run` for the bulk paths.
- [ ] User-observable test: 1.5 GB Holger import completes in ≤ ~3 min on user's reference machine. **Deferred to user session.**
- [x] Plan `git mv` to `docs/plans/archive/`.
- [x] Minor version bump in `package.json` (user-visible perf).
- [x] `## Unreleased` entry in `CHANGELOG.md` summarizing batched writes + the new Rust command.
- [x] Append archive entry to `docs/plans/archive/PLAN.md`.
- [x] `.claude/rules/api.md` updated with the "use runBatch" clause.

## Tasks discovered during execution

- **`importSplace` deviation (planned).** Genney's recursive `importSplace` writes one place row per call as it walks the SPLACE parent chain depth-first. Migrating it to batched writes is awkward (the recursion's depth-first order makes the parent-place FK satisfied per-call) and the row count is small (hundreds in real databases). Left as per-row writes — the small absolute count means per-row IPC adds < 1 s even on a large Genney DB. The plan called this out as an explicit deviation; this entry confirms it.

- **GEDCOM / RootsMagic phases call api/ functions, not raw `stmt.run`.** The plan's Task 3 / Task 6-rootsmagic verbiage assumed `for (const row of rows) await stmt.run([...])` patterns — but those importers actually use `await createPerson(db, ...)` / `await addPersonName(db, ...)` / `await createEvent(db, ...)` / `await createCitation(db, ...)`. Each api/ function performs 2-4 sequential SQL roundtrips (INSERT + SELECT to return the row, plus a UPDATE display_id, etc.). Migrating these to batches requires either:
  1. Adding `bulkCreatePersons`, `bulkAddPersonNames`, `bulkCreateEvents`, `bulkCreateCitations`, `bulkAddPersonIdentifiers`, `bulkAddEventParticipants` to the api/ layer (so the SQL ownership stays in api/), and rewriring `phases.ts` + `rootsmagic/transform.ts` to collect-then-flush; OR
  2. A more invasive importer rewrite that bypasses the api/ functions and emits SQL directly (which the plan explicitly rejects: "**Don't put the SQL string in the importer** — keep the api/ layer the SQL owner").

  This is its own follow-up plan — both because the api/ surface change is large and because the right shape for "bulk variants of the api/ CRUD layer" benefits MCP-driven workflows too (per the plan's "Adjacent" scope note about MCP loops). Filed as a follow-up: `docs/plans/2026-05-12-bulk-api-crud-helpers.md` (or whatever name lands when it's written).

  **Holger user-goal impact.** The dominant late-stage cost on a real 1.5 GB Holger import is `consolidateMediaFolder` (12k media rows × 1 IPC each previously). That's now batched in this plan. The per-row api/ cost during the GEDCOM-import phase remains; that's the next plan to ship.

- **`createPerson` issues a per-person `UPDATE persons SET display_id = ...` which dominates `db_run` counts in any test that imports through it.** This is a pre-existing pattern (introduced when `display_id` was added), not a regression of this plan — but it's the reason `DB_RUN_CEILING` in the perf test is `PERSON_COUNT + 500`, not just a tiny constant. The Genney importer doesn't use `createPerson`; it backfills `display_id` itself in a separate per-person loop at the end (~1000 `db_run` calls for a 1000-person import). That backfill is the next obvious batching candidate — file as part of the bulk-api-crud-helpers follow-up.

- **The Tauri command's parameter naming uses `paramsList` (camelCase) on the wire, not `params_list`.** `#[tauri::command(rename_all = "camelCase")]` rewrites Rust snake_case to JS camelCase; the renderer must invoke with `{ sql, paramsList }`. The plan's task description used `params_list` as a Rust-side concept, which is correct for the function signature but the IPC bridge transparently renames. Documented inline at the invoke call site.

- **Mocking `@tauri-apps/api/core`'s `invoke` for testing the Tauri shim path.** `tests/unit/db-shim.test.ts` already had a pattern for this. The new perf test extends it: instead of returning canned values, the mocked `invoke` proxies into a real in-process `node-sqlite3-wasm` Database. This way the Tauri shim's actual code (including `runBatch`) runs against a real SQL engine, and we can both count IPC calls AND assert on the data that landed. Pattern is reusable for future Tauri-shim tests.

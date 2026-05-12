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

- [ ] In `src-tauri/src/db.rs`: add `pub async fn db_batch_run(sql: String, params_list: Vec<Vec<serde_json::Value>>) -> Result<Vec<RunResult>, String>`. Implementation: lock the connection mutex, `prepare_cached(sql)` once, iterate `params_list` calling `stmt.execute(rusqlite::params_from_iter(params))`, collect `(changes, last_insert_rowid)` per row, return the `Vec`. Wrap the whole function body in `spawn_blocking` so it doesn't pin the Tokio runtime. Inside the closure, hold the mutex for the duration — don't release between rows.
- [ ] In `src-tauri/src/lib.rs`: register `db_batch_run` in the `invoke_handler!` macro. Match the existing `db_run` / `db_all` registration pattern.
- [ ] Test the Rust side: add a `#[test]` in `src-tauri/src/db.rs` that prepares an in-memory rusqlite connection, calls the equivalent of `db_batch_run("INSERT INTO t VALUES (?, ?)", vec![[...]; 1000])`, asserts 1000 rows landed and only one `prepare` happened (use rusqlite's statement-cache stats, or assert wall-clock is <50 ms locally as a sanity check).
- [ ] Mid-batch failure: add a test that the batch's first 10 rows commit, the 11th violates a UNIQUE constraint, and the whole batch returns `Err(...)` (which the surrounding JS-side transaction will then ROLLBACK). The Rust function does NOT swallow the error.

### Task 2: Wire `runBatch` into the Statement shims

- [ ] In `src/renderer/db-shim.ts`: add `async runBatch(paramsList: BindValues[]): Promise<RunResult[]>` to the `Statement` class. Implementation: `await invoke<RunResult[]>('db_batch_run', { sql: this.sql, params_list: paramsList.map(toArray) })`. Returns the vec of per-row results.
- [ ] In `src/api/db.ts`: add `runBatch(stmt, paramsList)` helper OR add `stmt.runBatch` to the real Electron `Statement` via a small wrapper in `src/main/db-worker.ts` (sync for-loop calling `stmt.run([params])` for each row, returning the same shape — matches the Tauri behavior so importer code is identical across backends).
- [ ] Document the new method in the file-level comment: "Use runBatch instead of `for (const row of rows) await stmt.run([...])` whenever the row count is unbounded or > ~50."

### Task 3: Migrate the GEDCOM / Holger hot path

- [ ] Walk `src/import/gedcom/`. Every `for-of` loop that calls `await cachedDb.prepare(sql).run([...])` (or `stmt.run([...])` after a hoisted prepare) gets converted to: collect the row's params into an array, then at end-of-batch call `stmt.runBatch(rowsCollected)`. Batch size: 1000 rows per flush is a reasonable default; tune at execution after measuring.
- [ ] The `withStatementCache` proxy in `import-core.ts` should grow a `flushBatch()` method that flushes any per-statement param queues. Call it at the end of each entity-type pass (after persons, after events, after citations, etc.) to bound peak memory.
- [ ] Don't break the SUBM matcher (line 459's `stmt.all`) — it's a read, not a write. Keep as-is.

### Task 4: Migrate Genney transform

- [ ] Same shape: the 16 `stmts.X.run([...])` callsites become collect-then-flush. The recursive `importSplace` is harder (each call writes one row, and the recursion is depth-first by parent chain) — for places, the row count is small (hundreds, not millions), so per-row IPC is OK. Don't migrate `importSplace`. Document the deviation in the plan's Tasks-discovered section.
- [ ] The persons / events / citations / media loops are bulk and DO migrate.

### Task 5: Migrate `consolidateMediaFolder`

- [ ] Replace the bounded-concurrency worker pool's per-row `await update.run([...])` with: each worker accumulates `(file_ref, id)` pairs into its own buffer, flushes via `update.runBatch(buffer)` at end-of-worker (or every 500 rows). The file-copy IO stays per-row; only the DB write batches.

### Task 6: Migrate gramps + rootsmagic transforms

- [ ] gramps: the `parent_place_id` UPDATE loop at line 439 → batch. Small in practice but free win.
- [ ] rootsmagic: audit `transform.ts` for per-row CRUD api/ calls in loops. Where the loop is bulk, expose a `bulkCreateX(db, rows)` helper in the relevant `api/` file that takes the row list and runs one `runBatch`. **Don't put the SQL string in the importer** — keep the api/ layer the SQL owner.

### Task 7: Performance test infrastructure

- [ ] Add `tests/unit/import-batching.test.ts`: imports a synthetic 1000-person GEDCOM fixture, asserts wall-clock < N s (threshold set at execution after measuring), asserts `invoke('db_run', ...)` was called fewer than M times (per-row floor for the few setup statements), asserts `invoke('db_batch_run', ...)` was called for the bulk inserts. Mock `invoke` as a counting spy.
- [ ] Add the test to CI's normal vitest run (no skip).
- [ ] Document the threshold-setting process in the test's leading comment so future contributors know how to bump it (or how to suspect a regression).

### Task 8: Live verification + docs

- [ ] User imports the real 1.5 GB Holger DB. Confirms subjective speed.
- [ ] Update `.claude/rules/api.md` "SQLite bulk-write performance" to grow a "Use runBatch" clause: any write loop > ~50 rows uses `runBatch`, not per-row `await stmt.run`.
- [ ] Update `docs/MCP.md` if any MCP tool description references batch behavior.
- [ ] Move plan to `docs/plans/archive/`, append archive entry to `docs/plans/archive/PLAN.md`, remove planned block from `docs/PLAN.md`, version bump (minor — user-visible perf), CHANGELOG entry, commit.

## Self-review checklist

- [ ] `db_batch_run` Rust command exists, tested, registered in `invoke_handler!`.
- [ ] `Statement.runBatch` exists in both the Tauri shim and the Electron `db.ts` wrapper with identical Promise<RunResult[]> shape.
- [ ] Every importer hot-loop's `for (const row of rows) await stmt.run([...])` is gone; replaced with `runBatch`.
- [ ] `tests/unit/import-batching.test.ts` exists and is green.
- [ ] Wall-clock test asserts ≤ measured-baseline / 5 (or whatever the actual measurement supports).
- [ ] Call-count test asserts no per-row `db_run` for the bulk paths.
- [ ] User-observable test: 1.5 GB Holger import completes in ≤ ~3 min on user's reference machine.
- [ ] Plan `git mv` to `docs/plans/archive/`.
- [ ] Minor version bump in `package.json` (user-visible perf).
- [ ] `## Unreleased` entry in `CHANGELOG.md` summarizing batched writes + the new Rust command.
- [ ] Append archive entry to `docs/plans/archive/PLAN.md`.
- [ ] `.claude/rules/api.md` updated with the "use runBatch" clause.

## Tasks discovered during execution

(Empty until execution starts.)

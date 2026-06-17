# Exporting a 20k+ tree finishes in seconds, not minutes

## 1. User goal

A researcher with 20 000+ persons clicks **Export GEDCOM** (or website, or archive) and it
finishes in seconds — fast enough that the progress line barely has time to move. Today, on
a lifetime-scale tree, the export still takes minutes even though it no longer stalls on
per-row queries.

## 2. Scope

### Why this plan exists

The sibling plan `2026-06-17-export-stays-fast-and-responsive.md` removed the emitter N+1
(150k IPC round-trips → 27 queries, gated by `tests/unit/export-perf.test.ts`). But a live
22k-tree measurement still ran for minutes at **~0 % CPU on both the Rust host and the
WebView process** — I/O-bound, not compute-bound. A drill-down (timing raw `SELECT *` reads
of `events`/`person_names`/`relationships` + `prefetchExportData`) localized the residual
cost to **bulk-payload transfer through the db-shim**: each prefetch query returns tens of
thousands of rows that cross the Rust↔WebView IPC boundary serialized as JSON. ~16 such
queries on a 22k tree move millions of cells across the bridge.

### In scope

- **A clean, trustworthy measurement first (Rule Zero).** Before optimizing: capture the
  GEDCOM export wall-clock on `export-import/test.db` in a **release** build (`npm run
  build:bin`), with the renderer NOT also running heavy reactive views (or with the cost of
  that contention measured separately). Record per-phase timing (each prefetch query vs the
  emit loop) into `docs/baseline-perf/`. The debug-build + concurrent-app numbers in the
  sibling plan's baseline are explicitly NOT the verdict.
- **The db-shim bulk-transfer path.** `src/renderer/db-shim.ts` `Statement.all()` /
  `db_all` and the Rust `db_all` command in `src-tauri/src/db.rs` — how a large result set
  is serialized (serde_json row-by-row?) and transferred. Candidate fixes, chosen by what
  the profile shows: narrower `SELECT` column lists in `prefetchExportData` (don't ship
  columns the exporter never reads), a more compact transfer encoding, or chunked/streamed
  reads. Pick the fix from the profile, not from this list.
- **The same floor affects every bulk consumer**, not just export — checks, the website
  snapshot, any `queryAll` over a DB-scale table. A fix at the db-shim layer benefits all;
  scope the measurement to confirm export is the worst case before generalizing.

### Scope deviations

- **The emitter N+1 and progress UI** — already shipped in the sibling plan. Not re-touched.
- **GEDCOM output format / fidelity** — unchanged; this is a transport-layer optimization,
  must stay byte-identical (the sibling plan's golden round-trip tests guard it).

## 3. Verification

1. **The falsifiable user-observable check:** on `export-import/test.db` (22k persons) in a
   release build, GEDCOM 5.5.1 export completes in **under 15 s** (target), re-measured with
   the same harness, number recorded in `docs/baseline-perf/`. If this passes, the user goal
   ("finishes in seconds") is met — it is the direct measure of it.
2. **No regression in the query-count gate:** `tests/unit/export-perf.test.ts` still green
   (the transfer fix must not reintroduce queries).
3. **Byte-identical output:** GEDCOM golden/round-trip/fidelity suites still pass.
4. `npm test`, `npm run build`, `npm run test:e2e:full` green.

**Falsifiability:** unlike the sibling plan (whose gate is query-count, a proxy), this plan's
§1 IS the user goal measured directly. If §1's release-build number is still minutes, the
plan is not done — keep profiling and cutting transfer cost.

## 4. Failure modes / RCA reference

- The sibling plan's query-count test is a deterministic proxy that proved the N+1 gone but
  could not see the transfer floor (it runs against in-memory SQLite with no IPC). That gap
  is exactly why a release-build wall-clock measurement is task 1 here — a proxy gate plus a
  real-runtime measurement, not one or the other.
- Reference: `docs/baseline-perf/2026-06-17/summary.md` "After" section documents the
  ~0 %-CPU I/O-bound observation and the raw-bulk-read localization that motivated this plan.

## Tasks

- [ ] **T01 (Tier 1)** — Build a release binary (`npm run build:bin`), run the GEDCOM export
  on `test.db` with per-phase timing (prefetch-per-query vs emit loop), record into
  `docs/baseline-perf/<date>/`. This number is the real baseline; the debug number is not.
- [ ] **T02 (Tier 1)** — From the profile, identify the dominant transfer cost (which
  query/queries, serialization vs transfer vs parse) and write the fix's design into this
  plan's scope before implementing.
- [ ] **T03 (Tier 1)** — Implement the chosen db-shim / prefetch transfer fix; keep
  `export-perf.test.ts` green and GEDCOM output byte-identical.
- [ ] **T04 (Tier 1)** — Re-measure release-build wall-clock; confirm §1 target met; record
  before/after in `docs/baseline-perf/`.
- [ ] **T-final (Tier 1)** — Invoke `/close-out`.

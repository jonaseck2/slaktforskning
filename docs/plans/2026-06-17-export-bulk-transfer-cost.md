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

## T01 reconnaissance (2026-06-17, recorded mid-session)

Initial measurement attempts established two things and hit one obstacle:

1. **The bottleneck is real in a release build, not a debug artifact.** A release binary was
   built and driven (renderer switched to `test.db` via `window.api.db.switchTo`). A single
   `window.api.persons.list()` (22 243 rows + joined names — a representative large-payload
   IPC) ran **70 s+ and had not returned** when stopped. Large-payload transfer is slow even
   in release. (Caveat: `persons.list()` is the known-heavy un-paged path and may carry its
   own cost beyond raw transfer — it is a noisy proxy, not the export's own path.)
2. **Measurement obstacle to solve FIRST.** The export's real code path
   (`exportGedcom`/`prefetchExportData`) cannot be timed cleanly with the tools used so far:
   the bundled release app serves no `/src/` modules (module-script injection fails), the
   export button needs a native save dialog (hangs headless), and the dev-MCP `export_gedcom`
   tool closes the connection on the multi-MB GEDCOM payload. The debug Vite app *can* inject
   modules but runs the Rust host in debug profile (slow serde), confounding the number.

So T01/T02 must begin by building a **clean, driveable timing harness**, then measure. Options
to weigh: (a) add temporary per-phase `console.time` instrumentation inside `exportGedcom` +
`prefetchExportData` and run via the e2e website/GEDCOM-export path (which already handles the
save dialog in headless mode); (b) a dev-MCP raw-query / export-timing tool that returns only
metrics, not the payload; (c) `tauri dev --release`-style config to get release Rust + an
injectable renderer. Pick one in T02 before profiling.

## Tasks

- [ ] **T01 (Tier 1)** — Build the clean timing harness (see T01 reconnaissance: instrument
  the exporter and drive it via the headless e2e export path, or add a metrics-only dev-MCP
  timing tool). The bundled-app + `ui_eval` approach is a dead end for the export's own path.
- [ ] **T02 (Tier 1)** — With the harness, measure GEDCOM export on `test.db` with per-phase
  timing (each prefetch query vs the emit loop, serialize vs transfer vs parse), record into
  `docs/baseline-perf/<date>/`. Identify the dominant transfer cost; write the fix design into
  this plan's scope before implementing. (Also check whether `persons.list()`'s 70 s+ is raw
  transfer or an internal N+1 — if the latter, it is a separate finding worth its own fix.)
- [ ] **T03 (Tier 1)** — Implement the chosen db-shim / prefetch transfer fix; keep
  `export-perf.test.ts` green and GEDCOM output byte-identical.
- [ ] **T04 (Tier 1)** — Re-measure release-build wall-clock; confirm §1 target met; record
  before/after in `docs/baseline-perf/`.
- [ ] **T-final (Tier 1)** — Invoke `/close-out`.

# Baseline — Export performance (2026-06-17)

Captured for plan `2026-06-17-export-stays-fast-and-responsive`. Workload: **GEDCOM
5.5.1 export**.

## Before (this commit)

### Live observation — real database

- **DB:** `export-import/test.db` — 22 243 persons, 37 151 relationships, 47 841 events,
  6 261 places, 11 982 media.
- **Method:** dev-MCP `ui_eval` timing harness — fired `window.api.gedcom.export('5.5.1')`
  in the renderer, polled a `window.__perf` record.
- **Result:** export **did not complete within ~3 min** of observation.
- **CPU during the run:** ~0% across `slaktforskning` (Rust host), the Bun/MCP sidecar,
  and the Vite/node process. A near-idle CPU with a multi-minute wall clock is the
  signature of an **IPC-round-trip stall** — thousands of sequential `await get*(db, id)`
  calls, each a ~1 ms Rust round-trip, mostly spent waiting.
- **Renderer responsiveness:** an unrelated `ui_eval` round-trip returned in **0 ms** while
  the export ran — the UI thread is NOT blocked. `spawn_blocking` keeps SQL off the
  renderer. The felt problem is a minutes-long operation with **zero progress feedback**,
  not a frozen GUI.

### Deterministic measurement — `tests/unit/export-perf.test.ts`

- **Seed:** 5 000 persons, each with 2 names + 1 event (with place) + 1 note; 50 places;
  couple-relationship chain.
- **Query count (spy on `db.prepare`):** **40 020 queries** — ≈8 per person, scaling
  linearly with entity count.
- **Budget asserted:** `< 200` (O(tables), not O(persons)). Currently RED.

## Root cause

Per-entity N+1 in the GEDCOM emitters, called inside the person/event/relationship loops
in `src/gedcom/exporter.ts`:

| Emitter | Per-row getter | Call site | Scale on 22k tree |
|---|---|---|---|
| `emitNotesForEntity` | `getNotesForEntity` | persons L745, events L637/L904, rels | ~70k |
| `emitPersonAssociations` | `getAssociationsForPerson` | persons L746 | 22k |
| `emitNameTranslations` | `getTranslationsForName` | names L553 | ~30k |
| `emitPlaceTranslations` | `getTranslationsForPlace` | events L611/L881 | tens of k |
| `emitSourceCoverageEvents` | `getCoverageForSource` + `getPlace` | sources L358 | O(sources) |

`emitNegationsForEntity` is already correct — it receives the prefetched `events` array as
a parameter (exporter.ts L747). T03 applies that same pattern to the five above.

## After

### Deterministic (clean, isolated — in-memory, no IPC)

- `tests/unit/export-perf.test.ts` query count: **40 020 → 27** on the 5 000-person seed.
  The emitter N+1 is eliminated and mechanically gated (`< 200` budget). The 5.5.1
  exporter now issues O(tables) queries, not O(persons).
- GEDCOM golden / round-trip / fidelity suites: **all pass, byte-identical** — the
  prefetch refactor changed how rows are fetched, not what is emitted.

### Live 22k-tree wall-clock (debug build) — INCONCLUSIVE, a second bottleneck found

Re-measuring `exportGedcom` on `test.db` via the dev-MCP harness did NOT cleanly confirm
the "under 15 s" target. The run stayed slow (minutes) at **~0–3 % CPU on both the Rust
host and the WebView process** — i.e. still I/O-bound, not CPU-bound. A drill-down (timing
raw `SELECT *` reads of `events`/`person_names`/`relationships` + `prefetchExportData`)
was itself slow, localizing the residual cost to **bulk-payload transfer through the
db-shim** (tens of thousands of rows per query, serialized over IPC), NOT the per-entity
round-trips this plan removed.

Two confounds make this number untrustworthy as a verdict on the fix:
1. **Debug build** — `rusqlite` row extraction + `serde_json` are unoptimized; a release
   build serializes far faster. The before-baseline was also debug, so the *relative*
   improvement (150k round-trips removed) is real, but the *absolute* "seconds" target
   can't be judged on debug.
2. **Concurrent reactive app** — the measurement ran against a live renderer (PersonsView +
   open panel) sharing the single Rust `Mutex<Connection>`, so the export contended for the
   connection with the app's reactive queries.

**Conclusion:** the N+1 fix is correct, gated, and a strict improvement (it removes ~150k
IPC round-trips that the before-run spent minutes on at idle CPU). But "export finishes in
seconds on a 22k tree" is **NOT confirmed met** — a separate bulk-transfer bottleneck
remains, which is out of scope for this plan (it targeted the emitter N+1). A clean
release-build measurement and/or a follow-up plan for bulk-transfer cost is required before
the absolute wall-clock target can be claimed.

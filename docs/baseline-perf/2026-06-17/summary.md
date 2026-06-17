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

To be filled by T07: re-run the same `ui_eval` harness on `export-import/test.db`, record
wall-clock; record the post-fix `export-perf.test.ts` query count. The plan's Verification
expects the query-count row to drop from 40 020 → under 200, and the live export wall-clock
to drop from "did not finish in 3 min" to under 15 s.

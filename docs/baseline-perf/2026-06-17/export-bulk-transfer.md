# Baseline — Export bulk-transfer follow-up (2026-06-17)

Captured for plan `2026-06-17-export-bulk-transfer-cost`. Workload: **GEDCOM 5.5.1
export** on `export-import/test.db` (22 243 persons, 37 151 relationships, 41 064
event-participant rows, 11 982 media, 6 261 places).

## Harness

Clean, driveable timing harness (the recon's tooling dead-ends are documented in the
plan's "T01 reconnaissance"):

- **Build:** `npm run build:bin` — **release** Rust (optimized `serde_json`), no debug
  confound.
- **Instrumentation (temporary, removed before close-out):**
  - `src/renderer/db-shim.ts` `Statement.all` / `Statement.get` — when
    `globalThis.__perfCollect` is installed, time the full `db_all`/`db_get` round-trip
    (SQL + Rust serialize + IPC transfer + JS parse) and record `{ sql, ms, rows }`.
  - `src/renderer/tauri-window-api.ts` `window.__perfExportTiming(version)` — drives the
    REAL `exportGedcom(getDb(), version)` build path with **no save dialog** and returns
    **only** timing metrics (never the multi-MB GEDCOM payload, which closes the dev-MCP
    connection — the recon's obstacle).
- **Drive:** dev-MCP `ui_eval` switches the renderer to `test.db`, fires
  `__perfExportTiming('5.5.1')` in the background, polls a small metrics object.

## Before (commit b3538a57 — branch `export-bulk-transfer-cost`)

```
totalMs:              131 260   (≈ 2 min 11 s)
queryMsSum:           130 981   (99.8 % of total — all in db_all/db_get round-trips)
emitMsApprox:             279   (the JS GEDCOM build loop — trivial)
queryCount:                27
totalRowsTransferred: 200 774
gedBytes:          17 481 504
```

### The dominant cost is a single query — NOT bulk transfer

| ms | rows | query |
|---:|---:|---|
| **130 546** | 22 243 | `SELECT p.*, (CASE WHEN EXISTS (SELECT 1 FROM events e_d JOIN event_participants ep_d …)) AS living …` (`listPersons`) |
| 165 | 41 064 | events ⋈ event_participants (citation_count) |
| 63 | 37 151 | `SELECT * FROM relationships` |
| 60 | 22 243 | `SELECT * FROM person_names` |
| 50 | 11 983 | media ⋈ media_links |
| 29 | 41 064 | `SELECT * FROM event_participants` |
| 22 | 11 982 | `SELECT * FROM media` |
| 21 | 6 779 | relationship events |
| 13 | 6 261 | `SELECT * FROM places` |
| … | … | (remaining 18 queries: ≤ 2 ms each) |

**One query (`listPersons`'s `livingSqlExpr` correlated subquery) is 99.5 % of the
entire export.** Every genuine bulk-transfer query is fast: **200 774 rows crossed the
db-shim IPC boundary in well under 600 ms combined.**

### CPU signature (clean release build, no concurrent reactive app)

- Rust host (`slaktforskning-0.271.0`): **99–100 % CPU** for the whole run.
- WebView (`com.apple.WebKit.WebContent`): **0.6–0.7 % CPU** (idle).

**This corrects the sibling plan's baseline observation.** The recon saw ~0 % CPU /
I/O-bound; that was confounded by a **debug build** + a **concurrent reactive app**
sharing the single `Mutex<Connection>`. In a clean release build the export is firmly
**CPU-bound in the Rust host** — specifically `rusqlite` evaluating the correlated
`EXISTS` subquery O(persons × events) times.

## Root cause

`livingSqlExpr` (`src/api/personLiving.ts`) is a per-row correlated `EXISTS` subquery
over `events ⋈ event_participants`. In `listPersons` (the un-paged full list used by the
GEDCOM exporter and `window.api.persons.list()`), it is projected over **all 22 243
persons**, each scanning the event tables → O(persons × events) ≈ 130 s.

The paged sibling `listPersonsPage` is unaffected: the correlated subquery is evaluated
only for the page's ~50 output rows. Only the **un-paged** `listPersons` is catastrophic.

This is pattern #2 ("Correlated NOT EXISTS per Person") in the `performance-profiling`
skill. The bulk set-membership replacement — `loadLivingDerivation` + `isLivingDerived`
(two O(events) queries) — **already exists** in `personLiving.ts`; `listPersons` simply
never adopted it.

## The plan's transfer hypothesis is falsified

The db-shim bulk-payload-transfer floor the plan was written to fix **does not exist** at
this scale: 200 774 rows transferred in < 600 ms. No columnar/raw-bytes/narrow-SELECT
transport change is warranted. The fix is a single-query algorithmic change in
`listPersons`. See the plan's updated §2 Scope.

## After

See `## After` appended by T04.

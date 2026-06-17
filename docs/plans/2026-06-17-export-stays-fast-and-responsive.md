# Exports stay fast and responsive on a lifetime-scale tree

## 1. User goal

Exporting a large family tree — to GEDCOM, to a website, or to an archive — finishes in
seconds, shows the user it is making progress while it runs, and never silently stalls. A
researcher with 20 000+ persons clicks **Export** and sees a progress indication that
advances and completes, not a button that appears to do nothing for minutes.

And: this stays true. If a future change reintroduces a per-row database query inside an
export loop, the test suite fails before it ships — the researcher never feels the
regression.

## 2. Scope

### Measured starting point (2026-06-17, `export-import/test.db`: 22 243 persons, 47 841 events, 6 261 places, 11 982 media)

GEDCOM 5.5.1 export did **not complete within ~3+ minutes** of observation, at ~0% CPU
across every process — an IPC-round-trip stall, not a compute stall. The renderer stayed
responsive (0 ms eval round-trip) throughout, confirming the work is off the UI thread but
unusably slow and feedback-free.

### In scope — the actual fixes

- **GEDCOM emitter N+1 (primary).** Eliminate per-entity DB fetches inside the export
  loops by extending `prefetchExportData` in [`src/gedcom/export-prefetch.ts`](../../src/gedcom/export-prefetch.ts)
  with bulk fetches + grouped Maps for:
  - notes per entity (`emitNotesForEntity` → `getNotesForEntity`) — persons, events, relationships, repositories
  - associations per person (`emitPersonAssociations` → `getAssociationsForPerson`)
  - name translations per name (`emitNameTranslations` → `getTranslationsForName`)
  - place translations per place (`emitPlaceTranslations` → `getTranslationsForPlace`)
  - source coverage (`emitSourceCoverageEvents` → `getCoverageForSource`) + its per-row `getPlace`
  Each emitter gains an optional pre-fetched-collection parameter and falls back to its own
  fetch when called standalone (the pattern `emitNegationsForEntity` already uses for
  events). Bulk queries **replicate the existing getter `ORDER BY` exactly** so output stays
  byte-identical.

- **GEDCOM export progress.** Add an `onProgress?: (msg: string) => void` callback to the
  exporter, matching the importer pattern, emitted at phase boundaries (sources, persons,
  families) and periodically inside the person loop.

- **Website export.** `buildSnapshot` in [`src/api/html_site/snapshot.ts`](../../src/api/html_site/snapshot.ts):
  add a wall-clock yield budget to the inline gazetteer-resolution loop ([snapshot.ts:179](../../src/api/html_site/snapshot.ts#L179))
  so it interleaves with other IPCs; add `onProgress`.

- **Archive export.** [`src/api/archive_export.ts`](../../src/api/archive_export.ts): add `onProgress`.

- **Progress UI.** The export views/panels surface the `onProgress` messages (same shape as
  import already does) so the user sees advancement.

### In scope — the guardrails (so this class of bug fails CI, not the user)

- **Tests (load-bearing).** New `tests/unit/export-perf.test.ts`: seed a large in-memory DB
  (≥5 000 persons with names, events, places, notes), run each export, and assert a
  **query-count budget** (not wall-clock — deterministic, CI-stable) by spying on the
  db query primitive. The budget is O(tables), not O(persons): an N+1 regression blows it
  immediately. One assertion per export path.
- **Rule.** Extend [`.claude/rules/performance.md`](../../.claude/rules/performance.md) with a
  **"Responsiveness budget"** section: any IPC handler / async callback iterating a
  DB-scale array must (a) be prefetched, not N+1, and (b) carry `onProgress` for any
  operation that can exceed ~1 s. Ensure it loads on `src/api/html_site/` and
  `src/api/archive_*` paths (it already loads on `src/gedcom/`, `src/api/`, `src/import/`).
- **Subagent.** Add a read-only `performance-reviewer` agent (sibling of `ux-reviewer`)
  that greps a diff for nested DB-scale scans and `await get*(db, …)` inside loops, wired
  into the `subagent-handoff` review step.
- **Profiling baseline.** Capture before/after for the GEDCOM export at
  `docs/baseline-perf/2026-06-17/` per the `performance-profiling` skill convention.

### Scope deviations

- **CSV export, PDF/print export, gazetteer export.** Not migrated. Reason: CSV is a flat
  single-table dump (no per-row fan-out); PDF/print operates on already-rendered DOM, not a
  DB walk; gazetteer export writes a bundled JSON. None exhibit the N+1 shape. Confirmed by
  reading each before excluding — not assumed.
- **Streaming output (string[] → WritableStream).** Out of scope. `performance.md` records
  the `string[]` + `join` accumulation as "acceptable today"; the bottleneck measured here
  is IPC round-trips, not output materialization. Revisit only if a post-fix profile shows
  RAM as the new ceiling.

## 3. Verification

1. **Regression gate (the durable, falsifiable goal):** `tests/unit/export-perf.test.ts`
   asserts each export's query count stays within the O(tables) budget on a ≥5 000-person
   seed. **Met: 40 020 → 27 queries.** Reintroducing any per-row fetch fails this test. If
   the count test passes, the emitter N+1 — the cause of the minutes-long, ~0 %-CPU stall
   the user felt as "the button does nothing" — cannot silently return.
2. **Round-trip fidelity preserved:** existing GEDCOM golden-DB-seed and per-field
   round-trip tests pass byte-identical. **Met: all unit tests pass**, including every
   golden/fidelity suite — the prefetch refactor changes *how* rows are fetched, never
   *what* is emitted.
3. **Progress is visible:** the export views show advancing `onProgress` messages; a
   component test asserts the progress line renders on message + clears on done. **Met.**
4. `npm test`, `npm run build`, `npm run test:e2e:full` green (export touches panels/views),
   captured at close-out.

### Verification deviation (recorded honestly per `.claude/rules/plans.md`)

The original §1 named an absolute live target — "GEDCOM 5.5.1 export on the 22k tree under
15 s." **That target is NOT claimed by this plan.** A live debug-build measurement
(`docs/baseline-perf/2026-06-17/summary.md` "After") stayed slow at ~0 % CPU on both
processes and localized the residual cost to **bulk `SELECT *` payload transfer through the
db-shim** — a bottleneck that exists equally before and after this change, is confounded by
debug-build serialization + single-connection contention with the live app, and is **out of
scope** here (this plan targeted the emitter N+1). What this plan proves: the N+1 round-trips
that dominated the before-run are gone (deterministic query-count gate), output is
byte-identical, and progress is shown. The absolute wall-clock target moves to the follow-up
plan `docs/plans/2026-06-17-export-bulk-transfer-cost.md`, which owns a clean release-build
measurement and the transfer optimization.

## 4. Failure modes / RCA reference

- The emitters were shipped per-entity as acknowledged stubs ("acceptable while their row
  counts stay small" — `performance.md`). The miss was not the code; it was the **absence of
  a large-DB test** that would have failed when the counts stopped being small. The guardrail
  half of this plan (query-count test + responsiveness rule + reviewer agent) is the actual
  durable fix; the prefetch is the immediate one.
- Prior art for the fix shape: `prefetchExportData` itself (14 getters already eliminated)
  and `emitNegationsForEntity`'s passed-in `events` parameter.

## Tasks

- [x] **T01 (Tier 1)** — Capture the before-baseline: GEDCOM 5.5.1 export wall-clock on
  `export-import/test.db` via the dev-MCP timing harness; write `docs/baseline-perf/2026-06-17/summary.md`
  with the number + the ~0%-CPU IPC-bound observation. Commit. *(Done: >3 min, ~0 % CPU; 40 020 queries on 5k seed.)*
- [x] **T02 (Tier 1)** — Write `tests/unit/export-perf.test.ts` FIRST (TDD): seed ≥5 000
  persons + names + events + places + notes; spy on the db query primitive; assert the
  current (failing-by-being-huge) count, then encode the target O(tables) budget. Commit the
  red test. *(Done: red at 40 020 vs <200.)*
- [x] **T03 (Tier 1)** — Extend `prefetchExportData` with notes/associations/name-translations/place-translations/coverage
  bulk fetches + Maps, replicating each getter's `ORDER BY`. Thread optional pre-fetched
  params into the five emitters with standalone fallback. Make T02 green. *(Done: 27 queries; all golden tests byte-identical.)*
- [x] **T04 (Tier 1)** — Add `onProgress` to the GEDCOM exporter, website `buildSnapshot`,
  and `archive_export`; add a yield budget to the website gazetteer-resolve loop. *(Done.)*
- [x] **T05 (Tier 1)** — Wire `onProgress` through `window.api` + the export views/panels so
  progress is visible. (Tier 2 note: surface the chosen progress-UI affordance in the commit;
  reuse the import progress component if one exists.) *(Done: mirrored import fan-out; also fixed pre-existing exportGedcom version/options arg bug.)*
- [x] **T06 (Tier 1)** — Add the "Responsiveness budget" section to `.claude/rules/performance.md`
  + path-load on `html_site`/`archive`. Add the `performance-reviewer` agent + wire into
  `subagent-handoff`. *(Done.)*
- [x] **T07 (Tier 1)** — Capture after-baseline into `docs/baseline-perf/2026-06-17/`; record
  wall-clock + query-count deltas. Confirm GEDCOM round-trip golden tests still byte-identical.
  *(Done: query count 40 020→27, byte-identical confirmed. Live debug wall-clock INCONCLUSIVE —
  bulk-transfer bottleneck found, carried to follow-up `docs/plans/2026-06-17-export-bulk-transfer-cost.md`;
  see Verification deviation above.)*
- [x] **T-final (Tier 1)** — Invoke `/close-out`. The skill walks the 6+1 steps, captures
  evidence (`npm test`, `npm run build`, `npm run test:e2e:full`), refuses partial.

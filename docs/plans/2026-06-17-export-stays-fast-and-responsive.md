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

1. **User-observable:** on `export-import/test.db` (22k persons), GEDCOM 5.5.1 export
   completes in **under 15 s** (target; the real win is minutes → seconds) and the export
   view shows progress messages advancing. Re-measured via the same dev-MCP `ui_eval`
   timing harness used to capture the starting point; number recorded in the close-out
   commit and in `docs/baseline-perf/2026-06-17/summary.md`.
2. **Regression gate:** `tests/unit/export-perf.test.ts` asserts each export's query count
   stays within the O(tables) budget on a ≥5 000-person seed. Reintroducing any per-row
   fetch fails this test. (This is the falsifiability check: if the count test passes, the
   user goal — no N+1 — cannot still be silently unmet.)
3. **Round-trip fidelity preserved:** existing GEDCOM golden-DB-seed and per-field
   round-trip tests still pass byte-identical — the prefetch refactor changes *how* rows are
   fetched, never *what* is emitted.
4. `npm test`, `npm run build`, and `npm run test:e2e:full` (export touches panels/views)
   green, with output captured at close-out.

## 4. Failure modes / RCA reference

- The emitters were shipped per-entity as acknowledged stubs ("acceptable while their row
  counts stay small" — `performance.md`). The miss was not the code; it was the **absence of
  a large-DB test** that would have failed when the counts stopped being small. The guardrail
  half of this plan (query-count test + responsiveness rule + reviewer agent) is the actual
  durable fix; the prefetch is the immediate one.
- Prior art for the fix shape: `prefetchExportData` itself (14 getters already eliminated)
  and `emitNegationsForEntity`'s passed-in `events` parameter.

## Tasks

- [ ] **T01 (Tier 1)** — Capture the before-baseline: GEDCOM 5.5.1 export wall-clock on
  `export-import/test.db` via the dev-MCP timing harness; write `docs/baseline-perf/2026-06-17/summary.md`
  with the number + the ~0%-CPU IPC-bound observation. Commit.
- [ ] **T02 (Tier 1)** — Write `tests/unit/export-perf.test.ts` FIRST (TDD): seed ≥5 000
  persons + names + events + places + notes; spy on the db query primitive; assert the
  current (failing-by-being-huge) count, then encode the target O(tables) budget. Commit the
  red test.
- [ ] **T03 (Tier 1)** — Extend `prefetchExportData` with notes/associations/name-translations/place-translations/coverage
  bulk fetches + Maps, replicating each getter's `ORDER BY`. Thread optional pre-fetched
  params into the five emitters with standalone fallback. Make T02 green.
- [ ] **T04 (Tier 1)** — Add `onProgress` to the GEDCOM exporter, website `buildSnapshot`,
  and `archive_export`; add a yield budget to the website gazetteer-resolve loop.
- [ ] **T05 (Tier 1)** — Wire `onProgress` through `window.api` + the export views/panels so
  progress is visible. (Tier 2 note: surface the chosen progress-UI affordance in the commit;
  reuse the import progress component if one exists.)
- [ ] **T06 (Tier 1)** — Add the "Responsiveness budget" section to `.claude/rules/performance.md`
  + path-load on `html_site`/`archive`. Add the `performance-reviewer` agent + wire into
  `subagent-handoff`.
- [ ] **T07 (Tier 1)** — Capture after-baseline into `docs/baseline-perf/2026-06-17/`; record
  wall-clock + query-count deltas. Confirm GEDCOM round-trip golden tests still byte-identical.
- [ ] **T-final (Tier 1)** — Invoke `/close-out`. The skill walks the 6+1 steps, captures
  evidence (`npm test`, `npm run build`, `npm run test:e2e:full`, the re-measured export
  number), refuses partial.

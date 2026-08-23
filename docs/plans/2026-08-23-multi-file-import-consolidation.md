# Multi-File Import and Consolidation Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A researcher picks several export files at once, and afterwards sees one list of the things that arrived twice, decides which to join, and ends with one tree.

**Architecture:** Every importer gains multi-file selection and runs the files as a sequential queue — no new merge concept, because `importGedcom` already appends to the current database. Afterwards a consolidation step reviews what arrived, grouped into **clusters** rather than pairs, because a pairwise surface cannot express "these 129 rows are one volume". Exact clusters key on the identifiers already stored in `external_identifiers`; fuzzy clusters reuse the existing scorers. Imports stay faithful — nothing collapses at import time, the researcher decides.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite, Vue 3, Playwright.

**Spec:** [docs/plans/2026-08-23-arkivdigital-import-design.md](2026-08-23-arkivdigital-import-design.md) — Parts 4 and 5.

**Depends on:** `external_identifiers`, shipped in v0.273.0 by [the arkivdigital profile](archive/2026-08-23-arkivdigital-profile.md). Its `idx_external_identifiers_lookup` index on `(system, value)` is what makes exact clustering a single indexed scan.

## Global Constraints

- **Imports stay faithful.** No profile collapses anything at import time. 2776 source records import as 2776; the review step is where anything merges, and only when the researcher says so. This is the design's explicit choice and the product principle "the user does the work; tools surface possibilities, never commit".
- `.claude/rules/performance.md`: clustering is bulk. `findDuplicateSources` today loads every source and runs pairwise Levenshtein — 3.85 M comparisons at 2776 sources. Exact clustering must be one indexed query, not N².
- The four ArkivDigital files under `export-import/min släkt/` are a real person's family data. `/export-import/` is gitignored. **Never commit them.**
- A parallel session owns `docs/unmapped-capture`. Do not touch `normalize.ts` and do not create an `unmapped_data` table.
- Worktree: `git -C <path>`, `npm --prefix <path>`, `npm --prefix <path> run typecheck`, and **vitest needs `--root <abs-worktree-path>`**.
- Stage commits **by explicit path** — `git add -A` is blocked by a hook, for good reason.

---

## User goal

A researcher who has four exports from the same service imports them in one go and is then shown, in one place:

- the archive volumes that arrived more than once, grouped — not 8256 pairs, one row per volume,
- the handful of people who appear in more than one file,
- for each, enough to decide, and a way to say no that sticks.

They approve what they recognise, decline what they don't, and close with one tree.

Measured on the friend's four ArkivDigital exports, that is: 2776 source records representing 1496 volumes, and **5 people** who genuinely appear in more than one file — Lena Kristina, Susanna Maria, Ronny Ingemar, Gustaf Hilding, and Maj Gulli/Gurli, whose two spellings differ by one letter. Those five are the entire join between the four grandparent lines.

## Scope

**Part 4 — multi-file import**, for every importer, not just GEDCOM. Full list of the entry points that today take one file: `gedcom` (`src/renderer/tauri-window-api.ts:802`), `genney`, `holger`, `rootsmagic`, `gramps`, `archive`. Each gains multi-select and a sequential queue with per-file progress and one combined report.

**Part 5 — consolidation review**, a step in the import flow, scoped to what the queue just imported.

- **Exact clusters** — same `(system, value)` in `external_identifiers`. Zero judgement.
- **Fuzzy clusters** — the existing `findDuplicateSources` / `findDuplicatePlaces` / `findDuplicates` (persons) / media scorers, re-shaped from pairs into clusters.
- Approve a cluster → merge into one row via the existing `mergePersons` / `mergeSources` / `mergePlaces` / `mergeMedia`. Decline → `ignored_duplicates`, which already covers `person | place | source | media`.

### Scope deviations

- **`ignored_duplicates` stores pairs, not clusters.** Declining a 129-row cluster writes 128 pair rows against the cluster's representative, not 8256 for every combination. That keeps the existing table and its `person1_id < person2_id` constraint, at the cost of a decline being expressible only relative to a representative. Revisit if a user reports a declined cluster reappearing split.
- **Cross-file person matching stays fuzzy.** ArkivDigital allocates person ids from one global sequence but writes a fresh id per tree — all 822 xrefs are distinct across the four files, including for the same human. There is no exact key to use, and inventing one would merge people who share a name.
- **The 129-copy case is not auto-merged even though it is unambiguous.** `Sveriges befolkning 1985` appearing 129 times is certainly one volume, but auto-merging on import is the rejected "auto-suggestions that mutate the DB" shape. It appears as one pre-ticked exact cluster the researcher confirms in a single action.
- **Archive (`.zip`) multi-file import is in scope; media consolidation across archives is not.** Two archives carrying the same photo produce two media rows; the media duplicates tab already exists for that and is not re-plumbed here.

## Verification

1. **Import all four ArkivDigital files in one action** and assert 822 persons, 2776 sources, and a consolidation step offering 1496 source clusters.
2. **Approve every exact cluster in one action** and assert sources drop 2776 → 1496 with every citation still pointing at a surviving source — `SELECT COUNT(*) FROM citations WHERE source_id NOT IN (SELECT id FROM sources)` returns 0.
3. **The five join people are offered and none is merged without approval.** Assert the fuzzy person clusters contain all five by name, and that declining one writes `ignored_duplicates` and it does not reappear on a re-run.
4. **Clustering is bulk.** Query-count assertion on a 5000-source DB: exact clustering issues under 20 queries, not one per source and not N² comparisons.
5. **The review is completable.** e2e `[imports]`: import two files, approve all exact clusters with one control, and assert the modal closes with the merged counts shown. A review that takes 1496 individual clicks has not met the user goal.
6. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e:full` green with output captured.

**User-goal-falsifiability check:** if 1-6 pass, can the goal be unmet? Yes, in one way — the researcher could approve a cluster that merges two genuinely different volumes and have no way back. Task 9 adds an undo group around each cluster merge so a mistaken approval is one action to reverse, which is why item 2 alone is not enough.

## File Structure

| File | Responsibility |
|---|---|
| `src/api/duplicates/clusters.ts` *(new)* | `findExactClusters(db, entityType)` over `external_identifiers`; `clusterFromPairs(pairs)` to fold the existing pairwise scorers into clusters. Pure grouping plus one indexed query. |
| `src/api/duplicates/consolidate.ts` *(new)* | `applyCluster(db, entityType, cluster)` — merge every member into the representative inside one undo group. |
| `src/renderer/components/import/ConsolidationStep.vue` *(new)* | The review surface. Cluster list, per-cluster approve/decline, one "approve all exact" control. |
| `src/renderer/components/import/ImportQueue.ts` *(new)* | Sequential queue: N files, per-file progress, one combined report. |
| `src/renderer/tauri-window-api.ts` *(modify)* | `pickFiles` (plural) alongside `pickFile`; each importer's `selectFile` gains a multi variant. |
| `src-tauri/src/lib.rs` *(modify)* | `dialog_pick` gains a `multiple` flag; `tauri_plugin_dialog`'s `pick_files` already exists. Regenerates `bindings.ts`. |
| `src/renderer/components/import/*ImportSection.vue` *(modify)* | Six sections wired to the queue. |
| `tests/e2e/imports.spec.ts` *(modify)* | Multi-file case + the consolidation step. |

---

## Tasks

### Task 1 (Tier 1): Exact clusters from stored identifiers

**Files:** Create `src/api/duplicates/clusters.ts`; test `tests/unit/duplicate-clusters.test.ts`.

**Interfaces:**
```ts
export interface DuplicateCluster { entityType: string; memberIds: string[]; representativeId: string; reason: string }
export function findExactClusters(db: Database, entityType: string): Promise<DuplicateCluster[]>
```
One indexed query on `external_identifiers(system, value)`, grouped in memory. Clusters of one are not clusters and are not returned.

- [ ] **Step 1: Write the failing test** — seed three sources, two sharing `(arkivdigital, v1)`; assert one cluster of two, and that a lone identifier yields nothing. Add a 5000-source query-count assertion (`< 20`).
- [ ] **Step 2: Run it and watch it fail** — module not found.
- [ ] **Step 3: Implement** — `SELECT system, value, entity_id FROM external_identifiers WHERE entity_type = ? ORDER BY system, value`, fold into groups, drop singletons. Representative is the earliest `created_at`, so the choice is stable across runs.
- [ ] **Step 4: Run it and watch it pass.**
- [ ] **Step 5: Commit** — `git add src/api/duplicates/clusters.ts tests/unit/duplicate-clusters.test.ts`

---

### Task 2 (Tier 1): Fold the pairwise scorers into clusters

**Files:** Modify `src/api/duplicates/clusters.ts`; test `tests/unit/duplicate-clusters.test.ts`.

**Interfaces:** `export function clusterFromPairs(pairs: Array<{ a: string; b: string; score: number }>): DuplicateCluster[]` — connected components over the pair graph.

The existing scorers return pairs. Three pairs (A,B), (B,C), (A,C) are one cluster of three, not three rows for the user to judge separately.

- [ ] **Step 1: Write the failing test** — (A,B) + (B,C) folds to one cluster {A,B,C}; two disjoint pairs stay two clusters; a pair with itself is rejected.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement** union-find. No DB access; pure function over the pair list.
- [ ] **Step 4: Run it and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 3 (Tier 1): Apply a cluster as one undoable action

**Files:** Create `src/api/duplicates/consolidate.ts`; test `tests/unit/duplicate-consolidate.test.ts`.

**Interfaces:** `export function applyCluster(db: Database, cluster: DuplicateCluster): Promise<{ merged: number }>`

Wraps the existing `mergePersons` / `mergeSources` / `mergePlaces` / `mergeMedia` in `beginGroup`/`endGroup` per `.claude/skills/undo-redo-patterns`, so approving a 129-member cluster is **one** undo step, not 128.

- [ ] **Step 1: Write the failing test** — a 3-source cluster merges to 1 with citations repointed; `SELECT COUNT(*) FROM citations WHERE source_id NOT IN (SELECT id FROM sources)` is 0; one undo restores all three.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 4 (Tier 1): Multi-select in the Rust picker

**Files:** Modify `src-tauri/src/lib.rs`, `src/renderer/tauri-window-api.ts`; test `tests/unit/tauri-window-api.test.ts`.

**Interfaces:** `dialog_pick` gains `multiple: Option<bool>`; renderer gains `pickFiles(...): Promise<string[]>`. `bindings.ts` regenerates on `cargo build` — run `npm run typecheck` afterwards, per CLAUDE.md's Specta note.

- [ ] **Step 1: Write the failing test** — mock the binding, assert `pickFiles` returns an array and that a cancel yields `[]` rather than `[undefined]`.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement** — `builder.pick_files` behind the flag; keep `pickFile` delegating to it and taking the first result, so no existing call site changes.
- [ ] **Step 4: Run `npm run typecheck`** to catch Specta drift.
- [ ] **Step 5: Run the test and watch it pass.**
- [ ] **Step 6: Commit.**

---

### Task 5 (Tier 1): The sequential import queue

**Files:** Create `src/renderer/components/import/ImportQueue.ts`; test `tests/components/import-queue.test.ts`.

**Interfaces:** `runImportQueue(files: string[], importOne: (f: string) => Promise<Report>, onProgress: (i: number, n: number, f: string) => void): Promise<CombinedReport>`

Sequential by design — `beginAccounting` throws on re-entry, and two overlapping imports would merge their node sets and mask a real drop.

- [ ] **Step 1: Write the failing test** — three files run in order; a failure on file 2 does not abandon file 3 and is named in the combined report; progress fires once per file.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 6 (Tier 1): Wire the queue into all six import sections

**Files:** Modify the six `*ImportSection.vue` under `src/renderer/components/import/`; test `tests/components/`.

- [ ] **Step 1: Write the failing test** for `GedcomImportSection` — picking two files calls the importer twice and shows one report.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement** for GEDCOM first, then the other five. Re-run after each so a broken section is attributable.
- [ ] **Step 4: Run the component suite.**
- [ ] **Step 5: Commit.**

---

### Task 7 (Tier 1): The consolidation step

**Files:** Create `src/renderer/components/import/ConsolidationStep.vue`; modify `GedcomImportSection.vue`; i18n `sv.ts` / `en.ts`; test `tests/components/consolidation-step.test.ts`.

Keys go under the `importExport` namespace beside `importReportSkipped`, and the markup follows the existing report sections — `<p class="report-section-label">`, not a heading.

- [ ] **Step 1: Write the failing test** — renders one row per cluster with its member count; "approve all exact" is a single control; declining hides the row; an empty cluster list renders nothing at all.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 8 (Tier 1): Decline sticks

**Files:** Modify `src/api/duplicates/consolidate.ts`; test `tests/unit/duplicate-consolidate.test.ts`.

- [ ] **Step 1: Write the failing test** — declining a cluster writes `ignored_duplicates` rows against the representative, and re-running the finder does not return it.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** Record the deviation in a comment: pairs against the representative, not the full combination, so a 129-cluster costs 128 rows rather than 8256.
- [ ] **Step 4: Run it and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 9 (Tier 1): Verify against the four real files

**Files:** none created — measurement against gitignored local data.

- [ ] **Step 1: Import all four in one queue run.** Assert 822 persons, 2776 sources.
- [ ] **Step 2: Assert the exact clusters number 1496** and that approving all of them leaves 1496 sources with zero orphaned citations.
- [ ] **Step 3: Assert the five join people appear** in the fuzzy person clusters, by name.
- [ ] **Step 4: Undo one approved cluster** and assert the sources come back.
- [ ] **Step 5: Drive the consolidation step in the running app** via dev MCP. `ui_screenshot` returned unpainted images in two prior sessions; if that recurs, capture the DOM via `ui_eval` and say which was used. **Switch to a scratch database first and restore the original afterwards.**
- [ ] **Step 6: Record all output for the close-out commit.**

---

### Task 10 (Tier 1): e2e coverage

**Files:** Modify `tests/e2e/imports.spec.ts`, `tests/e2e/fixtures/imports/`.

- [ ] **Step 1: Write the failing e2e** — import two synthetic files in one action, approve all exact clusters, assert the merged count.
- [ ] **Step 2: Run `npm run test:e2e:full`** and watch it fail.
- [ ] **Step 3: Implement whatever the failure names.**
- [ ] **Step 4: Run the full e2e tier and capture per-project counts.**
- [ ] **Step 5: Commit.**

---

### Task 11 (Tier 1): Close out

- [ ] **T-final (Tier 1)** — Invoke `/close-out`. The skill walks the 6+1 steps, refuses partial, captures evidence.

**On archiving the design spec:** this plan delivers Parts 4-5 of
[2026-08-23-arkivdigital-import-design.md](2026-08-23-arkivdigital-import-design.md), whose
Parts 1-3 shipped in v0.273.0. When this plan archives, that spec is fully delivered and
archives with it — check that Parts 1-5 are all accounted for before moving it.

---

## Self-review checklist

- [ ] Every task has a tier tag.
- [ ] No self-referential tasks.
- [ ] Every task ends in a commit or a recorded measurement.
- [ ] No file from `export-import/` committed.
- [ ] No change to `normalize.ts`, no `unmapped_data` table.
- [ ] Clustering is O(indexed query), not O(n²) — asserted, not assumed.
- [ ] Approving a cluster is one undo step.
- [ ] Nothing merges without an explicit approval.
- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e:full` green with output captured.

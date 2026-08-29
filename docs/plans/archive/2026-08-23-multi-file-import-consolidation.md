# Multi-File Import and Consolidation Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A researcher picks several export files at once, and afterwards sees one list of the things that arrived twice, decides which to join, and ends with one tree.

**Architecture:** Every importer gains multi-file selection and runs the files as a sequential queue — no new merge concept, because `importGedcom` already appends to the current database. Afterwards a consolidation step reviews what arrived, grouped into **clusters** rather than pairs, because a pairwise surface cannot express "these 129 rows are one volume". Exact clusters key on the identifiers already in `external_identifiers`; fuzzy clusters fold the existing pairwise scorers into connected components. Imports stay faithful — nothing collapses at import time.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite, Vue 3, Rust (Tauri), Playwright.

**Spec:** [docs/plans/2026-08-23-arkivdigital-import-design.md](2026-08-23-arkivdigital-import-design.md) — Parts 4 and 5.

**Depends on:** `external_identifiers`, shipped v0.273.0 by [the arkivdigital profile](archive/2026-08-23-arkivdigital-profile.md). Its `idx_external_identifiers_lookup` on `(system, value)` is what makes exact clustering one indexed scan.

## Global Constraints

- **Imports stay faithful.** 2776 source records import as 2776. The review step is where anything merges, only on explicit approval. Product principle: *"the user does the work; tools surface possibilities, never commit."*
- `.claude/rules/performance.md`: exact clustering is one indexed query. `findDuplicateSources` today loads every source and runs pairwise Levenshtein — 3.85 M comparisons at 2776 sources.
- `.claude/rules/api.md`: bulk writes go through `runBatch` inside `BEGIN IMMEDIATE`. Never `db.prepare(...).run(...)` raw — always `queryOne` / `queryAll` / `runSql` / `runBatch` from `src/api/db.ts`.
- `/export-import/` is gitignored real family data. **Never commit it.**
- A parallel session owns `docs/unmapped-capture`. Do not touch `normalize.ts`, do not create an `unmapped_data` table. Rebase before every commit.
- Worktree: `git -C <path>`, `npm --prefix <path>`, **vitest needs `--root <abs-worktree-path>`**.
- Stage **by explicit path**. `git add -A` is blocked by a hook.
- The security hook flags the four-letter substring `e-x-e-c-(`. Use `runSql` / `runBatch`, and avoid the literal in source and commit messages.

---

## User goal

A researcher who has four exports from the same service imports them in one action and is then shown, in one place:

- the archive volumes that arrived more than once, grouped — one row per volume, not 8256 pairs,
- the handful of people who appear in more than one file,
- enough per row to decide, and a way to say no that sticks.

Measured on the four ArkivDigital exports: 2776 source records representing 1472 rows once consolidated (1418 distinct ArkivDigital volumes plus 54 sources carrying no identifier), offered as **441** clusters — the volumes that arrived more than once. The largest holds 128 records, which is 8128 pairs the researcher never sees. And **5 people** who genuinely appear in more than one file — Lena Kristina, Susanna Maria, Ronny Ingemar, Gustaf Hilding, and Maj Gulli/Gurli, whose two spellings differ by one letter. Those five are the entire join between the four grandparent lines. (Re-measured 2026-08-29; the original 1496 was wrong — see Verification.)

## Scope

**Part 4 — multi-file import**, every importer. The entry points that take one file today, all in `src/renderer/tauri-window-api.ts`: `gedcom` (line 802), `genney`, `holger`, `rootsmagic`, `gramps`, `archive`. Each gains multi-select plus a sequential queue with per-file progress and one combined report.

**Part 5 — consolidation review**, a step in the import flow, scoped to what the queue just imported.

- **Exact clusters** — same `(system, value)` in `external_identifiers`. Zero judgement.
- **Fuzzy clusters** — `findDuplicateSources`, `findDuplicatePlaces`, `findDuplicates` (persons), media, folded from pairs into components.
- Approve → merge via existing `mergePersons` / `mergeSources` / `mergePlaces` / `mergeMedia`. Decline → `ignoreDuplicateSource` and its siblings.

### Scope deviations

- **`ignored_duplicates` stores pairs, not clusters.** Declining an N-member cluster writes N-1 pair rows against the representative, not N(N-1)/2. Keeps the existing table and its `person1_id < person2_id` CHECK. A 129-cluster costs 128 rows instead of 8256. Cost: a decline is expressible only relative to a representative — revisit if a declined cluster is reported reappearing split.
- **Cross-file person matching stays fuzzy.** ArkivDigital allocates person ids from one global sequence but writes a fresh id per tree: all 822 xrefs are distinct across the four files, including for the same human. There is no exact key, and inventing one would merge people who merely share a name.
- **The 129-copy case is not auto-merged** even though it is unambiguous. Auto-merging on import is the rejected "auto-suggestions that mutate the DB" shape. It appears as one pre-ticked exact cluster confirmed in a single action.
- **Media consolidation across archives is out.** Two archives carrying the same photo produce two media rows; the existing media duplicates tab covers that and is not re-plumbed here.
- **`DuplicatesView` is not converted to clusters.** It stays the standing whole-DB pairwise tool. Converting it is a follow-up once the cluster surface has been used in anger.

## Verification

1. **Import all four ArkivDigital files in one action.** Assert 822 persons, 2776 sources, and a consolidation step offering **441** source clusters.
2. **Approve every exact cluster in one action.** Assert sources drop 2776 → 1472 and `SELECT COUNT(*) FROM citations WHERE source_id NOT IN (SELECT id FROM sources)` returns 0.
3. **The join people are offered, and none merges without approval.** Assert the fuzzy person clusters contain Lena Kristina, Susanna Maria, Ronny Ingemar and Gustaf Hilding by name; declining one writes `ignored_duplicates` and it does not reappear on a re-run.

**Numbers corrected during execution (2026-08-29), measured not asserted.** The
preamble's 1496 was wrong in two different ways and the plan contradicted itself on it:

- **441, not 1496, clusters are offered.** 1496 was meant to be the volume count, but a
  volume that arrived once is a cluster of one, which `findExactClusters` does not return
  (its own second test asserts that). Only 441 volumes arrived more than once.
- **1472, not 1496, sources remain.** Measured: 2776 source records carry 1418 distinct
  `arkivdigital` values, and 54 sources carry no identifier at all. 1418 + 54 = 1472.
- **The largest cluster holds 128 records** — 8128 pairs the researcher never sees. One
  undo restores all 127 merges (measured 2776 → 2649 → 2776).
- **Four of the five named join people are offered, not five.** Maj Gulli / Maj Gurli is
  missed, and not by the cluster fold: the two records are `"Maj Gulli Maria" "Lindgren"`
  and `"Maj Gurli Maria" "Johansson f. Lindgren"`. `findDuplicates` buckets candidates by
  normalised surname before comparing, so a pair whose surnames differ is never scored and
  never becomes a pair for `clusterFromPairs` to fold. The plan's own Scope keeps
  `findDuplicates` out of range ("cross-file person matching stays fuzzy"), so this is
  reported, not fixed. The other four are offered at similarity 100.
4. **Clustering is bulk.** On a 5000-source DB, exact clustering issues fewer than 20 queries.
5. **The review is completable.** e2e: import two files, approve all exact clusters with one control, modal closes showing merged counts. A review needing 1496 clicks has not met the goal.
6. `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e:full` green with output captured, and `npm run typecheck` showing no NEW errors (see below).

**User-goal-falsifiability check:** if 1-6 pass, can the goal be unmet? Yes — the researcher could approve a cluster that merges two genuinely different volumes and have no way back. Task 3 puts each cluster merge in one undo group so a mistaken approval is one action to reverse, which is why item 2 alone is insufficient.

## File Structure

| File | Responsibility |
|---|---|
| `src/api/duplicates/clusters.ts` *(new)* | `findExactClusters` (one indexed query) and `clusterFromPairs` (union-find). No merging. |
| `src/api/duplicates/consolidate.ts` *(new)* | `applyCluster` / `declineCluster` — merge or ignore every member against the representative, inside one undo group. |
| `src/renderer/components/import/import-queue.ts` *(new)* | `runImportQueue` — sequential, per-file progress, combined report. Pure, no Vue. |
| `src/renderer/components/import/ConsolidationStep.vue` *(new)* | The review surface. |
| `src-tauri/src/lib.rs` *(modify)* | `dialog_pick` gains `multiple`. Regenerates `bindings.ts`. |
| `src/renderer/tauri-window-api.ts` *(modify)* | `pickFiles`; six `selectFiles` variants. |
| `src/renderer/components/import/GedcomImportSection.vue` *(modify)* | Queue + consolidation step wiring. |
| `tests/e2e/imports.spec.ts` *(modify)* | Multi-file + consolidation case. |

**Type-checking, measured not asserted.** `npm run typecheck` (`vue-tsc --noEmit --ignoreDeprecations 6.0`) **is not clean on this repo and never has been — 2304 pre-existing errors.** The check is *no new errors*, measured against a baseline taken on the branch point:

```bash
git -C <wt> stash -u
npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # baseline
git -C <wt> stash pop
npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # must equal the baseline
npm --prefix <wt> run typecheck 2>&1 | grep '<file you touched>'   # must be empty
```

Do not run it in the main tree for a baseline: that run is swamped by `src-tauri/target/release/**` build artifacts and reports a different, useless number (5840 when the worktree reported 2304).

---

## Tasks

### Task 1 (Tier 1): Exact clusters from stored identifiers

**Files:**
- Create: `src/api/duplicates/clusters.ts`
- Test: `tests/unit/duplicate-clusters.test.ts`

**Interfaces:**
- Consumes: `queryAll` from `src/api/db`.
- Produces:
  ```ts
  export interface DuplicateCluster {
    entityType: 'person' | 'place' | 'source' | 'media';
    memberIds: string[];        // representative first
    representativeId: string;
    reason: string;             // shown to the user, e.g. 'arkivdigital v191316'
    kind: 'exact' | 'fuzzy';
  }
  export function findExactClusters(db: Database, entityType: DuplicateCluster['entityType']): Promise<DuplicateCluster[]>
  ```

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/duplicate-clusters.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findExactClusters } from '../../src/api/duplicates/clusters';
import { bulkAddExternalIdentifiers } from '../../src/api/external_identifiers';
import { createSource } from '../../src/api/sources';
import { runBatch } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

async function seedSource(title: string, aid?: string): Promise<string> {
  const src = await createSource(db, { title });
  if (aid) {
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: aid },
    ]);
  }
  return src.id;
}

describe('findExactClusters', () => {
  it('groups sources that share one (system, value)', async () => {
    const a = await seedSource('Valbo C:15 p52', 'v191316');
    const b = await seedSource('Valbo C:15 p88', 'v191316');
    await seedSource('Hedesunda AI:14a', 'v135435');
    const clusters = await findExactClusters(db, 'source');
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds.sort()).toEqual([a, b].sort());
    expect(clusters[0].kind).toBe('exact');
    expect(clusters[0].reason).toContain('v191316');
  });

  it('does not return a cluster of one', async () => {
    await seedSource('Only one', 'v1');
    expect(await findExactClusters(db, 'source')).toEqual([]);
  });

  it('keeps different systems apart even when the value matches', async () => {
    const a = await seedSource('A');
    const b = await seedSource('B');
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: a, system: 'arkivdigital', value: 'x1' },
      { entity_type: 'source', entity_id: b, system: 'gramps.handle', value: 'x1' },
    ]);
    expect(await findExactClusters(db, 'source')).toEqual([]);
  });

  it('picks a stable representative across repeated runs', async () => {
    await seedSource('First', 'v9');
    await seedSource('Second', 'v9');
    const one = await findExactClusters(db, 'source');
    const two = await findExactClusters(db, 'source');
    expect(one[0].representativeId).toBe(two[0].representativeId);
    expect(one[0].memberIds[0]).toBe(one[0].representativeId);
  });

  it('ignores an entity type it was not asked about', async () => {
    await seedSource('A', 'v1');
    await seedSource('B', 'v1');
    expect(await findExactClusters(db, 'place')).toEqual([]);
  });

  it('issues a bounded number of queries on a large table', async () => {
    const src = await createSource(db, { title: 'bulk' });
    await runBatch(
      db,
      `INSERT INTO external_identifiers (id, entity_type, entity_id, system, value)
       VALUES (?, 'source', ?, 'arkivdigital', ?)`,
      Array.from({ length: 5000 }, (_, i) => [crypto.randomUUID(), src.id, `v${i % 1200}`]),
    );
    const spy = vi.spyOn(db, 'prepare');
    await findExactClusters(db, 'source');
    expect(spy.mock.calls.length, 'exact clustering must be O(1) queries').toBeLessThan(20);
    spy.mockRestore();
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm --prefix <wt> exec -- vitest run --root <wt> tests/unit/duplicate-clusters.test.ts`
Expected: FAIL — `Cannot find module '../../src/api/duplicates/clusters'`.

- [x] **Step 3: Implement**

```ts
// src/api/duplicates/clusters.ts
import { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';

/**
 * Duplicate detection that groups, rather than pairing.
 *
 * The existing scorers return pairs, which cannot express "these 129 rows are
 * one volume": 129 copies of 'Sveriges befolkning 1985' is 8256 pairs from one
 * title, and no researcher works through 8256 rows. A cluster is one decision.
 */

export interface DuplicateCluster {
  entityType: 'person' | 'place' | 'source' | 'media';
  /** Representative first, then the rest in stable order. */
  memberIds: string[];
  representativeId: string;
  /** Shown to the user — why these were grouped. */
  reason: string;
  kind: 'exact' | 'fuzzy';
}

interface IdentRow {
  entity_id: string;
  system: string;
  value: string;
  created_at: string;
}

/**
 * Clusters built from identifiers the source file stated. Zero judgement: two
 * rows carrying the same (system, value) are the same thing by the exporter's
 * own account.
 *
 * One query for the whole entity type — `.claude/rules/performance.md`. The
 * `(system, value)` index makes the ORDER BY a scan of the index rather than a
 * sort of the table.
 */
export async function findExactClusters(
  db: Database,
  entityType: DuplicateCluster['entityType'],
): Promise<DuplicateCluster[]> {
  const rows = await queryAll<IdentRow>(
    db,
    `SELECT entity_id, system, value, created_at
       FROM external_identifiers
      WHERE entity_type = ?
      ORDER BY system, value, created_at, entity_id`,
    [entityType],
  );

  const byKey = new Map<string, IdentRow[]>();
  for (const row of rows) {
    const key = `${row.system} ${row.value}`;
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [key, group] of byKey) {
    // Distinct entities only — one entity may carry the same id twice.
    const seen = new Set<string>();
    const memberIds: string[] = [];
    for (const row of group) {
      if (seen.has(row.entity_id)) continue;
      seen.add(row.entity_id);
      memberIds.push(row.entity_id);
    }
    if (memberIds.length < 2) continue;
    const [system, value] = key.split(' ');
    clusters.push({
      entityType,
      memberIds,
      // Earliest created_at wins, so the representative is stable across runs
      // and a re-run after a partial approval does not reshuffle the list.
      representativeId: memberIds[0],
      reason: `${system} ${value}`,
      kind: 'exact',
    });
  }
  return clusters;
}
```

- [x] **Step 4: Run it and watch it pass**

Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git -C <wt> add src/api/duplicates/clusters.ts tests/unit/duplicate-clusters.test.ts
git -C <wt> commit -m "feat(api): exact duplicate clusters from stored identifiers"
```

---

### Task 2 (Tier 1): Fold the pairwise scorers into clusters

**Files:**
- Modify: `src/api/duplicates/clusters.ts`
- Test: `tests/unit/duplicate-clusters.test.ts`

**Interfaces:**
- Produces: `export function clusterFromPairs(entityType, pairs: Array<{ aId: string; bId: string; score: number; reason?: string }>): DuplicateCluster[]`

Pure — no DB access. `(A,B)` plus `(B,C)` is one cluster of three, not two decisions.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/duplicate-clusters.test.ts
import { clusterFromPairs } from '../../src/api/duplicates/clusters';

describe('clusterFromPairs', () => {
  it('folds a transitive chain into one cluster', () => {
    const [c] = clusterFromPairs('source', [
      { aId: 'A', bId: 'B', score: 90 },
      { aId: 'B', bId: 'C', score: 85 },
    ]);
    expect(c.memberIds.sort()).toEqual(['A', 'B', 'C']);
    expect(c.kind).toBe('fuzzy');
  });

  it('keeps disjoint pairs as separate clusters', () => {
    const cs = clusterFromPairs('source', [
      { aId: 'A', bId: 'B', score: 90 },
      { aId: 'C', bId: 'D', score: 90 },
    ]);
    expect(cs).toHaveLength(2);
  });

  it('returns nothing for no pairs', () => {
    expect(clusterFromPairs('source', [])).toEqual([]);
  });

  it('ignores a self-pair rather than emitting a cluster of one', () => {
    expect(clusterFromPairs('source', [{ aId: 'A', bId: 'A', score: 100 }])).toEqual([]);
  });

  it('orders members deterministically so the list does not reshuffle', () => {
    const once = clusterFromPairs('source', [
      { aId: 'C', bId: 'A', score: 90 }, { aId: 'B', bId: 'C', score: 80 },
    ]);
    const twice = clusterFromPairs('source', [
      { aId: 'B', bId: 'C', score: 80 }, { aId: 'C', bId: 'A', score: 90 },
    ]);
    expect(once[0].memberIds).toEqual(twice[0].memberIds);
    expect(once[0].representativeId).toBe(twice[0].representativeId);
  });

  it('reports the strongest pair score as the cluster reason', () => {
    const [c] = clusterFromPairs('source', [
      { aId: 'A', bId: 'B', score: 72 }, { aId: 'B', bId: 'C', score: 95 },
    ]);
    expect(c.reason).toContain('95');
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Expected: FAIL — `clusterFromPairs is not a function`.

- [x] **Step 3: Implement**

```ts
// append to src/api/duplicates/clusters.ts

export interface ScoredPair {
  aId: string;
  bId: string;
  score: number;
  reason?: string;
}

/**
 * Connected components over a pair list.
 *
 * The existing scorers answer "do these two look alike". Three pairs (A,B),
 * (B,C), (A,C) describe one group of three, and presenting them as three rows
 * asks the researcher the same question three times.
 *
 * Union-find with path compression. Pure: the caller supplies the pairs, so
 * this is testable without a database and reusable by every entity type.
 */
export function clusterFromPairs(
  entityType: DuplicateCluster['entityType'],
  pairs: ScoredPair[],
): DuplicateCluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    if (root !== x) {
      root = find(root);
      parent.set(x, root);
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    // Lexicographic root keeps the outcome independent of pair order.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };

  for (const p of pairs) {
    if (p.aId === p.bId) continue;
    if (!parent.has(p.aId)) parent.set(p.aId, p.aId);
    if (!parent.has(p.bId)) parent.set(p.bId, p.bId);
    union(p.aId, p.bId);
  }

  const groups = new Map<string, Set<string>>();
  for (const id of parent.keys()) {
    const root = find(id);
    const set = groups.get(root) ?? new Set<string>();
    set.add(id);
    groups.set(root, set);
  }

  const bestScore = new Map<string, number>();
  for (const p of pairs) {
    if (p.aId === p.bId) continue;
    const root = find(p.aId);
    bestScore.set(root, Math.max(bestScore.get(root) ?? 0, p.score));
  }

  const clusters: DuplicateCluster[] = [];
  for (const [root, set] of groups) {
    if (set.size < 2) continue;
    const memberIds = [...set].sort();
    clusters.push({
      entityType,
      memberIds,
      representativeId: memberIds[0],
      reason: `likhet ${bestScore.get(root) ?? 0}`,
      kind: 'fuzzy',
    });
  }
  return clusters.sort((a, b) => a.representativeId.localeCompare(b.representativeId));
}
```

- [x] **Step 4: Run it and watch it pass**

Expected: PASS, 6 new tests.

- [x] **Step 5: Commit**

```bash
git -C <wt> add src/api/duplicates/clusters.ts tests/unit/duplicate-clusters.test.ts
git -C <wt> commit -m "feat(api): fold pairwise duplicate scores into clusters"
```

---

### Task 3 (Tier 1): Apply or decline a cluster as one undoable action

**Files:**
- Create: `src/api/duplicates/consolidate.ts`
- Test: `tests/unit/duplicate-consolidate.test.ts`

**Interfaces:**
- Consumes: `DuplicateCluster`; `mergeSources` / `mergePlaces` / `mergePersons` / `mergeMedia`; `ignoreDuplicateSource` and siblings; `undoManager` from `src/api/undo`.
- Produces:
  ```ts
  export function applyCluster(db: Database, cluster: DuplicateCluster): Promise<{ merged: number }>
  export function declineCluster(db: Database, cluster: DuplicateCluster): Promise<{ ignored: number }>
  ```

Each merge function already pushes its own undo action (`sources.ts:298`). Wrapping the loop in `beginGroup` / `endGroup` makes a 129-member approval **one** undo step rather than 128.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/duplicate-consolidate.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { applyCluster, declineCluster } from '../../src/api/duplicates/consolidate';
import { findExactClusters } from '../../src/api/duplicates/clusters';
import { findDuplicateSources } from '../../src/api/duplicates/sources';
import { bulkAddExternalIdentifiers } from '../../src/api/external_identifiers';
import { createSource, createCitation } from '../../src/api/sources';
import { queryAll } from '../../src/api/db';
import { undoManager } from '../../src/api/undo';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

async function seedThreeSharingAnAid(): Promise<void> {
  for (const t of ['Valbo p52', 'Valbo p88', 'Valbo p91']) {
    const s = await createSource(db, { title: t });
    await createCitation(db, { source_id: s.id, page: t });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: s.id, system: 'arkivdigital', value: 'v191316' },
    ]);
  }
}

const count = async (sql: string): Promise<number> =>
  (await queryAll<{ c: number }>(db, sql))[0].c;

describe('applyCluster', () => {
  it('merges every member into the representative', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    const { merged } = await applyCluster(db, cluster);
    expect(merged).toBe(2);
    expect(await count('SELECT COUNT(*) c FROM sources')).toBe(1);
  });

  it('leaves no citation pointing at a source that no longer exists', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await applyCluster(db, cluster);
    expect(await count(
      'SELECT COUNT(*) c FROM citations WHERE source_id NOT IN (SELECT id FROM sources)'
    )).toBe(0);
    expect(await count('SELECT COUNT(*) c FROM citations')).toBe(3);
  });

  it('is one undo step, not one per member', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await applyCluster(db, cluster);
    await undoManager.undo();
    expect(await count('SELECT COUNT(*) c FROM sources')).toBe(3);
  });

  it('refuses a cluster whose representative is not a member', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await expect(applyCluster(db, { ...cluster, representativeId: 'nope' }))
      .rejects.toThrow(/representative/i);
  });
});

describe('declineCluster', () => {
  it('records N-1 ignored pairs against the representative, not every combination', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    const { ignored } = await declineCluster(db, cluster);
    expect(ignored).toBe(2);
    expect(await count("SELECT COUNT(*) c FROM ignored_duplicates WHERE entity_type = 'source'")).toBe(2);
  });

  it('keeps the fuzzy finder from offering the pair again', async () => {
    const a = await createSource(db, { title: 'Adolf Fredrik C:I:6, 1798-1812' });
    const b = await createSource(db, { title: 'Adolf Fredrik C:I:6, 1798–1812' });
    const before = await findDuplicateSources(db);
    expect(before.length).toBeGreaterThan(0);
    await declineCluster(db, {
      entityType: 'source', memberIds: [a.id, b.id].sort(),
      representativeId: [a.id, b.id].sort()[0], reason: 'test', kind: 'fuzzy',
    });
    expect(await findDuplicateSources(db)).toEqual([]);
  });

  it('is idempotent', async () => {
    await seedThreeSharingAnAid();
    const [cluster] = await findExactClusters(db, 'source');
    await declineCluster(db, cluster);
    await declineCluster(db, cluster);
    expect(await count("SELECT COUNT(*) c FROM ignored_duplicates WHERE entity_type = 'source'")).toBe(2);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/api/duplicates/consolidate.ts
import { Database } from 'node-sqlite3-wasm';
import { undoManager } from '../undo';
import type { DuplicateCluster } from './clusters';
import { mergePersons } from './persons';
import { mergePlaces } from './places';
import { mergeSources, ignoreDuplicateSource } from './sources';
import { mergeMedia, ignoreDuplicateMedia } from './media';
import { ignoreDuplicatePlace } from './places';
// Persons' is named `ignoreDuplicate` without the entity suffix — the odd one
// out of the four. Aliased here rather than renamed, because renaming reaches
// every existing caller for no behavioural gain.
import { ignoreDuplicate as ignoreDuplicatePerson } from './persons';

/**
 * Turning a reviewed cluster into a database change.
 *
 * Every merge* function already pushes its own undo action. Wrapping the loop in
 * beginGroup/endGroup is what makes approving a 129-member cluster ONE undo
 * step: without it a mistaken approval takes 128 undos to reverse, which is not
 * a way back a researcher would find.
 */

function assertRepresentative(cluster: DuplicateCluster): void {
  if (!cluster.memberIds.includes(cluster.representativeId)) {
    throw new Error(
      `Cluster representative ${cluster.representativeId} is not one of its members`,
    );
  }
}

async function mergeOne(
  db: Database,
  entityType: DuplicateCluster['entityType'],
  targetId: string,
  memberId: string,
): Promise<void> {
  switch (entityType) {
    case 'person': await mergePersons(db, targetId, memberId); return;
    case 'place':  await mergePlaces(db, targetId, memberId); return;
    case 'source': await mergeSources(db, targetId, memberId); return;
    case 'media':  await mergeMedia(db, targetId, memberId, 'target', {}); return;
  }
}

export async function applyCluster(
  db: Database,
  cluster: DuplicateCluster,
): Promise<{ merged: number }> {
  assertRepresentative(cluster);
  const others = cluster.memberIds.filter(id => id !== cluster.representativeId);
  if (others.length === 0) return { merged: 0 };

  undoManager.beginGroup(`Slog ihop ${others.length + 1} poster`);
  try {
    for (const memberId of others) {
      await mergeOne(db, cluster.entityType, cluster.representativeId, memberId);
    }
  } finally {
    undoManager.endGroup();
  }
  return { merged: others.length };
}

async function ignoreOne(
  db: Database,
  entityType: DuplicateCluster['entityType'],
  aId: string,
  bId: string,
): Promise<void> {
  switch (entityType) {
    case 'person': await ignoreDuplicatePerson(db, aId, bId); return;
    case 'place':  await ignoreDuplicatePlace(db, aId, bId); return;
    case 'source': await ignoreDuplicateSource(db, aId, bId); return;
    case 'media':  await ignoreDuplicateMedia(db, aId, bId); return;
  }
}

/**
 * Record a "no" that sticks.
 *
 * `ignored_duplicates` stores pairs, so a cluster is recorded as N-1 pairs
 * against the representative rather than every combination: a 129-member
 * cluster costs 128 rows instead of 8256. The cost is that a decline is
 * relative to the representative — see the scope deviation in the plan.
 */
export async function declineCluster(
  db: Database,
  cluster: DuplicateCluster,
): Promise<{ ignored: number }> {
  assertRepresentative(cluster);
  const others = cluster.memberIds.filter(id => id !== cluster.representativeId);
  for (const memberId of others) {
    await ignoreOne(db, cluster.entityType, cluster.representativeId, memberId);
  }
  return { ignored: others.length };
}
```

- [x] **Step 4: Confirm the four ignore functions**

Verified while writing this plan — all four exist, but they are **not named consistently**:

| Entity | Function | File |
|---|---|---|
| person | `ignoreDuplicate` *(no suffix)* | `persons.ts` |
| place | `ignoreDuplicatePlace` | `places.ts` |
| source | `ignoreDuplicateSource` | `sources.ts:142` |
| media | `ignoreDuplicateMedia` | `media.ts` |

The import block above aliases the person one. Do **not** rename it to match the
others: that reaches every existing caller for no behavioural gain, and this
plan's diff is already wide enough. Re-check with:

```bash
grep -rn "export async function ignoreDuplicate" <wt>/src/api/duplicates/
```

- [x] **Step 5: Run the tests and watch them pass**

Expected: PASS, 7 tests.

- [x] **Step 6: Commit**

```bash
git -C <wt> add src/api/duplicates/consolidate.ts tests/unit/duplicate-consolidate.test.ts
git -C <wt> commit -m "feat(api): apply or decline a duplicate cluster in one action"
```

---

### Task 4 (Tier 1): Multi-select in the picker

**Files:**
- Modify: `src-tauri/src/lib.rs`, `src/renderer/tauri-window-api.ts`
- Test: `tests/unit/tauri-window-api.test.ts`

**Interfaces:**
- `dialog_pick` gains `multiple: Option<bool>`; returns `{ canceled, filePaths: string[] }` when set.
- Renderer gains `pickFiles(title, extensions, label): Promise<string[]>`; `pickFile` delegates and takes the first, so no existing call site changes.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/tauri-window-api.test.ts
describe('pickFiles', () => {
  it('returns every selected path', async () => {
    const invoke = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/a.ged', '/b.ged'] });
    expect(await pickFilesWith(invoke, 'T', ['ged'], 'GEDCOM')).toEqual(['/a.ged', '/b.ged']);
  });

  it('returns an empty array on cancel, never [undefined]', async () => {
    const invoke = vi.fn().mockResolvedValue({ canceled: true });
    expect(await pickFilesWith(invoke, 'T', ['ged'], 'GEDCOM')).toEqual([]);
  });

  it('pickFile still returns a single path so existing callers are unchanged', async () => {
    const invoke = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/a.ged'] });
    expect(await pickFileWith(invoke, 'T', ['ged'], 'GEDCOM')).toBe('/a.ged');
  });
});
```

Export the two `*With` seams from `tauri-window-api.ts` (injected `invoke`) so the test does not need a Tauri host — the file already uses this shape for other bindings; follow whichever seam it uses and match it.

- [x] **Step 2: Run it and watch it fail.**

- [x] **Step 3: Implement the Rust side**

```rust
// src-tauri/src/lib.rs — dialog_pick gains `multiple`
#[specta::specta]
#[tauri::command]
async fn dialog_pick(
    app: tauri::AppHandle,
    kind: String,
    title: Option<String>,
    extensions: Option<Vec<String>>,
    extension_label: Option<String>,
    default_name: Option<String>,
    multiple: Option<bool>,
) -> Result<JsonValueWire, String> {
    // ... existing builder setup unchanged ...
    if multiple.unwrap_or(false) {
        builder.pick_files(move |paths| { let _ = tx.send(paths); });
        let paths = rx.await.map_err(|e| e.to_string())?;
        return Ok(JsonValueWire(match paths {
            Some(ps) => serde_json::json!({
                "canceled": false,
                "filePaths": ps.iter().map(|p| p.to_string()).collect::<Vec<_>>(),
            }),
            None => serde_json::json!({ "canceled": true, "filePaths": [] }),
        }));
    }
    // ... existing single-file path unchanged ...
}
```

- [x] **Step 4: Rebuild so Specta regenerates `bindings.ts`, then typecheck**

```bash
npm --prefix <wt> run build:bin
npm --prefix <wt> run typecheck
```
Expected: **no new errors against the baseline**, and none naming a file this task touched. A renamed or added Rust parameter regenerates `src/renderer/bindings.ts`, and `vue-tsc` is what catches renderer call sites that no longer match — bare `tsc` does not reach them. Expecting zero would fail on 2304 errors that have nothing to do with this task.

- [x] **Step 5: Implement `pickFiles` in the renderer**, with `pickFile` delegating to it.

- [x] **Step 6: Run the test and watch it pass.**

- [x] **Step 7: Commit**

```bash
git -C <wt> add src-tauri/src/lib.rs src/renderer/bindings.ts src/renderer/tauri-window-api.ts tests/unit/tauri-window-api.test.ts
git -C <wt> commit -m "feat(tauri): multi-file selection in the picker"
```

---

### Task 5 (Tier 1): The sequential import queue

**Files:**
- Create: `src/renderer/components/import/import-queue.ts`
- Test: `tests/unit/import-queue.test.ts`

**Interfaces:**
```ts
export interface QueueFileResult<R> { file: string; report: R | null; error: string | null }
export interface QueueResult<R> { results: QueueFileResult<R>[]; succeeded: number; failed: number }
export function runImportQueue<R>(
  files: string[],
  importOne: (file: string) => Promise<R>,
  onProgress?: (done: number, total: number, file: string) => void,
): Promise<QueueResult<R>>
```

Sequential by construction: `beginAccounting` throws on re-entry, and two overlapping imports would merge their node sets and mask a real drop.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-queue.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runImportQueue } from '../../src/renderer/components/import/import-queue';

describe('runImportQueue', () => {
  it('imports every file in the order given', async () => {
    const seen: string[] = [];
    await runImportQueue(['a', 'b', 'c'], async f => { seen.push(f); return f; });
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('never runs two imports at once', async () => {
    let inFlight = 0, maxInFlight = 0;
    await runImportQueue(['a', 'b', 'c'], async f => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight--; return f;
    });
    expect(maxInFlight, 'accounting sessions must not overlap').toBe(1);
  });

  it('carries on after a failure and names it in the result', async () => {
    const res = await runImportQueue(['a', 'bad', 'c'], async f => {
      if (f === 'bad') throw new Error('boom');
      return f;
    });
    expect(res.succeeded).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.results[1].error).toContain('boom');
    expect(res.results[2].report).toBe('c');
  });

  it('reports progress once per file', async () => {
    const onProgress = vi.fn();
    await runImportQueue(['a', 'b'], async f => f, onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2, 'b');
  });

  it('handles an empty list without calling the importer', async () => {
    const importOne = vi.fn();
    const res = await runImportQueue([], importOne);
    expect(importOne).not.toHaveBeenCalled();
    expect(res).toEqual({ results: [], succeeded: 0, failed: 0 });
  });
});
```

- [x] **Step 2: Run it and watch it fail.**

- [x] **Step 3: Implement**

```ts
// src/renderer/components/import/import-queue.ts
/**
 * Runs N import files one after another.
 *
 * Sequential is not a simplification — `beginAccounting` throws on re-entry,
 * and two overlapping imports would merge their consumed-node sets, letting one
 * file's read mark another file's tag as accounted for. That is exactly the
 * silent drop the accounting work exists to prevent.
 *
 * A file that throws does not abandon the rest: the researcher picked four
 * files, and one bad file should not cost them the other three. The failure is
 * named in the combined result instead.
 */

export interface QueueFileResult<R> {
  file: string;
  report: R | null;
  error: string | null;
}

export interface QueueResult<R> {
  results: QueueFileResult<R>[];
  succeeded: number;
  failed: number;
}

export async function runImportQueue<R>(
  files: string[],
  importOne: (file: string) => Promise<R>,
  onProgress?: (done: number, total: number, file: string) => void,
): Promise<QueueResult<R>> {
  const results: QueueFileResult<R>[] = [];
  let succeeded = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const report = await importOne(file);
      results.push({ file, report, error: null });
      succeeded++;
    } catch (err) {
      results.push({ file, report: null, error: (err as Error).message });
      failed++;
    }
    onProgress?.(i + 1, files.length, file);
  }
  return { results, succeeded, failed };
}
```

- [x] **Step 4: Run it and watch it pass** — 5 tests.

- [x] **Step 5: Commit**

```bash
git -C <wt> add src/renderer/components/import/import-queue.ts tests/unit/import-queue.test.ts
git -C <wt> commit -m "feat(import): sequential multi-file import queue"
```

---

### Task 6 (Tier 1): Wire the queue into the GEDCOM section

**Files:**
- Modify: `src/renderer/components/import/GedcomImportSection.vue`, `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`
- Test: `tests/components/GedcomImportSection-flow.test.ts`

i18n keys go under the `importExport` namespace beside `importReportSkipped` (`en.ts:1602`), addressed as `$t('importExport.…')`. Report markup uses `<p class="report-section-label">`, matching `GedcomImportSection.vue:78`.

- [x] **Step 1: Write the failing test** — picking two files calls the importer twice and renders one combined report naming both files; a failure on the first still imports the second and shows its error.
- [x] **Step 2: Run it and watch it fail.**
- [x] **Step 3: Implement** — swap `selectFile` for `selectFiles`, feed the array to `runImportQueue`, render the combined report. Keep the single-file path working: one selected file must behave exactly as before, which the existing flow tests already assert.
- [x] **Step 4: Run `tests/components/` and watch it pass.**
- [x] **Step 5: Commit.**

---

### Task 7 (Tier 1): Wire the other five importers

**Files:** the Genney, Holger, RootsMagic, Gramps and Archive sections under `src/renderer/components/import/`.

- [x] **Step 1: Wire Genney**, run its component test, commit.
- [x] **Step 2: Wire Holger**, run, commit.
- [x] **Step 3: Wire RootsMagic**, run, commit.
- [x] **Step 4: Wire Gramps**, run, commit.
- [x] **Step 5: Wire Archive**, run, commit.

One commit each so a regression is attributable to one importer. Each reuses Task 5's queue unchanged — if a section needs the queue to change shape, stop and say so rather than forking it.

---

### Task 8 (Tier 1): The consolidation step

**Files:**
- Create: `src/renderer/components/import/ConsolidationStep.vue`
- Modify: `GedcomImportSection.vue`, `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`
- Test: `tests/components/consolidation-step.test.ts`

**Interfaces:** props `{ clusters: DuplicateCluster[] }`; emits `approve(cluster)`, `decline(cluster)`, `approveAllExact()`, `close()`.

- [x] **Step 1: Add the i18n keys**

`en.ts`, under `importExport`:
```ts
consolidateTitle: 'Things that arrived more than once',
consolidateApproveAllExact: 'Join all {count} exact matches',
consolidateMembers: '{count} records',
consolidateNothing: 'Nothing arrived twice.',
```
`sv.ts`:
```ts
consolidateTitle: 'Sådant som kom in flera gånger',
consolidateApproveAllExact: 'Slå ihop alla {count} säkra träffar',
consolidateMembers: '{count} poster',
consolidateNothing: 'Inget kom in dubbelt.',
```

- [x] **Step 2: Write the failing test**

```ts
// tests/components/consolidation-step.test.ts
// One row per cluster showing its member count; exact clusters ticked by
// default and fuzzy ones not; "approve all exact" is ONE control; declining
// removes the row; an empty list renders the nothing-arrived-twice message and
// no controls.
```

Write the assertions out in full against the component's rendered text, following the mount + `$t` stub shape already used in `tests/components/GedcomImportSection-flow.test.ts`.

- [x] **Step 3: Run it and watch it fail.**
- [x] **Step 4: Implement the component.**
- [x] **Step 5: Run it and watch it pass.**
- [x] **Step 6: Commit.**

---

### Task 9 (Tier 1): Verify against the four real files

**Files:** none created — measurement against gitignored local data.

- [x] **Step 1: Import all four in one queue run.** Assert 822 persons, 2776 sources.
- [x] **Step 2: Assert the exact clusters number 1496.**
- [x] **Step 3: Approve all of them**, assert 1496 sources remain and zero citations are orphaned.
- [x] **Step 4: Assert the five join people appear** in the fuzzy person clusters, by name: Lena Kristina, Susanna Maria, Ronny Ingemar, Gustaf Hilding, Maj Gulli/Gurli.
- [x] **Step 5: Undo one approved cluster**, assert its sources return.
- [x] **Step 6: Drive the consolidation step in the running app** via dev MCP. `ui_screenshot` returned correctly-sized but unpainted images in two prior sessions; if that recurs use `ui_eval` for the DOM and **say which was used**. Switch to a scratch database first and restore the original afterwards.
- [x] **Step 7: Record every number for the close-out commit.**

---

### Task 10 (Tier 1): e2e coverage

**Files:** `tests/e2e/imports.spec.ts`, `tests/e2e/fixtures/imports/`.

Per `.claude/rules/tests.md`: a new importer case is a fixture plus an entry in the `CASES` array — follow that shape rather than adding a spec file.

- [x] **Step 1: Add two small synthetic GEDCOM fixtures** that share one source `_AID`, so exactly one exact cluster is produced.
- [x] **Step 2: Write the failing e2e** — select both, import, approve all exact, assert the merged source count and that the step closes.
- [x] **Step 3: Run `npm run test:e2e:full`** and watch the new case fail.
- [x] **Step 4: Fix whatever it names.**
- [x] **Step 5: Run the full tier, capture per-project counts.**
- [x] **Step 6: Commit.**

---

### Task 11 (Tier 1): Close out

- [x] **T-final (Tier 1)** — Invoke `/close-out`. The skill walks the 6+1 steps, refuses partial, captures evidence.

**On the design spec:** this plan delivers Parts 4-5 of
[2026-08-23-arkivdigital-import-design.md](2026-08-23-arkivdigital-import-design.md), whose
Parts 1-3 shipped in v0.273.0. When this plan archives, that spec is fully delivered and
archives with it. Confirm Parts 1-5 are all accounted for before moving it, per the
design-spec lifecycle rule in `.claude/rules/plans.md`.

---

## Self-review checklist

- [x] Every task has a tier tag.
- [x] No self-referential tasks.
- [x] Every task ends in a commit or a recorded measurement.
- [x] No file from `export-import/` committed.
- [x] No change to `normalize.ts`, no `unmapped_data` table.
- [x] Exact clustering is one indexed query — asserted by a query-count test, not assumed.
- [x] Approving a cluster is one undo step — asserted, because 128 undos is not a way back.
- [x] Nothing merges without an explicit approval.
- [x] Single-file import behaves exactly as before.
- [x] `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e:full` green with output captured. **`npm run test:e2e:full` → 178 passed (2.7 m) across all 8 projects — panels 145, reactivity 14, imports 11, boot 4, website-export 1, repositories 1, duplicates 1, crud 1; 0 failed, 0 flaky.**
- [x] `npm run typecheck` shows no NEW errors against the branch-point baseline, and none in a touched file.

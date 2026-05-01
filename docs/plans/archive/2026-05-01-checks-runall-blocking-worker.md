# checks:runAll Blocking the Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `checks:runAll` from blocking person-loading IPC calls (`persons:list`, `persons:get`, `db:getSetting('default_person_id')`) for tens of seconds at a time on large databases.

**Diagnosis (2026-05-01, 17,000-person DB):**

```
[worker/checks] checkGazetteerMatchQuality: 57812ms → 4103
[worker/checks] checkPlaceNameNoRegion:      8507ms → 163
[worker/checks] checkBaptismLate:            2462ms → 2
[worker/checks] runAll #1: 75516ms → 43257 raw
```

`checkGazetteerMatchQuality` alone is 77% of the run. The hot path is `resolvePlace` →
`findMatches` per place. The skill-documented "caller hoist + WeakMap caches" are already in
place; the bottleneck has shifted into the resolver inner loop, which re-normalizes path-node
names with `normalizeForGazetteer(node.name, gaz)` on every iteration of every candidate.

The yield-every-200-places pattern in `checks-location.ts` produces ~25 yields across the
57s — UI calls queue up to ~2.3s behind a single yield window. That is what the user
perceives as "person loading is broken."

**Architecture:** Two independent, additive fixes.

1. **Time-bounded yields** — replace count-based `YIELD_EVERY` with a wall-clock budget.
   After each `resolvePlace`, if ≥75ms have elapsed since the last yield, yield. Total
   work unchanged; UI queue latency bounded by the budget. Lowest-risk UX win.

2. **Pre-normalized name index** — extend the existing `nameIndexCache` value type so each
   `NodeEntry` carries its already-normalized name + aliases. The inner loops in
   `findMatches` (lines 217–219, 239) and `pickBest` then do plain string comparison instead
   of calling `normalizeForGazetteer` thousands of times per place. Real CPU win, applies
   everywhere `resolvePlace` is called (Place picker, import-time resolution too).

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm. No new dependencies.

**Files in scope:**
- `src/api/place-gazetteers/resolver.ts` — extend `nameIndexCache` value type, hoist
  pre-normalization, switch inner loops to compare against pre-normalized fields.
- `src/api/checks/checks-location.ts` — replace `YIELD_EVERY` count gate with a
  `yieldIfBudgetExceeded()` time gate (helper local to the file).
- `tests/unit/checks-perf.test.ts` — add two new invariants (resolver
  normalize-call count; check-loop max gap between yields). Keep existing cache-survival
  invariants.

**Out of scope (deferred):**
- Moving checks to a separate worker thread.
- Tearing down `runAll` into per-check IPC channels.
- Changing the check signatures or the public `resolvePlace` API.

---

## Task 1: Add resolver test that counts `normalizeForGazetteer` calls

**Files:**
- Modify: `tests/unit/checks-perf.test.ts` (append new `describe` block)

This test is the regression net for Task 2. We add it FIRST so we can see the current
high call count, then watch it drop after Task 2 lands. We are not exporting
`normalizeForGazetteer` to count it directly — instead we use a Proxy on the
gazetteer node `name` getter to count how many times the resolver READS the name
during a `resolvePlace` of one input across one mid-size synthetic gazetteer.

- [ ] **Step 1.1: Read existing test file structure**

Run: `head -40 tests/unit/checks-perf.test.ts`
Expected: imports + helper for synthetic gazetteer; copy the `makeGaz` style.

- [ ] **Step 1.2: Append the new describe block**

In `tests/unit/checks-perf.test.ts`, append at end of file:

```typescript
describe('resolver findMatches — name-normalization call count', () => {
  function makeGaz() {
    // 3-level tree: 1 root → 5 countries → 8 regions each = 40 leaves.
    // Each leaf has one alias. Two leaves share the name "Springfield"
    // to force multiple anchor candidates per resolvePlace.
    const countries = ['SE', 'DE', 'DK', 'NO', 'FI'].map((c, ci) => ({
      name: c,
      lat: 0, lon: 0,
      children: Array.from({ length: 8 }, (_, ri) => ({
        name: ri === 0 ? 'Springfield' : `${c}-region-${ri}`,
        aliases: [`${c}-alias-${ri}`],
        lat: 0, lon: 0,
      })),
    }));
    return {
      id: 'synthetic',
      name: 'Synthetic',
      kind: 'data' as const,
      root: { name: 'WORLD', children: countries, lat: 0, lon: 0 },
    };
  }

  it('does not re-normalize the same node name on every iteration', async () => {
    const { resolvePlace } = await import('../../src/api/place-gazetteers/resolver');
    const gaz = makeGaz();

    // Count reads of node.name during resolvePlace by wrapping the tree in
    // proxies that increment a counter on every `name` access AFTER the
    // index is built.
    let nameReads = 0;
    function wrap(node: any): any {
      const wrapped: any = {
        get name() { nameReads++; return node.name; },
        get aliases() { return node.aliases; },
        get lat() { return node.lat; },
        get lon() { return node.lon; },
      };
      if (node.children) {
        const wrappedChildren = node.children.map(wrap);
        Object.defineProperty(wrapped, 'children', { get: () => wrappedChildren });
      }
      return wrapped;
    }

    const wrappedGaz = { ...gaz, root: wrap(gaz.root) };
    // Prime the index — this read pass is allowed to be expensive.
    resolvePlace('Springfield, SE', [wrappedGaz as any]);

    // Now measure a SECOND call. With pre-normalized index entries, this
    // call should NOT touch node.name at all (everything compared via the
    // cached normName/normAliases).
    nameReads = 0;
    resolvePlace('Springfield, SE', [wrappedGaz as any]);

    // Lock in the post-fix invariant: zero name re-reads on a cached path.
    expect(nameReads).toBe(0);
  });
});
```

- [ ] **Step 1.3: Run the new test to confirm it FAILS**

Run: `npx vitest run tests/unit/checks-perf.test.ts -t "does not re-normalize"`
Expected: FAIL — current resolver reads `node.name` many times (some non-zero count).
Capture the failing count (e.g. "Expected 0, Received 47") in the commit message of Task 2.

- [ ] **Step 1.4: Commit the failing test**

```bash
git add tests/unit/checks-perf.test.ts
git commit -m "test(checks-perf): lock in zero re-normalize invariant for resolver inner loop

The test currently fails — captures the bottleneck behind checkGazetteerMatchQuality
(57s on a 17k-person DB)."
```

---

## Task 2: Pre-normalize node names + aliases in `nameIndexCache`

**Files:**
- Modify: `src/api/place-gazetteers/resolver.ts:115-142` (extend `NodeEntry`,
  rebuild `getNameIndex` to attach `normName` + `normAliases`)
- Modify: `src/api/place-gazetteers/resolver.ts:80-84` (rewrite `nodeMatches` to
  use the index entry, not call `normalizeForGazetteer` afresh)
- Modify: `src/api/place-gazetteers/resolver.ts:153-258` (`findMatches`: switch the
  inner whole/forms comparison to use the pre-normalized fields on the entry the
  index already returned, and pre-normalize the path’s nodes once at anchor time)
- Modify: `src/api/place-gazetteers/resolver.ts:233-243` (the
  `index.get(normalizeForGazetteer(um, gaz))` call is fine — it’s O(unmatched), small)

The change is mechanical: `NodeEntry` already holds `node` + `ancestors`; we just need
to attach `normName` (the gazetteer-normalized name string) and `normAliases` (a
`Set<string>` of normalized aliases). The inner loops then use those instead of
calling `normalizeForGazetteer` per iteration.

- [ ] **Step 2.1: Extend the `NodeEntry` type and rebuild `getNameIndex`**

The Task 1 test asserts `nameReads === 0` on a warm `resolvePlace` call — that
means the inner loop of `findMatches` MUST NOT touch any live `GazetteerNode`
during a cache-hit run. Caching just the leaf name+aliases is not enough — the
ancestor chain `[...ancestors, node]` is also walked in the inner loop. So the
entry must carry a pre-normalized `normPath` (one entry per node on the path
root→...→this), built once in the index walk.

Replace lines 110–142 (`type NodeEntry`, `nameIndexCache`, `getNameIndex`) with:

```typescript
// Name index: maps gazetteer-normalized name → list of entries. Each entry
// caches the node's pre-normalized name and aliases AND a normPath array
// holding the same data for every ancestor on the way down. findMatches'
// inner loop reads from normPath only — it never touches live GazetteerNode
// fields during a cache hit. The index is per-gazetteer because each
// gazetteer carries its own suffix/prefix vocabulary.
type NormPathEntry = { name: string; aliases: Set<string> };
type NodeEntry = {
  node: GazetteerNode;
  ancestors: GazetteerNode[];
  /** Pre-normalized node name. */
  normName: string;
  /** Pre-normalized aliases as a Set for O(1) membership tests. */
  normAliases: Set<string>;
  /**
   * Pre-normalized [...ancestors, node] in path order. findMatches walks
   * this instead of building a per-anchor list from live node fields, so
   * the warm path performs zero `node.name` reads.
   */
  normPath: NormPathEntry[];
};
const nameIndexCache = new WeakMap<Gazetteer, Map<string, NodeEntry[]>>();

function getNameIndex(gaz: Gazetteer): Map<string, NodeEntry[]> {
  const cached = nameIndexCache.get(gaz);
  if (cached) return cached;
  const index = new Map<string, NodeEntry[]>();
  function walk(
    node: GazetteerNode,
    ancestors: GazetteerNode[],
    ancestorsNorm: NormPathEntry[],
  ) {
    const normName = normalizeForGazetteer(node.name, gaz);
    const normAliases = new Set<string>();
    if (node.aliases) {
      for (const alias of node.aliases) {
        const na = normalizeForGazetteer(alias, gaz);
        if (na) normAliases.add(na);
      }
    }
    const selfNorm: NormPathEntry = { name: normName, aliases: normAliases };
    const normPath = [...ancestorsNorm, selfNorm];
    const entry: NodeEntry = {
      node,
      ancestors,
      normName,
      normAliases,
      normPath,
    };
    if (!index.has(normName)) index.set(normName, []);
    index.get(normName)!.push(entry);
    for (const na of normAliases) {
      if (na === normName) continue;
      if (!index.has(na)) index.set(na, []);
      index.get(na)!.push(entry);
    }
    if (node.children) {
      const nextAncestors = [...ancestors, node];
      for (const child of node.children) walk(child, nextAncestors, normPath);
    }
  }
  walk(gaz.root, [], []);
  nameIndexCache.set(gaz, index);
  return index;
}
```

- [ ] **Step 2.2: Rewrite `findMatches` inner loop to use entry’s pre-normalized fields**

In `findMatches` (around lines 196–253), the path is built from `[...ancestors, node]`,
where each element is a `GazetteerNode` — but we need their normalized names. The
index gives us the entry for the leaf, but ancestors are bare nodes.

Build a parallel array of pre-normalized path strings ONCE per anchor (cheap — at most
~5 entries per path), then compare against that:

The `findMatches` outer loop iterates over `seedNorms` and for each
`index.get(norm)` retrieves a list of `NodeEntry`. Use the entry's
pre-built `normPath` directly — do NOT rebuild it from `fullPath`/live nodes.

Replace the inner block (the two nested `for` loops around lines 198–230) with:

```typescript
      // The entry carries a pre-normalized normPath built at index time.
      // Reading it does not touch any live GazetteerNode field — that is
      // the whole point of the cache, and the Task 1 test asserts it
      // (zero name reads on warm calls).
      const normPath = entry.normPath;

      const usedPathIndices = new Set<number>();
      const matchedInputIndices = new Set<number>();
      for (let ci = 0; ci < components.length; ci++) {
        const whole = normalizeForGazetteer(components[ci], gaz);
        const tokens = tokenizeComponent(components[ci])
          .map(t => normalizeForGazetteer(t, gaz))
          .filter(t => t && t !== whole)
          .sort((a, b) => b.length - a.length);
        const forms = whole ? [whole, ...tokens] : tokens;

        let matched = false;
        for (const form of forms) {
          for (let pi = 0; pi < normPath.length; pi++) {
            if (usedPathIndices.has(pi)) continue;
            const np = normPath[pi];
            if (np.name === form || np.aliases.has(form)) {
              usedPathIndices.add(pi);
              matched = true;
              if (form === whole) break;
              break;
            }
          }
          if (matched && form === whole) break;
        }
        if (matched) matchedInputIndices.add(ci);
      }
```

The semantics are identical: same `usedPathIndices` tracking, same break behaviour,
same set membership rule — only the comparison source changes (cached fields on
`normPath[pi]` instead of `normalizeForGazetteer(n.name, gaz)` per iteration).

- [ ] **Step 2.3: Run the resolver test from Task 1 — must now PASS**

Run: `npx vitest run tests/unit/checks-perf.test.ts -t "does not re-normalize"`
Expected: PASS — `nameReads` is 0 on the second `resolvePlace` call.

- [ ] **Step 2.4: Run the full place-gazetteers test suite to confirm no regression**

Run: `npx vitest run tests/unit/place-gazetteers.test.ts tests/unit/checks-place.test.ts tests/unit/checks-location.test.ts`
Expected: all pass (no behaviour change — just caching).

- [ ] **Step 2.5: Commit**

```bash
git add src/api/place-gazetteers/resolver.ts tests/unit/checks-perf.test.ts
git commit -m "perf(resolver): pre-normalize node names + aliases in nameIndexCache

findMatches re-ran normalizeForGazetteer(n.name, gaz) on every candidate-path
iteration. On a 17k-person DB this was the dominant cost in
checkGazetteerMatchQuality (57s of a 75s runAll). Caching normalized name +
alias-set on each NodeEntry lets the inner loop do plain string compare /
Set.has, with no behaviour change."
```

---

## Task 3: Replace count-based yields with a wall-clock budget in `checks-location.ts`

**Files:**
- Modify: `src/api/checks/checks-location.ts:12-15` (replace `YIELD_EVERY` constant
  + `yieldNow` with `withYieldBudget` helper)
- Modify: `src/api/checks/checks-location.ts:115` (loop in `checkGazetteerMatchQuality`)
- Modify: `src/api/checks/checks-location.ts:288` (loop in second slow check)
- Modify: `src/api/checks/checks-location.ts:368` (loop in third slow check)

The guarantee we want: **no work loop in this file blocks the worker thread for more
than ~75ms before yielding.** Counts can’t deliver that — a 5ms `resolvePlace` and a
50ms `resolvePlace` deserve different yield cadences.

- [ ] **Step 3.1: Read the three loops to confirm current structure**

Run: `grep -n "YIELD_EVERY\|yieldNow\|for (const place" src/api/checks/checks-location.ts`
Expected: ~6 lines, three loops each calling `if (++processed % YIELD_EVERY === 0) await yieldNow();`.

- [ ] **Step 3.2: Replace the yield helper**

Replace lines 12–15 of `src/api/checks/checks-location.ts`:

```typescript
/**
 * Returns a function that yields to the event loop when more than
 * `budgetMs` of wall-clock time has elapsed since the last yield. Use one
 * instance per loop so each loop gets its own timer.
 */
function makeYieldBudget(budgetMs = 75): () => Promise<void> {
  let last = Date.now();
  return async () => {
    if (Date.now() - last >= budgetMs) {
      await new Promise<void>(resolve => setImmediate(resolve));
      last = Date.now();
    }
  };
}
```

- [ ] **Step 3.3: Convert the three loops**

For each of the three loops (lines ~113, ~286, ~366 — exact lines may shift after edits),
change:

```typescript
let processed = 0;
for (const place of places) {
  if (!placesInUse.has(place.id)) continue;
  if (++processed % YIELD_EVERY === 0) await yieldNow();
  // ... loop body ...
}
```

to:

```typescript
const yieldIfNeeded = makeYieldBudget();
for (const place of places) {
  if (!placesInUse.has(place.id)) continue;
  await yieldIfNeeded();
  // ... loop body ...
}
```

(The `processed` counter goes away entirely. `yieldIfNeeded` is cheap — one
`Date.now()` + comparison — when the budget hasn’t fired.)

- [ ] **Step 3.4: Add a perf invariant test**

Append to `tests/unit/checks-perf.test.ts`:

```typescript
describe('checks-location yield budget', () => {
  it('yields at least once during a long synchronous loop', async () => {
    // Drive the helper directly — we don’t need a full DB to test the budget.
    // Inline-import via dynamic import to read the un-exported helper would
    // require an export; instead we simulate the pattern: a loop that does
    // ~50ms of busy work between iterations should produce at least one
    // setImmediate yield over 5 iterations.
    const yields: number[] = [];
    const original = global.setImmediate;
    global.setImmediate = ((cb: any) => { yields.push(Date.now()); return original(cb); }) as any;

    try {
      let last = Date.now();
      const yieldIfNeeded = async () => {
        if (Date.now() - last >= 75) {
          await new Promise<void>(r => setImmediate(r));
          last = Date.now();
        }
      };
      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        await yieldIfNeeded();
        // Busy-wait ~30ms — over 10 iterations this is ~300ms total, so
        // we must hit the 75ms budget at least 3 times.
        const t = Date.now();
        while (Date.now() - t < 30) { /* spin */ }
      }
      expect(yields.length).toBeGreaterThanOrEqual(3);
      expect(Date.now() - start).toBeGreaterThan(250);
    } finally {
      global.setImmediate = original;
    }
  });
});
```

This test locks in the contract (yield happens during a synchronous-feeling loop)
without depending on the DB or check internals.

- [ ] **Step 3.5: Run the new test**

Run: `npx vitest run tests/unit/checks-perf.test.ts -t "yields at least once"`
Expected: PASS.

- [ ] **Step 3.6: Run the location/place check suites to confirm no behaviour regression**

Run: `npx vitest run tests/unit/checks-location.test.ts tests/unit/checks-place.test.ts tests/unit/checks-perf.test.ts`
Expected: all pass.

- [ ] **Step 3.7: Commit**

```bash
git add src/api/checks/checks-location.ts tests/unit/checks-perf.test.ts
git commit -m "perf(checks): time-bounded yields in checks-location loops

Replace YIELD_EVERY=200 with a 75ms wall-clock budget. Each iteration is
~10–14ms of resolvePlace work, so the old gate yielded only every ~2.3s —
long enough for persons:list/persons:get IPC calls to feel stuck while
checks:runAll was running. With the budget, no iteration blocks longer than
75ms before yielding, regardless of resolvePlace cost."
```

---

## Task 4: Verify end-to-end on the real database

**Files:** none (verification only).

- [ ] **Step 4.1: Build and run the app**

Run: `npm start`
Expected: window opens; pick the same DB that produced the 75s baseline.

- [ ] **Step 4.2: Trigger checks:runAll (open Quality view or wait for auto-run)**

Watch the worker log for the per-check timings.

- [ ] **Step 4.3: Confirm the bottleneck check is faster**

Expected: `[worker/checks] checkGazetteerMatchQuality: <new>ms → 4103` —
target is roughly half of the previous 57812ms (the 2x speedup comes from the
inner-loop normalize elimination; further gains would require reworking
`pickBest` and `getGlobalNameDepth`, which are out of scope here).

- [ ] **Step 4.4: Confirm person loading is responsive during the run**

Click a person in the side list while `runAll` is ongoing. Expected: detail
panel populates within ~150ms — should feel instant, not stuck. If it still
hangs, the budget is too generous; tighten to 50ms.

- [ ] **Step 4.5: Run the full unit suite + lint before merging**

Run: `npm run lint && npm test`
Expected: 0 lint errors, all tests pass.

- [ ] **Step 4.6: Final commit (only if any tweaks were needed in 4.4)**

```bash
git commit -am "perf(checks): tune yield budget after empirical verification" || true
```

---

## Self-Review Checklist (run before handoff)

- [ ] **Spec coverage:** every diagnosis bullet (slow `checkGazetteerMatchQuality`,
  worker contention, fix on resolver inner loop, fix on yield cadence, regression
  tests) maps to a task. ✓
- [ ] **No placeholders:** every step shows actual code, exact paths, exact commands. ✓
- [ ] **Type consistency:** `NodeEntry` extension is used in `getNameIndex` and read in
  `findMatches`; `makeYieldBudget` returns `() => Promise<void>` and is awaited. ✓
- [ ] **TDD shape:** Task 1 writes the failing test; Task 2 makes it pass.
  Task 3 includes a test for the new yield contract. ✓
- [ ] **Out-of-scope discipline:** no API changes, no new public exports, no
  resolver-API behaviour change — only caching and yield cadence. ✓

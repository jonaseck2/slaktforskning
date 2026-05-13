# Chart-Layout Property-Based Test Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Replace golden-snapshot assertions in `tests/unit/chartLayout.test.ts` (1,663 LOC) with property-based assertions. Keep 3–5 narrow goldens as documented examples. Result: a chart-layout commit no longer cascades into 50+ snapshot updates.

**Architecture:** Property assertions live in `tests/unit/chart-layout/properties.ts`; test file(s) call them against fixtures. Each assertion fails-fast with a named message ("Box X at (100,200) overlaps Box Y at (110,205)"). Order of execution: write assertions alongside goldens → verify equivalence on existing fixtures → deliberately break the layout three ways and confirm assertions catch them → delete supplanted goldens.

**Tech Stack:** Vitest, TypeScript.

**Design doc:** [2026-05-14-chart-layout-property-tests-design.md](2026-05-14-chart-layout-property-tests-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `tests/unit/chart-layout/properties.ts` | **New.** Exports the 7 named property-assertion functions. |
| `tests/unit/chart-layout/regression-fixtures.ts` | **New.** Three fixtures with deliberately-broken layouts (overlap, parent-direction reversed, generation-alignment broken). Used to verify property assertions catch real regressions. |
| `tests/unit/chartLayout.test.ts` | **Rewritten** to use property assertions. Either shrunk in place (< 800 LOC) or split by chart type. |
| `tests/unit/chart-layout/pedigree.test.ts`, `hourglass.test.ts`, `descendant.test.ts` | **(Alternative to in-place shrink.)** Per-chart-type test files, each < 500 LOC, calling property assertions on fixtures. |
| `tests/__snapshots__/chartLayout.test.ts.snap` (and similar) | **Trimmed.** Most snapshots deleted; 3–5 documented examples remain. |
| `CHANGELOG.md` | `## Unreleased` entry. |

---

## Task 1: Catalogue current snapshots

**Files:**
- Read-only inventory. No commits this task.

- [ ] **Step 1: List every snapshot assertion in `chartLayout.test.ts`**

```bash
grep -nE 'toMatchSnapshot|toMatchInlineSnapshot|expect.*layout.*toEqual' tests/unit/chartLayout.test.ts | head -50
```

Note: the file is 1,663 LOC, likely ~50 snapshot assertions.

- [ ] **Step 2: Categorize each snapshot by what it protects**

Open the test file. For each snapshot assertion, write down which category it belongs to:

| Category | Counts |
|----------|--------|
| Position correctness (exact coordinates) | TBD |
| Generation alignment (column or row consistency) | TBD |
| Collision avoidance (no overlaps) | TBD |
| Outline placeholder placement | TBD |
| Couple-spacing (spouse adjacency) | TBD |
| Connector / line routing | TBD |
| Total bounding extent | TBD |

Save this table to a scratch note — it informs which property assertions are needed.

---

## Task 2: Build the property-assertion library

**Files:**
- Create: `tests/unit/chart-layout/properties.ts`

- [ ] **Step 1: Create the directory + file**

```bash
mkdir -p tests/unit/chart-layout
```

- [ ] **Step 2: Write the 7 assertion functions**

Start with this skeleton, fleshing out the bodies based on the layout's data shape (consult `src/renderer/utils/chart-layout/types.ts` for `Layout`, `Box`, `Line` types):

```typescript
// tests/unit/chart-layout/properties.ts

import type { Layout } from '../../../src/renderer/utils/chart-layout/types';

export type ChartType = 'pedigree' | 'hourglass' | 'descendant';

export function assertNoOverlaps(layout: Layout): void {
  for (let i = 0; i < layout.boxes.length; i++) {
    for (let j = i + 1; j < layout.boxes.length; j++) {
      const a = layout.boxes[i];
      const b = layout.boxes[j];
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlapX && overlapY) {
        throw new Error(
          `Box ${a.id} at (${a.x}, ${a.y}, ${a.w}×${a.h}) overlaps Box ${b.id} at (${b.x}, ${b.y}, ${b.w}×${b.h})`,
        );
      }
    }
  }
}

export function assertParentDirection(layout: Layout, chartType: ChartType): void {
  // pedigree: parents have higher x than children
  // hourglass: ancestors have lower y than descendants
  // descendant: parents have lower y than children
  for (const line of layout.lines) {
    const parent = layout.boxes.find((b) => b.id === line.from);
    const child = layout.boxes.find((b) => b.id === line.to);
    if (!parent || !child) continue;
    switch (chartType) {
      case 'pedigree':
        if (parent.x <= child.x) {
          throw new Error(
            `Pedigree: parent ${parent.id} (x=${parent.x}) should be right of child ${child.id} (x=${child.x})`,
          );
        }
        break;
      case 'hourglass':
        if (parent.y >= child.y) {
          throw new Error(
            `Hourglass: ancestor ${parent.id} (y=${parent.y}) should be above descendant ${child.id} (y=${child.y})`,
          );
        }
        break;
      case 'descendant':
        if (parent.y >= child.y) {
          throw new Error(
            `Descendant: parent ${parent.id} (y=${parent.y}) should be above child ${child.id} (y=${child.y})`,
          );
        }
        break;
    }
  }
}

export function assertGenerationAlignment(layout: Layout, chartType: ChartType, tolerance = 2): void {
  // Group boxes by generation (assume `generation` field on box, or derive from connectivity).
  // For each generation group, all boxes should share the chart-type-appropriate axis within tolerance.
  const byGen = new Map<number, typeof layout.boxes>();
  for (const b of layout.boxes) {
    const gen = (b as { generation?: number }).generation;
    if (gen === undefined) continue;
    if (!byGen.has(gen)) byGen.set(gen, []);
    byGen.get(gen)!.push(b);
  }
  for (const [gen, group] of byGen) {
    if (group.length < 2) continue;
    const axisValues = chartType === 'pedigree'
      ? group.map((b) => b.x)
      : group.map((b) => b.y);
    const min = Math.min(...axisValues);
    const max = Math.max(...axisValues);
    if (max - min > tolerance) {
      throw new Error(
        `Generation ${gen} (${chartType}): boxes span ${min}..${max} on the alignment axis (tolerance ${tolerance}). Boxes: ${group.map((b) => b.id).join(', ')}`,
      );
    }
  }
}

export function assertOutlineAdjacency(layout: Layout, anchorId: string): void {
  const anchor = layout.boxes.find((b) => b.id === anchorId);
  if (!anchor) throw new Error(`Anchor ${anchorId} not in layout`);
  const placeholders = layout.placeholders ?? [];
  for (const ph of placeholders) {
    const dx = Math.abs(ph.x - anchor.x);
    const dy = Math.abs(ph.y - anchor.y);
    const maxDist = Math.max(anchor.w, anchor.h) * 2;  // within 2× box dimension
    if (dx > maxDist && dy > maxDist) {
      throw new Error(
        `Outline placeholder ${ph.id} at (${ph.x}, ${ph.y}) too far from anchor ${anchorId} at (${anchor.x}, ${anchor.y})`,
      );
    }
  }
}

export function assertCoupleSpacing(layout: Layout, personId: string, spouseId: string, maxGap = 60): void {
  const a = layout.boxes.find((b) => b.id === personId);
  const b = layout.boxes.find((bx) => bx.id === spouseId);
  if (!a || !b) return;
  const gap = Math.abs(a.x - b.x);
  if (gap > a.w + maxGap) {
    throw new Error(
      `Couple ${personId}/${spouseId}: gap=${gap}px exceeds box-width ${a.w} + max-gap ${maxGap}`,
    );
  }
}

export function assertConnectivity(layout: Layout): void {
  const connected = new Set<string>();
  for (const line of layout.lines) {
    connected.add(line.from);
    connected.add(line.to);
  }
  for (const box of layout.boxes) {
    if (layout.boxes.length > 1 && !connected.has(box.id)) {
      throw new Error(`Box ${box.id} has no connecting lines (orphan)`);
    }
  }
}

export function assertStableExtent(
  layout: Layout,
  expected: { width: number; height: number },
  tolerancePct = 5,
): void {
  const actual = {
    width: Math.max(...layout.boxes.map((b) => b.x + b.w)),
    height: Math.max(...layout.boxes.map((b) => b.y + b.h)),
  };
  const widthDelta = Math.abs(actual.width - expected.width) / expected.width * 100;
  const heightDelta = Math.abs(actual.height - expected.height) / expected.height * 100;
  if (widthDelta > tolerancePct || heightDelta > tolerancePct) {
    throw new Error(
      `Extent drift: expected ${expected.width}×${expected.height}, got ${actual.width}×${actual.height} (${widthDelta.toFixed(1)}% / ${heightDelta.toFixed(1)}%)`,
    );
  }
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
npx tsc --noEmit 2>&1 | grep 'chart-layout/properties' | head -5
```

Expected: 0 errors (adjust the Box/Line/Layout type imports if they don't match).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/chart-layout/properties.ts
git commit -m "test(chart-layout): property assertion library

Seven invariant assertions: no overlaps, parent direction, generation
alignment, outline adjacency, couple spacing, connectivity, stable
extent. Each fails fast with a named message naming the specific boxes
involved. Used by Tasks 3-4 to replace golden snapshots."
```

---

## Task 3: Verify equivalence on existing fixtures

**Files:**
- Modify (additively): `tests/unit/chartLayout.test.ts`

- [ ] **Step 1: Add a new `describe` block at the bottom of `chartLayout.test.ts`**

For each existing snapshot test, add a parallel call to the property assertions:

```typescript
describe('Property assertions on existing fixtures', () => {
  it('basic 3-generation hourglass: passes property suite', () => {
    const layout = computeHourglassLayout(basicHourglassFixture);
    assertNoOverlaps(layout);
    assertParentDirection(layout, 'hourglass');
    assertGenerationAlignment(layout, 'hourglass');
    assertConnectivity(layout);
  });
  // ... one per fixture
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/unit/chartLayout.test.ts 2>&1 | tail -10
```

Expected: all tests pass — the existing fixtures satisfy the properties. If any fail, it means either (a) the property assertion is too strict, or (b) the fixture has a real bug. Investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/chartLayout.test.ts
git commit -m "test(chart-layout): run property assertions alongside existing goldens

Existing fixtures verified to satisfy the 7 invariants. The
side-by-side run proves the property suite covers what the
goldens were protecting; Task 4 deletes the goldens."
```

---

## Task 4: Regression fixtures — verify-by-deliberate-breakage

**Files:**
- Create: `tests/unit/chart-layout/regression-fixtures.ts`

- [ ] **Step 1: Build three deliberately-broken fixtures**

```typescript
// tests/unit/chart-layout/regression-fixtures.ts

import type { Layout } from '../../../src/renderer/utils/chart-layout/types';

export const overlapFixture: Layout = {
  boxes: [
    { id: 'A', x: 100, y: 100, w: 80, h: 40, generation: 0 },
    { id: 'B', x: 110, y: 110, w: 80, h: 40, generation: 0 },
  ],
  lines: [],
  placeholders: [],
};

export const parentDirectionReversedFixture: Layout = {
  boxes: [
    { id: 'parent', x: 100, y: 100, w: 80, h: 40, generation: 0 },
    { id: 'child',  x: 100, y: 200, w: 80, h: 40, generation: 1 },  // child below parent in pedigree mode = WRONG
  ],
  lines: [{ from: 'parent', to: 'child' }],
  placeholders: [],
};

export const alignmentBrokenFixture: Layout = {
  boxes: [
    { id: 'A', x: 100, y: 100, w: 80, h: 40, generation: 0 },
    { id: 'B', x: 100, y: 150, w: 80, h: 40, generation: 0 },  // same generation, different y — broken
  ],
  lines: [],
  placeholders: [],
};
```

- [ ] **Step 2: Write assertions that these fixtures fail the property suite**

In `tests/unit/chartLayout.test.ts`, add:

```typescript
import { overlapFixture, parentDirectionReversedFixture, alignmentBrokenFixture } from './chart-layout/regression-fixtures';

describe('Property assertions catch regressions', () => {
  it('detects overlap', () => {
    expect(() => assertNoOverlaps(overlapFixture)).toThrow(/overlaps Box B/);
  });

  it('detects reversed parent direction (pedigree)', () => {
    expect(() => assertParentDirection(parentDirectionReversedFixture, 'pedigree'))
      .toThrow(/should be right of child/);
  });

  it('detects generation alignment break (hourglass)', () => {
    expect(() => assertGenerationAlignment(alignmentBrokenFixture, 'hourglass'))
      .toThrow(/Generation 0.*tolerance/);
  });
});
```

- [ ] **Step 3: Run**

```bash
npx vitest run tests/unit/chartLayout.test.ts -t 'Property assertions catch regressions' 2>&1 | tail -10
```

Expected: all three tests pass (i.e., the assertions correctly fire on the broken fixtures).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/chart-layout/regression-fixtures.ts tests/unit/chartLayout.test.ts
git commit -m "test(chart-layout): property assertions catch three deliberate regressions

overlap, parent-direction-reversed, and generation-alignment-broken
fixtures each trigger the corresponding property assertion with a
named failure message. This proves the property suite has teeth
before goldens are deleted."
```

---

## Task 5: Delete supplanted goldens; keep 3–5 documented examples

**Files:**
- Modify: `tests/unit/chartLayout.test.ts` (replace snapshot calls with property calls)
- Modify: `tests/__snapshots__/chartLayout.test.ts.snap` (delete most entries; keep 3–5)

- [ ] **Step 1: List current snapshots**

```bash
ls tests/__snapshots__/chartLayout* 2>/dev/null
wc -l tests/__snapshots__/chartLayout*
```

Note the current line count of `.snap` files (will drop dramatically).

- [ ] **Step 2: For each snapshot assertion in `chartLayout.test.ts`, decide: keep as documented example or delete**

Criteria for keeping (max 3–5 total):
- Documents a tricky edge case (e.g., "selected person with 4 spouses across 3 generations").
- Adjacent test code adds a leading comment explaining *why* the snapshot is kept.

Criteria for deleting (default):
- Tests a positional invariant already covered by `assertNoOverlaps` + `assertParentDirection` + `assertGenerationAlignment`.
- No specific edge case rationale.

- [ ] **Step 3: Replace each "delete" snapshot with property assertion calls**

For each tested fixture, swap `expect(layout).toMatchSnapshot()` for the appropriate combination:

```typescript
assertNoOverlaps(layout);
assertParentDirection(layout, 'pedigree');
assertGenerationAlignment(layout, 'pedigree');
assertConnectivity(layout);
// optionally:
assertStableExtent(layout, { width: 800, height: 600 });
```

- [ ] **Step 4: Add code comments above each kept golden**

Example:

```typescript
// Kept golden: documents the 4-spouses-3-generations edge case.
// The exact coordinates here exercise the collision-avoidance pass
// for the second-row spouse boxes that the property suite cannot
// uniquely pin (multiple valid layouts satisfy the invariants).
it('4 spouses across 3 generations: documented layout', () => {
  const layout = computeHourglassLayout(fourSpousesFixture);
  expect(layout).toMatchSnapshot();
});
```

- [ ] **Step 5: Update the snapshot file**

```bash
npx vitest run tests/unit/chartLayout.test.ts -u 2>&1 | tail -5
```

The `-u` flag regenerates snapshots. After running, manually delete entries from `tests/__snapshots__/chartLayout.test.ts.snap` that don't correspond to a kept golden test.

- [ ] **Step 6: Run; verify clean pass**

```bash
npx vitest run tests/unit/chartLayout.test.ts 2>&1 | tail -5
```

Expected: pass.

- [ ] **Step 7: Check snapshot count**

```bash
grep -c '^exports' tests/__snapshots__/chartLayout.test.ts.snap
```

Expected: ≤ 5.

- [ ] **Step 8: Commit**

```bash
git add tests/unit/chartLayout.test.ts tests/__snapshots__/
git commit -m "test(chart-layout): replace goldens with property assertions

Kept 3-5 narrow goldens as documented edge-case examples; each has
a leading comment naming the case it documents. Remaining ~45
snapshot assertions replaced by combinations of the property suite.
Snapshot count: <new> (was <old>)."
```

---

## Task 6: Optional — split test file by chart type

If `chartLayout.test.ts` is still > 800 LOC after Task 5, split it:

- [ ] **Step 1: Identify the chart-type boundaries in the test file** (probably already grouped via `describe('Pedigree')`, `describe('Hourglass')`, `describe('Descendant')`).
- [ ] **Step 2: Create `tests/unit/chart-layout/pedigree.test.ts`, `hourglass.test.ts`, `descendant.test.ts`.** Move each `describe` block to its file.
- [ ] **Step 3: Delete `tests/unit/chartLayout.test.ts` if empty after the moves.**
- [ ] **Step 4: Run** `npx vitest run tests/unit/chart-layout/` — verify all pass.
- [ ] **Step 5: Commit.**

If the file is already < 800 LOC after Task 5, skip Task 6.

---

## Task 7: Cross-check perf baseline (no production code changed)

- [ ] **Step 1: Confirm `docs/baseline-perf/2026-05-14/` includes a chart-render workload** (or capture one in plan 1.2 if missing).

- [ ] **Step 2: Verify zero perf regression**

This is a test-side refactor — no `src/renderer/utils/chart-layout/` code changed. Spot-check by opening a chart view in the running app; render should be visually identical.

```bash
npm start &
# Open a tree chart view, verify it renders. Kill the app.
```

---

## Task 8: Phase 2 follow-up stub + CHANGELOG

**Files:**
- Create: `docs/plans/2026-05-14-hourglass-layout-refactor-design.md` (Phase 2 stub)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the Phase 2 stub**

```markdown
# Design — Hourglass layout refactor (Phase 2)

**Trigger:** Now that `tests/unit/chartLayout.test.ts` runs property assertions instead of golden snapshots (per plan 3.2), refactoring the 1,052-LOC `hourglass.ts` is no longer cascade-blocked.

## User goal

(To be brainstormed: separation of tree-shape derivation, geometric layout, and outline-placeholder extraction inside `hourglass.ts`. Each piece testable in isolation.)

## Scope

(To be brainstormed.)

## Verification

(To be brainstormed.)
```

- [ ] **Step 2: CHANGELOG**

```markdown
## Unreleased

### Refactored

- `tests/unit/chartLayout.test.ts` migrated from ~50 golden snapshots to 7 property-based assertions (`assertNoOverlaps`, `assertParentDirection`, etc.). Three regression fixtures verify the property suite catches deliberate layout breaks. 3–5 narrow goldens kept as documented edge-case examples. Phase 2 (refactoring `hourglass.ts` internally) tracked at `docs/plans/2026-05-14-hourglass-layout-refactor-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-05-14-hourglass-layout-refactor-design.md CHANGELOG.md
git commit -m "chore: changelog + phase 2 stub for chart-layout property test migration"
```

---

## Self-review checklist

- [ ] `tests/unit/chart-layout/properties.ts` exports the 7 named assertion functions.
- [ ] `tests/unit/chart-layout/regression-fixtures.ts` exists; 3 fixtures verified to trigger the property assertions with named messages.
- [ ] `tests/__snapshots__/chartLayout*` snapshot file count drops to ≤ 5.
- [ ] `tests/unit/chartLayout.test.ts` (or its split successors) < 800 LOC per file.
- [ ] Each kept golden has a leading comment naming the edge case it documents.
- [ ] No production code under `src/renderer/utils/chart-layout/` modified.
- [ ] Phase 2 stub committed.
- [ ] CHANGELOG Unreleased entry.

## Failure modes / RCA reference

- **Property assertion misses a class of bug.** Mitigation: Task 3's side-by-side run + Task 4's deliberate-breakage fixtures. If a property can't catch a deliberately-introduced regression that the snapshot did, either add the property, keep that golden, or document why the regression isn't actually a bug.
- **Property assertions too loose.** "No overlaps" alone is necessary but not sufficient. The combination of stable-extent + parent-direction + alignment + connectivity covers what the goldens were protecting.
- **Failure messages tune developers out.** Each assertion fails fast (first violation) and names specific box IDs. Don't change to "find all violations" — that produces noise on small breakages.

# Hourglass Layout Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the hourglass chart layout algorithm using a measure-then-place pipeline that guarantees no box overlaps, no line-through-box clipping, and connected outlines for every selected person.

**Architecture:** The layout is split into 7 pipeline stages: clone, inject outlines, collapse filter, measure footprints, place boxes (4 passes), draw connector lines, finalize. Measurement computes a per-person Footprint (left/right extent) that includes real spouses and outline placeholders. Placement uses these footprints so spacing is guaranteed before any box is positioned. Cross-direction outlines use collision avoidance as a final pass.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-15-hourglass-layout-rework-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/utils/chart-layout/hourglass.ts` | **Rewrite** | Hourglass layout: clone, inject, collapse, measure, place, connect, finalize |
| `tests/unit/chartLayout.test.ts` | **Modify** | Add outline overlap tests for every person type |
| `.claude/skills/tree-layout/SKILL.md` | **Create** | Reusable skill documenting the measurement→placement→connection tree layout pipeline |

---

### Task 1: Write the Footprint measurement function and tests

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`
- Modify: `tests/unit/chartLayout.test.ts`

- [x] **Step 1: Write failing tests for `computeFootprint`**

Add to `tests/unit/chartLayout.test.ts` after the existing helpers:

```typescript
import { computeFootprint } from '../../src/renderer/utils/chart-layout/hourglass';

describe('computeFootprint', () => {
  it('base footprint is BOX_W/2 each side', () => {
    const node: TreePerson = { person: p('a'), parents: [], children: [], spouses: [] };
    const fp = computeFootprint(node);
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2);
  });

  it('male with one real spouse extends right', () => {
    const spouse: TreePerson = { person: p('s'), parents: [], children: [], spouses: [] };
    const node: TreePerson = { person: p('a', { sex: 'M' }), parents: [], children: [], spouses: [spouse] };
    const fp = computeFootprint(node);
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2 + BOX_W + 20); // BOX_W + V_GAP
  });

  it('female with one real spouse extends left', () => {
    const spouse: TreePerson = { person: p('s'), parents: [], children: [], spouses: [] };
    const node: TreePerson = { person: p('a', { sex: 'F' }), parents: [], children: [], spouses: [spouse] };
    const fp = computeFootprint(node);
    expect(fp.left).toBe(BOX_W / 2 + BOX_W + 20);
    expect(fp.right).toBe(BOX_W / 2);
  });

  it('two placeholder parents widen both sides', () => {
    const phFather: TreePerson = { person: p('__ph_father_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const phMother: TreePerson = { person: p('__ph_mother_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const node: TreePerson = { person: p('a'), parents: [phFather, phMother], children: [], spouses: [] };
    const fp = computeFootprint(node);
    // 2 boxes + 1 gap = 2*155 + 20 = 330, half = 165
    expect(fp.left).toBe(165);
    expect(fp.right).toBe(165);
  });

  it('spouse + parent outlines: max of both', () => {
    const spouse: TreePerson = { person: p('s'), parents: [], children: [], spouses: [] };
    const phFather: TreePerson = { person: p('__ph_father_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const phMother: TreePerson = { person: p('__ph_mother_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const node: TreePerson = { person: p('a', { sex: 'M' }), parents: [phFather, phMother], children: [], spouses: [spouse] };
    const fp = computeFootprint(node);
    // right = max(BOX_W/2 + spouse extent, parent group half) = max(77.5 + 175, 165) = 252.5
    expect(fp.left).toBe(165);     // parent group half
    expect(fp.right).toBe(BOX_W / 2 + BOX_W + 20); // spouse wins (175 < 252.5... let me recalc)
    // Actually: spouse side = BOX_W/2 + 1*(BOX_W+V_GAP) = 77.5 + 175 = 252.5
    // Parent group half = (2*155 + 20) / 2 = 165
    // So right = max(252.5, 165) = 252.5
  });
});
```

Note: The last test expectation needs to be corrected during implementation once the exact formula is confirmed. The test structure is what matters.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/chartLayout.test.ts`
Expected: FAIL — `computeFootprint` not exported

- [x] **Step 3: Implement `computeFootprint` in hourglass.ts**

Add at the top of `hourglass.ts` (after imports, before `computeHourglassLayout`):

```typescript
export interface Footprint {
  left: number;   // extent left of person's center
  right: number;  // extent right of person's center
}

/** Compute the bounding footprint of a person including spouses and outline placeholders. */
export function computeFootprint(node: TreePerson): Footprint {
  const half = BOX_W / 2;

  // Spouse extent: spouses stack to one side (left for F, right for M/U)
  const spouseW = node.spouses.length * (BOX_W + V_GAP);
  const onLeft = node.person.sex === 'F';
  let left = onLeft ? half + spouseW : half;
  let right = onLeft ? half : half + spouseW;

  // Parent/child placeholder outlines are centered — may be wider than the box
  for (const arr of [
    node.parents.filter(p => p.isPlaceholder),
    node.children.filter(c => c.isPlaceholder),
  ]) {
    if (arr.length > 0) {
      const groupHalf = (arr.length * BOX_W + (arr.length - 1) * V_GAP) / 2;
      left = Math.max(left, groupHalf);
      right = Math.max(right, groupHalf);
    }
  }

  return { left, right };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/chartLayout.test.ts`
Expected: All footprint tests PASS. Fix the last test expectation if the formula gives a different number.

- [x] **Step 5: Commit**

Message: `refactor: add computeFootprint for hourglass layout measurement`

---

### Task 2: Rewrite spacing functions to use Footprint

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`

This task replaces the current `ancestorWidth`, `ancestorRelCX`, `descExtents`, and focal row extent calculations with versions that consume `computeFootprint`.

- [ ] **Step 1: Write failing tests for spacing with spouses**

Add to `tests/unit/chartLayout.test.ts`:

```typescript
describe('hourglass spacing with spouses', () => {
  it('ancestor with spouse gets wider subtree', () => {
    const spouse: TreePerson = { person: p('sp', { sex: 'F' }), parents: [], children: [], spouses: [] };
    const father: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [spouse] };
    const tree: TreePerson = {
      person: p('f'), parents: [father], children: [], spouses: [], isFocal: true,
    };
    const withSpouse = computeHourglassLayout(tree);
    const fatherNoSpouse: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [] };
    const treeNoSpouse: TreePerson = {
      person: p('f'), parents: [fatherNoSpouse], children: [], spouses: [], isFocal: true,
    };
    const without = computeHourglassLayout(treeNoSpouse);
    expect(withSpouse.svgWidth).toBeGreaterThan(without.svgWidth);
  });

  it('no overlaps: ancestor with spouse', () => {
    const spouse: TreePerson = { person: p('sp', { sex: 'F' }), parents: [], children: [], spouses: [] };
    const father: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [spouse] };
    const tree: TreePerson = {
      person: p('f'), parents: [father], children: [], spouses: [], isFocal: true,
    };
    const { boxes } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
  });
});
```

- [ ] **Step 2: Run tests to verify the overlap test fails**

The current code does not account for spouse width in ancestor spacing, so the overlap test should fail (or the width test should fail if spouse boxes aren't placed at all).

Run: `npx vitest run tests/unit/chartLayout.test.ts`

- [ ] **Step 3: Rewrite `ancestorWidth` to use `computeFootprint`**

Replace the current `ancestorWidth` function body:

```typescript
const ancWidthCache = new Map<string, number>();
function ancestorWidth(node: TreePerson): number {
  if (ancWidthCache.has(node.person.id)) return ancWidthCache.get(node.person.id)!;
  const fp = computeFootprint(node);
  const nodeW = fp.left + fp.right;
  let w: number;
  if (node.parents.length === 0) {
    w = nodeW;
  } else {
    const parentW = node.parents.reduce((sum, par) => sum + ancestorWidth(par), 0)
      + (node.parents.length - 1) * V_GAP;
    w = Math.max(parentW, nodeW);
  }
  ancWidthCache.set(node.person.id, w);
  return w;
}
```

- [ ] **Step 4: Rewrite `ancestorRelCX` to use `computeFootprint`**

The relative CX must account for the footprint asymmetry — a female ancestor with left spouses has her center offset to the right within her subtree width.

```typescript
const ancRelCXCache = new Map<string, number>();
function ancestorRelCX(node: TreePerson): number {
  if (ancRelCXCache.has(node.person.id)) return ancRelCXCache.get(node.person.id)!;
  const fp = computeFootprint(node);
  let cx: number;
  if (node.parents.length === 0) {
    cx = fp.left; // center is fp.left from the left edge of the footprint
  } else {
    const parentCXs: number[] = [];
    let x = 0;
    for (const par of node.parents) {
      parentCXs.push(x + ancestorRelCX(par));
      x += ancestorWidth(par) + V_GAP;
    }
    const parentMidCX = parentCXs.reduce((a, b) => a + b, 0) / parentCXs.length;
    // Clamp so the node + its spouses fit within the subtree width
    const minCX = fp.left;
    const maxCX = ancestorWidth(node) - fp.right;
    cx = Math.max(minCX, Math.min(maxCX, parentMidCX));
  }
  ancRelCXCache.set(node.person.id, cx);
  return cx;
}
```

- [ ] **Step 5: Rewrite `descExtents` to use `computeFootprint`**

```typescript
const descExtCache = new Map<string, [number, number]>();
function descExtents(node: TreePerson): [number, number] {
  if (descExtCache.has(node.person.id)) return descExtCache.get(node.person.id)!;
  const fp = computeFootprint(node);
  if (node.children.length === 0) {
    const ext: [number, number] = [fp.left, fp.right];
    descExtCache.set(node.person.id, ext);
    return ext;
  }
  const n = node.children.length;
  const childExts = node.children.map(c => descExtents(c));
  const offsets: number[] = [0];
  for (let i = 1; i < n; i++) {
    offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
  }
  const totalSpan = offsets[n - 1];
  const leftExt = Math.max(fp.left, totalSpan / 2 + childExts[0][0]);
  const rightExt = Math.max(fp.right, totalSpan / 2 + childExts[n - 1][1]);
  descExtCache.set(node.person.id, [leftExt, rightExt]);
  return [leftExt, rightExt];
}
```

- [ ] **Step 6: Rewrite focal row extent calculation**

Replace the focal spouse/sibling extent calculation with directional footprint walking:

```typescript
const spouseCXOffsets: number[] = [];
let focalSpouseExtent = 0;
if (root.spouses.length > 0) {
  let cursor = BOX_W / 2 + H_GAP;
  for (let i = 0; i < root.spouses.length; i++) {
    const fp = computeFootprint(root.spouses[i]);
    const towardFocal = spouseOnLeft ? fp.right : fp.left;
    const awayFromFocal = spouseOnLeft ? fp.left : fp.right;
    cursor += towardFocal;
    spouseCXOffsets.push(cursor);
    cursor += awayFromFocal + V_GAP;
  }
  focalSpouseExtent = cursor - V_GAP;
}

const sibCXOffsets: number[] = [];
let siblingExtent = 0;
if (siblings.length > 0) {
  let cursor = BOX_W / 2 + H_GAP;
  for (let i = 0; i < siblings.length; i++) {
    const fp = computeFootprint(siblings[i]);
    const towardFocal = siblingsOnLeft ? fp.right : fp.left;
    const awayFromFocal = siblingsOnLeft ? fp.left : fp.right;
    cursor += towardFocal;
    sibCXOffsets.push(cursor);
    cursor += awayFromFocal + V_GAP;
  }
  siblingExtent = cursor - V_GAP;
}
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: All tests pass including the new spouse spacing tests.

- [ ] **Step 8: Commit**

Message: `refactor: hourglass spacing uses computeFootprint for all nodes`

---

### Task 3: Rewrite placement passes 1-3 (ancestors, descendants, focal row)

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`

- [ ] **Step 1: Write `placeSpouses` helper**

This places real spouses beside a node using the footprint. Used by all three passes.

```typescript
function placeSpouses(node: TreePerson, nodeCX: number, nodeY: number): void {
  if (node.spouses.length === 0) return;
  const onLeft = node.person.sex === 'F';
  const lineY = nodeY + BOX_H / 2;
  for (let i = 0; i < node.spouses.length; i++) {
    const spCX = onLeft
      ? nodeCX - BOX_W / 2 - V_GAP - BOX_W / 2 - i * (BOX_W + V_GAP)
      : nodeCX + BOX_W / 2 + V_GAP + BOX_W / 2 + i * (BOX_W + V_GAP);
    boxes.push({
      person: node.spouses[i].person, isFocal: false,
      x: spCX - BOX_W / 2, y: nodeY, w: BOX_W, h: BOX_H,
    });
  }
  const lastIdx = node.spouses.length - 1;
  const lastCX = onLeft
    ? nodeCX - BOX_W / 2 - V_GAP - BOX_W / 2 - lastIdx * (BOX_W + V_GAP)
    : nodeCX + BOX_W / 2 + V_GAP + BOX_W / 2 + lastIdx * (BOX_W + V_GAP);
  lines.push({
    x1: onLeft ? lastCX - BOX_W / 2 : nodeCX + BOX_W / 2,
    y1: lineY,
    x2: onLeft ? nodeCX - BOX_W / 2 : lastCX + BOX_W / 2,
    y2: lineY,
  });
}
```

- [ ] **Step 2: Write `placeAncestors` — places node box + real spouses + recurses to parents**

```typescript
function placeAncestors(node: TreePerson, nodeCX: number, depth: number): void {
  const nodeY = ancestorRowY(depth);
  boxes.push({
    person: node.person, isFocal: !!node.isFocal,
    x: nodeCX - BOX_W / 2, y: nodeY, w: BOX_W, h: BOX_H,
  });
  if (!node.isFocal) placeSpouses(node, nodeCX, nodeY);
  // Parents (including parent placeholders — they ARE parents in the tree)
  if (node.parents.length === 0) return;
  const forkY = nodeY - GEN_GAP / 2;
  const parentWidths = node.parents.map(par => ancestorWidth(par));
  const totalWidth = parentWidths.reduce((s, w) => s + w, 0) + (node.parents.length - 1) * V_GAP;
  let x = nodeCX - totalWidth / 2;
  const parentCXs: number[] = [];
  for (let i = 0; i < node.parents.length; i++) {
    const pcx = x + ancestorRelCX(node.parents[i]);
    parentCXs.push(pcx);
    placeAncestors(node.parents[i], pcx, depth + 1);
    x += parentWidths[i] + V_GAP;
  }
  lines.push({ x1: nodeCX, y1: nodeY, x2: nodeCX, y2: forkY });
  if (parentCXs.length > 1) {
    lines.push({ x1: Math.min(...parentCXs), y1: forkY, x2: Math.max(...parentCXs), y2: forkY });
  }
  const parentRowBottom = ancestorRowY(depth + 1) + BOX_H;
  for (const pcx of parentCXs) {
    lines.push({ x1: pcx, y1: forkY, x2: pcx, y2: parentRowBottom });
  }
}
```

Note: parent placeholders (from `injectOutlines`) are in `node.parents[]` — they get placed by the recursion naturally. `ancestorWidth` already accounts for them via `computeFootprint`. No special handling needed.

- [ ] **Step 3: Write `placeDescendants` — same pattern downward**

```typescript
function placeDescendants(node: TreePerson, nodeCX: number, depth: number): void {
  const nodeY = descRowY(depth);
  boxes.push({
    person: node.person, isFocal: !!node.isFocal,
    x: nodeCX - BOX_W / 2, y: nodeY, w: BOX_W, h: BOX_H,
  });
  if (!node.isFocal) placeSpouses(node, nodeCX, nodeY);
  // Children (including child placeholders)
  if (node.children.length === 0) return;
  const forkY = nodeY + BOX_H + GEN_GAP / 2;
  lines.push({ x1: nodeCX, y1: nodeY + BOX_H, x2: nodeCX, y2: forkY });
  const n = node.children.length;
  const childExts = node.children.map(c => descExtents(c));
  const offsets: number[] = [0];
  for (let i = 1; i < n; i++) {
    offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
  }
  const totalSpan = offsets[n - 1];
  const leftmostCX = nodeCX - totalSpan / 2;
  const childCXs = offsets.map(o => leftmostCX + o);
  if (n > 1) {
    lines.push({ x1: childCXs[0], y1: forkY, x2: childCXs[n - 1], y2: forkY });
  }
  for (let i = 0; i < n; i++) {
    lines.push({ x1: childCXs[i], y1: forkY, x2: childCXs[i], y2: descRowY(depth + 1) });
    placeDescendants(node.children[i], childCXs[i], depth + 1);
  }
}
```

Note: child placeholders (from `injectOutlines`) are in `node.children[]` — placed naturally. Same for parent placeholders on descendants (they're in `node.parents[]` and would be placed by `placeAncestors` if the recursion went upward — but descendants only recurse down). Parent placeholders on descendants are cross-direction and handled in Task 4.

- [ ] **Step 4: Write focal row placement (Pass 3)**

Place focal box, then focal spouses and siblings using the pre-computed `spouseCXOffsets` and `sibCXOffsets`:

```typescript
// Place focal box
boxes.push({
  person: root.person, isFocal: true,
  x: focalCX - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H,
});

// Place focal spouses
function spouseCXOf(i: number): number {
  return spouseOnLeft ? focalCX - spouseCXOffsets[i] : focalCX + spouseCXOffsets[i];
}
if (root.spouses.length > 0) {
  const lineY = focalRowY + BOX_H / 2;
  const lastCX = spouseCXOf(root.spouses.length - 1);
  lines.push({
    x1: spouseOnLeft ? lastCX - BOX_W / 2 : focalCX + BOX_W / 2,
    y1: lineY,
    x2: spouseOnLeft ? focalCX + BOX_W / 2 : lastCX + BOX_W / 2,
    y2: lineY,
  });
  for (let i = 0; i < root.spouses.length; i++) {
    boxes.push({
      person: root.spouses[i].person, isFocal: false,
      x: spouseCXOf(i) - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H,
    });
  }
}

// Place siblings
function siblingCXOf(i: number): number {
  return siblingsOnLeft ? focalCX - sibCXOffsets[i] : focalCX + sibCXOffsets[i];
}
if (siblings.length > 0) {
  for (let i = 0; i < siblings.length; i++) {
    boxes.push({
      person: siblings[i].person, isFocal: false,
      x: siblingCXOf(i) - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H,
    });
  }
  if (A >= 1) {
    const parentForkY = focalRowY - GEN_GAP / 2;
    const allCXs = [focalCX, ...siblings.map((_, i) => siblingCXOf(i))];
    lines.push({ x1: Math.min(...allCXs), y1: parentForkY, x2: Math.max(...allCXs), y2: parentForkY });
    for (let i = 0; i < siblings.length; i++) {
      lines.push({ x1: siblingCXOf(i), y1: parentForkY, x2: siblingCXOf(i), y2: focalRowY });
    }
  }
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All existing hourglass tests pass (basic layout, collapse, overlap detection).

- [ ] **Step 6: Commit**

Message: `refactor: hourglass placement passes 1-3 with footprint-based spacing`

---

### Task 4: Outline placement pass (Pass 4) with collision avoidance

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`
- Modify: `tests/unit/chartLayout.test.ts`

- [ ] **Step 1: Write failing tests for outline placement**

```typescript
describe('hourglass outline overlap detection', () => {
  it('no overlaps when focal is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1')], [p('s1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'f');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when child is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1'), p('c2')], [p('s1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'c1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when ancestor is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [p('gp0'), p('gp1'), null, null], [p('c1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'dad');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when focal spouse is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1')], [p('s1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 's1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when sibling is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [], [], [p('sib1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'sib1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/chartLayout.test.ts`
Expected: FAIL — outlines are not placed yet (no placeholders in output when selected).

- [ ] **Step 3: Implement `placeOutlineGroup` collision avoidance helper**

```typescript
/** Place a group of outline boxes at targetY, centered on ownerCX, with collision avoidance. */
function placeOutlineGroup(
  nodes: TreePerson[], ownerCX: number, ownerY: number, dir: 'up' | 'down'
): void {
  if (nodes.length === 0) return;
  const targetY = dir === 'down' ? ownerY + BOX_H + GEN_GAP : ownerY - BOX_H - GEN_GAP;
  const forkY = dir === 'down' ? ownerY + BOX_H + GEN_GAP / 2 : ownerY - GEN_GAP / 2;
  const n = nodes.length;
  const groupW = n * BOX_W + (n - 1) * V_GAP;

  let startX = ownerCX - groupW / 2;
  const collides = (gx: number) => {
    for (let i = 0; i < n; i++) {
      const bx = gx + i * (BOX_W + V_GAP);
      if (boxes.some(b =>
        bx < b.x + b.w + V_GAP && bx + BOX_W + V_GAP > b.x &&
        targetY < b.y + b.h && targetY + BOX_H > b.y
      )) return true;
    }
    return false;
  };
  if (collides(startX)) {
    const rowBoxes = boxes.filter(b => targetY < b.y + b.h && targetY + BOX_H > b.y).sort((a, b) => a.x - b.x);
    const candidates = [startX];
    for (const b of rowBoxes) {
      candidates.push(b.x + b.w + V_GAP);
      candidates.push(b.x - groupW - V_GAP);
    }
    let bestX: number | null = null;
    let bestDist = Infinity;
    for (const cx of candidates) {
      if (!collides(cx)) {
        const dist = Math.abs((cx + groupW / 2) - ownerCX);
        if (dist < bestDist) { bestDist = dist; bestX = cx; }
      }
    }
    if (bestX !== null) startX = bestX;
  }

  // Connector from owner to fork
  if (dir === 'down') {
    lines.push({ x1: ownerCX, y1: ownerY + BOX_H, x2: ownerCX, y2: forkY });
  } else {
    lines.push({ x1: ownerCX, y1: ownerY, x2: ownerCX, y2: forkY });
  }
  for (let i = 0; i < n; i++) {
    const px = startX + i * (BOX_W + V_GAP);
    const pCX = px + BOX_W / 2;
    boxes.push({ person: nodes[i].person, isFocal: false, x: px, y: targetY, w: BOX_W, h: BOX_H });
    lines.push(dir === 'down'
      ? { x1: pCX, y1: forkY, x2: pCX, y2: targetY }
      : { x1: pCX, y1: forkY, x2: pCX, y2: targetY + BOX_H });
  }
  if (n > 1) {
    lines.push({ x1: startX + BOX_W / 2, y1: forkY, x2: startX + (n - 1) * (BOX_W + V_GAP) + BOX_W / 2, y2: forkY });
  }
}
```

- [ ] **Step 4: Implement Pass 4 — place outlines for the selected person**

After passes 1-3, add:

```typescript
// Pass 4: Place outlines for selected person
if (selectedPersonId) {
  const selBox = boxes.find(b => b.person.id === selectedPersonId);
  if (selBox) {
    const selNode = findPersonInTree(root, selectedPersonId);
    if (selNode) {
      const selCX = selBox.x + BOX_W / 2;
      const selIsFemale = selNode.person.sex === 'F';

      // Spouse outlines — beside the selected person with collision avoidance
      const placedIds = new Set(boxes.map(b => b.person.id));
      const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
      for (let i = 0; i < unplacedSpouses.length; i++) {
        let spX: number;
        const findClearX = (startX: number, y: number, direction: 1 | -1): number => {
          let x = startX;
          while (boxes.some(b =>
            x < b.x + b.w + V_GAP && x + BOX_W + V_GAP > b.x &&
            y < b.y + b.h && y + BOX_H > b.y
          )) { x += direction * (BOX_W + V_GAP); }
          return x;
        };
        if (selIsFemale) {
          spX = findClearX(selBox.x - BOX_W - V_GAP - i * (BOX_W + V_GAP), selBox.y, -1);
        } else {
          spX = findClearX(selBox.x + BOX_W + V_GAP + i * (BOX_W + V_GAP), selBox.y, 1);
        }
        boxes.push({ person: unplacedSpouses[i].person, isFocal: false, x: spX, y: selBox.y, w: BOX_W, h: BOX_H });
        const spCX = spX + BOX_W / 2;
        const lineY = selBox.y + BOX_H / 2;
        lines.push({
          x1: selIsFemale ? spCX + BOX_W / 2 : selCX + BOX_W / 2,
          y1: lineY,
          x2: selIsFemale ? selCX - BOX_W / 2 : spCX - BOX_W / 2,
          y2: lineY,
        });
      }

      // Cross-direction outlines: child on ancestor, parent on descendant
      const unplacedChildren = selNode.children.filter(c => !placedIds.has(c.person.id));
      placeOutlineGroup(unplacedChildren, selCX, selBox.y, 'down');

      const unplacedParents = selNode.parents.filter(par => !placedIds.has(par.person.id));
      placeOutlineGroup(unplacedParents, selCX, selBox.y, 'up');
    }
  }
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass including the new outline overlap tests.

- [ ] **Step 6: Commit**

Message: `feat: hourglass outline placement pass with collision avoidance`

---

### Task 5: Finalize — SVG dimensions, collapse buttons, placeholder extraction

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`

- [ ] **Step 1: Add SVG dimensions with negative-X shift**

```typescript
// Shift everything right if any box is at negative X
const minBoxLeft = boxes.length > 0 ? Math.min(...boxes.map(b => b.x)) : 0;
if (minBoxLeft < PAD) {
  const shift = PAD - minBoxLeft;
  for (const box of boxes) box.x += shift;
  for (const ln of lines) { ln.x1 += shift; ln.x2 += shift; }
}
const maxBoxRight = Math.max(...boxes.map(b => b.x + b.w));
const maxBoxBottom = Math.max(...boxes.map(b => b.y + b.h));
const minBoxTop = Math.min(...boxes.map(b => b.y));
const finalSvgWidth = Math.max(svgWidth, maxBoxRight + PAD);
const deepestDescRow = D > 0 ? descRowY(D) : focalRowY;
const svgHeight = Math.max(deepestDescRow + BOX_H + 20 + PAD, maxBoxBottom + 20 + PAD);
const viewBoxMinY = Math.min(0, minBoxTop - PAD);
const finalHeight = viewBoxMinY < 0 ? svgHeight + (-viewBoxMinY) : svgHeight;
```

- [ ] **Step 2: Add collapse buttons (copy from current working code)**

The collapse button logic is unchanged from the current implementation. Keep the existing code block that generates `collapseButtons` for ancestors (up), descendants (down per co-parent group), focal spouses (left/right), and siblings.

- [ ] **Step 3: Add placeholder extraction**

```typescript
const placeholders: PlaceholderBox[] = [];
const placeholderLines: Line[] = [];

for (let i = boxes.length - 1; i >= 0; i--) {
  const box = boxes[i];
  if (!box.person.id.startsWith(PLACEHOLDER_PREFIX)) continue;
  const pid = box.person.id;
  let role: 'father' | 'mother' | 'child' | 'spouse';
  let childPersonId: string;
  if (pid.startsWith(PLACEHOLDER_PREFIX + 'father_')) {
    role = 'father'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'father_').length);
  } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'mother_')) {
    role = 'mother'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'mother_').length);
  } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'spouse_')) {
    role = 'spouse'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'spouse_').length);
  } else {
    role = 'child'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'child_').length);
  }
  placeholders.push({ type: 'placeholder', role, childPersonId, x: box.x, y: box.y });
  boxes.splice(i, 1);
}

const phCenters = new Set<string>();
for (const ph of placeholders) {
  phCenters.add(`${ph.x + BOX_W / 2},${ph.y}`);
  phCenters.add(`${ph.x + BOX_W / 2},${ph.y + BOX_H}`);
  phCenters.add(`${ph.x + BOX_W / 2},${ph.y + BOX_H / 2}`);
  phCenters.add(`${ph.x},${ph.y + BOX_H / 2}`);
  phCenters.add(`${ph.x + BOX_W},${ph.y + BOX_H / 2}`);
}
for (let i = lines.length - 1; i >= 0; i--) {
  const ln = lines[i];
  if (phCenters.has(`${ln.x1},${ln.y1}`) || phCenters.has(`${ln.x2},${ln.y2}`)) {
    placeholderLines.push(ln);
    lines.splice(i, 1);
  }
}
```

- [ ] **Step 4: Return the ChartLayout**

```typescript
return { boxes, lines, svgWidth: finalSvgWidth, svgHeight: finalHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines };
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All 1127+ tests pass.

- [ ] **Step 6: Commit**

Message: `feat(v0.78.0): hourglass layout rework — footprint spacing, no-clip outlines`

---

### Task 6: MCP visual verification

**Files:** None (testing only)

- [ ] **Step 1: Start app and navigate to hourglass**

Run: `npm start` (or use running dev server)
Navigate to hourglass view with a person who has parents, children, spouses, and siblings.

- [ ] **Step 2: Select focal person — verify 4 outlines, no clipping**

Use MCP `ui_click` on the focal person box. Take screenshot. Verify:
- Father, Mother, Spouse/Partner, Child outlines all visible
- No box overlaps any other box
- All outline connector lines reach their outlines without crossing boxes

- [ ] **Step 3: Select each ancestor — verify outlines**

Click each grandparent and parent. For each: screenshot, verify 4 outlines visible, no clipping.

- [ ] **Step 4: Select each descendant — verify outlines**

Click each child. Screenshot, verify.

- [ ] **Step 5: Select each focal spouse — verify outlines**

Click the spouse. Screenshot, verify 4 outlines including parent outlines above (should not clip ancestors).

- [ ] **Step 6: Select each sibling — verify outlines**

Click the sibling. Screenshot, verify.

- [ ] **Step 7: Select ancestor's spouse — verify outlines**

Click a real spouse of an ancestor (not a placeholder). Verify their outlines appear.

---

### Task 7: Extract tree layout skill

**Files:**
- Create: `.claude/skills/tree-layout/SKILL.md`

- [ ] **Step 1: Write the skill document**

Create `.claude/skills/tree-layout/SKILL.md` with the measurement→placement→connection pipeline pattern documented as a reusable reference:

```markdown
---
name: tree-layout
description: Layout algorithm patterns for tree charts (pedigree, hourglass, descendant). Use when building or modifying any chart layout that positions boxes in a tree structure.
---

# Tree Layout Skill

## The Pipeline

Every tree chart layout follows this pipeline:

1. **Clone** — deep-clone input tree (Vue computed re-runs on same ref)
2. **Inject** — add outline placeholders for the selected person
3. **Collapse** — prune collapsed branches (preserve placeholders)
4. **Measure** — compute bounding footprint for every person
5. **Place** — position all boxes using measurements
6. **Connect** — draw connector lines between placed boxes
7. **Finalize** — SVG dimensions, shift, collapse buttons, extract placeholders

## Measurement: Footprint

Every person has a bounding footprint — the total horizontal space they need including their real spouses and outline placeholders.

interface Footprint {
  left: number;   // extent left of person's center
  right: number;  // extent right of person's center
}

Computation:
- Base: BOX_W / 2 each side
- Spouses: extend to one side (left for females, right for males). Each spouse adds BOX_W + V_GAP.
- Parent/child outlines: centered group, extends max(groupWidth/2) each side.
- Take the max of all contributions per side.

## Spacing

Recursive spacing functions consume footprints:
- ancestorWidth(node) = max(sum of parent subtree widths, node footprint width)
- descExtents(node) = [max(fp.left, childSpan/2 + first.left), max(fp.right, childSpan/2 + last.right)]
- Focal row: walk outward accumulating directional footprint (toward-focal + away-from-focal)

## Placement

Four passes:
1. Ancestors (upward recursion) — places boxes + real spouses
2. Descendants (downward recursion) — places boxes + real spouses
3. Focal row — focal box + manual spouse/sibling placement
4. Outlines — collision avoidance for cross-direction and focal-row outlines

Same-direction outlines (parent placeholders on ancestors, child placeholders on descendants) are placed by the recursive passes naturally since they're in the parents[]/children[] arrays.

Cross-direction outlines use collision avoidance: try centered on owner, shift to nearest clear position if overlapping.

## Collision Avoidance

function placeOutlineGroup(nodes, ownerCX, ownerY, direction):
  1. Compute targetY one row away from owner
  2. Try centered group at ownerCX
  3. If collides with any placed box, scan candidate positions (after/before each row box)
  4. Pick the closest non-colliding position to ownerCX
  5. Place boxes + fork connectors

## Line Routing

Lines drawn AFTER all boxes are placed:
1. Parent-child: vertical fork (node → forkY → horizontal span → vertical drops)
2. Spouse: horizontal line between facing edges
3. Outline: same geometry, converted to dashed via placeholder center detection

## Invariants

1. No box overlaps any other box
2. No line passes through any box
3. Every outline is connected to its owner
4. Outlines are as close to their owner as possible

## Files

- src/renderer/utils/chart-layout/hourglass.ts — hourglass layout
- src/renderer/utils/chart-layout/pedigree.ts — pedigree layout
- src/renderer/utils/chart-layout/descendant.ts — descendant layout
- src/renderer/utils/chart-layout/types.ts — TreePerson, BoxLayout, ChartLayout, etc.
- src/renderer/utils/chart-layout/constants.ts — BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD
```

- [ ] **Step 2: Commit**

Message: `docs: add tree-layout skill documenting chart layout pipeline`

---

### Task 8: Documentation updates

**Files:**
- Modify: `docs/PLAN.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add implementation status entry in PLAN.md**

Add row: `| v0.78.0 | Hourglass layout rework — footprint spacing, no-clip outlines, spouses for all nodes | [archive](plans/archive/2026-04-15-hourglass-layout-rework.md) |`

- [ ] **Step 2: Update CLAUDE.md if needed**

Update the tree-layout skill entry in the skills table if not already listed.

- [ ] **Step 3: Commit**

Message: `docs: update PLAN.md and CLAUDE.md for hourglass rework`

# Chart Layout Shared Utilities Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated logic from pedigree, descendant, and hourglass chart layouts into a shared utilities module, reducing ~120 LOC of copy-paste code.

**Architecture:** Three chart layouts share identical implementations of `findPersonInTree`, placeholder extraction/parsing, and line-to-dashed conversion. These get extracted to `chart-layout/shared.ts`. Each layout file imports shared functions, removing its local copies. The hourglass outline placement also adopts the relocation approach from descendant (tree-driven spacing instead of post-layout gap-finding), but that is a **separate follow-up plan** — this refactor is pure extraction with no behavior change.

**Tech Stack:** TypeScript, Vitest

**Precondition:** Hourglass outline routing bugs must be fixed before this refactor. This plan assumes all three charts produce correct output before we start.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/utils/chart-layout/shared.ts` | **Create** | Shared helpers: `findPersonInTree`, `findParentOf`, `extractPlaceholders`, `convertPlaceholderLines`, `parsePlaceholderId` |
| `src/renderer/utils/chart-layout/pedigree.ts` | Modify | Remove local `findPersonInTree`, placeholder extraction, line conversion. Import from shared. |
| `src/renderer/utils/chart-layout/descendant.ts` | Modify | Remove local `findPersonInTree`, `findParentOf`, placeholder extraction, line conversion. Import from shared. |
| `src/renderer/utils/chart-layout/hourglass.ts` | Modify | Remove local `findPersonInTree` (line 9-18), placeholder extraction, line conversion. Import from shared. |
| `src/renderer/utils/chart-layout/hourglass-tree.ts` | Modify | Remove local `findPerson` (line 135-156), import `findPersonInTree` from shared. |
| `src/renderer/utils/chart-layout/index.ts` | Modify | Re-export shared functions that are used externally. |
| `tests/unit/chartLayoutShared.test.ts` | **Create** | Unit tests for all shared functions. |
| `tests/unit/chartLayout.test.ts` | Verify | Existing tests must still pass (no behavior change). |

---

### Task 1: Create shared module with `findPersonInTree` and `findParentOf`

**Files:**
- Create: `src/renderer/utils/chart-layout/shared.ts`
- Create: `tests/unit/chartLayoutShared.test.ts`

- [ ] **Step 1: Write failing tests for findPersonInTree**

```typescript
// tests/unit/chartLayoutShared.test.ts
import { describe, it, expect } from 'vitest';
import { findPersonInTree, findParentOf } from '../../src/renderer/utils/chart-layout/shared';
import type { TreePerson, PersonNode } from '../../src/renderer/utils/chart-layout/types';

function tp(id: string, opts: { parents?: TreePerson[]; children?: TreePerson[]; spouses?: TreePerson[]; siblings?: TreePerson[] } = {}): TreePerson {
  return {
    person: { id, givenName: 'T', surname: 'P', preferredName: null, nickname: null, sex: 'U', living: true, birthDate: null, deathDate: null },
    parents: opts.parents ?? [],
    children: opts.children ?? [],
    spouses: opts.spouses ?? [],
    siblings: opts.siblings,
  };
}

describe('findPersonInTree', () => {
  it('finds the root node', () => {
    const root = tp('a');
    expect(findPersonInTree(root, 'a')?.person.id).toBe('a');
  });

  it('finds a child', () => {
    const child = tp('b');
    const root = tp('a', { children: [child] });
    expect(findPersonInTree(root, 'b')?.person.id).toBe('b');
  });

  it('finds a parent', () => {
    const parent = tp('p');
    const root = tp('a', { parents: [parent] });
    expect(findPersonInTree(root, 'p')?.person.id).toBe('p');
  });

  it('finds a spouse', () => {
    const spouse = tp('s');
    const root = tp('a', { spouses: [spouse] });
    expect(findPersonInTree(root, 's')?.person.id).toBe('s');
  });

  it('finds in siblings', () => {
    const sib = tp('sib');
    const root = tp('a', { siblings: [sib] });
    expect(findPersonInTree(root, 'sib')?.person.id).toBe('sib');
  });

  it('returns null for missing id', () => {
    const root = tp('a', { children: [tp('b')] });
    expect(findPersonInTree(root, 'z')).toBeNull();
  });

  it('handles cycles without infinite loop', () => {
    const a = tp('a');
    const b = tp('b', { children: [a] });
    a.children.push(b); // cycle
    expect(findPersonInTree(a, 'b')?.person.id).toBe('b');
    expect(findPersonInTree(a, 'z')).toBeNull();
  });
});

describe('findParentOf', () => {
  it('finds direct parent', () => {
    const child = tp('c');
    const root = tp('r', { children: [child] });
    expect(findParentOf(root, 'c')?.person.id).toBe('r');
  });

  it('finds nested parent', () => {
    const grandchild = tp('gc');
    const child = tp('c', { children: [grandchild] });
    const root = tp('r', { children: [child] });
    expect(findParentOf(root, 'gc')?.person.id).toBe('c');
  });

  it('returns null for root', () => {
    const root = tp('r');
    expect(findParentOf(root, 'r')).toBeNull();
  });

  it('returns null for missing id', () => {
    const root = tp('r', { children: [tp('c')] });
    expect(findParentOf(root, 'z')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/chartLayoutShared.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement shared module**

```typescript
// src/renderer/utils/chart-layout/shared.ts
import type { TreePerson } from './types';

/** Find a TreePerson by ID anywhere in the tree (cycle-safe). */
export function findPersonInTree(
  node: TreePerson, id: string, visited = new Set<string>()
): TreePerson | null {
  if (node.person.id === id) return node;
  if (visited.has(node.person.id)) return null;
  visited.add(node.person.id);
  for (const p of node.parents) { const f = findPersonInTree(p, id, visited); if (f) return f; }
  for (const c of node.children) { const f = findPersonInTree(c, id, visited); if (f) return f; }
  for (const s of node.spouses) { const f = findPersonInTree(s, id, visited); if (f) return f; }
  for (const sib of (node.siblings ?? [])) { const f = findPersonInTree(sib, id, visited); if (f) return f; }
  return null;
}

/** Find the tree-parent of a person (the node whose children array contains it). */
export function findParentOf(
  root: TreePerson, childId: string, visited = new Set<string>()
): TreePerson | null {
  if (visited.has(root.person.id)) return null;
  visited.add(root.person.id);
  for (const c of root.children) {
    if (c.person.id === childId) return root;
    const found = findParentOf(c, childId, visited);
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/chartLayoutShared.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

Message: `refactor: extract findPersonInTree and findParentOf to shared chart-layout module`

---

### Task 2: Extract placeholder extraction and line conversion

**Files:**
- Modify: `src/renderer/utils/chart-layout/shared.ts`
- Modify: `tests/unit/chartLayoutShared.test.ts`

- [ ] **Step 1: Write failing tests for parsePlaceholderId, extractPlaceholders, convertPlaceholderLines**

```typescript
// Append to tests/unit/chartLayoutShared.test.ts
import { parsePlaceholderId, extractPlaceholders, convertPlaceholderLines } from '../../src/renderer/utils/chart-layout/shared';
import type { BoxLayout, PlaceholderBox, Line } from '../../src/renderer/utils/chart-layout/types';
import { BOX_W, BOX_H } from '../../src/renderer/utils/chart-layout/constants';
import { PLACEHOLDER_PREFIX } from '../../src/renderer/utils/chart-layout/hourglass-tree';

function box(id: string, x: number, y: number): BoxLayout {
  return {
    person: { id, givenName: 'T', surname: 'P', preferredName: null, nickname: null, sex: 'U', living: true, birthDate: null, deathDate: null },
    isFocal: false, x, y, w: BOX_W, h: BOX_H,
  };
}

describe('parsePlaceholderId', () => {
  it('parses father placeholder', () => {
    const result = parsePlaceholderId(PLACEHOLDER_PREFIX + 'father_person123');
    expect(result).toEqual({ role: 'father', forPersonId: 'person123' });
  });

  it('parses mother placeholder', () => {
    const result = parsePlaceholderId(PLACEHOLDER_PREFIX + 'mother_abc');
    expect(result).toEqual({ role: 'mother', forPersonId: 'abc' });
  });

  it('parses spouse placeholder', () => {
    const result = parsePlaceholderId(PLACEHOLDER_PREFIX + 'spouse_xyz');
    expect(result).toEqual({ role: 'spouse', forPersonId: 'xyz' });
  });

  it('parses child placeholder', () => {
    const result = parsePlaceholderId(PLACEHOLDER_PREFIX + 'child_def');
    expect(result).toEqual({ role: 'child', forPersonId: 'def' });
  });

  it('returns null for non-placeholder', () => {
    expect(parsePlaceholderId('regular-person-id')).toBeNull();
  });
});

describe('extractPlaceholders', () => {
  it('separates placeholder boxes from real boxes', () => {
    const boxes: BoxLayout[] = [
      box('real1', 0, 0),
      box(PLACEHOLDER_PREFIX + 'father_real1', 100, 0),
      box('real2', 200, 0),
    ];
    const { remaining, placeholders } = extractPlaceholders(boxes);
    expect(remaining).toHaveLength(2);
    expect(remaining.map(b => b.person.id)).toEqual(['real1', 'real2']);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].role).toBe('father');
    expect(placeholders[0].childPersonId).toBe('real1');
    expect(placeholders[0].x).toBe(100);
  });

  it('returns empty placeholders when none exist', () => {
    const boxes: BoxLayout[] = [box('a', 0, 0)];
    const { remaining, placeholders } = extractPlaceholders(boxes);
    expect(remaining).toHaveLength(1);
    expect(placeholders).toHaveLength(0);
  });
});

describe('convertPlaceholderLines', () => {
  it('moves lines touching placeholder centers to dashed', () => {
    const ph: PlaceholderBox = { type: 'placeholder', role: 'father', childPersonId: 'c', x: 100, y: 50 };
    const phCX = 100 + BOX_W / 2;
    const phTop = 50;
    const solidLine: Line = { x1: 0, y1: 0, x2: 50, y2: 50 };
    const touchingLine: Line = { x1: phCX, y1: phTop, x2: phCX, y2: 0 };
    const lines = [solidLine, touchingLine];

    const { solid, dashed } = convertPlaceholderLines(lines, [ph]);
    expect(solid).toHaveLength(1);
    expect(dashed).toHaveLength(1);
    expect(dashed[0]).toEqual(touchingLine);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/chartLayoutShared.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement parsePlaceholderId, extractPlaceholders, convertPlaceholderLines**

Append to `src/renderer/utils/chart-layout/shared.ts`:

```typescript
import type { BoxLayout, PlaceholderBox, Line } from './types';
import { BOX_W, BOX_H } from './constants';
import { PLACEHOLDER_PREFIX } from './hourglass-tree';

/** Parse a placeholder ID into its role and the person it belongs to. */
export function parsePlaceholderId(id: string): { role: 'father' | 'mother' | 'child' | 'spouse'; forPersonId: string } | null {
  if (!id.startsWith(PLACEHOLDER_PREFIX)) return null;
  const rest = id.slice(PLACEHOLDER_PREFIX.length);
  for (const role of ['father', 'mother', 'spouse', 'child'] as const) {
    if (rest.startsWith(role + '_')) {
      return { role, forPersonId: rest.slice(role.length + 1) };
    }
  }
  return null;
}

/**
 * Separate placeholder boxes from real boxes. Mutates nothing — returns new arrays.
 * Replaces the identical reverse-iterate-and-splice loop in all three layouts.
 */
export function extractPlaceholders(boxes: BoxLayout[]): { remaining: BoxLayout[]; placeholders: PlaceholderBox[] } {
  const remaining: BoxLayout[] = [];
  const placeholders: PlaceholderBox[] = [];
  for (const box of boxes) {
    const parsed = parsePlaceholderId(box.person.id);
    if (parsed) {
      placeholders.push({ type: 'placeholder', role: parsed.role, childPersonId: parsed.forPersonId, x: box.x, y: box.y });
    } else {
      remaining.push(box);
    }
  }
  return { remaining, placeholders };
}

/**
 * Partition lines into solid and dashed based on whether they touch a placeholder box.
 * Checks 5 anchor points per placeholder: top/bottom/left/right/center edges.
 * Optionally deduplicates dashed lines that overlap solid lines.
 */
export function convertPlaceholderLines(
  lines: Line[],
  placeholders: PlaceholderBox[],
  opts: { deduplicate?: boolean } = {},
): { solid: Line[]; dashed: Line[] } {
  const phCenters = new Set<string>();
  for (const ph of placeholders) {
    const cx = ph.x + BOX_W / 2;
    phCenters.add(`${cx},${ph.y}`);                      // top center
    phCenters.add(`${cx},${ph.y + BOX_H}`);               // bottom center
    phCenters.add(`${cx},${ph.y + BOX_H / 2}`);           // mid center
    phCenters.add(`${ph.x},${ph.y + BOX_H / 2}`);         // left center
    phCenters.add(`${ph.x + BOX_W},${ph.y + BOX_H / 2}`); // right center
  }

  const solid: Line[] = [];
  const dashed: Line[] = [];
  for (const ln of lines) {
    if (phCenters.has(`${ln.x1},${ln.y1}`) || phCenters.has(`${ln.x2},${ln.y2}`)) {
      dashed.push(ln);
    } else {
      solid.push(ln);
    }
  }

  if (opts.deduplicate) {
    const solidSet = new Set(solid.map(l => `${l.x1},${l.y1},${l.x2},${l.y2}`));
    return { solid, dashed: dashed.filter(l => !solidSet.has(`${l.x1},${l.y1},${l.x2},${l.y2}`)) };
  }
  return { solid, dashed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/chartLayoutShared.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

Message: `refactor: extract placeholder parsing and line conversion to shared module`

---

### Task 3: Wire pedigree.ts to use shared functions

**Files:**
- Modify: `src/renderer/utils/chart-layout/pedigree.ts`
- Verify: `tests/unit/chartLayout.test.ts`

- [ ] **Step 1: Replace imports and remove local functions**

In `pedigree.ts`:

1. Add import: `import { findPersonInTree, extractPlaceholders, convertPlaceholderLines } from './shared';`
2. Delete the local `findPersonInTree` function (bottom of file, ~lines 329-337)
3. Replace the placeholder extraction block (lines 277-301) with:

```typescript
const { remaining: realBoxes, placeholders } = extractPlaceholders(boxes);
boxes.length = 0;
boxes.push(...realBoxes);
```

4. Replace the line conversion block (lines 303-323) with:

```typescript
const { solid, dashed: placeholderLines } = convertPlaceholderLines(lines, placeholders, { deduplicate: true });
lines.length = 0;
lines.push(...solid);
```

5. Update the return to use `placeholderLines` (already the variable name).

- [ ] **Step 2: Run all existing tests**

Run: `npm test`
Expected: All 1119+ tests pass. Zero behavior change — this is a pure extraction.

- [ ] **Step 3: Commit**

Message: `refactor: pedigree.ts uses shared placeholder extraction and findPersonInTree`

---

### Task 4: Wire descendant.ts to use shared functions

**Files:**
- Modify: `src/renderer/utils/chart-layout/descendant.ts`
- Verify: `tests/unit/chartLayout.test.ts`

- [ ] **Step 1: Replace imports and remove local functions**

In `descendant.ts`:

1. Add import: `import { findPersonInTree, findParentOf, extractPlaceholders, convertPlaceholderLines } from './shared';`
2. Delete the local `findPersonInTree` function (bottom of file)
3. Delete the local `findParentOf` function (bottom of file)
4. Replace the placeholder extraction block with:

```typescript
const { remaining: realBoxes, placeholders } = extractPlaceholders(boxes);
boxes.length = 0;
boxes.push(...realBoxes);
```

5. Replace the line conversion block with:

```typescript
const { solid, dashed: placeholderLines } = convertPlaceholderLines(lines, placeholders);
lines.length = 0;
lines.push(...solid);
```

- [ ] **Step 2: Run all existing tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

Message: `refactor: descendant.ts uses shared placeholder extraction and tree helpers`

---

### Task 5: Wire hourglass.ts and hourglass-tree.ts to use shared functions

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`
- Modify: `src/renderer/utils/chart-layout/hourglass-tree.ts`
- Verify: `tests/unit/chartLayout.test.ts`

- [ ] **Step 1: Replace in hourglass.ts**

1. Add import: `import { findPersonInTree, extractPlaceholders, convertPlaceholderLines } from './shared';`
2. Remove the import of `findPersonInTree` from `./hourglass-tree` (it was previously re-exported or defined locally)
3. Delete the local `findPersonInTree` if it exists at top of file (lines ~9-18 — note: hourglass imports from hourglass-tree, check if it\'s duplicated or imported)
4. Replace placeholder extraction block (lines 668-689) with:

```typescript
const { remaining: realBoxes, placeholders } = extractPlaceholders(boxes);
boxes.length = 0;
boxes.push(...realBoxes);
```

5. Replace line conversion block (lines 691-703) with:

```typescript
const { solid, dashed: placeholderLines } = convertPlaceholderLines(lines, placeholders);
lines.length = 0;
lines.push(...solid);
```

**Note:** Hourglass currently uses only 2 anchor points (top/bottom center) vs 5 in pedigree/descendant. The shared function uses 5 points. This is strictly more correct — it catches lines that were previously missed. Verify no visual regression.

- [ ] **Step 2: Replace in hourglass-tree.ts**

1. Add import: `import { findPersonInTree } from './shared';`
2. Delete the local `findPerson` function (lines 135-156)
3. Replace all calls to `findPerson(` with `findPersonInTree(`

The only call site is in `injectOutlines` (line 117): `const target = findPerson(root, selectedPersonId);` → `const target = findPersonInTree(root, selectedPersonId);`

- [ ] **Step 3: Run all existing tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

Message: `refactor: hourglass uses shared tree helpers and placeholder extraction`

---

### Task 6: Update barrel exports and clean up

**Files:**
- Modify: `src/renderer/utils/chart-layout/index.ts`

- [ ] **Step 1: Add shared exports to barrel**

Add to `index.ts`:
```typescript
export { findPersonInTree, findParentOf } from './shared';
```

These are used by layout files internally, but exporting them keeps the public API complete for any external consumers.

- [ ] **Step 2: Verify no unused exports remain in hourglass-tree.ts**

Check that `hourglass-tree.ts` no longer exports `findPerson` (it was a local function, not exported — but verify). The `PLACEHOLDER_PREFIX` export stays since `shared.ts` imports it.

- [ ] **Step 3: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

Message: `refactor: update barrel exports for shared chart-layout module`

---

## Summary

| Before | After |
|--------|-------|
| `findPersonInTree` defined in 4 files | Defined once in `shared.ts` |
| Placeholder extraction: 22-line block × 3 files | Single `extractPlaceholders()` call |
| Line-to-dashed conversion: 15-line block × 3 files | Single `convertPlaceholderLines()` call |
| phCenters variance (2 vs 5 points) | Consistent 5-point coverage everywhere |
| No deduplication in descendant/hourglass | Optional `deduplicate` flag available |
| ~120 lines of copy-paste across 4 files | ~60 lines in one shared module |

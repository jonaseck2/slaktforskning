# Chart Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Project workflow (CLAUDE.md): execute in a git worktree under `.worktrees/chart-consistency/`; dispatch a fresh subagent per task with `subagent-handoff` templates; verify user-observable outcomes (not just "tests pass") before marking a task done.

**Goal:** The three `TreePerson` family-tree charts (Pedigree, Hourglass, Descendant) render and behave identically wherever they share a concept, with the shared code living in one place so it cannot drift.

**Architecture:** Lift the cross-cut duplication out of the three layout files and the three chart components into (1) a shared `findPerson` (already exists, unused), (2) a shared `extractPlaceholders` pure function, (3) a `useChartBox` composable holding the ~16 box-render helpers, and (4) a `<ChartCanvas>` component owning the SVG shell + pan/zoom + interaction. The three layout *algorithms* stay as three separate files (legitimately different shapes). Behavior parity (double-click re-root, selection auto-pan, ARIA roles, arrow-key navigation) is leveled up to the most complete chart and lives inside `<ChartCanvas>`.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Vitest (unit + happy-dom component tests), the existing `chartLayout.test.ts` 130-test property suite as the behavior-preserving guard.

**Design spec:** [`docs/plans/2026-06-07-chart-consistency-design.md`](2026-06-07-chart-consistency-design.md).

---

## File Structure

**Create:**
- `src/renderer/utils/chart-layout/extract-placeholders.ts` — `extractPlaceholders(boxes, paths)` pure fn; mutates-free, returns the placeholder split.
- `src/renderer/composables/useChartBox.ts` — the box-render helper bundle (colors + geometry + i18n labels).
- `src/renderer/components/charts/ChartCanvas.vue` — shared SVG shell + pan/zoom container + box/collapse/placeholder rendering + interaction + the add-relative `PersonModal`.
- `tests/unit/chart-layout/extract-placeholders.test.ts` — unit test for the extraction fn.
- `tests/components/chart-parity.test.ts` — the user-goal parity test.

**Modify:**
- `src/renderer/utils/chart-layout/{pedigree,hourglass,descendant}.ts` — drop local `findPersonInTree`; use shared `findPerson`; use `extractPlaceholders`.
- `src/renderer/components/charts/{PedigreeChart,HourglassChart,DescendantChart}.vue` — adopt `useChartBox`; render via `<ChartCanvas>`; gain parity behaviors.
- `src/renderer/utils/chart-layout/index.ts` — re-export `extractPlaceholders` (follow existing re-export style).

**Reference (read, don't change unless noted):**
- `src/renderer/utils/chart-layout/hourglass-tree.ts:163` — the existing shared `findPerson`.
- `src/renderer/utils/chart-layout/types.ts` — `ChartLayout`, `BoxLayout`, `PlaceholderBox`, `CollapseButton`, `TreePerson`.

---

## Phase A — Layout-layer dedup (low risk; 130 property tests are the guard)

### Task 1: Dedup `findPerson` across the three layout files

**Files:**
- Modify: `src/renderer/utils/chart-layout/pedigree.ts:324-332`, `hourglass.ts:21-30`, `descendant.ts:336-344`
- Reference: `src/renderer/utils/chart-layout/hourglass-tree.ts:163`

- [ ] **(Tier 1) Step 1: Confirm the shared `findPerson` is a superset**

Read `hourglass-tree.ts:163`. Confirm its body traverses `parents`, `children`, and `spouses` (and `siblings` if present) with a `visited` cycle-guard. The three local `findPersonInTree` copies traverse parents/children/spouses only. The shared one must cover at least that set. If the shared `findPerson` is missing any of parents/children/spouses traversal, STOP and surface — do not silently narrow behavior.

- [ ] **(Tier 1) Step 2: Run the property suite to capture the green baseline**

Run: `npx vitest run tests/unit/chartLayout.test.ts`
Expected: `Tests  130 passed (130)`

- [ ] **(Tier 1) Step 3: Replace local copies with the shared import**

In each of `pedigree.ts`, `descendant.ts`, `hourglass.ts`:
1. Delete the local `function findPersonInTree(...) { ... }` definition.
2. Add `findPerson` to the existing `import { ... } from './hourglass-tree'` line.
3. Replace every call site `findPersonInTree(root, id)` → `findPerson(root, id)` (the `root`/`tp` first arg is unchanged).

`descendant.ts` also has `findParentOf` (lines 325-334) — leave it; it is descendant-specific and not duplicated.

- [ ] **(Tier 1) Step 4: Verify the property suite still passes**

Run: `npx vitest run tests/unit/chartLayout.test.ts`
Expected: `Tests  130 passed (130)` — identical count, all green.

- [ ] **(Tier 1) Step 5: Verify the grep gate**

Run: `grep -rn "function findPersonInTree" src/renderer/utils/chart-layout/`
Expected: no output (zero matches).

- [ ] **(Tier 1) Step 6: Commit**

```bash
git add src/renderer/utils/chart-layout/pedigree.ts src/renderer/utils/chart-layout/hourglass.ts src/renderer/utils/chart-layout/descendant.ts
git commit -m "refactor(charts): dedup findPersonInTree → shared findPerson"
```

---

### Task 2: Extract `extractPlaceholders` shared function

The placeholder role-parse tail is copy-pasted near-identically: `pedigree.ts:283-307`, `descendant.ts:299-318`, `hourglass.ts` (the `// ── 9. Extract placeholders` block at ~1025). Each iterates `boxes` backwards, parses `PLACEHOLDER_PREFIX + '<role>_' + childId`, pushes a `PlaceholderBox`, and splices the box out.

**Files:**
- Create: `src/renderer/utils/chart-layout/extract-placeholders.ts`
- Create: `tests/unit/chart-layout/extract-placeholders.test.ts`
- Modify: `pedigree.ts`, `descendant.ts`, `hourglass.ts`, `index.ts`

- [ ] **(Tier 1) Step 1: Write the failing unit test**

Create `tests/unit/chart-layout/extract-placeholders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractPlaceholders } from '../../../src/renderer/utils/chart-layout/extract-placeholders';
import { PLACEHOLDER_PREFIX } from '../../../src/renderer/utils/chart-layout/hourglass-tree';
import type { BoxLayout } from '../../../src/renderer/utils/chart-layout/types';

function box(id: string, x = 0, y = 0): BoxLayout {
  return {
    person: { id, givenName: null, surname: null, preferredName: null, nickname: null, sex: 'U', living: true, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null },
    isFocal: false, x, y, w: 100, h: 40,
  };
}

describe('extractPlaceholders', () => {
  it('splits placeholder boxes out into typed PlaceholderBox entries, leaving real boxes', () => {
    const real = box('real-1', 10, 20);
    const father = box(`${PLACEHOLDER_PREFIX}father_real-1`, 30, 5);
    const daughter = box(`${PLACEHOLDER_PREFIX}daughter_real-1`, 30, 90);
    const { boxes, placeholders } = extractPlaceholders([real, father, daughter]);

    expect(boxes.map(b => b.person.id)).toEqual(['real-1']);
    expect(placeholders).toEqual([
      { type: 'placeholder', role: 'daughter', childPersonId: 'real-1', x: 30, y: 90 },
      { type: 'placeholder', role: 'father', childPersonId: 'real-1', x: 30, y: 5 },
    ]);
  });

  it('parses all five roles', () => {
    const ids = ['father', 'mother', 'spouse', 'son', 'daughter'].map(
      r => box(`${PLACEHOLDER_PREFIX}${r}_owner`),
    );
    const { boxes, placeholders } = extractPlaceholders(ids);
    expect(boxes).toHaveLength(0);
    expect(placeholders.map(p => p.role).sort()).toEqual(['daughter', 'father', 'mother', 'son', 'spouse']);
    expect(placeholders.every(p => p.childPersonId === 'owner')).toBe(true);
  });

  it('returns the input boxes unchanged when there are no placeholders', () => {
    const a = box('a'); const b = box('b');
    const { boxes, placeholders } = extractPlaceholders([a, b]);
    expect(boxes).toEqual([a, b]);
    expect(placeholders).toEqual([]);
  });
});
```

- [ ] **(Tier 1) Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/chart-layout/extract-placeholders.test.ts`
Expected: FAIL — `Failed to resolve import` / `extractPlaceholders is not a function`.

- [ ] **(Tier 1) Step 3: Write the implementation**

Create `src/renderer/utils/chart-layout/extract-placeholders.ts`:

```typescript
import type { BoxLayout, PlaceholderBox } from './types';
import { PLACEHOLDER_PREFIX } from './hourglass-tree';

const ROLES = ['father', 'mother', 'spouse', 'son', 'daughter'] as const;
type Role = (typeof ROLES)[number];

/**
 * Split placeholder boxes out of a layout's box list. Placeholder boxes carry
 * an id of the form `${PLACEHOLDER_PREFIX}<role>_<childPersonId>`. Real boxes
 * pass through untouched. Iterates back-to-front so the returned `placeholders`
 * order matches the legacy per-chart loops (which spliced from the tail).
 *
 * Pure: does not mutate the input array.
 */
export function extractPlaceholders(
  inputBoxes: BoxLayout[],
): { boxes: BoxLayout[]; placeholders: PlaceholderBox[] } {
  const boxes: BoxLayout[] = [];
  const placeholders: PlaceholderBox[] = [];

  for (let i = inputBoxes.length - 1; i >= 0; i--) {
    const b = inputBoxes[i];
    const id = b.person.id;
    if (!id.startsWith(PLACEHOLDER_PREFIX)) {
      boxes.unshift(b);
      continue;
    }
    const rest = id.slice(PLACEHOLDER_PREFIX.length);
    const role = ROLES.find((r) => rest.startsWith(r + '_'));
    if (!role) { boxes.unshift(b); continue; }
    const childPersonId = rest.slice((role + '_').length);
    placeholders.push({ type: 'placeholder', role: role as Role, childPersonId, x: b.x, y: b.y });
  }

  return { boxes, placeholders };
}
```

- [ ] **(Tier 1) Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/chart-layout/extract-placeholders.test.ts`
Expected: `Tests  3 passed (3)`.

- [ ] **(Tier 1) Step 5: Re-export from index.ts**

In `src/renderer/utils/chart-layout/index.ts`, add (matching the file's existing `export ... from './...'` style):

```typescript
export { extractPlaceholders } from './extract-placeholders';
```

- [ ] **(Tier 1) Step 6: Replace the three copy-pasted tails**

In each layout file, replace the manual back-to-front placeholder loop with:

```typescript
const { boxes: realBoxes, placeholders } = extractPlaceholders(boxes);
```

Then return `realBoxes` as `boxes` in the `ChartLayout` result, and `placeholders` as `placeholders`. Keep each file's existing `placeholderPaths` / `placeholderLines` handling unchanged — `extractPlaceholders` only owns the box→placeholder split, not the path prefixing (`'D:' + d`).

Add `extractPlaceholders` to each file's import from `'./extract-placeholders'` (or from `'./index'` if the file already imports from there — match the existing import source).

- [ ] **(Tier 1) Step 7: Verify the property suite is unchanged**

Run: `npx vitest run tests/unit/chartLayout.test.ts`
Expected: `Tests  130 passed (130)`.

- [ ] **(Tier 1) Step 8: Commit**

```bash
git add src/renderer/utils/chart-layout/extract-placeholders.ts tests/unit/chart-layout/extract-placeholders.test.ts src/renderer/utils/chart-layout/index.ts src/renderer/utils/chart-layout/pedigree.ts src/renderer/utils/chart-layout/hourglass.ts src/renderer/utils/chart-layout/descendant.ts
git commit -m "refactor(charts): extract shared extractPlaceholders, drop 3 copy-pasted tails"
```

---

## Phase B — Shared box rendering (`useChartBox`)

### Task 3: Create the `useChartBox` composable

The ~16 render helpers are currently defined verbatim in each of the three components. Their reference implementation is `PedigreeChart.vue:423-518` (`sexBg`, `isHighlighted`, `boxFill`, `boxStroke`, `nameColor`, `dateColor`, `portraitBg`, `portraitTextColor`, `wrappedName`, `birthText`, `deathText`, `initials`, `nameStartY`, `portraitY`, `birthY`, `deathY`, `placeholderLabel`) plus `boxAriaLabel` (`PedigreeChart.vue:267-272`).

**Files:**
- Create: `src/renderer/composables/useChartBox.ts`

- [ ] **(Tier 1) Step 1: Write the composable**

Create `src/renderer/composables/useChartBox.ts`. Bodies are moved verbatim from `PedigreeChart.vue` (cited lines); only the dependency wiring changes — `colors`, `colorMode`, and `selectedId` arrive as args instead of being closed-over component locals:

```typescript
import type { ComputedRef, Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { wrapFullNameSegments, truncateToWidth } from '../utils/chart-layout/measure';
import { BOX_PAD_Y, PORTRAIT_H, TEXT_AREA_W } from '../utils/chart-layout';
import type { BoxLayout } from '../utils/chart-layout';
import type { ColorMode } from '../../api/chart-export';

// The shape returned by applyColorMode(useChartColors(...)). Imported structurally.
type ChartColors = {
  boxFocal: string; boxDeceased: string; boxBg: string; boxStroke: string; focalStroke: string;
  text: string; textFocal: string; textSub: string; textFocalSub: string;
  sexMBg: string; sexFBg: string; sexUBg: string;
};

export function useChartBox(opts: {
  colors: ComputedRef<ChartColors>;
  colorMode: ComputedRef<ColorMode>;
  selectedId: Ref<string | null>;
}) {
  const { t } = useI18n();
  const { colors, colorMode, selectedId } = opts;

  function sexBg(sex: string): string {
    if (sex === 'M') return colors.value.sexMBg;
    if (sex === 'F') return colors.value.sexFBg;
    return colors.value.sexUBg;
  }
  function isHighlighted(box: BoxLayout): boolean {
    return !!selectedId.value && box.person.id === selectedId.value;
  }
  function boxFill(box: BoxLayout): string {
    if (isHighlighted(box)) return colors.value.boxFocal;
    if (colorMode.value === 'sex-colored') return sexBg(box.person.sex);
    if (!box.person.living) return colors.value.boxDeceased;
    return colors.value.boxBg;
  }
  function boxStroke(box: BoxLayout): string {
    return isHighlighted(box) ? colors.value.focalStroke : colors.value.boxStroke;
  }
  function nameColor(box: BoxLayout): string {
    return isHighlighted(box) ? colors.value.textFocal : colors.value.text;
  }
  function dateColor(box: BoxLayout): string {
    return isHighlighted(box) ? colors.value.textFocalSub : colors.value.textSub;
  }
  function portraitBg(box: BoxLayout): string { return sexBg(box.person.sex); }
  function portraitTextColor(): string { return '#ffffff'; }
  function wrappedName(box: BoxLayout) {
    return wrapFullNameSegments(box.person.givenName, box.person.surname, box.person.preferredName, box.person.nickname, TEXT_AREA_W, 12);
  }
  function birthText(box: BoxLayout): string {
    const parts = [box.person.birthDate, box.person.birthPlace].filter(Boolean).join(' ');
    return parts ? truncateToWidth('* ' + parts, TEXT_AREA_W, 10) : '';
  }
  function deathText(box: BoxLayout): string {
    const parts = [box.person.deathDate, box.person.deathPlace].filter(Boolean).join(' ');
    return parts ? truncateToWidth('† ' + parts, TEXT_AREA_W, 10) : '';
  }
  function initials(box: BoxLayout): string {
    const g = (box.person.preferredName ?? box.person.givenName ?? '').trim()[0] ?? '';
    const s = (box.person.surname ?? '').trim()[0] ?? '';
    return (g + s).toUpperCase() || '?';
  }
  function nameStartY(box: BoxLayout): number { return box.y + BOX_PAD_Y + 12; }
  function portraitY(box: BoxLayout): number { return box.y + (box.h - PORTRAIT_H) / 2; }
  function birthY(box: BoxLayout): number { return box.y + BOX_PAD_Y + wrappedName(box).length * 16 + 10; }
  function deathY(box: BoxLayout): number {
    const hasBirth = !!(box.person.birthDate || box.person.birthPlace);
    return birthY(box) + (hasBirth ? 14 : 0);
  }
  function placeholderLabel(role: string): string {
    const labels: Record<string, string> = {
      father: t('personDetail.addFather'), mother: t('personDetail.addMother'),
      spouse: t('personDetail.addSpouse'), son: t('personDetail.addSon'), daughter: t('personDetail.addDaughter'),
    };
    return labels[role] ?? role;
  }
  function boxAriaLabel(box: BoxLayout): string {
    const name = ((box.person.givenName ?? '') + ' ' + (box.person.surname ?? '')).trim();
    const birth = box.person.birthDate ? '* ' + box.person.birthDate : '';
    const death = box.person.deathDate ? '† ' + box.person.deathDate : '';
    return [name || t('common.unknown'), birth, death].filter(Boolean).join(', ');
  }

  return { sexBg, isHighlighted, boxFill, boxStroke, nameColor, dateColor, portraitBg, portraitTextColor, wrappedName, birthText, deathText, initials, nameStartY, portraitY, birthY, deathY, placeholderLabel, boxAriaLabel };
}
```

- [ ] **(Tier 1) Step 2: Type-check**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep useChartBox || echo "clean"`
Expected: `clean` (no type errors referencing the new file). If `ChartColors` structurally mismatches `applyColorMode`'s return, widen the local type to match the real fields used — do not cast to `any`.

- [ ] **(Tier 1) Step 3: Commit**

```bash
git add src/renderer/composables/useChartBox.ts
git commit -m "feat(charts): add useChartBox composable (shared box-render helpers)"
```

---

### Task 4: Migrate PedigreeChart to `useChartBox`

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

- [ ] **(Tier 1) Step 1: Wire the composable**

In the `<script setup>`, after the `colors` computed (line 414) and the existing `layoutSelectedId` ref (line 323), add:

```typescript
import { useChartBox } from '../../composables/useChartBox';

const colorModeRef = computed<ColorMode>(() => props.colorMode ?? 'themed');
const { sexBg, boxFill, boxStroke, nameColor, dateColor, portraitBg, portraitTextColor, wrappedName, birthText, deathText, initials, nameStartY, portraitY, birthY, deathY, placeholderLabel, boxAriaLabel } = useChartBox({ colors, colorMode: colorModeRef, selectedId: layoutSelectedId });
```

- [ ] **(Tier 1) Step 2: Delete the now-duplicated local definitions**

Delete from `PedigreeChart.vue`: `sexBg` (423-427), `isHighlighted` (429-431), `boxFill` (433-438), `boxStroke` (440-442), `nameColor` (444-446), `dateColor` (448-450), `portraitBg` (452-454), `portraitTextColor` (456-458), `wrappedName` (460-469), `birthText` (471-475), `deathText` (477-481), `initials` (483-489), `nameStartY` (491-493), `portraitY` (495-497), `birthY` (499-502), `deathY` (504-507), `placeholderLabel` (509-518), and `boxAriaLabel` (267-272). Keep the `wrapFullNameSegments` / `truncateToWidth` import only if still used elsewhere — if not, remove it (now used inside the composable).

- [ ] **(Tier 1) Step 3: Type-check + render-shape guard**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep PedigreeChart || echo "clean"`
Expected: `clean`.
Run: `npx vitest run tests/unit/chartLayout.test.ts`
Expected: `Tests  130 passed (130)` (layout fns untouched; sanity that nothing leaked).

- [ ] **(Tier 1) Step 4: Commit**

```bash
git add src/renderer/components/charts/PedigreeChart.vue
git commit -m "refactor(charts): PedigreeChart uses useChartBox"
```

---

### Task 5: Migrate HourglassChart to `useChartBox`

**Files:**
- Modify: `src/renderer/components/charts/HourglassChart.vue`

- [ ] **(Tier 1) Step 1: Locate the local helpers**

Run: `grep -nE "function (sexBg|boxFill|boxStroke|nameColor|dateColor|portraitBg|portraitTextColor|wrappedName|birthText|deathText|initials|nameStartY|portraitY|birthY|deathY|placeholderLabel|boxAriaLabel|isHighlighted)" src/renderer/components/charts/HourglassChart.vue`
Expected: the list of line numbers for the locally-defined copies.

- [ ] **(Tier 1) Step 2: Wire the composable + delete local copies**

Add the same import + destructure as Task 4 Step 1 (using Hourglass's own `colors` computed and its `selectedId`/`layoutSelectedId` ref — confirm the ref name via the grep in Task 5 Step 1; Hourglass uses `props.selectedPersonId` directly per the divergence audit, so introduce a `selectedId` ref mirroring Pedigree's `layoutSelectedId` if one doesn't exist, OR pass `toRef`-wrapped `props.selectedPersonId`). Delete each local helper found in Step 1.

- [ ] **(Tier 1) Step 3: Type-check**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep HourglassChart || echo "clean"`
Expected: `clean`.

- [ ] **(Tier 1) Step 4: Commit**

```bash
git add src/renderer/components/charts/HourglassChart.vue
git commit -m "refactor(charts): HourglassChart uses useChartBox"
```

---

### Task 6: Migrate DescendantChart to `useChartBox`

**Files:**
- Modify: `src/renderer/components/charts/DescendantChart.vue`

- [ ] **(Tier 1) Step 1: Locate + replace**

Same procedure as Task 5: `grep -nE "function (sexBg|boxFill|...)" src/renderer/components/charts/DescendantChart.vue`, wire `useChartBox`, delete the local copies.

- [ ] **(Tier 1) Step 2: Type-check + commit**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep DescendantChart || echo "clean"`
Expected: `clean`.

```bash
git add src/renderer/components/charts/DescendantChart.vue
git commit -m "refactor(charts): DescendantChart uses useChartBox"
```

---

## Phase C — Shared `<ChartCanvas>` component

### Task 7: Create `<ChartCanvas>`

`<ChartCanvas>` owns the SVG shell currently triplicated. Its template is the box-and-elbow markup moved verbatim from `PedigreeChart.vue:7-201` (the `<svg>…</svg>` block), with helper calls bound from `useChartBox` and interactions emitted to the parent. Pan/zoom + the scroll container + `ZoomControls` slot + the add-relative `PersonModal` move in too.

**Files:**
- Create: `src/renderer/components/charts/ChartCanvas.vue`

- [ ] **(Tier 2) Step 1: Define props + emits**

> Tier 2 — surface the prop/emit contract before building, since all three charts will bind to it. Propose, then proceed unless told otherwise.

```typescript
const props = defineProps<{
  layout: ChartLayout;
  tree: unknown | null;          // truthy gate for rendering (each chart passes its own tree ref)
  loading: boolean;
  zoom: number;
  isPanning: boolean;
  readonly?: boolean;
  colorMode?: ColorMode;
  selectedId: string | null;
  ariaLabel: string;             // role="tree" aria-label, per-chart i18n key
  addBtnStyle: 'plus' | 'leaf';
}>();

const emit = defineEmits<{
  navigate: [id: string];
  'focus-person': [id: string];                                   // double-click re-root
  'person-context-menu': [payload: { personId: string; x: number; y: number }];
  'collapse-toggle': [btn: CollapseButton];
  'add-from-placeholder': [ph: PlaceholderBox];
  'box-keydown': [payload: { event: KeyboardEvent; box: BoxLayout }];
  wheel: [e: WheelEvent];
  mousedown: [e: MouseEvent]; mousemove: [e: MouseEvent]; mouseup: [e: MouseEvent];
}>();
```

The scroll container's `ref` is owned by the parent's `useChartZoom` (it returns `scrollRef`); `<ChartCanvas>` exposes its inner scroll element via `defineExpose({ scrollEl })` so the parent can bind `scrollRef` to it, OR the parent passes `scrollRef` down as a template ref. Choose the template-ref-down approach: add `const scrollRef = defineModel<HTMLElement | null>('scrollRef')` is NOT valid for elements — instead accept a callback: the parent binds `:ref` on `<ChartCanvas>` and reads `canvasRef.value.scrollEl`. Implement `defineExpose({ scrollEl })`.

- [ ] **(Tier 1) Step 2: Build the template**

Move the `<div class="chart-outer">…</div>` wrapper through the `<svg>…</svg>` block verbatim from `PedigreeChart.vue:1-208` into `ChartCanvas.vue`'s `<template>`, then rewire:
- `boxFill(box)` etc. → from `useChartBox` (destructured in this component, fed by props).
- `@click="$emit('navigate', box.person.id)"` → unchanged.
- Add `@dblclick="$emit('focus-person', box.person.id)"` to the box `<g>`.
- `@keydown="$emit('box-keydown', { event: $event, box })"` (the parent owns the arrow-key logic — see Task 14).
- `@click.stop` on the add-relative `<g>` → `$emit('person-context-menu', …)`.
- `handleCollapseButton(btn)` → `$emit('collapse-toggle', btn)`.
- `startAddFromPlaceholder(ph)` → `$emit('add-from-placeholder', ph)`.
- `:aria-label="$t(props.ariaLabel)"` on the `<svg role="tree">`.
- Move the `<style scoped>` block from `PedigreeChart.vue:575-648` into `ChartCanvas.vue` verbatim (these classes — `.chart-outer`, `.person-box`, `.collapse-btn`, `.ghost-box`, `.add-relative-btn` — become the single source of chart box styling).

The `PersonModal` add-relative flow + `startAddFromPlaceholder`/`onRelativeSaved` local state stays in each *chart* component (it needs the chart's `reload`), so `<ChartCanvas>` only emits `add-from-placeholder` and the parent opens the modal.

- [ ] **(Tier 1) Step 3: Type-check**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep ChartCanvas || echo "clean"`
Expected: `clean`.

- [ ] **(Tier 1) Step 4: Commit**

```bash
git add src/renderer/components/charts/ChartCanvas.vue
git commit -m "feat(charts): add shared ChartCanvas component (SVG shell + interaction)"
```

---

### Task 8: Render PedigreeChart via `<ChartCanvas>`

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

- [ ] **(Tier 1) Step 1: Replace the inline SVG with `<ChartCanvas>`**

Replace `PedigreeChart.vue`'s `<div class="chart-outer">…</svg>…</div>` (lines 1-202, keeping `ZoomControls` + `PersonModal` below) with:

```vue
<template>
  <ChartCanvas
    ref="canvasRef"
    :layout="layout"
    :tree="tree"
    :loading="loading"
    :zoom="zoom"
    :is-panning="isPanning"
    :readonly="readonly"
    :color-mode="props.colorMode"
    :selected-id="layoutSelectedId"
    aria-label="a11y.pedigreeChart"
    :add-btn-style="addBtnStyle"
    @navigate="(id) => $emit('navigate', id)"
    @focus-person="(id) => $emit('focus-person', id)"
    @person-context-menu="(p) => $emit('person-context-menu', p)"
    @collapse-toggle="handleCollapseButton"
    @add-from-placeholder="startAddFromPlaceholder"
    @box-keydown="({ event, box }) => onBoxKeydown(event, box)"
    @wheel="onWheel" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp"
  >
    <template #zoom-controls>
      <ZoomControls overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
        <!-- existing generation spinner markup, unchanged -->
      </ZoomControls>
    </template>
  </ChartCanvas>
  <PersonModal v-if="showAddRelative && addRelativePersonId" … />  <!-- unchanged -->
</template>
```

Bind `scrollRef` from `useChartZoom` to the canvas's exposed `scrollEl` in `onMounted` (`scrollRef.value = canvasRef.value?.scrollEl ?? null`) so pan/zoom keeps working. Delete the now-unused box-render helper destructure if `useChartBox` is only used inside `<ChartCanvas>` (it is — remove the Task-4 destructure from the chart component, keep it only in `ChartCanvas`).

- [ ] **(Tier 1) Step 2: Add the `focus-person` emit to the chart's `defineEmits`**

`PedigreeChart.vue`'s emits (lines 247-251) gain `'focus-person': [id: string];`.

- [ ] **(Tier 1) Step 3: Type-check + property suite**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep PedigreeChart || echo "clean"` → `clean`.
Run: `npx vitest run tests/unit/chartLayout.test.ts` → `Tests  130 passed (130)`.

- [ ] **(Tier 1) Step 4: Commit**

```bash
git add src/renderer/components/charts/PedigreeChart.vue
git commit -m "refactor(charts): PedigreeChart renders via ChartCanvas"
```

---

### Task 9: Render HourglassChart via `<ChartCanvas>`

> Hourglass has the richest `collapseButtons` set (4-way + multi-parent `coParentId` groups + sibling button). `<ChartCanvas>` renders whatever `layout.collapseButtons` contains, so this must verify the button set survives unchanged.

**Files:**
- Modify: `src/renderer/components/charts/HourglassChart.vue`

- [ ] **(Tier 2) Step 1: Replace inline SVG with `<ChartCanvas>`**

> Tier 2 — Hourglass is the highest-risk migration (most behaviors). Surface the diff before committing.

Same shape as Task 8, with `aria-label="a11y.hourglassChart"` (add this i18n key to `sv.ts` + `en.ts` if absent — mirror `a11y.pedigreeChart`). Keep Hourglass's `onPersonDblClick` → `focus-person` path: wire the canvas `@focus-person` to Hourglass's existing handler (which also dismisses the Coachmark) rather than a bare re-emit. Keep the `Coachmark` + `focusBoxEl` callback-ref by exposing the focal box element from `<ChartCanvas>` (`defineExpose({ scrollEl, focalBoxEl })`) OR leave the Coachmark anchor in Hourglass by having it query `canvasRef.value.scrollEl.querySelector('[data-testid=person-box-<focalId>]')`.

- [ ] **(Tier 1) Step 2: Verify the collapse-button set is unchanged**

Run: `npx vitest run tests/unit/chartLayout.test.ts` → `Tests  130 passed (130)` (the layout fn produces the buttons; untouched).
Manual/dev-MCP (deferred to Task 16): confirm up/down/left/right + multi-parent group buttons render and toggle.

- [ ] **(Tier 1) Step 3: Type-check + commit**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep HourglassChart || echo "clean"` → `clean`.

```bash
git add src/renderer/components/charts/HourglassChart.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "refactor(charts): HourglassChart renders via ChartCanvas"
```

---

### Task 10: Render DescendantChart via `<ChartCanvas>`

**Files:**
- Modify: `src/renderer/components/charts/DescendantChart.vue`

- [ ] **(Tier 1) Step 1: Replace inline SVG with `<ChartCanvas>`**

Same shape as Task 8, `aria-label="a11y.descendantChart"` (add i18n key if absent). Opportunistically delete the dead `isExpanded ? '▼' : '▼'` ternary — it lives in `<ChartCanvas>` now as the shared direction-keyed glyph map, so it disappears automatically.

- [ ] **(Tier 1) Step 2: Type-check + property suite + commit**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep DescendantChart || echo "clean"` → `clean`.
Run: `npx vitest run tests/unit/chartLayout.test.ts` → `Tests  130 passed (130)`.

```bash
git add src/renderer/components/charts/DescendantChart.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "refactor(charts): DescendantChart renders via ChartCanvas"
```

---

## Phase D — Behavior parity (leveled up to the most complete chart)

### Task 11: Double-click → re-root parity (Pedigree + Descendant)

Hourglass already emits `focus-person` on double-click (re-roots the tree). `<ChartCanvas>` now emits it for all three (Task 7). The chart's *parent view* must handle it for Pedigree + Descendant.

**Files:**
- Modify: the parent view(s) that host the charts — `src/renderer/views/PersonsView.vue` (the chart tab host). Confirm via `grep -rln "HourglassChart\|PedigreeChart\|DescendantChart" src/renderer/views src/renderer/components`.

- [ ] **(Tier 1) Step 1: Find how Hourglass's `focus-person` is handled today**

Run: `grep -rn "focus-person\|@focus-person\|focusPerson" src/renderer/views src/renderer/components`
Identify the handler that re-roots Hourglass (sets the focal `personId`). This is the path to reuse.

- [ ] **(Tier 1) Step 2: Wire the same handler for Pedigree + Descendant**

In the host view, add `@focus-person="<sameHandler>"` to the `<PedigreeChart>` and `<DescendantChart>` usages, matching the existing `<HourglassChart>` binding (regression-triage default: reuse the existing path, don't invent a parallel one).

- [ ] **(Tier 1) Step 3: Verify via build (behavior tested in Task 15 + 16)**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | tail -3` → no new errors.

- [ ] **(Tier 1) Step 4: Commit**

```bash
git add src/renderer/views/PersonsView.vue
git commit -m "feat(charts): double-click re-roots Pedigree + Descendant (parity with Hourglass)"
```

---

### Task 12: Selection auto-pan parity

Hourglass scrolls the selected box into view (`scrollSelectedBoxIntoView`); Pedigree/Descendant don't. Move this into `<ChartCanvas>` so all three get it.

**Files:**
- Modify: `src/renderer/components/charts/ChartCanvas.vue`
- Reference: `HourglassChart.vue` `scrollSelectedBoxIntoView` (grep for it)

- [ ] **(Tier 1) Step 1: Locate the reference implementation**

Run: `grep -n "scrollSelectedBoxIntoView\|scrollSelectedBox\|scrollIntoView" src/renderer/components/charts/HourglassChart.vue`
Read the function: it pans the scroll container to show the box with the given id (≈100px inset).

- [ ] **(Tier 1) Step 2: Move it into `<ChartCanvas>` and watch `selectedId`**

Add to `ChartCanvas.vue` `<script setup>`:

```typescript
import { watch, nextTick } from 'vue';

function scrollSelectedIntoView(id: string | null) {
  if (!id || !scrollEl.value) return;
  const el = scrollEl.value.querySelector(`[data-testid="person-box-${id}"]`) as SVGGElement | null;
  if (!el) return;
  const box = el.getBoundingClientRect();
  const container = scrollEl.value.getBoundingClientRect();
  const inset = 100;
  if (box.left < container.left + inset) scrollEl.value.scrollLeft -= (container.left + inset - box.left);
  else if (box.right > container.right - inset) scrollEl.value.scrollLeft += (box.right - (container.right - inset));
  if (box.top < container.top + inset) scrollEl.value.scrollTop -= (container.top + inset - box.top);
  else if (box.bottom > container.bottom - inset) scrollEl.value.scrollTop += (box.bottom - (container.bottom - inset));
}

watch(() => props.selectedId, async (id) => { await nextTick(); scrollSelectedIntoView(id); });
```

Then remove the now-redundant `scrollSelectedBoxIntoView` from `HourglassChart.vue` (its `watch(selectedPersonId)` that called it). If Hourglass's version had Hourglass-specific math, reconcile to the shared version and confirm parity in Task 16.

- [ ] **(Tier 1) Step 2b: Reconcile with Hourglass's existing `centerOnFocal`**

Leave each chart's one-time `centerOnFocal()`-on-load as-is (it's load-time, not selection-time). This task only unifies selection-driven panning.

- [ ] **(Tier 1) Step 3: Type-check + commit**

Run: `npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "ChartCanvas|HourglassChart" || echo "clean"` → `clean`.

```bash
git add src/renderer/components/charts/ChartCanvas.vue src/renderer/components/charts/HourglassChart.vue
git commit -m "feat(charts): selection auto-pans into view in all three charts (parity)"
```

---

### Task 13: ARIA roles + box keyboard focus parity

`<ChartCanvas>` already carries `role="tree"` + `role="treeitem"` + `tabindex="0"` + `boxAriaLabel` (moved verbatim from Pedigree in Task 7). Adopting the canvas (Tasks 8-10) gives Hourglass + Descendant these for free. This task verifies it and adds the per-chart aria-label keys.

**Files:**
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` (if not already added in Tasks 9-10)

- [ ] **(Tier 1) Step 1: Write the failing assertion (folded into Task 15's test)**

This parity is asserted by the Task 15 `chart-parity.test.ts` (`role="tree"` + `treeitem` present). No separate test here — the canvas adoption is the implementation.

- [ ] **(Tier 1) Step 2: Confirm the i18n keys exist**

Run: `grep -n "pedigreeChart\|hourglassChart\|descendantChart" src/renderer/i18n/en.ts src/renderer/i18n/sv.ts`
Expected: all three present in both files. Add any missing key mirroring `a11y.pedigreeChart`.

- [ ] **(Tier 1) Step 3: Commit (if i18n changed)**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n(charts): add hourglass/descendant chart aria-label keys"
```

---

### Task 14: Arrow-key tree navigation parity

Pedigree's `onBoxKeydown` (`PedigreeChart.vue:279-313`) navigates by generation/sibling using `generationOf(box) = round((box.x - PAD)/(BOX_W+H_GAP))` — that X-based math only works for the horizontal pedigree. Generalize to focal-relative directions that work in all three orientations, and have each chart pass its orientation.

**Files:**
- Create: helper in `src/renderer/composables/useChartKeyboardNav.ts`
- Modify: the three chart components (pass orientation + wire `@box-keydown`)
- Test: `tests/components/chart-parity.test.ts` (added in Task 15)

- [x] **(Tier 1) Step 1: Orientation→axis mapping — LOCKED (user-approved 2026-06-07)**

The mapping is decided; implement it directly (no escalation):
- **Pedigree** (focal left, ancestors right): ArrowRight = toward ancestors, ArrowLeft = toward focal, ArrowUp/Down = sibling in same generation. *(current behavior — keep)*
- **Hourglass** (focal center, ancestors up, descendants down): ArrowUp = toward ancestors, ArrowDown = toward descendants, ArrowLeft/Right = spouse/sibling on focal row.
- **Descendant** (focal top, descendants down): ArrowDown = toward descendants, ArrowUp = toward focal, ArrowLeft/Right = sibling.

- [ ] **(Tier 1) Step 2: Write the failing test**

In `tests/components/chart-parity.test.ts`, add a case mounting `<ChartCanvas>` with a seeded multi-gen layout, focus a box, dispatch `Arrow*` keydowns, and assert focus moves to the geometrically-correct neighbor for each orientation.

- [ ] **(Tier 1) Step 3: Implement `useChartKeyboardNav`** *(after go-ahead)*

Create `src/renderer/composables/useChartKeyboardNav.ts` exporting `onBoxKeydown(event, box, opts: { boxes, orientation, scrollEl, onActivate })` that resolves the target box by geometry (using `box.x`/`box.y` neighbors per orientation, not the pedigree-only X formula) and calls `.focus()` on the target's `[data-testid]` element. Each chart passes `orientation: 'pedigree' | 'hourglass' | 'descendant'` via the `@box-keydown` handler.

- [ ] **(Tier 1) Step 4: Verify + commit**

Run: `npx vitest run tests/components/chart-parity.test.ts` → all green.

```bash
git add src/renderer/composables/useChartKeyboardNav.ts src/renderer/components/charts/PedigreeChart.vue src/renderer/components/charts/HourglassChart.vue src/renderer/components/charts/DescendantChart.vue tests/components/chart-parity.test.ts
git commit -m "feat(charts): arrow-key tree navigation in all three charts (parity)"
```

---

## Phase E — Verification + close-out

### Task 15: Write the parity test

**Files:**
- Create: `tests/components/chart-parity.test.ts`

- [ ] **(Tier 1) Step 1: Write the test**

Mount `<ChartCanvas>` with a seeded `ChartLayout` (2 boxes incl. a focal, 1 placeholder, 1 collapse button). Assert the shared behaviors that constitute "the charts behave identically":

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ChartCanvas from '../../src/renderer/components/charts/ChartCanvas.vue';
import type { ChartLayout, BoxLayout } from '../../src/renderer/utils/chart-layout/types';
import { PLACEHOLDER_PREFIX } from '../../src/renderer/utils/chart-layout/hourglass-tree';
import en from '../../src/renderer/i18n/en';

function box(id: string, isFocal = false, x = 0, y = 0): BoxLayout {
  return { person: { id, givenName: 'A', surname: 'B', preferredName: null, nickname: null, sex: 'U', living: true, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null }, isFocal, x, y, w: 180, h: 56 };
}

const layout: ChartLayout = {
  boxes: [box('focal', true, 0, 100), box('p2', false, 220, 100)],
  lines: [], paths: [], svgWidth: 500, svgHeight: 300, viewBoxMinY: 0,
  collapseButtons: [{ personId: 'focal', direction: 'right', cx: 190, cy: 128, isExpanded: true }],
  placeholders: [{ type: 'placeholder', role: 'father', childPersonId: 'focal', x: 220, y: 0 }],
  placeholderLines: [],
};

function mountCanvas() {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });
  return mount(ChartCanvas, {
    props: { layout, tree: {}, loading: false, zoom: 1, isPanning: false, selectedId: 'focal', ariaLabel: 'a11y.pedigreeChart', addBtnStyle: 'plus', readonly: false },
    global: { plugins: [i18n] },
  });
}

describe('chart parity (shared ChartCanvas)', () => {
  it('renders role=tree on the svg and role=treeitem on every box', () => {
    const w = mountCanvas();
    expect(w.find('svg[role="tree"]').exists()).toBe(true);
    expect(w.findAll('[role="treeitem"]')).toHaveLength(2);
  });

  it('emits focus-person on box double-click (re-root)', async () => {
    const w = mountCanvas();
    await w.find('[data-testid="person-box-focal"]').trigger('dblclick');
    expect(w.emitted('focus-person')?.[0]).toEqual(['focal']);
  });

  it('emits navigate on box click', async () => {
    const w = mountCanvas();
    await w.find('[data-testid="person-box-p2"]').trigger('click');
    expect(w.emitted('navigate')?.[0]).toEqual(['p2']);
  });

  it('emits person-context-menu from the + affordance', async () => {
    const w = mountCanvas();
    await w.find('.add-relative-btn').trigger('click');
    expect(w.emitted('person-context-menu')).toBeTruthy();
  });

  it('emits add-from-placeholder when a ghost box is activated', async () => {
    const w = mountCanvas();
    await w.find('.ghost-box').trigger('click');
    expect(w.emitted('add-from-placeholder')?.[0]?.[0]).toMatchObject({ role: 'father', childPersonId: 'focal' });
  });

  it('emits collapse-toggle on collapse-button click', async () => {
    const w = mountCanvas();
    await w.find('.collapse-btn').trigger('click');
    expect(w.emitted('collapse-toggle')).toBeTruthy();
  });
});
```

- [ ] **(Tier 1) Step 2: Add the structural delegation guard**

Append a second `describe` that shallow-mounts each of the three chart components (stub `window.api` minimally so `useEntityData` doesn't throw) and asserts `findComponent(ChartCanvas).exists()` is true — proving no chart reintroduced bespoke rendering. If full mount is too heavy, assert on the component source instead:

```typescript
import { readFileSync } from 'node:fs';
for (const f of ['PedigreeChart', 'HourglassChart', 'DescendantChart']) {
  it(`${f} renders via ChartCanvas`, () => {
    const src = readFileSync(`src/renderer/components/charts/${f}.vue`, 'utf8');
    expect(src).toMatch(/<ChartCanvas/);
    expect(src).not.toMatch(/<svg[^>]*role="tree"/); // bespoke SVG shell is gone
  });
}
```

- [ ] **(Tier 1) Step 3: Run + verify**

Run: `npx vitest run tests/components/chart-parity.test.ts`
Expected: all cases pass.

- [ ] **(Tier 1) Step 4: Commit**

```bash
git add tests/components/chart-parity.test.ts
git commit -m "test(charts): chart-parity test asserts shared ChartCanvas behaviors"
```

---

### Task 16: Dev-MCP visual confirmation

> UI verification via dev MCP is Tier 1 standard practice per `.claude/rules/mandate.md` — not optional escalation.

**Files:** none (capture evidence).

- [ ] **(Tier 1) Step 1: Launch + seed**

Per `tauri-dev` / `slaktforskning-mcp-dev` skills: `npm start`, then via the dev MCP seed (or open an existing DB with) a person who has ≥3 generations of ancestors AND descendants AND a spouse.

- [ ] **(Tier 1) Step 2: For each of Pedigree / Hourglass / Descendant**

Capture screenshots and confirm:
1. Select a non-focal person → the viewport pans it into view (Task 12) — same in all three.
2. Double-click a person → tree re-roots (Task 11) — same in all three.
3. Tab to a box, press arrows → focus traverses per the Task-14 mapping (or, if Task 14 was deferred, Enter/Space activates in all three).
4. Box rendering (name/dates/portrait/+) is pixel-consistent across the three.

- [ ] **(Tier 1) Step 3: Record evidence**

Paste the screenshot paths + a one-line per-chart confirmation into the Task 17 evidence block.

---

### Task 17: Full verification sweep

**Files:** none (capture evidence for close-out).

- [ ] **(Tier 1) Step 1: Unit + component tests**

Run: `npm test`
Expected: all pass; capture the `N passed (Xs)` summary line. The new `extract-placeholders.test.ts` and `chart-parity.test.ts` are included; `chartLayout.test.ts` still `130 passed`.

- [ ] **(Tier 1) Step 2: Build**

Run: `npm run build`
Expected: exit 0; capture the `built in Xs` tail line.

- [ ] **(Tier 1) Step 3: e2e (UI-touching plan → full tier required)**

This plan touches panels/charts (a `data-changed` consumer + chart components), so per CLAUDE.md the full tier is required.
Run: `npm run test:e2e:full`
Expected: `N passed (Xs)` across the 7 projects. Capture per-project pass counts.

- [ ] **(Tier 1) Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **(Tier 1) Step 5: Commit the evidence block**

Capture all of the above (test summary, build tail, e2e per-project counts, dev-MCP confirmations from Task 16) — they go into the close-out commit message in Task 18.

---

### Task 18: Close out

- [ ] **(Tier 1) T-final — Invoke `/close-out` skill.** The skill walks the 6+1 steps (mark checkboxes, `git mv` plan + `-design.md` to `docs/plans/archive/`, version bump — feature ⇒ minor — + CHANGELOG block via `oss-release`, `docs/PLAN.md` sync incl. removing the parked hourglass-refactor reopen-trigger entry which this plan supersedes, archive PLAN.md append, commit, merge/push), captures evidence, refuses partial. Also delete `docs/plans/2026-05-14-hourglass-layout-refactor-design.md` as superseded (note in archive PLAN.md that it was authored, deferred, and superseded by this plan).

---

## Self-Review

**Spec coverage:** ✅ findPerson dedup (T1), extractPlaceholders (T2), useChartBox (T3-6), ChartCanvas (T7-10), double-click re-root parity (T11), selection auto-pan (T12), ARIA (T13), arrow-key nav (T14), parity test (T15), dev-MCP confirm (T16), 130-test guard at every layout-touching task, grep gates (T1/T2). All spec sections map to a task.

**Placeholder scan:** Real code in every code step; moves cite exact source line ranges; tests are complete. T14 is gated Tier 3 with an explicit degraded-outcome fallback (not a placeholder — a genuine human-decision carve).

**Type consistency:** `ChartLayout`/`BoxLayout`/`PlaceholderBox`/`CollapseButton` per `types.ts`; `extractPlaceholders` returns `{ boxes, placeholders }` used identically in T2/T15; `useChartBox` opts (`colors`/`colorMode`/`selectedId`) consistent T3→T4-6; `<ChartCanvas>` props/emits defined T7, bound identically T8-10.

**Risk note:** the behavior-preserving guard is the 130-test `chartLayout.test.ts` suite, re-run at T1/T2/T4/T8/T9/T10. Any red there means an extraction changed layout shape — fix the extraction, never loosen the assertion (per Failure modes in the spec).

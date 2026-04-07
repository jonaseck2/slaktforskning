# Plan: Shared CircleChartSvg Component

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the circle chart SVG rendering into a shared `CircleChartSvg.vue` so that `CircleChart.vue` (interactive) and `AncestorBookReport.vue` (print) both use the same implementation.

**Architecture:** A pure presentation component that receives `segments`, `focalSegment`, and display options as props. The interactive wrapper (`CircleChart.vue`) continues to own zoom/pan/data-fetching; the report uses it directly with `curvedText=true` and `fontFamily="Georgia, serif"`.

**Tech Stack:** Vue 3 Composition API, TypeScript, same SVG/circleLayout utilities already in use.

---

### Task 1: Create `CircleChartSvg.vue`

**Files:**
- Create: `src/renderer/components/charts/CircleChartSvg.vue`

- [ ] Define props interface:
```typescript
interface Props {
  segments: CircleSegment[];
  curvedText?: boolean;           // default false
  fontFamily?: string;            // default system sans-serif
  linkBase?: string | null;       // if set, wraps each segment in <a :href="`${linkBase}${person.id}`">
}
```

- [ ] Move the entire SVG element (defs + non-focal g loop + focal circle + focal text) from `CircleChart.vue` into the new component — keep identical logic, just parameterise `fontFamily` and `linkBase`.

- [ ] Add `lineDy()`, `givenLabel()`, `surnameLabel()`, `birthLabel()`, `deathLabel()`, `nameFontSize()`, `dateFontSize()` as local functions (copied verbatim from `CircleChart.vue`).

- [ ] Keep the focal date centering logic (`focalLineY`) as a local function.

- [ ] The component emits `navigate(personId: string)` when a non-focal segment is clicked (only when `linkBase` is null — i.e. interactive mode).

- [ ] Run `npm test` and confirm 462 tests pass.

- [ ] Commit: `refactor(circle-chart): extract CircleChartSvg shared SVG component`

### Task 2: Use `CircleChartSvg` in `CircleChart.vue`

**Files:**
- Modify: `src/renderer/components/charts/CircleChart.vue`

- [ ] Import and register `CircleChartSvg`.
- [ ] Replace the inline SVG block with `<CircleChartSvg :segments="layout" :curved-text="curvedText" @navigate="$emit('navigate', $event)" />`.
- [ ] Remove all the duplicated helper functions (givenLabel, surnameLabel, birthLabel, deathLabel, lineDy, nameFontSize, dateFontSize, focalLineY, wrapText, focalNameLines) — they now live in the child.
- [ ] Keep zoom/pan, generation selector, curved-text toggle in `CircleChart.vue`.
- [ ] Verify the interactive chart looks identical to before.
- [ ] Run `npm test`.
- [ ] Commit: `refactor(circle-chart): CircleChart uses shared CircleChartSvg`

### Task 3: Use `CircleChartSvg` in `AncestorBookReport.vue`

**Files:**
- Modify: `src/renderer/components/reports/AncestorBookReport.vue`

- [ ] Import `CircleChartSvg`.
- [ ] Replace the inline SVG block with:
```vue
<CircleChartSvg
  :segments="segments"
  :curved-text="true"
  font-family="Georgia, serif"
  link-base="'#person-'"
  class="ab-svg"
/>
```
- [ ] Remove the duplicated helper functions from the report (`givenLabel`, `surnameLabel`, `birthLabel`, `deathLabel`, `lineDy`, `nameFontSize`, `dateFontSize`, `focalLineY`, `wrapText`, `focalNameLines`, `focalDates`).
- [ ] Keep `lifespanStr`, `displayName`, `formatDate`, and all non-SVG report logic.
- [ ] Verify the exported report looks identical to before.
- [ ] Run `npm test`.
- [ ] Commit: `refactor(ancestor-book): use shared CircleChartSvg`

# Visualization & Reports Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify chart rendering — visualization components become the single pipeline for both interactive views and printable reports. Add standalone descendant chart. Remove old wall chart code.

**Architecture:** Each chart component gains a `readonly` prop that hides interactive controls. New thin report wrappers embed these components in print-friendly containers. A new DescendantChart component is added to both visualization tabs and reports.

**Tech Stack:** Vue 3 (Composition API), SVG, TypeScript, existing chart-layout utilities

---

### Task 1: Add `readonly` prop to PedigreeChart

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

- [ ] **Step 1: Add readonly prop**

Add to the props definition (currently at ~line 203):

```typescript
defineProps<{ personId: string | undefined; focusedPerson?: string | null; readonly?: boolean }>()
```

- [ ] **Step 2: Guard interactive controls**

Wrap these template sections with `v-if="!readonly"`:

1. **Add button on hover** (~lines 74-96): the `<g class="add-btn" ...>` block
2. **Collapse buttons** (~lines 98-118): the `v-for="btn in layout.collapseButtons"` block  
3. **Placeholder boxes** (~lines 126-150): the `v-for="ph in layout.placeholders"` block
4. **Add popover** (~lines 161-172): the popover div
5. **Zoom controls** (~lines 153-158): the zoom button group

On person boxes (~line 29), make click conditional:
```
@click="!readonly && ('navigate', box.person.id)"
```

Set cursor style: `:style="{ cursor: readonly ? 'default' : 'pointer' }"`

- [ ] **Step 3: Verify app still works**

Run: `npm start` — navigate to Visualization > Pedigree, confirm all interactive features still work (no `readonly` prop passed = default false).

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "feat: add readonly prop to PedigreeChart"
```

---

### Task 2: Add `readonly` prop to HourglassChart

**Files:**
- Modify: `src/renderer/components/charts/HourglassChart.vue`

- [ ] **Step 1: Add readonly prop**

```typescript
defineProps<{ personId: string | undefined; readonly?: boolean }>()
```

- [ ] **Step 2: Guard interactive controls**

Wrap with `v-if="!readonly"`:

1. **Add button on hover** (~lines 66-88): the `<g class="add-btn">` block
2. **Collapse buttons** (~lines 90-110): the `v-for="btn in layout.collapseButtons"` block
3. **Add popover** (~lines 122-133): the popover div
4. **Zoom controls** (~lines 113-118): the zoom button group

On person boxes (~line 24), make click conditional:
```
@click="!readonly && ('navigate', box.person.id)"
```

Set cursor: `:style="{ cursor: readonly ? 'default' : 'pointer' }"`

- [ ] **Step 3: Verify and commit**

```
npm test && git add -A && git commit -m "feat: add readonly prop to HourglassChart"
```

---

### Task 3: Add `readonly` prop to TimelineChart

**Files:**
- Modify: `src/renderer/components/charts/TimelineChart.vue`

- [ ] **Step 1: Add readonly prop**

```typescript
defineProps<{ personId: string | undefined; readonly?: boolean }>()
```

- [ ] **Step 2: Guard interactive controls**

1. **Zoom controls** (~lines 83-88): wrap with `v-if="!readonly"`
2. **Timeline bars** (~line 47): make click conditional:
   ```
   @click="!readonly && ('navigate', bar.person.id)"
   ```
3. Set cursor: `:style="{ cursor: readonly ? 'default' : 'pointer' }"`

- [ ] **Step 3: Verify and commit**

```
npm test && git add -A && git commit -m "feat: add readonly prop to TimelineChart"
```

---

### Task 4: Create descendant layout algorithm

**Files:**
- Create: `src/renderer/utils/chart-layout/descendant.ts`
- Modify: `src/renderer/utils/chart-layout/index.ts` (add export)

- [ ] **Step 1: Create descendant.ts**

Port the descendant layout logic from `hourglass.ts` (`subtreeExtents` and `placeDescendants`) into a standalone function. The hourglass version places descendants relative to a focal offset; this version starts from y=0 with the focal at top.

```typescript
import type { DescendantNode, ChartLayout, ChartBox, ChartLine, CollapseButton } from './types';
import { BOX_W, BOX_H, V_GAP, GEN_GAP } from './constants';

export function computeDescendantLayout(
  root: DescendantNode,
  maxGenerations: number,
  collapsed: Set<string> = new Set(),
): ChartLayout {
  const boxes: ChartBox[] = [];
  const lines: ChartLine[] = [];
  const collapseButtons: CollapseButton[] = [];
  const M = maxGenerations;

  function subtreeExtents(node: DescendantNode, depth: number): [number, number] {
    const half = BOX_W / 2;
    if (depth >= M || node.children.length === 0) return [half, half];
    const key = `${node.person.id}:down`;
    if (depth > 0 && collapsed.has(key)) return [half, half];

    const n = node.children.length;
    const childExts = node.children.map(c => subtreeExtents(c, depth + 1));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftExt  = Math.max(half, totalSpan / 2 + childExts[0][0]);
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]);
    return [leftExt, rightExt];
  }

  function rowY(depth: number): number {
    return depth * (BOX_H + GEN_GAP);
  }

  function place(node: DescendantNode, depth: number, cx: number): void {
    boxes.push({
      person: node.person,
      isFocal: depth === 0,
      x: cx - BOX_W / 2,
      y: rowY(depth),
      w: BOX_W,
      h: BOX_H,
    });

    const key = `${node.person.id}:down`;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(key);

    // Collapse button
    if (depth < M && (hasChildren || node.hasMoreChildren)) {
      collapseButtons.push({
        personId: node.person.id,
        direction: 'down',
        cx,
        cy: rowY(depth) + BOX_H + 10,
        isExpanded: hasChildren && !isCollapsed,
        isLoadMore: !hasChildren && !!node.hasMoreChildren,
      });
    }

    if (depth >= M || !hasChildren || (depth > 0 && isCollapsed)) return;

    const n = node.children.length;
    const childExts = node.children.map(c => subtreeExtents(c, depth + 1));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const startX = cx - totalSpan / 2;

    const forkY = rowY(depth) + BOX_H + GEN_GAP / 2;
    lines.push({ x1: cx, y1: rowY(depth) + BOX_H, x2: cx, y2: forkY });

    for (let i = 0; i < n; i++) {
      const childCX = startX + offsets[i] + childExts[i][0];
      lines.push({ x1: childCX, y1: forkY, x2: childCX, y2: rowY(depth + 1) });
      place(node.children[i], depth + 1, childCX);
    }

    if (n > 1) {
      const leftCX = startX + childExts[0][0];
      const rightCX = startX + offsets[n - 1] + childExts[n - 1][0];
      lines.push({ x1: leftCX, y1: forkY, x2: rightCX, y2: forkY });
    }
  }

  const [leftExt, rightExt] = subtreeExtents(root, 0);
  const rootCX = leftExt;
  place(root, 0, rootCX);

  const width = leftExt + rightExt;
  const maxDepth = Math.max(...boxes.map(b => b.y)) + BOX_H;

  return { boxes, lines, collapseButtons, placeholders: [], width, height: maxDepth };
}
```

- [ ] **Step 2: Export from index.ts**

Add to `src/renderer/utils/chart-layout/index.ts`:
```typescript
export { computeDescendantLayout } from './descendant';
```

- [ ] **Step 3: Commit**

```
npm test && git add -A && git commit -m "feat: add descendant chart layout algorithm"
```

---

### Task 5: Create DescendantChart component

**Files:**
- Create: `src/renderer/components/charts/DescendantChart.vue`

- [ ] **Step 1: Create the component**

Model after HourglassChart but simpler — only descendants, no ancestor section. Use the same SVG box rendering pattern, same CSS classes, same tooltip.

Props:
```typescript
defineProps<{ personId: string | undefined; readonly?: boolean }>()
```

Emits:
```typescript
defineEmits<{ navigate: [id: string]; reload: [] }>()
```

Key implementation:
- Fetch data via `fetchDescendantTree(personId, 0, 4)` from `chartData.ts`
- Compute layout via `computeDescendantLayout(tree, 4, collapsed)`
- Render SVG boxes with the same template structure as HourglassChart (person name, dates, sex colors)
- Collapse buttons: toggle `collapsed` set entries, recompute layout
- Load more: call `loadChildrenForNode(tree, personId)` to expand
- `readonly` prop: hide collapse buttons, zoom controls, disable click navigation (same pattern as Tasks 1-3)
- Include generation depth selector (1-5, default 4)
- Include zoom controls (+, −, reset)

Use `ChartTooltip` for hover info, same as other charts.

- [ ] **Step 2: Verify standalone rendering**

Import in VisualizationView temporarily, confirm it renders a descendant tree.

- [ ] **Step 3: Commit**

```
git add -A && git commit -m "feat: add DescendantChart component"
```

---

### Task 6: Add Descendants tab to VisualizationView

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Update tab type and buttons**

Change TabName type (~line 142):
```typescript
type TabName = 'pedigree' | 'circle' | 'hourglass' | 'descendants' | 'timeline';
```

Add tab button in the tab bar (after hourglass, before timeline):
```vue
<button role="tab" :class="['tab-btn', { active: activeTab === 'descendants' }]"
  :aria-selected="activeTab === 'descendants'"
  @click="setTab('descendants')">{{ ('viz.tabDescendants') }}</button>
```

- [ ] **Step 2: Add chart rendering**

Add after the hourglass section:
```vue
<DescendantChart
  v-if="activeTab === 'descendants'"
  :person-id="focalPerson?.id"
  @navigate="navigateTo"
  @reload="reload"
/>
```

Import the component:
```typescript
import DescendantChart from '../components/charts/DescendantChart.vue';
```

- [ ] **Step 3: Add i18n keys**

en.ts — add to the `viz` section:
```
tabDescendants: 'Descendants',
```

sv.ts — add to the `viz` section:
```
tabDescendants: 'Efterkommande',
```

- [ ] **Step 4: Verify and commit**

```
npm test && git add -A && git commit -m "feat: add Descendants tab to visualization view"
```

---

### Task 7: Create chart report wrappers

**Files:**
- Create: `src/renderer/components/reports/PedigreeChartReport.vue`
- Create: `src/renderer/components/reports/DescendantChartReport.vue`
- Create: `src/renderer/components/reports/CircleChartReport.vue`
- Create: `src/renderer/components/reports/TimelineChartReport.vue`

- [ ] **Step 1: Create PedigreeChartReport.vue**

Thin wrapper that embeds PedigreeChart in readonly mode:

```vue
<template>
  <div class="chart-report">
    <PedigreeChart :person-id="personId" :readonly="true" />
  </div>
</template>

<script setup lang="ts">
import PedigreeChart from '../charts/PedigreeChart.vue';

defineProps<{ personId: string }>();
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}
.chart-report :deep(.chart-scroll) {
  overflow: visible;
  height: auto;
}
.chart-report :deep(svg) {
  width: 100%;
  height: auto;
}
</style>
```

Note: the `:deep()` selectors override the chart's scroll container to make SVG fill the print area instead of being scrollable.

- [ ] **Step 2: Create DescendantChartReport.vue**

Same pattern:
```vue
<template>
  <div class="chart-report">
    <DescendantChart :person-id="personId" :readonly="true" />
  </div>
</template>

<script setup lang="ts">
import DescendantChart from '../charts/DescendantChart.vue';

defineProps<{ personId: string }>();
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}
.chart-report :deep(.chart-scroll) {
  overflow: visible;
  height: auto;
}
.chart-report :deep(svg) {
  width: 100%;
  height: auto;
}
</style>
```

- [ ] **Step 3: Create CircleChartReport.vue**

Wraps CircleChartSvg (not CircleChart, since the wrapper has its own zoom/controls). Uses `fetchAllAncestors` + `computeCircleLayout` directly, same as CircleChart does internally. Adds a generation depth selector.

```vue
<template>
  <div class="chart-report">
    <div class="circle-controls">
      <label>
        {{ ('reports.generations') }}
        <select v-model.number="generations">
          <option v-for="n in 6" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
    </div>
    <CircleChartSvg
      v-if="layout.length > 0"
      :segments="layout"
      :focal-segment="focalSegment"
      :curved-text="true"
      width="100%"
      height="auto"
    />
    <div v-else-if="loading" class="empty-hint">{{ ('common.loading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import CircleChartSvg from '../charts/CircleChartSvg.vue';
import { fetchAllAncestors } from '../../utils/chartData';
import { computeCircleLayout } from '../../utils/circleLayout';
import type { CircleSegment } from '../../utils/circleLayout';

const props = defineProps<{ personId: string }>();
const { t } = useI18n();

const generations = ref(4);
const layout = ref<CircleSegment[]>([]);
const focalSegment = ref<CircleSegment | null>(null);
const loading = ref(false);

async function load() {
  if (!props.personId) return;
  loading.value = true;
  const { ancestors } = await fetchAllAncestors(props.personId);
  const result = computeCircleLayout(ancestors, generations.value);
  layout.value = result.segments;
  focalSegment.value = result.focal;
  loading.value = false;
}

watch([() => props.personId, generations], load, { immediate: true });
</script>

<style scoped>
.chart-report { width: 100%; }
.circle-controls { margin-bottom: 12px; }
.circle-controls select { margin-left: 8px; }
</style>
```

Note: check exact return shape of `computeCircleLayout` and `fetchAllAncestors` — the above is the pattern, adapt to actual signatures.

- [ ] **Step 4: Create TimelineChartReport.vue**

```vue
<template>
  <div class="chart-report">
    <TimelineChart :person-id="personId" :readonly="true" />
  </div>
</template>

<script setup lang="ts">
import TimelineChart from '../charts/TimelineChart.vue';

defineProps<{ personId: string }>();
</script>

<style scoped>
.chart-report {
  width: 100%;
  overflow: visible;
}
.chart-report :deep(.chart-scroll) {
  overflow: visible;
  height: auto;
}
.chart-report :deep(svg) {
  width: 100%;
  height: auto;
}
</style>
```

- [ ] **Step 5: Commit**

```
git add -A && git commit -m "feat: add chart report wrappers for print"
```

---

### Task 8: Replace wall chart tab with 4 chart reports in ReportsView

**Files:**
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Add i18n keys**

en.ts — add to `reports` section:
```
tabPedigreeChart: 'Pedigree Chart',
tabDescendantChart: 'Descendant Chart',
tabCircleChart: 'Circle Chart',
tabTimeline: 'Timeline',
```

sv.ts — add to `reports` section:
```
tabPedigreeChart: 'Stamtavla',
tabDescendantChart: 'Efterkommande',
tabCircleChart: 'Cirkeldiagram',
tabTimeline: 'Tidslinje',
```

- [ ] **Step 2: Update tabs array**

Replace the wallChart tab entry in the `tabs` computed (~line 296-305):

```typescript
const tabs = computed(() => [
  { id: 'ancestor', label: t('reports.tabAncestor') },
  { id: 'family', label: t('reports.tabFamily') },
  { id: 'individual', label: t('reports.tabIndividual') },
  { id: 'ancestorBook', label: t('reports.tabAncestorBook') },
  { id: 'biography', label: t('reports.tabBiography') },
  { id: 'placeHistory', label: t('reports.tabPlaceHistory') },
  { id: 'familyNarrative', label: t('reports.tabFamilyNarrative') },
  { id: 'pedigreeChart', label: t('reports.tabPedigreeChart') },
  { id: 'descendantChart', label: t('reports.tabDescendantChart') },
  { id: 'circleChart', label: t('reports.tabCircleChart') },
  { id: 'timeline', label: t('reports.tabTimeline') },
]);
```

Update the `activeTab` type union to replace `wallChart` with the 4 new IDs.

- [ ] **Step 3: Replace wall chart template section**

Remove the entire `<!-- Wall Chart Tab -->` section (~lines 215-266).

Add 4 new tab sections. Each follows the same pattern — a tab-content div with person picker (reuse existing `wallChartPersonId` or a shared ref), preview area with the chart report component, and zoom controls.

For pedigree, descendant, and timeline — use the same person-picker + preview pattern as other person-based reports.

For circle chart — same pattern.

Example for pedigree chart tab:
```vue
<div v-if="activeTab === 'pedigreeChart'" class="tab-content">
  <div class="tab-header">
    <div class="controls">
      <PersonPicker v-model="chartPersonId" :placeholder="('reports.selectPerson')" />
    </div>
    <div class="print-actions">
      <button class="btn-add btn-report-action" :disabled="!chartPersonId" @click="printReport">{{ ('reports.print') }}</button>
      <button class="btn-add btn-report-action" :disabled="!chartPersonId" @click="exportPdf">{{ ('reports.exportPdf') }}</button>
    </div>
  </div>
  <div ref="previewContainer" class="preview-area">
    <div v-if="chartPersonId" class="print-preview" :style="{ zoom: effectiveZoom }">
      <PedigreeChartReport :person-id="chartPersonId" />
    </div>
    <div v-else class="empty-hint">{{ ('reports.selectPersonFirst') }}</div>
    <div class="zoom-floating">
      <button class="zoom-btn" :disabled="effectiveZoom <= 0.2" @click="zoomOut">&#x2212;</button>
      <span class="zoom-label">{{ Math.round(effectiveZoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomIn">+</button>
      <button class="zoom-btn zoom-fit-btn" @click="resetZoom">{{ ('reports.zoomFit') }}</button>
    </div>
  </div>
</div>
```

Repeat the same pattern for descendantChart, circleChart, and timeline tabs.

- [ ] **Step 4: Remove old wall chart imports and state**

Remove:
- `import WallChartReport` 
- `wallChartType`, `wallChartPaperSize`, `wallChartTiled`, `wallChartGenerations` refs
- `paperSizeOptions`, `onWallChartSvgReady`, `saveWallChartSvg`, `printWallChart` functions
- Any wall-chart-specific state/methods

Add:
- `import PedigreeChartReport`, `DescendantChartReport`, `CircleChartReport`, `TimelineChartReport`
- `chartPersonId` ref (shared across the 4 chart tabs, initialized from focusStore)

- [ ] **Step 5: Verify and commit**

```
npm test && git add -A && git commit -m "feat: replace wall chart with 4 chart-based reports"
```

---

### Task 9: Delete old wall chart code

**Files:**
- Delete: `src/renderer/components/reports/WallChartReport.vue`
- Delete: `src/api/reports/wall_chart.ts`

- [ ] **Step 1: Delete files**

```bash
rm src/renderer/components/reports/WallChartReport.vue
rm src/api/reports/wall_chart.ts
```

- [ ] **Step 2: Remove stale i18n keys**

Remove the `wallChart` section from both `en.ts` and `sv.ts` (the entire block ~lines 594-606 in en.ts).

- [ ] **Step 3: Verify no broken imports**

```bash
npm test
grep -r "WallChartReport\|wall_chart" src/ --include="*.ts" --include="*.vue"
```

The grep should return no results. If any remain, remove them.

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "chore: remove old wall chart code"
```

---

### Task 10: Update documentation

**Files:**
- Modify: `CLAUDE.md` — update component tables, route descriptions
- Modify: `docs/PLAN.md` — mark milestone, add implementation status row
- Move: `docs/plans/2026-04-11-visualization-reports-alignment.md` → `docs/plans/archive/`

- [ ] **Step 1: Update CLAUDE.md**

- Add DescendantChart to the components section
- Update ReportsView route description to list the new chart reports
- Add report wrapper components to the shared components table
- Remove WallChartReport references

- [ ] **Step 2: Update PLAN.md**

Add implementation status row. Move plan to archive.

- [ ] **Step 3: Version bump**

Bump `package.json` minor version (new feature: descendant chart + report alignment).

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "docs: update CLAUDE.md and PLAN.md for chart alignment"
```

---

### Task 11: Visual verification

- [ ] **Step 1: Test each visualization tab**

Launch app (`npm start`), select a person with descendants:
- Pedigree tab: renders, interactive controls work
- Circle tab: renders, generation selector works
- Hourglass tab: renders, collapse/expand works
- **Descendants tab**: renders standalone descendant tree, collapse/expand works, click navigates
- Timeline tab: renders

- [ ] **Step 2: Test each chart report**

Go to Reports view:
- Pedigree Chart: select person, chart renders in readonly mode, no interactive buttons visible
- Descendant Chart: select person, chart renders, no interactive buttons
- Circle Chart: select person, generation selector works, chart renders
- Timeline: select person, timeline renders in readonly mode

- [ ] **Step 3: Test print**

Click Print on each chart report — verify browser print dialog shows the chart filling the page.

- [ ] **Step 4: Final commit if any fixes needed**

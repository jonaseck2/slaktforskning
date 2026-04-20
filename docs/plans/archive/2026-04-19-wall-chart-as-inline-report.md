# Wall Chart as Inline Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the modal-based wall chart UX with an inline tab in `ReportsView`, matching the pattern of every other report tab. Remove the wall chart button from `VisualizationView` (it is an export, not a chart-browser feature).

**Architecture:** Extract SVG generation from `WallChartModal.vue` into a new prop-driven `WallChartReport.vue` component (sibling of `CircleChartReport`, `PedigreeChartReport`, etc.). `ReportsView.vue` owns the `wallOptions` reactive, the controls row above the preview, the export buttons, and the paper-sized preview wrapper. The existing `ZoomControls` + `fitZoom` ResizeObserver math becomes per-tab so it scales any paper size to fit. Delete `WallChartModal.vue`. Remove the wall-chart entry points from `VisualizationView.vue`.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vitest, Electron Forge + Vite. SVG generation lives in `src/api/wall-charts.ts` (unchanged).

**Spec:** `docs/plans/2026-04-19-wall-chart-as-inline-report-design.md`

---

### Task 1: Create `WallChartReport.vue` component

**Files:**
- Create: `src/renderer/components/reports/WallChartReport.vue`

This is a pure rendering component that takes the 11 wall chart options as props, fetches the tree, generates the SVG, and emits `svgGenerated` so the parent can cache the SVG for export. It does NOT render the controls or export buttons — that lives in `ReportsView.vue` (Task 2).

- [ ] **Step 1: Create the component file**

Path: `src/renderer/components/reports/WallChartReport.vue`

```vue
<template>
  <div class="wall-chart-report">
    <div v-if="generating" class="report-loading">{{ $t('common.loading') }}</div>
    <div v-else-if="svgContent" class="report-svg" v-html="svgContent"></div>
    <div v-else class="report-empty">{{ $t('wallChart.noPreview') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  computeTileViewBoxes,
  getPaperDimensions,
  type WallChartOptions,
} from '../../../api/wall-charts';
import {
  fetchWallChartAncestorTree,
  fetchWallChartDescendantTree,
} from '../../utils/wallChartData';

const props = defineProps<{
  personId: string;
  options: WallChartOptions;
}>();

const emit = defineEmits<{
  svgGenerated: [svg: string];
  tilesChanged: [tiles: { count: number; rows: number; cols: number } | null];
}>();

const svgContent = ref<string | null>(null);
const generating = ref(false);

async function generateChart() {
  generating.value = true;
  svgContent.value = null;
  try {
    if (props.options.chartType === 'pedigree') {
      const tree = await fetchWallChartAncestorTree(props.personId, props.options.generations);
      svgContent.value = generatePedigreeWallChart(tree, props.options);
    } else {
      const tree = await fetchWallChartDescendantTree(props.personId, props.options.generations);
      svgContent.value = generateDescendantWallChart(tree, props.options);
    }
    emit('svgGenerated', svgContent.value);

    // Compute tile info
    const paper = getPaperDimensions(props.options);
    const MM_TO_PX = 3.7795275591;
    const W = Math.round(paper.width * MM_TO_PX);
    const H = Math.round(paper.height * MM_TO_PX);
    const tiles = computeTileViewBoxes(W, H);
    if (tiles.length <= 1) {
      emit('tilesChanged', null);
    } else {
      const maxRow = Math.max(...tiles.map(t => t.row)) + 1;
      const maxCol = Math.max(...tiles.map(t => t.col)) + 1;
      emit('tilesChanged', { count: tiles.length, rows: maxRow, cols: maxCol });
    }
  } catch (err) {
    console.error('Wall chart generation failed:', err);
  } finally {
    generating.value = false;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [props.personId, { ...props.options }],
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateChart, 400);
  },
  { deep: true },
);

onMounted(generateChart);
</script>

<style scoped>
.wall-chart-report {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.report-svg {
  width: 100%;
  height: 100%;
}
.report-svg :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}
.report-loading,
.report-empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No new errors related to `WallChartReport.vue`. (Pre-existing errors elsewhere are fine.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/reports/WallChartReport.vue
git commit -m "feat(reports): add WallChartReport prop-driven render component"
```

---

### Task 2: Inline the wall chart tab in `ReportsView.vue`

**Files:**
- Modify: `src/renderer/views/ReportsView.vue`

This task replaces the modal-trigger wallChart tab body with the inline pattern (controls row + paper-shaped preview + export buttons) and makes the `NATURAL_WIDTH` per-tab so the existing `fitZoom` math handles any paper size.

- [ ] **Step 1: Replace the wallChart tab `<template>` block**

In `src/renderer/views/ReportsView.vue`, locate the existing wallChart tab block (lines 229–245):

```vue
<!-- Wall Chart Tab -->
<div v-if="activeTab === 'wallChart'" class="tab-content">
  <div class="tab-header">
    <div class="controls"></div>
    <div class="print-actions">
      <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="showWallChartModal = true">{{ $t('wallChart.title') }}</AppButton>
    </div>
  </div>
  <div class="preview-area">
    <div v-if="chartPersonId" class="empty-hint">
      {{ $t('wallChart.noPreview') }}
      <br /><br />
      <AppButton variant="primary" @click="showWallChartModal = true">{{ $t('wallChart.title') }}</AppButton>
    </div>
    <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
  </div>
</div>
```

Replace it with:

```vue
<!-- Wall Chart Tab -->
<div v-if="activeTab === 'wallChart'" class="tab-content">
  <div class="tab-header">
    <div class="controls wall-chart-controls">
      <label class="control-narrow">
        {{ $t('wallChart.chartType') }}
        <select v-model="wallOptions.chartType">
          <option value="pedigree">{{ $t('wallChart.pedigree') }}</option>
          <option value="descendant">{{ $t('wallChart.descendant') }}</option>
        </select>
      </label>
      <label class="control-narrow">
        {{ $t('wallChart.paperSize') }}
        <select v-model="wallOptions.paperSize">
          <option v-for="size in paperSizeOptions" :key="size.value" :value="size.value">{{ size.label }}</option>
        </select>
      </label>
      <label v-if="wallOptions.paperSize === 'custom'" class="control-narrow">
        {{ $t('wallChart.widthMm') }}
        <input type="number" v-model.number="wallOptions.customWidth" min="100" max="2000" />
      </label>
      <label v-if="wallOptions.paperSize === 'custom'" class="control-narrow">
        {{ $t('wallChart.heightMm') }}
        <input type="number" v-model.number="wallOptions.customHeight" min="100" max="2000" />
      </label>
      <label class="control-narrow">
        {{ $t('wallChart.orientation') }}
        <select v-model="wallOptions.orientation">
          <option value="portrait">{{ $t('wallChart.portrait') }}</option>
          <option value="landscape">{{ $t('wallChart.landscape') }}</option>
        </select>
      </label>
      <label class="control-narrow">
        {{ $t('reports.generations') }}: {{ wallOptions.generations }}
        <input type="range" v-model.number="wallOptions.generations" :min="genMin" :max="genMax" />
      </label>
      <label class="control-narrow">
        {{ $t('wallChart.fontSize') }}
        <select v-model="wallOptions.fontSize">
          <option value="small">{{ $t('wallChart.fontSmall') }}</option>
          <option value="medium">{{ $t('wallChart.fontMedium') }}</option>
          <option value="large">{{ $t('wallChart.fontLarge') }}</option>
        </select>
      </label>
      <label class="control-narrow">
        {{ $t('wallChart.colorMode') }}
        <select v-model="wallOptions.colorMode">
          <option value="themed">{{ $t('wallChart.themed') }}</option>
          <option value="bw">{{ $t('wallChart.blackWhite') }}</option>
          <option value="sex-colored">{{ $t('wallChart.sexColored') }}</option>
        </select>
      </label>
      <fieldset class="content-fieldset">
        <legend>{{ $t('wallChart.content') }}</legend>
        <label class="checkbox-label"><input type="checkbox" v-model="wallOptions.showDates" /> {{ $t('wallChart.showDates') }}</label>
        <label class="checkbox-label"><input type="checkbox" v-model="wallOptions.showPlaces" /> {{ $t('wallChart.showPlaces') }}</label>
        <label class="checkbox-label"><input type="checkbox" v-model="wallOptions.showPhotos" /> {{ $t('wallChart.showPhotos') }}</label>
      </fieldset>
      <label class="control-wide">
        {{ $t('wallChart.chartTitle') }}
        <input type="text" v-model="wallOptions.title" />
      </label>
    </div>
    <div class="print-actions">
      <AppButton variant="secondary" size="sm" :disabled="!chartPersonId || !currentSvg" @click="exportWallSvg">{{ $t('wallChart.exportSvg') }}</AppButton>
      <AppButton variant="primary" size="sm" :disabled="!chartPersonId || !currentSvg" @click="exportWallPdf">{{ $t('wallChart.exportTiledPdf') }}</AppButton>
    </div>
  </div>
  <div ref="previewContainer" class="preview-area">
    <div v-if="chartPersonId" class="print-preview wall-chart-preview" :style="{ zoom: effectiveZoom, width: paperWidthMm, height: paperHeightMm }">
      <WallChartReport
        :person-id="chartPersonId"
        :options="wallOptions"
        @svg-generated="onWallSvgGenerated"
        @tiles-changed="onWallTilesChanged"
      />
    </div>
    <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
  </div>
  <div v-if="wallTileInfo" class="tile-info-hint">
    {{ $t('wallChart.tilesNeeded', { count: wallTileInfo.count, cols: wallTileInfo.cols, rows: wallTileInfo.rows }) }}
  </div>
</div>
```

- [ ] **Step 2: Remove the `<WallChartModal>` element from the template**

In the same file, locate (lines 264–269):

```vue
<WallChartModal
  v-if="showWallChartModal && chartPersonId"
  :person-id="chartPersonId"
  :person-name="focusStore.personName ?? ''"
  @close="showWallChartModal = false"
/>
```

Delete this entire block.

- [ ] **Step 3: Update the `<script setup>` block**

In `src/renderer/views/ReportsView.vue`:

a) Replace the `WallChartModal` import (line 291):

```ts
import WallChartModal from '../components/reports/WallChartModal.vue';
```

with:

```ts
import WallChartReport from '../components/reports/WallChartReport.vue';
import {
  computeTileViewBoxes,
  generateTileSvg,
  getPaperDimensions,
  type WallChartOptions,
  type FontSizePreset,
  type ColorMode,
} from '../../api/wall-charts';
```

b) Add `reactive` to the existing `vue` import. Change:

```ts
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
```

to:

```ts
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
```

c) Delete the `showWallChartModal` ref (line 368):

```ts
const showWallChartModal = ref(false);
```

d) After the existing `circleCurvedText` ref (around line 328), add the wall chart state:

```ts
// --- Wall chart state ---
const wallOptions = reactive<WallChartOptions>({
  chartType: 'pedigree',
  paperSize: 'A2',
  customWidth: 420,
  customHeight: 594,
  orientation: 'landscape',
  generations: 4,
  showDates: true,
  showPlaces: true,
  showPhotos: false,
  fontSize: 'medium' as FontSizePreset,
  colorMode: 'sex-colored' as ColorMode,
  title: '',
});
const currentSvg = ref<string | null>(null);
const wallTileInfo = ref<{ count: number; rows: number; cols: number } | null>(null);

const paperSizeOptions = computed(() => [
  { value: 'A4', label: 'A4 (210 \u00d7 297 mm)' },
  { value: 'A3', label: 'A3 (297 \u00d7 420 mm)' },
  { value: 'A2', label: 'A2 (420 \u00d7 594 mm)' },
  { value: 'A1', label: 'A1 (594 \u00d7 841 mm)' },
  { value: 'A0', label: 'A0 (841 \u00d7 1189 mm)' },
  { value: 'custom', label: t('wallChart.custom') },
]);

const genMin = computed(() => wallOptions.chartType === 'pedigree' ? 3 : 2);
const genMax = computed(() => wallOptions.chartType === 'pedigree' ? 12 : 8);

const wallPaperDims = computed(() => getPaperDimensions(wallOptions));
const paperWidthMm  = computed(() => `${wallPaperDims.value.width}mm`);
const paperHeightMm = computed(() => `${wallPaperDims.value.height}mm`);

function onWallSvgGenerated(svg: string) {
  currentSvg.value = svg;
}
function onWallTilesChanged(tiles: { count: number; rows: number; cols: number } | null) {
  wallTileInfo.value = tiles;
}

async function exportWallSvg() {
  if (!currentSvg.value) return;
  await (window.api as any).wallChart.saveSvg(currentSvg.value);
}

async function exportWallPdf() {
  if (!currentSvg.value) return;
  const paper = wallPaperDims.value;
  const MM_TO_PX = 3.7795275591;
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);
  if (tiles.length === 1) {
    await (window.api as any).wallChart.saveTiledPdf([currentSvg.value]);
  } else {
    const pages = tiles.map(tile => generateTileSvg(currentSvg.value!, tile));
    await (window.api as any).wallChart.saveTiledPdf(pages);
  }
}
```

e) Make the title default to the focal person's name when the focus changes. After the existing `coupleRelationships.value = options;` line in `onMounted` (around line 414), add:

```ts
// Default wall chart title from focal person
if (focusStore.personId && focusStore.personName) {
  wallOptions.title = t('reports.pedigreeTitle', { name: focusStore.personName });
}
```

And add a watcher just below the existing `watch(chartPersonId, triggerLoading);` (around line 377):

```ts
watch(() => focusStore.personName, (name) => {
  if (name && !wallOptions.title) {
    wallOptions.title = t('reports.pedigreeTitle', { name });
  }
});
```

- [ ] **Step 4: Make the `fitZoom` math per-tab**

The existing ResizeObserver computes `fitZoom = (clientWidth - 48) / NATURAL_WIDTH` where `NATURAL_WIDTH` is hardcoded to `794`. For the wallChart tab the natural width depends on paper size. Replace the constant with a computed.

In `src/renderer/views/ReportsView.vue`, find:

```ts
// Natural preview width in px (A4 at 96dpi ≈ 794px).
// The .print-preview has width: 210mm which Chromium renders as ~794px.
const NATURAL_WIDTH = 794;
```

Replace with:

```ts
const A4_NATURAL_WIDTH = 794;
const naturalWidth = computed(() => {
  if (activeTab.value === 'wallChart') {
    return Math.round(wallPaperDims.value.width * 3.7795275591);
  }
  return A4_NATURAL_WIDTH;
});
```

Then update the ResizeObserver `update` closure (around line 350) from:

```ts
const update = () => {
  const w = el.clientWidth - 48;
  if (w > 0) fitZoom.value = w / NATURAL_WIDTH;
};
```

to:

```ts
const update = () => {
  const w = el.clientWidth - 48;
  if (w > 0) fitZoom.value = w / naturalWidth.value;
};
```

And add a watcher so the fit re-computes when paper size or orientation changes (place near the existing `watch(activeTab, ...)` around line 360):

```ts
watch(naturalWidth, () => {
  const el = previewContainer.value;
  if (!el) return;
  const w = el.clientWidth - 48;
  if (w > 0) fitZoom.value = w / naturalWidth.value;
});
```

- [ ] **Step 5: Add styles for the wall chart controls**

In the `<style scoped>` block at the bottom of `ReportsView.vue`, add at the end (before the closing `</style>`):

```css
/* Wall chart-specific controls — denser layout than other report tabs */
.wall-chart-controls .control-narrow { min-width: 140px; }
.wall-chart-controls .control-wide   { min-width: 240px; flex: 1 1 240px; }
.wall-chart-controls .content-fieldset {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  margin: 0;
}
.wall-chart-controls .content-fieldset legend {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  padding: 0 4px;
}
.wall-chart-controls .checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: var(--space-sm) !important;
  font-weight: normal !important;
  min-width: 0 !important;
}
.wall-chart-preview {
  /* Override the fixed A4 width from .print-preview — width is set inline */
  padding: 0 !important;
  min-height: 0 !important;
}
.tile-info-hint {
  text-align: center;
  margin-top: var(--space-xs);
  font-size: var(--font-xs);
  color: var(--text-muted);
}
```

- [ ] **Step 6: Verify TypeScript compiles and lint passes**

Run:
```bash
npx vue-tsc --noEmit
npm run lint
```
Expected: No new errors related to `ReportsView.vue`. (Pre-existing errors elsewhere are fine.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/views/ReportsView.vue
git commit -m "feat(reports): inline wall chart tab with paper-shaped preview"
```

---

### Task 3: Remove the wall chart entry point from `VisualizationView.vue`

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`

- [ ] **Step 1: Remove the wall chart button**

In `src/renderer/views/VisualizationView.vue`, delete lines 35–37:

```vue
        <AppButton variant="ghost" size="sm" @click="showWallChartModal = true" :disabled="!personId">
          {{ $t('wallChart.tabWallChart') }}
        </AppButton>
```

- [ ] **Step 2: Remove the `<WallChartModal>` element**

In the same file, delete lines 117–124 (the comment + the modal):

```vue
    <!-- Wall Chart Modal -->
    <WallChartModal
      v-if="showWallChartModal && personId"
      :person-id="personId"
      :person-name="focusStore.personName ?? ''"
      :initial-chart-type="activeTab === 'descendants' ? 'descendant' : 'pedigree'"
      @close="showWallChartModal = false"
    />
```

- [ ] **Step 3: Remove the import**

In the same file, delete line 146:

```ts
import WallChartModal from '../components/reports/WallChartModal.vue';
```

- [ ] **Step 4: Remove the `showWallChartModal` ref**

In the same file, delete lines 180–181:

```ts
// Wall chart modal
const showWallChartModal = ref(false);
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No new errors related to `VisualizationView.vue`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/VisualizationView.vue
git commit -m "refactor(visualization): remove wall chart button (now lives in Reports)"
```

---

### Task 4: Delete `WallChartModal.vue` and clean up i18n

**Files:**
- Delete: `src/renderer/components/reports/WallChartModal.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Verify nothing else references the modal**

Run:
```bash
grep -rn "WallChartModal" src tests
```
Expected: No matches. (If any matches appear, fix them before deleting the file.)

- [ ] **Step 2: Delete the modal component**

```bash
git rm src/renderer/components/reports/WallChartModal.vue
```

- [ ] **Step 3: Verify nothing references `wallChart.noPreview`**

The `noPreview` i18n key was used by the now-deleted modal AND by the old wallChart-tab placeholder in `ReportsView`. The new inline `WallChartReport.vue` references it as the empty state when no SVG has been generated yet — so it is still in use.

Run:
```bash
grep -rn "wallChart.noPreview" src tests
```
Expected: At least one match (in `WallChartReport.vue`). If that is the only remaining reference, the key stays.

If you find no matches at all, remove the key from `src/renderer/i18n/sv.ts` (line 738) and `src/renderer/i18n/en.ts` (line 738).

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer/components/reports src/renderer/i18n
git commit -m "chore(reports): delete WallChartModal (replaced by inline WallChartReport)"
```

---

### Task 5: Verify in the running app

**Files:**
- None (manual verification + test/lint runs)

- [ ] **Step 1: Run lint and unit tests**

```bash
npm run lint
npm test
```
Expected: 0 lint errors. All tests pass (existing tests for `src/api/wall-charts.ts` are untouched and should still pass).

- [ ] **Step 2: Launch the app and exercise the new tab**

```bash
npm start
```

Verify the following manually:

1. Navigate to the family-tree view (Persons / Visualization). Confirm there is **no** "Wall Chart" button next to the chart tabs.
2. Pick a person with several generations of ancestors as the focal person.
3. Open Reports (`/reports`). Click the "Wall Chart" tab.
4. Confirm:
   - Configuration controls appear in a wrapped row above the preview (chart type, paper size, orientation, generations slider, font size, color mode, content checkboxes, title).
   - A paper-shaped preview renders inline (no modal).
   - Switching paper size from A2 to A0 makes the preview rectangle bigger and the auto-fit zoom shrinks it to fit the available width.
   - Switching orientation between portrait/landscape rotates the preview rectangle.
   - Changing chart type, generations, content checkboxes, etc. regenerates the SVG after ~400ms.
   - The ZoomControls in/out/reset buttons work.
   - When the SVG would span multiple tiles, a "X tiles needed" hint appears below the preview.
   - "Save SVG" produces a valid `.svg` file.
   - "Save Tiled PDF" produces a multi-page PDF when paper size requires tiling, single-page PDF otherwise.
5. Switch to another report tab (e.g. Ancestor Chart) and back. Confirm the wall chart preview stays correct, and that other tabs still preview at A4 (the per-tab natural width works correctly).

- [ ] **Step 3: If everything works, bump version**

This is a feature — bump the minor version. Edit `package.json` and bump `version` (e.g. `0.111.2` → `0.112.0`). Update `docs/PLAN.md` Done section with a one-line entry pointing to the spec.

```bash
git add package.json docs/PLAN.md
git commit -m "release: v0.112.0 — wall chart as inline report tab"
```

- [ ] **Step 4: Final lint pass**

```bash
npm run lint
```
Expected: 0 errors.

---

## Self-review notes

- **Spec coverage:** Every section of the spec maps to a task — Task 1 = new component; Task 2 = ReportsView changes (controls, preview, exports, per-tab natural width); Task 3 = VisualizationView removal; Task 4 = modal deletion + i18n cleanup; Task 5 = verification + version bump.
- **i18n note:** The spec said "the modal-specific `wallChart.noPreview` key is no longer referenced and can be removed" — but it actually IS used by the new `WallChartReport` as its empty-state message, so the plan keeps it (Task 4 Step 3 verifies this empirically rather than guessing).
- **No placeholders.** Every step has exact paths, exact code, and an expected outcome. The only "judgment call" steps are in Task 5 (manual UI verification), which is unavoidable for UI work.
- **Type consistency:** `WallChartOptions`, `getPaperDimensions`, `computeTileViewBoxes`, `generateTileSvg`, `generatePedigreeWallChart`, `generateDescendantWallChart`, `fetchWallChartAncestorTree`, `fetchWallChartDescendantTree` — all imported from existing modules and used the same way as in the deleted modal.

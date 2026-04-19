# Wall Chart Rollup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Wall Chart report tab and distribute its paper-size / orientation / color-mode / Save-SVG / Save-tiled-PDF controls across the four existing chart components (Pedigree, Hourglass, Descendant, Fan), mirroring FanChart's existing `ZoomControls`-slotted pattern.

**Architecture:**
- One shared `<ChartExportControls>` component slots into each chart's `<ZoomControls>` overlay. It owns paper-size + orientation + color-mode controls and the two export buttons (Save SVG, Save tiled PDF).
- One shared `useChartExport(svgRef, titleRef)` composable handles SVG serialization, tile math, and the IPC calls to save files.
- The wall-chart-specific SVG generators (`generatePedigreeWallChart`, `generateDescendantWallChart`) are deleted. The live chart components already render the SVG we want; export just serializes the live SVG.
- `src/api/wall-charts.ts` is renamed to `src/api/chart-export.ts` and trimmed to paper math + tile math only. The `wallChart:*` IPC channels are renamed to `chart:*`.
- The `wallChart` tab and all `wallChart.*` i18n keys are deleted. Chart title is auto-derived as `"{chart type} — {person name}"` (no user input).

**Tech Stack:** Vue 3 Composition API, TypeScript, Electron file-save IPC, Vitest for unit tests, existing `ZoomControls` component, existing chart components (`FanChart.vue`, `PedigreeChart.vue`, `HourglassChart.vue`, `DescendantChart.vue`).

**Pre-flight assumptions to verify in Task 1:**
- `src/renderer/components/ZoomControls.vue` renders slot children (confirmed — FanChart already slots into it).
- `window.api.wallChart.saveSvg` and `saveTiledPdf` work and will be cleanly renamed to `window.api.chart.*` with no external callers beyond `ReportsView.vue` (grep confirmed: only that one file).
- `src/renderer/utils/wallChartData.ts` is only used by `WallChartReport.vue` (verify in Task 1; if true, delete it).

---

## File Structure

**Create:**
- `src/renderer/components/ChartExportControls.vue` — shared control strip (paper size + orientation + color mode + Save SVG + Save tiled PDF).
- `src/renderer/composables/useChartExport.ts` — composable exposing `{ colorMode, paperSize, orientation, saveSvg(), savePdf(), tileCount }` given an SVG template ref and a computed title.
- `src/api/chart-export.ts` — renamed + trimmed `src/api/wall-charts.ts`.
- `tests/unit/chart-export.test.ts` — tests for `getPaperDimensions`, `computeTileViewBoxes`, `generateTileSvg` under the new module.

**Modify:**
- `src/renderer/components/charts/FanChart.vue` — replace inline color-mode button with `<ChartExportControls>` slot content.
- `src/renderer/components/charts/PedigreeChart.vue` — add `<ChartExportControls>` (adds color mode for first time).
- `src/renderer/components/charts/HourglassChart.vue` — add `<ChartExportControls>` (adds color mode for first time).
- `src/renderer/components/charts/DescendantChart.vue` — add `<ChartExportControls>` (adds color mode for first time).
- `src/renderer/views/ReportsView.vue` — delete wallChart tab registration, state, content block, export functions.
- `src/preload/index.ts` — rename `wallChart.saveSvg/saveTiledPdf` → `chart.saveSvg/saveTiledPdf`.
- `src/main/ipc/utility.ts` — rename IPC channels `wallChart:*` → `chart:*`.
- `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` — remove `wallChart.*` keys, add `chart.export.*` keys (paperSize, orientation, portrait, landscape, colorMode, themed, blackWhite, sexColored, saveSvg, saveTiledPdf, tilesNeeded).
- `CLAUDE.md` — update file map (wall-charts.ts → chart-export.ts), update chart component descriptions, update MCP/IPC refs if any.
- `docs/IPC_REFERENCE.md` — rename wallChart.* entries to chart.*.
- `docs/PLAN.md` — add roadmap entry.
- `package.json` — version bump to 0.128.0 (minor — feature-ish change).

**Delete:**
- `src/renderer/components/reports/WallChartReport.vue`
- `src/renderer/utils/wallChartData.ts` (if only used by WallChartReport — verify in Task 1)
- `src/api/wall-charts.ts` (replaced by `src/api/chart-export.ts`)
- `tests/unit/wall-charts.test.ts` (replaced by `tests/unit/chart-export.test.ts`)

---

## Task 1: Verify pre-flight assumptions

**Goal:** Confirm no external consumers exist that the plan does not account for. Cheap to do, expensive to miss.

- [ ] **Step 1: Search for all callers of wallChart IPC surface**

Run:
```bash
grep -rn "wallChart\." src/ --include="*.ts" --include="*.vue"
grep -rn "wall-charts" src/ tests/ --include="*.ts" --include="*.vue"
grep -rn "wallChartData" src/ tests/ --include="*.ts" --include="*.vue"
grep -rn "WallChartReport" src/ --include="*.ts" --include="*.vue"
grep -rn "generatePedigreeWallChart\|generateDescendantWallChart" src/ tests/
```

Expected callers (delete/rename these and nothing else):
- `src/preload/index.ts` — renames to `chart.*`
- `src/main/ipc/utility.ts` — renames channels
- `src/renderer/views/ReportsView.vue` — strips wall-chart code
- `src/renderer/components/reports/WallChartReport.vue` — deleted
- `src/renderer/utils/wallChartData.ts` — deleted
- `src/api/wall-charts.ts` — renamed to `chart-export.ts`
- `tests/unit/wall-charts.test.ts` — replaced by `chart-export.test.ts`

- [ ] **Step 2: Record any surprises**

If any caller outside the expected list exists, STOP and report it to the user before proceeding. Otherwise continue.

- [ ] **Step 3: Commit progress note if any unexpected callers found**

No commit needed if expected set matches.

---

## Task 2: Create `src/api/chart-export.ts` (rename + trim of `wall-charts.ts`)

**Goal:** A minimal pure module with only paper/tile utilities. No SVG generation. The live charts render their own SVG.

**Files:**
- Create: `src/api/chart-export.ts`
- Create: `tests/unit/chart-export.test.ts`
- Do NOT delete `src/api/wall-charts.ts` yet — other files still import from it.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/chart-export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PAPER_SIZES,
  getPaperDimensions,
  computeTileViewBoxes,
  generateTileSvg,
  type PaperSize,
  type Orientation,
  type ColorMode,
} from '../../src/api/chart-export';

describe('getPaperDimensions', () => {
  it('returns A4 portrait dimensions by default', () => {
    expect(getPaperDimensions({ paperSize: 'A4', orientation: 'portrait' }))
      .toEqual({ width: 210, height: 297 });
  });
  it('swaps width and height for landscape', () => {
    expect(getPaperDimensions({ paperSize: 'A4', orientation: 'landscape' }))
      .toEqual({ width: 297, height: 210 });
  });
  it('returns A2 dimensions when A2 is selected', () => {
    const dims = getPaperDimensions({ paperSize: 'A2', orientation: 'portrait' });
    expect(dims).toEqual({ width: 420, height: 594 });
  });
});

describe('computeTileViewBoxes', () => {
  it('returns a single tile when SVG fits on one A4 page', () => {
    const tiles = computeTileViewBoxes(500, 700);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].row).toBe(0);
    expect(tiles[0].col).toBe(0);
  });
  it('produces a grid for oversize SVG', () => {
    const tiles = computeTileViewBoxes(2000, 3000);
    expect(tiles.length).toBeGreaterThan(1);
    const cols = Math.max(...tiles.map(t => t.col)) + 1;
    const rows = Math.max(...tiles.map(t => t.row)) + 1;
    expect(cols * rows).toBe(tiles.length);
  });
});

describe('generateTileSvg', () => {
  it('wraps inner content in a new viewBox with crop marks', () => {
    const fullSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100"/></svg>';
    const tile = { x: 0, y: 0, width: 794, height: 1123, row: 0, col: 0 };
    const out = generateTileSvg(fullSvg, tile);
    expect(out).toContain('<svg');
    expect(out).toContain('viewBox="0 0 794 1123"');
    expect(out).toContain('<rect');
    expect(out).toContain('stroke="#000"'); // crop marks
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/chart-export.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/api/chart-export.ts`**

Copy the following from `src/api/wall-charts.ts`:
- `PAPER_SIZES` constant
- `computeTileViewBoxes` function (lines ~339–366)
- `generateTileSvg` function (lines ~372 onward)
- The `MM_TO_PX = 3.7795275591` constant
- The `escXml` helper (if `generateTileSvg` uses it — it doesn't, but double-check)

Define new, simpler types — do NOT copy `WallChartOptions`:

```typescript
export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'custom';
export type Orientation = 'portrait' | 'landscape';
export type ColorMode = 'themed' | 'bw' | 'sex-colored';

export interface PaperConfig {
  paperSize: PaperSize;
  orientation: Orientation;
  customWidth?: number;  // mm, required when paperSize === 'custom'
  customHeight?: number; // mm, required when paperSize === 'custom'
}

export function getPaperDimensions(cfg: PaperConfig): { width: number; height: number } {
  const base = cfg.paperSize === 'custom'
    ? { width: cfg.customWidth ?? 420, height: cfg.customHeight ?? 594 }
    : PAPER_SIZES[cfg.paperSize] ?? PAPER_SIZES.A2;
  return cfg.orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : base;
}
```

Do NOT copy: `generatePedigreeWallChart`, `generateDescendantWallChart`, `FONT_SIZES`, `WallChartOptions`, `WallChartPerson`, `WallChartAncestorTree`, `WallChartDescendantTree`, `ChartType`, `FontSizePreset`.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/chart-export.test.ts
```

Expected: PASS (3 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/api/chart-export.ts tests/unit/chart-export.test.ts
git commit -m "feat(chart-export): extract paper/tile utilities from wall-charts"
```

---

## Task 3: Rename IPC channels `wallChart:*` → `chart:*`

**Goal:** Rename the two IPC channels and the preload namespace. Keep the implementations identical.

**Files:**
- Modify: `src/main/ipc/utility.ts` (lines ~224 and ~240)
- Modify: `src/preload/index.ts` (lines 237–238)
- Modify: `src/renderer/views/ReportsView.vue` (temporary — will be deleted in Task 8 anyway, but rename now to keep types green)

- [ ] **Step 1: Rename the main-process handlers**

In `src/main/ipc/utility.ts`:
- `wrapHandler('wallChart:saveSvg', ...)` → `wrapHandler('chart:saveSvg', ...)`
- `wrapHandler('wallChart:saveTiledPdf', ...)` → `wrapHandler('chart:saveTiledPdf', ...)`

- [ ] **Step 2: Rename the preload bridge**

In `src/preload/index.ts` (around lines 235–240), change the `wallChart` namespace object to `chart`:

```typescript
chart: {
  saveSvg: (svgContent: string) => ipcRenderer.invoke('chart:saveSvg', svgContent),
  saveTiledPdf: (pages: string[]) => ipcRenderer.invoke('chart:saveTiledPdf', pages),
},
```

- [ ] **Step 3: Update the sole current caller (stops the build from breaking)**

In `src/renderer/views/ReportsView.vue` lines 534, 545, 548:
- `(window.api as any).wallChart.saveSvg` → `(window.api as any).chart.saveSvg`
- `(window.api as any).wallChart.saveTiledPdf` → `(window.api as any).chart.saveTiledPdf`

(This code will be deleted in Task 8. We just need the file to type-check in the interim.)

- [ ] **Step 4: Verify build**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/utility.ts src/preload/index.ts src/renderer/views/ReportsView.vue
git commit -m "refactor(ipc): rename wallChart IPC channels to chart"
```

---

## Task 4: Create `useChartExport` composable

**Goal:** Single source of truth for save-SVG and save-tiled-PDF behavior, reusable by all four charts.

**Files:**
- Create: `src/renderer/composables/useChartExport.ts`
- Create: `tests/unit/useChartExport.test.ts`

- [ ] **Step 1: Write a failing test (pure-function parts only)**

Create `tests/unit/useChartExport.test.ts`. We test only the pure helpers — the DOM + IPC parts are covered by manual QA.

```typescript
import { describe, it, expect } from 'vitest';
import { buildExportSvgString, wrapWithTitle } from '../../src/renderer/composables/useChartExport';

describe('buildExportSvgString', () => {
  it('serializes an SVGElement to an XML string with namespace', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '50');
    svg.appendChild(rect);
    const out = buildExportSvgString(svg);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('<rect');
  });
});

describe('wrapWithTitle', () => {
  it('prepends a <text> title element above the content', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect/></svg>';
    const out = wrapWithTitle(svg, 'Pedigree — Jonas Ahnstedt');
    expect(out).toContain('<text');
    expect(out).toContain('Pedigree &#8212; Jonas Ahnstedt'); // em-dash XML-escaped
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/useChartExport.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composable**

Create `src/renderer/composables/useChartExport.ts`:

```typescript
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import {
  getPaperDimensions,
  computeTileViewBoxes,
  generateTileSvg,
  type PaperSize,
  type Orientation,
  type ColorMode,
} from '../../api/chart-export';

const MM_TO_PX = 3.7795275591;

export function buildExportSvgString(el: SVGElement): string {
  const clone = el.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return new XMLSerializer().serializeToString(clone);
}

export function wrapWithTitle(svgString: string, title: string): string {
  // Insert a <text> element immediately after the opening <svg ...> tag.
  const escaped = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/—/g, '&#8212;');
  const titleNode = `<text x="50%" y="32" text-anchor="middle" font-size="24" font-family="system-ui, sans-serif" fill="currentColor">${escaped}</text>`;
  return svgString.replace(/(<svg[^>]*>)/, `$1${titleNode}`);
}

export interface UseChartExportOptions {
  svgRef: Ref<SVGElement | null>;
  title: ComputedRef<string> | Ref<string>;
  defaultPaperSize?: PaperSize;
  defaultOrientation?: Orientation;
  defaultColorMode?: ColorMode;
}

export function useChartExport(opts: UseChartExportOptions) {
  const paperSize = ref<PaperSize>(opts.defaultPaperSize ?? 'A2');
  const orientation = ref<Orientation>(opts.defaultOrientation ?? 'landscape');
  const colorMode = ref<ColorMode>(opts.defaultColorMode ?? 'themed');
  const customWidth = ref<number>(420);
  const customHeight = ref<number>(594);

  const paperDims = computed(() => getPaperDimensions({
    paperSize: paperSize.value,
    orientation: orientation.value,
    customWidth: customWidth.value,
    customHeight: customHeight.value,
  }));

  const tileCount = computed(() => {
    const W = Math.round(paperDims.value.width * MM_TO_PX);
    const H = Math.round(paperDims.value.height * MM_TO_PX);
    const tiles = computeTileViewBoxes(W, H);
    if (tiles.length <= 1) return null;
    const rows = Math.max(...tiles.map(t => t.row)) + 1;
    const cols = Math.max(...tiles.map(t => t.col)) + 1;
    return { count: tiles.length, rows, cols };
  });

  async function saveSvg() {
    if (!opts.svgRef.value) return;
    const raw = buildExportSvgString(opts.svgRef.value);
    const titled = wrapWithTitle(raw, opts.title.value);
    await (window as any).api.chart.saveSvg(titled);
  }

  async function savePdf() {
    if (!opts.svgRef.value) return;
    const raw = buildExportSvgString(opts.svgRef.value);
    const titled = wrapWithTitle(raw, opts.title.value);
    const W = Math.round(paperDims.value.width * MM_TO_PX);
    const H = Math.round(paperDims.value.height * MM_TO_PX);
    const tiles = computeTileViewBoxes(W, H);
    const pages = tiles.length === 1
      ? [titled]
      : tiles.map(t => generateTileSvg(titled, t));
    await (window as any).api.chart.saveTiledPdf(pages);
  }

  return {
    paperSize,
    orientation,
    colorMode,
    customWidth,
    customHeight,
    paperDims,
    tileCount,
    saveSvg,
    savePdf,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/useChartExport.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/composables/useChartExport.ts tests/unit/useChartExport.test.ts
git commit -m "feat(charts): add useChartExport composable"
```

---

## Task 5: Create `<ChartExportControls>` shared component

**Goal:** The slotted control strip: paper size dropdown + orientation toggle + color mode cycling button + Save SVG button + Save PDF button.

**Files:**
- Create: `src/renderer/components/ChartExportControls.vue`

- [ ] **Step 1: Add new i18n keys**

Add to `src/renderer/i18n/en.ts` under a new `chart.export` namespace:

```typescript
chart: {
  export: {
    paperSize: 'Paper',
    orientation: 'Orientation',
    portrait: 'Portrait',
    landscape: 'Landscape',
    colorMode: 'Color',
    themed: 'Themed',
    blackWhite: 'B&W',
    sexColored: 'Sex',
    saveSvg: 'Save SVG',
    saveTiledPdf: 'Save PDF',
    tilesNeeded: '{count} tiles ({cols}×{rows})',
    customWidth: 'W (mm)',
    customHeight: 'H (mm)',
  },
},
```

Add Swedish equivalents to `src/renderer/i18n/sv.ts`:

```typescript
chart: {
  export: {
    paperSize: 'Papper',
    orientation: 'Orientering',
    portrait: 'Stående',
    landscape: 'Liggande',
    colorMode: 'Färg',
    themed: 'Tema',
    blackWhite: 'S/V',
    sexColored: 'Kön',
    saveSvg: 'Spara SVG',
    saveTiledPdf: 'Spara PDF',
    tilesNeeded: '{count} sidor ({cols}×{rows})',
    customWidth: 'B (mm)',
    customHeight: 'H (mm)',
  },
},
```

- [ ] **Step 2: Create the component**

Create `src/renderer/components/ChartExportControls.vue`:

```vue
<template>
  <span class="zoom-extra-sep">|</span>

  <span class="zoom-extra-label">{{ $t('chart.export.paperSize') }}</span>
  <select class="zoom-extra-select" :value="paperSize" @change="onPaperChange">
    <option value="A4">A4</option>
    <option value="A3">A3</option>
    <option value="A2">A2</option>
    <option value="A1">A1</option>
    <option value="A0">A0</option>
  </select>

  <button class="zoom-extra-btn" :title="$t('chart.export.orientation')" @click="toggleOrientation">
    {{ orientation === 'portrait' ? $t('chart.export.portrait') : $t('chart.export.landscape') }}
  </button>

  <button class="zoom-extra-btn" :title="$t('chart.export.colorMode')" @click="cycleColorMode">
    {{ colorModeLabel }}
  </button>

  <span class="zoom-extra-sep">|</span>

  <button class="zoom-extra-btn" @click="$emit('saveSvg')">
    {{ $t('chart.export.saveSvg') }}
  </button>
  <button class="zoom-extra-btn" @click="$emit('savePdf')">
    {{ $t('chart.export.saveTiledPdf') }}
  </button>

  <span v-if="tileCount" class="zoom-extra-label tile-hint">
    {{ $t('chart.export.tilesNeeded', { count: tileCount.count, cols: tileCount.cols, rows: tileCount.rows }) }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PaperSize, Orientation, ColorMode } from '../../api/chart-export';

const props = defineProps<{
  paperSize: PaperSize;
  orientation: Orientation;
  colorMode: ColorMode;
  tileCount: { count: number; rows: number; cols: number } | null;
}>();

const emit = defineEmits<{
  'update:paperSize': [value: PaperSize];
  'update:orientation': [value: Orientation];
  'update:colorMode': [value: ColorMode];
  saveSvg: [];
  savePdf: [];
}>();

const { t } = useI18n();

function onPaperChange(e: Event) {
  emit('update:paperSize', (e.target as HTMLSelectElement).value as PaperSize);
}
function toggleOrientation() {
  emit('update:orientation', props.orientation === 'portrait' ? 'landscape' : 'portrait');
}
function cycleColorMode() {
  const order: ColorMode[] = ['themed', 'sex-colored', 'bw'];
  const idx = order.indexOf(props.colorMode);
  emit('update:colorMode', order[(idx + 1) % order.length]);
}
const colorModeLabel = computed(() => {
  if (props.colorMode === 'themed') return t('chart.export.themed');
  if (props.colorMode === 'sex-colored') return t('chart.export.sexColored');
  return t('chart.export.blackWhite');
});
</script>

<style scoped>
.zoom-extra-select {
  background: transparent;
  color: inherit;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  font-size: var(--font-xs);
}
.tile-hint {
  opacity: 0.7;
  font-style: italic;
}
</style>
```

- [ ] **Step 3: Verify lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ChartExportControls.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat(charts): add shared ChartExportControls component"
```

---

## Task 6: Wire ChartExportControls into `FanChart.vue`

**Goal:** Fan chart already has color mode in its zoom controls. Replace the bespoke color button with the shared component; add paper/orientation/save controls.

**Files:**
- Modify: `src/renderer/components/charts/FanChart.vue`

- [ ] **Step 1: Import composable + component**

Near the existing imports:

```typescript
import ChartExportControls from '../ChartExportControls.vue';
import { useChartExport } from '../../composables/useChartExport';
```

- [ ] **Step 2: Wire up in script**

After existing state declarations (after `const selectedGens = fanGenerations;`):

```typescript
const svgRootRef = ref<SVGElement | null>(null);
const exportTitle = computed(() => `${t('reports.tabFanChart')} — ${focalPersonName.value}`);
const exporter = useChartExport({
  svgRef: svgRootRef,
  title: exportTitle,
  defaultPaperSize: 'A2',
  defaultOrientation: 'landscape',
  defaultColorMode: 'branch' as any, // keep existing fan color semantics; map fan's 'branch' into themed
});
```

**NOTE:** Fan chart's existing `colorMode` is `'branch' | 'sex' | 'bw'` (see `FanColorMode` in `src/renderer/utils/fanColors.ts`). The shared component uses `'themed' | 'sex-colored' | 'bw'`. Reconcile by:
- keep FanChart's own `colorMode` ref bound to the original `FanColorMode` type
- map to/from the shared type via two small helpers inside FanChart

Add these mapping helpers in FanChart script:

```typescript
import type { FanColorMode } from '../../utils/fanColors';
import type { ColorMode as ExportColorMode } from '../../../api/chart-export';

function fanToExport(m: FanColorMode): ExportColorMode {
  if (m === 'branch') return 'themed';
  if (m === 'sex') return 'sex-colored';
  return 'bw';
}
function exportToFan(m: ExportColorMode): FanColorMode {
  if (m === 'themed') return 'branch';
  if (m === 'sex-colored') return 'sex';
  return 'bw';
}
```

- [ ] **Step 3: Expose an SVG ref on the FanChartSvg subcomponent**

Open `src/renderer/components/charts/FanChartSvg.vue` and add a template ref to its root `<svg>`:

```vue
<svg ref="rootRef" ... />
```

and expose it:

```typescript
const rootRef = ref<SVGElement | null>(null);
defineExpose({ rootRef });
```

Back in `FanChart.vue`, capture it:

```vue
<FanChartSvg ref="fanSvgRef" ... />
```

```typescript
const fanSvgRef = ref<{ rootRef: SVGElement | null } | null>(null);
watchEffect(() => {
  svgRootRef.value = fanSvgRef.value?.rootRef ?? null;
});
```

- [ ] **Step 4: Replace the inline color-mode button with `<ChartExportControls>`**

In the template, delete the existing color-mode button block (the one at lines 43–48 that calls `toggleColorMode`) and replace with:

```vue
<ChartExportControls
  :paper-size="exporter.paperSize.value"
  :orientation="exporter.orientation.value"
  :color-mode="fanToExport(colorMode)"
  :tile-count="exporter.tileCount.value"
  @update:paper-size="(v) => exporter.paperSize.value = v"
  @update:orientation="(v) => exporter.orientation.value = v"
  @update:color-mode="(v) => colorMode = exportToFan(v)"
  @save-svg="exporter.saveSvg"
  @save-pdf="exporter.savePdf"
/>
```

Leave the arc-span and generation controls above it intact.

- [ ] **Step 5: Manual test**

```bash
npm start
```

- Open a person, go to Visualisering → Fan chart.
- Verify: paper-size dropdown, orientation toggle, color-mode button, Save SVG, Save PDF all appear in the control strip.
- Click Save SVG. A file dialog should open. Save and verify the file has the chart.
- Click Save PDF. A file dialog should open.
- Verify that color-mode button still cycles correctly (branch → sex → bw → branch).

If any of these fail, stop and debug before committing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/charts/FanChart.vue src/renderer/components/charts/FanChartSvg.vue
git commit -m "feat(fan-chart): use ChartExportControls for paper/color/save"
```

---

## Task 7: Wire ChartExportControls into `PedigreeChart.vue`

**Goal:** Add color mode + paper/orientation/save to Pedigree. Color mode is new here — it currently only has generation controls.

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

- [ ] **Step 1: Add template ref to the root `<svg>` (around line ~12)**

Find the `<svg ...>` tag inside `<div class="chart-scroll">` and add `ref="svgRootRef"`.

- [ ] **Step 2: Import composable + component + types**

```typescript
import ChartExportControls from '../ChartExportControls.vue';
import { useChartExport } from '../../composables/useChartExport';
import type { ColorMode } from '../../../api/chart-export';
```

- [ ] **Step 3: Add color-mode state + exporter**

After existing state declarations:

```typescript
const svgRootRef = ref<SVGElement | null>(null);
const colorMode = ref<ColorMode>('themed');
const exportTitle = computed(() =>
  `${t('reports.tabPedigreeChart')} — ${focalPersonName.value ?? '?'}`
);
const exporter = useChartExport({
  svgRef: svgRootRef,
  title: exportTitle,
  defaultColorMode: 'themed',
});
```

If `focalPersonName` isn't already defined, derive it from the loaded tree's focal person.

- [ ] **Step 4: Apply color mode to rendered output**

The pedigree SVG uses sex-coloring logic somewhere — find the existing fill / stroke computed properties and extend them to respect `colorMode.value`:
- `themed` → current behavior
- `sex-colored` → color boxes by sex
- `bw` → all black/grey

If the pedigree chart has no sex coloring yet, `bw` mode can just set all fills to white with black stroke. Keep this change minimal — we're adding export options, not redesigning color logic.

- [ ] **Step 5: Slot `<ChartExportControls>` into the existing `<ZoomControls>`**

Around line 180–185, inside `<ZoomControls v-if="!readonly" overlay ...>`, after the existing generation buttons:

```vue
<ChartExportControls
  :paper-size="exporter.paperSize.value"
  :orientation="exporter.orientation.value"
  :color-mode="colorMode"
  :tile-count="exporter.tileCount.value"
  @update:paper-size="(v) => exporter.paperSize.value = v"
  @update:orientation="(v) => exporter.orientation.value = v"
  @update:color-mode="(v) => colorMode = v"
  @save-svg="exporter.saveSvg"
  @save-pdf="exporter.savePdf"
/>
```

- [ ] **Step 6: Manual test**

```bash
npm start
```

Open a person → Visualisering → Pedigree. Verify all controls render. Save SVG. Save PDF. Cycle color modes and verify visual change.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/charts/PedigreeChart.vue
git commit -m "feat(pedigree-chart): add color-mode + export controls"
```

---

## Task 8: Wire ChartExportControls into `HourglassChart.vue`

**Goal:** Same pattern as Task 7, applied to hourglass.

**Files:**
- Modify: `src/renderer/components/charts/HourglassChart.vue`

- [ ] **Step 1: Add template ref, imports, color-mode state, exporter**

Same pattern as Task 7 steps 1–4. Use `t('reports.tabHourglassChart')` for the title.

- [ ] **Step 2: Slot `<ChartExportControls>` into the existing `<ZoomControls>` (around lines 171–176)**

Same block as in Task 7 step 5.

- [ ] **Step 3: Manual test**

Open Hourglass, verify controls, save SVG, save PDF, cycle colors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/charts/HourglassChart.vue
git commit -m "feat(hourglass-chart): add color-mode + export controls"
```

---

## Task 9: Wire ChartExportControls into `DescendantChart.vue`

**Goal:** Same pattern, applied to descendant chart.

**Files:**
- Modify: `src/renderer/components/charts/DescendantChart.vue`

- [ ] **Step 1: Add template ref, imports, color-mode state, exporter**

Same pattern as Task 7 steps 1–4. Use `t('reports.tabDescendantChart')` for the title.

- [ ] **Step 2: Slot `<ChartExportControls>` into the existing `<ZoomControls>`**

Same block as in Task 7 step 5.

- [ ] **Step 3: Manual test**

Open Descendants, verify controls, save SVG, save PDF, cycle colors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/charts/DescendantChart.vue
git commit -m "feat(descendant-chart): add color-mode + export controls"
```

---

## Task 10: Delete Wall Chart tab from `ReportsView.vue`

**Goal:** Remove everything wall-chart-specific from the reports view.

**Files:**
- Modify: `src/renderer/views/ReportsView.vue`

- [ ] **Step 1: Remove the `wallChart` item from `tabs` array (line ~468)**

- [ ] **Step 2: Remove `'wallChart'` from the `activeTab` type union (line 453)**

- [ ] **Step 3: Delete the entire Wall Chart tab content block (lines 273–355)**

That's the `<!-- Wall Chart Tab -->` comment through the closing `</div>` of the tab-content div.

- [ ] **Step 4: Delete wall-chart state and helpers**

In the script section (around lines 485–550), delete:
- `const wallOptions = reactive<WallChartOptions>(...)` and initial object
- `const currentSvg = ref<string | null>(null);`
- `const wallTileInfo = ref<...>(null);`
- `const titleIsAutoGenerated = ref(true);`
- `const paperSizeOptions = computed(...)`
- `const genMin`, `const genMax`
- `const wallPaperDims`, `paperWidthMm`, `paperHeightMm`
- `function onWallSvgGenerated`, `function onWallTilesChanged`, `function onTitleInput`
- `async function exportWallSvg`, `async function exportWallPdf`
- The wall-chart-specific branches in `naturalWidth` computed (around line 557)
- The `watch(() => focusStore.personName, ...)` that updates `wallOptions.title` (around line 613)

- [ ] **Step 5: Remove wall-chart-related imports**

Remove:
- `import WallChartReport from '../components/reports/WallChartReport.vue';`
- `import { ..., type WallChartOptions, ..., type FontSizePreset, ..., type ColorMode, getPaperDimensions, computeTileViewBoxes, generateTileSvg } from '../../api/wall-charts';` (entire import)

- [ ] **Step 6: Remove wallChart from `validTabs` array (line ~681)**

- [ ] **Step 7: Verify build**

```bash
npm run lint
npx vitest run
```

Expected: 0 lint errors, all tests pass.

- [ ] **Step 8: Manual smoke test**

```bash
npm start
```

Navigate to Reports. Verify: no "Wall Chart" tab visible. Other tabs still render. Pedigree/Hourglass/Descendant/Fan chart tabs still work.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/views/ReportsView.vue
git commit -m "refactor(reports): remove wall chart tab"
```

---

## Task 11: Delete `WallChartReport.vue` and `wallChartData.ts`

**Goal:** Kill the now-unreferenced files.

**Files:**
- Delete: `src/renderer/components/reports/WallChartReport.vue`
- Delete: `src/renderer/utils/wallChartData.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -rn "WallChartReport\|wallChartData" src/ tests/
```

Expected: no matches.

- [ ] **Step 2: Delete files**

```bash
rm src/renderer/components/reports/WallChartReport.vue src/renderer/utils/wallChartData.ts
```

- [ ] **Step 3: Verify build**

```bash
npm run lint
npx vitest run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reports): delete WallChartReport and wallChartData"
```

---

## Task 12: Delete `src/api/wall-charts.ts` and its tests

**Goal:** All consumers have migrated to `src/api/chart-export.ts`. Delete the old module.

**Files:**
- Delete: `src/api/wall-charts.ts`
- Delete: `tests/unit/wall-charts.test.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -rn "api/wall-charts\|'wall-charts'" src/ tests/
```

Expected: no matches.

- [ ] **Step 2: Delete the files**

```bash
rm src/api/wall-charts.ts tests/unit/wall-charts.test.ts
```

- [ ] **Step 3: Verify**

```bash
npm run lint
npx vitest run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(api): delete wall-charts module (replaced by chart-export)"
```

---

## Task 13: Delete `wallChart.*` i18n keys

**Goal:** Remove the dead i18n tree. Preserve reused keys that have already been moved.

**Files:**
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Delete the `wallChart:` namespace block in both files**

In `src/renderer/i18n/en.ts` lines 739–769, delete the entire `wallChart: { ... }` object.

Same in `src/renderer/i18n/sv.ts`.

- [ ] **Step 2: Verify no remaining references**

```bash
grep -rn "wallChart\." src/ --include="*.ts" --include="*.vue"
grep -rn "'wallChart'" src/ --include="*.ts" --include="*.vue"
```

Expected: no matches (other than inside i18n files themselves, which are now deleted).

- [ ] **Step 3: Verify build + lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "refactor(i18n): remove wallChart.* keys"
```

---

## Task 14: Update CLAUDE.md, docs/IPC_REFERENCE.md, docs/PLAN.md

**Goal:** Documentation reflects the new state.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/IPC_REFERENCE.md`
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- Replace any mention of `src/api/wall-charts.ts` with `src/api/chart-export.ts` in the File Map (look for the line `│   ├── wall-charts.ts`).
- Remove `WallChartReport` from the `src/renderer/components/reports/` section (it's not in the current file map, but check Shared Components table — remove `WallChartReport` row).
- Update any description mentioning "wall chart SVG generation" to "chart export utilities (paper/tile math)".

- [ ] **Step 2: Update `docs/IPC_REFERENCE.md`**

Find any `window.api.wallChart.*` rows and rename them to `window.api.chart.*`. Channel `wallChart:saveSvg` → `chart:saveSvg`, etc.

- [ ] **Step 3: Update `docs/PLAN.md`**

Add a Done entry to the roadmap pointing at this plan file:

```markdown
- [x] **Wall Chart rollup** — merged paper/orientation/SVG/PDF export into Pedigree/Hourglass/Descendant/Fan charts; removed standalone Wall Chart tab. See `docs/plans/archive/2026-04-19-wall-chart-rollup.md`.
```

Add that entry in the Done section (adjust date format to match existing entries).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/IPC_REFERENCE.md docs/PLAN.md
git commit -m "docs: update for chart-export rename"
```

---

## Task 15: Archive this plan, bump version

**Goal:** Mark the feature complete.

**Files:**
- Move: `docs/plans/2026-04-19-wall-chart-rollup.md` → `docs/plans/archive/2026-04-19-wall-chart-rollup.md`
- Modify: `package.json` (version → `0.128.0`)

- [ ] **Step 1: Mark all checkboxes in this plan as done**

- [ ] **Step 2: Archive the plan file**

```bash
git mv docs/plans/2026-04-19-wall-chart-rollup.md docs/plans/archive/2026-04-19-wall-chart-rollup.md
```

- [ ] **Step 3: Bump version in `package.json`**

Change `"version": "0.127.1"` to `"version": "0.128.0"`.

- [ ] **Step 4: Update docs/PLAN.md pointer**

Update the archived-plan pointer path in the roadmap entry from Task 14 step 3.

- [ ] **Step 5: Final verification**

```bash
npm run lint
npx vitest run
npx playwright test
```

Expected: all green.

- [ ] **Step 6: Commit release**

```bash
git add -A
git commit -m "release: v0.128.0 — roll wall chart into live charts"
```

---

## Self-Review Notes

**Spec coverage:**
- Save SVG + tiled PDF on all 4 charts → Tasks 6–9 ✓
- Chart type goes away → Task 10 (deleted tab content) ✓
- Paper size on each chart → Task 5 component, wired in 6–9 ✓
- Orientation on each chart → Task 5 component, wired in 6–9 ✓
- Generation stays in zoom controls (no change) → noted at top ✓
- Font size goes away → not carried into new component ✓
- Color mode on each chart → Task 5 component, wired in 6–9 ✓
- Content (showDates/showPlaces/showPhotos) goes away → not carried into new component ✓
- Chart title is always auto-derived → `exportTitle` computed per chart ✓

**Open risks to flag during execution:**
- Pedigree/Hourglass/Descendant color mode is brand new. If the existing chart code doesn't support per-box color customization at all, Step 4 of Task 7 ("Apply color mode to rendered output") may need a follow-up plan. If so, ship `themed` as a no-op (current behavior) and add `bw` as all-grey stroke; punt sex-colored to a follow-up plan file and note it in `docs/PLAN.md`.
- Serializing the live SVG via `buildExportSvgString` captures whatever is currently rendered, including placeholder "+" outlines. If those appear in saved files, either hide placeholders before serialization or accept them as documentation of the chart state. Flag to the user after Task 6 manual test.
- `FanColorMode` uses `'branch' | 'sex' | 'bw'` — the mapping helpers in Task 6 preserve fan-specific behavior but leaks implementation detail. If this feels ugly at review time, unify on one type in a follow-up.

# Circle Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-circle (360°) circle chart ancestor view as a new "Cirkel" tab in VisualizationView, showing 6 generations with four branch-based colors.

**Architecture:** Pure SVG arc paths computed in `src/renderer/utils/circleLayout.ts`, rendered by `src/renderer/components/charts/CircleChart.vue`. Reuses `fetchPedigreeTree(focalId, 7)` (already returns a `Map<ahnentafelNumber, PersonNode>`), the `useChartZoom` composable, and the `navigate` event pattern from PedigreeChart/HourglassChart. No new dependencies, no schema or IPC changes.

**Tech Stack:** TypeScript, Vue 3 (Composition API, `<script setup>`), SVG, Vitest.

---

## Background reading

Before starting, read these files once:
- `src/renderer/utils/chartLayout.ts` — `PedigreeTree` and `PersonNode` types you'll import
- `src/renderer/utils/chartData.ts` — `fetchPedigreeTree(focalId, generations)` signature
- `src/renderer/components/charts/PedigreeChart.vue` — full pattern to follow (zoom, emit, load)
- `src/renderer/views/VisualizationView.vue` lines 1–75 — tab markup; lines 110–133 — `TabName` type and `setTab`
- `src/renderer/i18n/sv.ts` lines 323–339 — `visualization.tab.*` key structure

---

## File map

| File | Action |
|------|--------|
| `src/renderer/utils/circleLayout.ts` | **Create** — pure layout algorithm |
| `tests/unit/circleLayout.test.ts` | **Create** — unit tests |
| `src/renderer/components/charts/CircleChart.vue` | **Create** — SVG component |
| `src/renderer/views/VisualizationView.vue` | **Modify** — add Fan tab |
| `src/renderer/i18n/sv.ts` | **Modify** — add `visualization.tab.fan` |
| `src/renderer/i18n/en.ts` | **Modify** — add `visualization.tab.fan` |

---

## Task 1: circleLayout.ts — types and layout algorithm

**Files:**
- Create: `src/renderer/utils/circleLayout.ts`
- Create: `tests/unit/circleLayout.test.ts`

### Segment geometry

The SVG viewBox is 700×700, centered at (350, 350). Angles are measured from −90° (12 o'clock) going clockwise. Ahnentafel numbers: 1 = focal, 2 = father, 3 = mother, 4–7 = grandparents, …, 64–127 = gen-6 ancestors.

Ring radii and sweep angles:

| gen | ahnentafel | segments | sweep/seg | rInner | rOuter |
|-----|-----------|----------|-----------|--------|--------|
| 0 | 1 | 1 | 360° | 0 | 32 |
| 1 | 2–3 | 2 | 180° | 32 | 85 |
| 2 | 4–7 | 4 | 90° | 85 | 145 |
| 3 | 8–15 | 8 | 45° | 145 | 205 |
| 4 | 16–31 | 16 | 22.5° | 205 | 255 |
| 5 | 32–63 | 32 | 11.25° | 255 | 300 |
| 6 | 64–127 | 64 | 5.625° | 300 | 338 |

Total segments emitted: 1+2+4+8+16+32+64 = **127** (always, including empty slots).

### Branch colors

Four ancestor lines, one muted color each. For ahnentafel `n` in generation `g`:
- `g === 0`: `#2c3e50` (focal, always)
- `g === 1`: father (ahnentafel 2) = `#5888b0`; mother (3) = `#b07860`
- `g >= 2`: derive grandparent root = `n >> (g - 2)`, which lands in range 4–7. `branchIdx = root - 4`.

```
BRANCH_BASE_COLORS = ['#6a9cc0', '#6aaa78', '#c07848', '#a078b0']  // indices 0-3
```

Lighten the base color by `(g - 2) * 12%` per generation beyond gen 2. Empty slots use the same base color lightened by 55%.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/circleLayout.test.ts
import { describe, it, expect } from 'vitest';
import { computeCircleLayout } from '../../src/renderer/utils/circleLayout';
import type { PedigreeTree, PersonNode } from '../../src/renderer/utils/chartLayout';

function makeNode(id: string): PersonNode {
  return {
    id, givenName: 'Test', surname: 'Nilsson', preferredName: null,
    nickname: null, sex: 'M', living: false, birthYear: 1900, deathYear: 1980,
  };
}

function makeTree(maxAhn: number): PedigreeTree {
  const nodes = new Map<number, PersonNode>();
  for (let n = 1; n <= maxAhn; n++) nodes.set(n, makeNode(String(n)));
  return { nodes, generations: 7 };
}

describe('computeCircleLayout', () => {
  it('always returns exactly 127 segments', () => {
    // Empty tree (only focal)
    const treeEmpty: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    expect(computeCircleLayout(treeEmpty)).toHaveLength(127);

    // Full 6-gen tree
    expect(computeCircleLayout(makeTree(127))).toHaveLength(127);
  });

  it('focal segment has isFocal=true, generation=0, ahnNum=1', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const focal = computeCircleLayout(tree).find(s => s.ahnNum === 1)!;
    expect(focal.isFocal).toBe(true);
    expect(focal.generation).toBe(0);
    expect(focal.isEmpty).toBe(false);
    expect(focal.person?.id).toBe('1');
  });

  it('marks missing ancestors as empty with null person', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const nonFocal = computeCircleLayout(tree).filter(s => !s.isFocal);
    expect(nonFocal).toHaveLength(126);
    expect(nonFocal.every(s => s.isEmpty)).toBe(true);
    expect(nonFocal.every(s => s.person === null)).toBe(true);
  });

  it('each generation covers exactly 360 degrees', () => {
    const segs = computeCircleLayout(makeTree(127));
    for (let g = 0; g <= 6; g++) {
      const total = segs
        .filter(s => s.generation === g)
        .reduce((sum, s) => sum + s.sweepDeg, 0);
      expect(Math.round(total)).toBe(360);
    }
  });

  it('ahnentafel 4 gets base paternal-grandfather blue fill', () => {
    const segs = computeCircleLayout(makeTree(7));
    expect(segs.find(s => s.ahnNum === 4)!.fill).toBe('#6a9cc0');
  });

  it('ahnentafel 5 gets base paternal-grandmother green fill', () => {
    const segs = computeCircleLayout(makeTree(7));
    expect(segs.find(s => s.ahnNum === 5)!.fill).toBe('#6aaa78');
  });

  it('deeper generations of same branch are lighter', () => {
    const segs = computeCircleLayout(makeTree(127));
    // ahnentafel 4 → gen 2 (no lighten); 8 → gen 3 (+1 step); 16 → gen 4 (+2 steps)
    const r4  = parseInt(segs.find(s => s.ahnNum === 4)!.fill.slice(1, 3), 16);
    const r8  = parseInt(segs.find(s => s.ahnNum === 8)!.fill.slice(1, 3), 16);
    const r16 = parseInt(segs.find(s => s.ahnNum === 16)!.fill.slice(1, 3), 16);
    expect(r8).toBeGreaterThan(r4);
    expect(r16).toBeGreaterThan(r8);
  });

  it('ahnentafel 8 and 9 are in the same blue branch as ahnentafel 4', () => {
    const segs = computeCircleLayout(makeTree(15));
    // Both 8 and 9 descend from grandparent 4 (paternal-grandfather)
    const fill8  = segs.find(s => s.ahnNum === 8)!.fill;
    const fill9  = segs.find(s => s.ahnNum === 9)!.fill;
    const fill8r = parseInt(fill8.slice(1, 3), 16);
    const fill9r = parseInt(fill9.slice(1, 3), 16);
    // Both should be lighter than the gen-2 base (#6a9cc0, r=106) but same r value
    expect(fill8r).toBeGreaterThan(106);
    expect(fill8r).toBe(fill9r);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- circleLayout
```

Expected: 8 failures with "Cannot find module '../../src/renderer/utils/circleLayout'".

- [ ] **Step 3: Implement circleLayout.ts**

```typescript
// src/renderer/utils/circleLayout.ts
// Pure layout algorithm for the 360° circle chart. No DOM, no IPC.

import type { PedigreeTree, PersonNode } from './chartLayout';

export const CIRCLE_CX = 350;
export const CIRCLE_CY = 350;
export const CIRCLE_SVG_SIZE = 700;

const RINGS: Array<{ rInner: number; rOuter: number }> = [
  { rInner: 0,   rOuter: 32  },
  { rInner: 32,  rOuter: 85  },
  { rInner: 85,  rOuter: 145 },
  { rInner: 145, rOuter: 205 },
  { rInner: 205, rOuter: 255 },
  { rInner: 255, rOuter: 300 },
  { rInner: 300, rOuter: 338 },
];

const BRANCH_BASE: readonly string[] = [
  '#6a9cc0', // 0 — paternal grandfather (slate blue)
  '#6aaa78', // 1 — paternal grandmother (sage green)
  '#c07848', // 2 — maternal grandfather (terracotta)
  '#a078b0', // 3 — maternal grandmother (dusty mauve)
];

function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function computeFill(ahnNum: number, gen: number, isEmpty: boolean): string {
  let base: string;
  if (gen === 0) {
    base = '#2c3e50';
  } else if (gen === 1) {
    base = ahnNum === 2 ? '#5888b0' : '#b07860';
  } else {
    const rootAhn = ahnNum >> (gen - 2);    // lands in range 4–7
    const branchIdx = rootAhn - 4;          // 0–3
    base = lightenHex(BRANCH_BASE[branchIdx] ?? '#ccc', (gen - 2) * 0.12);
  }
  return isEmpty ? lightenHex(base, 0.55) : base;
}

function toRad(deg: number): number { return (deg * Math.PI) / 180; }

function arcXY(r: number, angleDeg: number): [number, number] {
  return [
    CIRCLE_CX + r * Math.cos(toRad(angleDeg)),
    CIRCLE_CY + r * Math.sin(toRad(angleDeg)),
  ];
}

function fmt(n: number): string { return n.toFixed(3); }

function buildPath(rInner: number, rOuter: number, startDeg: number, endDeg: number): string {
  const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
  const [ox1, oy1] = arcXY(rOuter, startDeg);
  const [ox2, oy2] = arcXY(rOuter, endDeg);
  if (rInner === 0) {
    // Pie slice to center (gen 1 only)
    return `M ${fmt(CIRCLE_CX)},${fmt(CIRCLE_CY)} L ${fmt(ox1)},${fmt(oy1)} A ${rOuter},${rOuter} 0 ${largeArc},1 ${fmt(ox2)},${fmt(oy2)} Z`;
  }
  const [ix1, iy1] = arcXY(rInner, startDeg);
  const [ix2, iy2] = arcXY(rInner, endDeg);
  return [
    `M ${fmt(ix1)},${fmt(iy1)}`,
    `L ${fmt(ox1)},${fmt(oy1)}`,
    `A ${rOuter},${rOuter} 0 ${largeArc},1 ${fmt(ox2)},${fmt(oy2)}`,
    `L ${fmt(ix2)},${fmt(iy2)}`,
    `A ${rInner},${rInner} 0 ${largeArc},0 ${fmt(ix1)},${fmt(iy1)}`,
    'Z',
  ].join(' ');
}

export interface CircleSegment {
  ahnNum: number;
  generation: number;
  person: PersonNode | null;
  pathD: string;        // empty string for focal (rendered as <circle>)
  fill: string;
  textX: number;        // midpoint of segment in SVG space
  textY: number;
  textAngle: number;    // degrees — apply as rotate(textAngle, textX, textY)
  midAngle: number;     // segment midpoint angle, from –90° (top), clockwise
  sweepDeg: number;
  isEmpty: boolean;
  isFocal: boolean;
}

export function computeCircleLayout(tree: PedigreeTree): CircleSegment[] {
  const segments: CircleSegment[] = [];

  for (let gen = 0; gen <= 6; gen++) {
    const count = Math.pow(2, gen);
    const firstAhn = Math.pow(2, gen);
    const sweepDeg = 360 / count;
    const { rInner, rOuter } = RINGS[gen];

    for (let pos = 0; pos < count; pos++) {
      const ahnNum = firstAhn + pos;
      const startDeg = -90 + pos * sweepDeg;
      const endDeg   = startDeg + sweepDeg;
      const midDeg   = startDeg + sweepDeg / 2;

      const person  = tree.nodes.get(ahnNum) ?? null;
      const isEmpty = person === null;
      const isFocal = gen === 0;

      const pathD = isFocal ? '' : buildPath(rInner, rOuter, startDeg, endDeg);
      const fill  = computeFill(ahnNum, gen, isEmpty);

      const rMid = (rInner + rOuter) / 2;
      const [textX, textY] = arcXY(rMid, midDeg);

      // Radial text: rotate so text runs along the radius.
      // In the left half of the circle the text would read backward — flip 180°.
      const normMid = ((midDeg % 360) + 360) % 360; // 0–360
      const flip = normMid > 90 && normMid <= 270;
      const textAngle = midDeg + (flip ? 180 : 0);

      segments.push({
        ahnNum, generation: gen, person, pathD, fill,
        textX, textY, textAngle, midAngle: midDeg, sweepDeg,
        isEmpty, isFocal,
      });
    }
  }

  return segments;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- circleLayout
```

Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add circleLayout.ts with computeCircleLayout + tests"
```

---

## Task 2: CircleChart.vue — SVG component

**Files:**
- Create: `src/renderer/components/charts/CircleChart.vue`

This component mirrors the structure of `PedigreeChart.vue`: loads data on mount, watches `personId`, renders SVG, zooms with the composable, emits `navigate`.

- [ ] **Step 1: Create CircleChart.vue**

```vue
<!-- src/renderer/components/charts/CircleChart.vue -->
<template>
  <div class="chart-outer">
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-else
        :width="CIRCLE_SVG_SIZE * zoom"
        :height="CIRCLE_SVG_SIZE * zoom"
        :viewBox="`0 0 ${CIRCLE_SVG_SIZE} ${CIRCLE_SVG_SIZE}`"
        data-testid="circle-svg"
      >
        <!-- Non-focal segments -->
        <g
          v-for="seg in nonFocalSegments"
          :key="seg.ahnNum"
          :class="['fan-seg', { clickable: !seg.isEmpty }]"
          @click="!seg.isEmpty && $emit('navigate', seg.person!.id)"
        >
          <path
            :d="seg.pathD"
            :fill="seg.fill"
            stroke="white"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <!-- Hover tooltip via native SVG title (works in Electron WebView) -->
          <title v-if="seg.person">{{ tooltipLabel(seg) }}</title>

          <!-- Text for gen 1–5 (gen 6 is too narrow) -->
          <g
            v-if="seg.person && seg.generation <= 5"
            :transform="`rotate(${seg.textAngle}, ${seg.textX}, ${seg.textY})`"
          >
            <text
              :x="seg.textX"
              :y="seg.textY - (seg.generation <= 4 ? 5 : 0)"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-weight="600"
              fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ primaryLabel(seg) }}</text>
            <text
              v-if="seg.generation <= 4 && birthYear(seg)"
              :x="seg.textX"
              :y="seg.textY + 6"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ birthYear(seg) }}</text>
          </g>
        </g>

        <!-- Focal person circle (rendered on top of segments) -->
        <circle
          v-if="focalSegment"
          :cx="CIRCLE_CX" :cy="CIRCLE_CY" r="32"
          :fill="focalSegment.fill"
        />
        <text
          v-if="focalSegment?.person"
          :x="CIRCLE_CX" :y="CIRCLE_CY - 7"
          text-anchor="middle"
          font-size="10"
          font-weight="600"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fill="white"
          style="pointer-events: none; user-select: none;"
        >{{ focalName }}</text>
        <text
          v-if="focalSegment?.person"
          :x="CIRCLE_CX" :y="CIRCLE_CY + 6"
          text-anchor="middle"
          font-size="8"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fill="rgba(255,255,255,0.65)"
          style="pointer-events: none; user-select: none;"
        >{{ focalDates }}</text>
      </svg>
    </div>

    <div class="zoom-controls">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeCircleLayout, CIRCLE_CX, CIRCLE_CY, CIRCLE_SVG_SIZE, type CircleSegment } from '../../utils/circleLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { fullNameParts } from '../../utils/nameUtils';
import type { PedigreeTree } from '../../utils/chartLayout';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-circle');

const layout = computed<CircleSegment[]>(() =>
  tree.value ? computeCircleLayout(tree.value) : [],
);

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);
const nonFocalSegments = computed(() => layout.value.filter(s => !s.isFocal));

const focalName = computed(() => {
  const p = focalSegment.value?.person;
  if (!p) return '';
  return fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
});

const focalDates = computed(() => {
  const p = focalSegment.value?.person;
  if (!p) return '';
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
  return '';
});

function primaryLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  const p = seg.person;
  if (seg.generation <= 2) {
    // Full name
    return fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
      .map(pt => pt.text).join('');
  }
  // Surname only for gen 3–5
  return p.surname ?? p.givenName ?? '';
}

function birthYear(seg: CircleSegment): string {
  return seg.person?.birthYear ? String(seg.person.birthYear) : '';
}

function tooltipLabel(seg: CircleSegment): string {
  const p = seg.person!;
  const name = fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
  const dates = p.birthYear && p.deathYear
    ? ` (${p.birthYear}–${p.deathYear})`
    : p.birthYear ? ` (${p.birthYear}–)` : '';
  return name + dates;
}

function nameFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 10, 2: 9, 3: 8.5, 4: 8, 5: 7 };
  return sizes[gen] ?? 7;
}

function dateFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 8, 2: 7.5, 3: 7, 4: 6.5 };
  return sizes[gen] ?? 6.5;
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    // generations=7: focal (gen 0) + 6 ancestor rings (gens 1–6)
    tree.value = await fetchPedigreeTree(props.personId, 7);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
onMounted(load);
</script>

<style scoped>
.chart-outer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.chart-loading { color: #999; padding: 40px; text-align: center; }

.fan-seg.clickable { cursor: pointer; }
.fan-seg.clickable:hover path { opacity: 0.85; }

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.93);
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 3px 5px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.zoom-btn {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: 14px;
  border-radius: 3px;
  color: #555;
  line-height: 1.4;
}
.zoom-btn:hover { background: #f0f0f0; }
.zoom-level {
  padding: 0 4px;
  font-size: 12px;
  color: #666;
  min-width: 38px;
  text-align: center;
}
</style>
```

- [ ] **Step 2: Run unit tests to confirm nothing is broken**

```bash
npm test
```

Expected: all existing tests pass (CircleChart.vue has no unit test — it's a Vue component, tested via the running app).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add CircleChart.vue SVG component"
```

---

## Task 3: Integration — tab + i18n

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add i18n keys**

In `src/renderer/i18n/sv.ts`, find the `visualization.tab` block (around line 324) and add `fan`:

```typescript
// Before:
    tab: {
      pedigree: 'Stamtavla',
      hourglass: 'Timglas',
      timeline: 'Tidslinje',
    },

// After:
    tab: {
      pedigree: 'Stamtavla',
      fan: 'Cirkel',
      hourglass: 'Timglas',
      timeline: 'Tidslinje',
    },
```

In `src/renderer/i18n/en.ts`, same location:

```typescript
// Before:
    tab: {
      pedigree: 'Pedigree',
      hourglass: 'Hourglass',
      timeline: 'Timeline',
    },

// After:
    tab: {
      pedigree: 'Pedigree',
      fan: 'Circle Chart',
      hourglass: 'Hourglass',
      timeline: 'Timeline',
    },
```

- [ ] **Step 2: Add Fan tab to VisualizationView**

In `VisualizationView.vue`, find the `TabName` type (around line 112) and add `'fan'`:

```typescript
// Before:
type TabName = 'pedigree' | 'hourglass' | 'timeline';

// After:
type TabName = 'pedigree' | 'fan' | 'hourglass' | 'timeline';
```

Add the import for CircleChart near the other chart imports (around line 82):

```typescript
import PedigreeChart from '../components/charts/PedigreeChart.vue';
import CircleChart from '../components/charts/CircleChart.vue';      // add this line
import HourglassChart from '../components/charts/HourglassChart.vue';
import TimelineChart from '../components/charts/TimelineChart.vue';
```

- [ ] **Step 3: Add the tab button and chart component in the template**

In the `<div class="viz-tabs">` block (around line 4–27), insert the Fan tab button between Pedigree and Hourglass:

```html
<!-- After the pedigree tab button, before hourglass: -->
<button
  role="tab" :aria-selected="activeTab === 'fan'"
  :class="['tab', { active: activeTab === 'fan' }]"
  data-testid="tab-circle" @click="setTab('fan')"
>{{ $t('visualization.tab.fan') }}</button>
```

In the chart area (inside `<div class="viz-chart-area">`), add the CircleChart after PedigreeChart:

```html
<CircleChart
  v-if="activeTab === 'fan'"
  :person-id="personId"
  @navigate="navigateTo"
/>
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Launch app and verify visually**

```bash
npm start
```

1. Open Visualisering tab in the sidebar.
2. Confirm the new "Cirkel" tab appears between Pedigree and Hourglass.
3. Click "Cirkel" — circle chart renders with focal person at center.
4. Verify branch colors: father's side (top-left half) is blue-ish, mother's side (top-right half) is warm-ish.
5. Hover over a populated segment — tooltip shows name + dates.
6. Click a populated segment — PersonPanel updates, focus store updates (name appears in sidebar focus indicator).
7. Click empty segment — no action.
8. Zoom +/− works.

- [ ] **Step 6: Commit and bump version**

Read current version from `package.json`, bump minor (new feature). Currently `1.8.0` → bump to `1.9.0`.

Update `"version"` in `package.json` to `"1.9.0"`.

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat: add circle chart (Cirkel) visualization tab

Full-circle 360° ancestor circle chart showing 6 generations.
Branch-based colors: four muted tones for paternal/maternal lines.
Reuses fetchPedigreeTree, useChartZoom, and navigate event pattern.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Post-implementation

After all tasks are done, update `.claude/PLAN.md`:
- Add `| v0.19.0 | Fan chart: full-circle 360° ancestor view, 6 generations, branch colors | [archive](plans/archive/2026-04-05-fan-chart.md) |` to Implementation Status
- Move this plan file from `.claude/plans/` to `.claude/plans/archive/`

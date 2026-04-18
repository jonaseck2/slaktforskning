# Timeline Chart Visual Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the timeline chart from plain colored bars on white background into a theme-aware, interactive visualization with event markers, hover tooltips, responsive width, and full dark/high-contrast/print support.

**Architecture:** The layout algorithm (`timeline.ts`) gains event marker positioning and responsive width via a new `containerWidth` parameter. The `TimelineEntry` type is extended with an `events` array so the layout can compute marker X positions. All color logic moves from hardcoded hex values to CSS custom properties derived from the existing design token system (`tokens.css` / `shared.css`). The Vue component (`TimelineChart.vue`) renders new SVG elements for event markers, gradients, tooltips, and animated living-person indicators. The report variant (`TimelineChartReport.vue`) inherits print styles via `@media print`.

**Tech Stack:** TypeScript (layout algorithm), Vue 3 `<script setup>` (component), CSS custom properties (theming), SVG (rendering), Vitest (unit tests)

---

## Task 1: Extend TimelineLayout types for event markers

**Files:** `src/renderer/utils/chart-layout/types.ts`

- [ ] Add `EventMarker` interface and extend `BarLayout` with markers
- [ ] Add `containerWidth` to layout input
- [ ] Extend `TimelineEntry` with events array

```typescript
// Add to types.ts after TickMark interface:

export interface EventMarker {
  /** X position on the SVG (computed from event year) */
  x: number;
  /** Event type (birth, death, marriage, etc.) */
  eventType: string;
  /** Year extracted from date_value */
  year: number;
  /** Symbol to render: '★' birth, '†' death, '♥' marriage, '◆' other */
  symbol: string;
}

// Extend BarLayout — add after hasNoDate:
//   markers: EventMarker[];

// Extend TimelineEntry — add after isFocal:
//   events?: Array<{ event_type: string; date_value: string | null }>;
```

Concrete edits to `src/renderer/utils/chart-layout/types.ts`:

Replace the existing `BarLayout` interface (lines 125–134):
```typescript
export interface BarLayout {
  person: PersonNode;
  isFocal: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  isOpen: boolean;
  hasNoDate: boolean;
  markers: EventMarker[];
}
```

Replace the existing `TimelineEntry` interface (lines 150–153):
```typescript
export interface TimelineEntry {
  person: PersonNode;
  isFocal: boolean;
  events?: Array<{ event_type: string; date_value: string | null }>;
}
```

Add the new `EventMarker` interface before `BarLayout`:
```typescript
export interface EventMarker {
  x: number;
  eventType: string;
  year: number;
  symbol: string;
}
```

---

## Task 2: Update layout algorithm for event positions + responsive width

**Files:** `src/renderer/utils/chart-layout/timeline.ts`

- [ ] Accept optional `containerWidth` parameter (default 800)
- [ ] Compute `EventMarker[]` positions for each bar
- [ ] Map event types to symbols

```typescript
// Replace the full file content:

import type { TimelineEntry, TimelineLayout, BarLayout, TickMark, EventMarker } from './types';
import { yearFromDate } from './utils';

const TL_LEFT_MARGIN = 164;
const TL_RIGHT_MARGIN = 30;
const TL_TOP_PAD = 20;
const TL_BAR_H = 22;
const TL_ROW_H = 36;
const TL_DEFAULT_W = 800;
const TL_AXIS_H = 30;

const EVENT_SYMBOLS: Record<string, string> = {
  birth: '★',
  death: '†',
  marriage: '♥',
  divorce: '✕',
  christening: '✝',
  burial: '⚰',
};
const DEFAULT_SYMBOL = '◆';

export function eventSymbol(eventType: string): string {
  return EVENT_SYMBOLS[eventType] ?? DEFAULT_SYMBOL;
}

export function computeTimelineLayout(
  entries: TimelineEntry[],
  currentYear: number,
  containerWidth?: number,
): TimelineLayout {
  const svgW = containerWidth && containerWidth > 400 ? containerWidth : TL_DEFAULT_W;

  const years = entries
    .flatMap(e => [yearFromDate(e.person.birthDate), yearFromDate(e.person.deathDate)])
    .filter((y): y is number => y !== null);

  let minYear: number;
  let maxYear: number;
  if (years.length === 0) {
    minYear = currentYear - 50;
    maxYear = currentYear;
  } else if (years.length === 1) {
    minYear = years[0] - 10;
    maxYear = Math.max(currentYear, years[0] + 10);
  } else {
    minYear = Math.min(...years) - 5;
    maxYear = Math.max(...years, currentYear) + 5;
  }

  minYear = Math.floor(minYear / 10) * 10;
  maxYear = Math.ceil(maxYear / 10) * 10;

  const sorted = [...entries].sort((a, b) => {
    const ay = yearFromDate(a.person.birthDate) ?? Infinity;
    const by = yearFromDate(b.person.birthDate) ?? Infinity;
    return ay - by;
  });

  const chartW = svgW - TL_LEFT_MARGIN - TL_RIGHT_MARGIN;
  const scale = chartW / (maxYear - minYear);
  const xOfYear = (year: number) => TL_LEFT_MARGIN + (year - minYear) * scale;

  const bars: BarLayout[] = sorted.map((entry, i) => {
    const birthYear = yearFromDate(entry.person.birthDate);
    const deathYear = yearFromDate(entry.person.deathDate);
    const isOpen = deathYear === null;
    const hasNoDate = birthYear === null;
    const startYear = birthYear ?? minYear;
    const endYear = isOpen ? currentYear : (deathYear ?? currentYear);
    const x = xOfYear(startYear);
    const endX = xOfYear(endYear);

    // Compute event markers
    const markers: EventMarker[] = [];
    if (entry.events) {
      for (const evt of entry.events) {
        const evtYear = yearFromDate(evt.date_value);
        if (evtYear !== null && evtYear >= startYear && evtYear <= endYear) {
          markers.push({
            x: xOfYear(evtYear),
            eventType: evt.event_type,
            year: evtYear,
            symbol: eventSymbol(evt.event_type),
          });
        }
      }
    }

    return {
      person: entry.person,
      isFocal: entry.isFocal,
      x, y: TL_TOP_PAD + i * TL_ROW_H,
      w: Math.max(endX - x, 4),
      h: TL_BAR_H,
      isOpen,
      hasNoDate,
      markers,
    };
  });

  const ticks: TickMark[] = [];
  for (let y = minYear; y <= maxYear; y += 10) {
    ticks.push({ x: xOfYear(y), year: y });
  }

  const axisY = TL_TOP_PAD + sorted.length * TL_ROW_H + 10;
  const todayX = xOfYear(currentYear);
  const svgHeight = axisY + TL_AXIS_H;

  return { bars, ticks, todayX, svgWidth: svgW, svgHeight, axisY };
}
```

Also export `eventSymbol` from `src/renderer/utils/chart-layout/index.ts`:
```typescript
export { computeTimelineLayout, eventSymbol } from './timeline';
```

---

## Task 3: Unit tests for layout changes

**File:** `tests/unit/chartLayout.test.ts`

- [ ] Test that `markers` array is populated when events are provided
- [ ] Test event marker X positions are within bar bounds
- [ ] Test `containerWidth` parameter changes `svgWidth`
- [ ] Test `eventSymbol()` mapping
- [ ] Verify existing tests still pass (markers default to `[]` when no events)

Add after the existing `computeTimelineLayout` describe block (line ~648):

```typescript
import { eventSymbol } from '../../src/renderer/utils/chart-layout';

describe('computeTimelineLayout — event markers', () => {
  it('populates markers when events are provided', () => {
    const entries = [{
      person: p('f', { birthDate: '1950', deathDate: '2010' }),
      isFocal: true,
      events: [
        { event_type: 'birth', date_value: '1950-01-15' },
        { event_type: 'marriage', date_value: '1975-06-20' },
        { event_type: 'death', date_value: '2010-12-01' },
      ],
    }];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].markers).toHaveLength(3);
    expect(bars[0].markers[0].symbol).toBe('★');
    expect(bars[0].markers[1].symbol).toBe('♥');
    expect(bars[0].markers[2].symbol).toBe('†');
  });

  it('returns empty markers when no events provided', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].markers).toEqual([]);
  });

  it('filters out events outside bar range', () => {
    const entries = [{
      person: p('f', { birthDate: '1950', deathDate: '2010' }),
      isFocal: true,
      events: [
        { event_type: 'census', date_value: '1920-01-01' }, // before birth
        { event_type: 'marriage', date_value: '1975-06-20' }, // in range
      ],
    }];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].markers).toHaveLength(1);
    expect(bars[0].markers[0].eventType).toBe('marriage');
  });

  it('marker x is within bar x..x+w', () => {
    const entries = [{
      person: p('f', { birthDate: '1950', deathDate: '2010' }),
      isFocal: true,
      events: [{ event_type: 'marriage', date_value: '1975' }],
    }];
    const { bars } = computeTimelineLayout(entries, 2024);
    const bar = bars[0];
    const marker = bar.markers[0];
    expect(marker.x).toBeGreaterThanOrEqual(bar.x);
    expect(marker.x).toBeLessThanOrEqual(bar.x + bar.w);
  });
});

describe('computeTimelineLayout — responsive width', () => {
  it('uses containerWidth when provided', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const layout = computeTimelineLayout(entries, 2024, 1200);
    expect(layout.svgWidth).toBe(1200);
  });

  it('falls back to 800 when containerWidth is too small', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const layout = computeTimelineLayout(entries, 2024, 300);
    expect(layout.svgWidth).toBe(800);
  });

  it('falls back to 800 when containerWidth is undefined', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const layout = computeTimelineLayout(entries, 2024);
    expect(layout.svgWidth).toBe(800);
  });
});

describe('eventSymbol', () => {
  it('maps known event types to symbols', () => {
    expect(eventSymbol('birth')).toBe('★');
    expect(eventSymbol('death')).toBe('†');
    expect(eventSymbol('marriage')).toBe('♥');
  });

  it('returns default diamond for unknown types', () => {
    expect(eventSymbol('census')).toBe('◆');
    expect(eventSymbol('immigration')).toBe('◆');
  });
});
```

Run: `npm test -- --run tests/unit/chartLayout.test.ts`

---

## Task 4: Fetch events for timeline entries

**File:** `src/renderer/utils/chartData.ts`

- [ ] Update `fetchTimelineEntries` to also fetch events per person
- [ ] Include event data in returned `TimelineEntry[]`

Replace the `fetchTimelineEntries` function (lines 606–621):

```typescript
export async function fetchTimelineEntries(focalId: string): Promise<TimelineEntry[]> {
  const rawRels = (await window.api.relationships.getForPerson(focalId)) as RawRel[];

  const relatedIds = new Set<string>();
  rawRels.forEach(r => {
    if (r.person1_id && r.person1_id !== focalId) relatedIds.add(r.person1_id);
    if (r.person2_id && r.person2_id !== focalId) relatedIds.add(r.person2_id);
  });

  const allIds = [focalId, ...relatedIds];

  const results = await Promise.all(
    allIds.map(async (id) => {
      try {
        const [node, events] = await Promise.all([
          fetchPersonNode(id),
          window.api.events.forPerson(id) as Promise<RawEvent[]>,
        ]);
        return {
          person: node,
          isFocal: id === focalId,
          events: events.map(e => ({ event_type: e.event_type, date_value: e.date_value })),
        };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((n): n is TimelineEntry => n !== null);
}
```

---

## Task 5: Timeline CSS custom properties for theme-aware colors

**Files:** `src/renderer/styles/tokens.css`, `src/renderer/styles/shared.css`

- [ ] Add timeline-specific CSS custom properties to `:root` in `tokens.css`
- [ ] Add dark mode overrides in `shared.css`
- [ ] Add high-contrast overrides in `shared.css`

Add to `tokens.css` at the end of the semantic colors section (after `--sex-u-text`, ~line 98):

```css
/* Timeline chart */
--tl-bar-m:         #7eb8f7;
--tl-bar-f:         #f7a5c0;
--tl-bar-u:         #bbb;
--tl-bar-focal:     var(--accent);
--tl-grid:          #f0f0f0;
--tl-axis:          #ddd;
--tl-text:          var(--text-secondary);
--tl-tick:          var(--text-muted);
--tl-today:         #ef4444;
--tl-marker:        var(--text-primary);
--tl-tooltip-bg:    var(--surface);
--tl-tooltip-border: var(--surface-border);
--tl-tooltip-text:  var(--text-primary);
```

Add dark mode overrides inside the existing `html.dark` block in `shared.css`:

```css
/* Timeline chart — dark */
--tl-bar-m:         #4a8ad4;
--tl-bar-f:         #d47a9a;
--tl-bar-u:         #666;
--tl-grid:          #2a2a2a;
--tl-axis:          #444;
--tl-today:         #f87171;
```

Add high-contrast overrides inside the existing `html.high-contrast` block in `shared.css`:

```css
/* Timeline chart — high contrast */
--tl-bar-m:         #3b82f6;
--tl-bar-f:         #ec4899;
--tl-bar-u:         #9ca3af;
--tl-grid:          #444;
--tl-axis:          #666;
--tl-marker:        #fff;
```

---

## Task 6: TimelineChart.vue visual updates

**File:** `src/renderer/components/charts/TimelineChart.vue`

- [ ] Replace hardcoded colors with CSS custom properties
- [ ] Add SVG `<defs>` for bar gradients (per sex)
- [ ] Render rounded bars with gradient fill
- [ ] Render event markers (symbols above/below bars)
- [ ] Add hover tooltip (SVG `<foreignObject>` or positioned `<div>`)
- [ ] Animate living-person bar end (pulsing)
- [ ] Show birth/death years at bar ends
- [ ] Improved grid: lighter lines, decade labels at top
- [ ] Responsive width via `ResizeObserver` on container
- [ ] Highlight related bars on hover (parents/children get accent border)

Replace the full component:

```vue
<template>
  <div class="chart-outer" ref="outerRef">
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <template v-else-if="layout.bars.length > 0">
        <svg
          :width="layout.svgWidth * zoom"
          :height="layout.svgHeight * zoom"
          :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
          class="timeline-svg"
          data-testid="timeline-svg"
          @mouseleave="hoveredId = null"
        >
          <defs>
            <!-- Gradient definitions for bar fills -->
            <linearGradient id="tl-grad-m" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--tl-bar-m)" stop-opacity="1" />
              <stop offset="100%" stop-color="var(--tl-bar-m)" stop-opacity="0.7" />
            </linearGradient>
            <linearGradient id="tl-grad-f" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--tl-bar-f)" stop-opacity="1" />
              <stop offset="100%" stop-color="var(--tl-bar-f)" stop-opacity="0.7" />
            </linearGradient>
            <linearGradient id="tl-grad-u" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--tl-bar-u)" stop-opacity="1" />
              <stop offset="100%" stop-color="var(--tl-bar-u)" stop-opacity="0.7" />
            </linearGradient>
            <linearGradient id="tl-grad-focal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--tl-bar-focal)" stop-opacity="1" />
              <stop offset="100%" stop-color="var(--tl-bar-focal)" stop-opacity="0.7" />
            </linearGradient>
          </defs>

          <!-- Grid lines (behind everything) -->
          <g class="tl-grid">
            <line
              v-for="tick in layout.ticks" :key="'grid-' + tick.year"
              :x1="tick.x" :y1="TOP"
              :x2="tick.x" :y2="layout.axisY"
              stroke="var(--tl-grid)" stroke-width="1"
            />
            <!-- Century markers: thicker line -->
            <line
              v-for="tick in centuryTicks" :key="'century-' + tick.year"
              :x1="tick.x" :y1="TOP"
              :x2="tick.x" :y2="layout.axisY"
              stroke="var(--tl-axis)" stroke-width="1.5"
            />
          </g>

          <!-- Axis line -->
          <line
            :x1="LEFT" :y1="layout.axisY"
            :x2="layout.svgWidth - RIGHT" :y2="layout.axisY"
            stroke="var(--tl-axis)" stroke-width="1"
          />

          <!-- Tick labels at top -->
          <g class="tl-tick-labels">
            <text
              v-for="tick in layout.ticks" :key="'label-' + tick.year"
              :x="tick.x" :y="TOP - 4"
              class="tick-label" text-anchor="middle"
            >{{ tick.year }}</text>
          </g>

          <!-- Today line -->
          <line
            :x1="layout.todayX" :y1="TOP - 14"
            :x2="layout.todayX" :y2="layout.axisY"
            stroke="var(--tl-today)" stroke-width="1.5" stroke-dasharray="4 3"
          />
          <text
            :x="layout.todayX" :y="TOP - 18"
            class="today-label" text-anchor="middle"
          >{{ $t('visualization.today') }}</text>

          <!-- Person bars -->
          <g
            v-for="bar in layout.bars"
            :key="bar.person.id"
            :data-testid="'timeline-row-' + bar.person.id"
            :class="['timeline-row', { focal: bar.isFocal, hovered: hoveredId === bar.person.id }]"
            :style="{ cursor: readonly ? 'default' : undefined }"
            @click="!readonly && $emit('navigate', bar.person.id)"
            @mouseenter="hoveredId = bar.person.id"
            @mouseleave="hoveredId = null"
          >
            <!-- Person name (left side) -->
            <text
              :x="LEFT - 8" :y="bar.y + bar.h / 2"
              class="row-label" :class="{ 'focal-label': bar.isFocal }"
              text-anchor="end" dominant-baseline="middle"
            ><tspan
                v-for="(part, pi) in truncateNameParts(fullNameParts(bar.person.givenName, bar.person.surname, bar.person.preferredName, bar.person.nickname), 22)"
                :key="pi"
                :text-decoration="part.underline ? 'underline' : undefined"
              >{{ part.text }}</tspan></text>

            <!-- Bar rect with gradient -->
            <rect
              v-if="!bar.hasNoDate"
              :x="bar.x" :y="bar.y"
              :width="bar.w" :height="bar.h"
              :fill="barGradient(bar)"
              :opacity="bar.person.living ? 1 : 0.8"
              :rx="bar.h / 2"
              :ry="bar.h / 2"
              class="tl-bar"
            />

            <!-- No-date placeholder -->
            <text
              v-if="bar.hasNoDate"
              :x="LEFT + 4" :y="bar.y + bar.h / 2"
              class="no-date-label" dominant-baseline="middle"
            >?</text>

            <!-- Living arrow (animated pulse) -->
            <g v-if="!bar.hasNoDate && bar.isOpen" class="living-pulse">
              <circle
                :cx="bar.x + bar.w" :cy="bar.y + bar.h / 2"
                :r="bar.h / 2"
                :fill="barGradient(bar)" opacity="0.5"
              >
                <animate attributeName="r" :values="`${bar.h / 2};${bar.h / 2 + 4};${bar.h / 2}`" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>

            <!-- Birth year label at bar start -->
            <text
              v-if="!bar.hasNoDate && birthYear(bar)"
              :x="bar.x - 3" :y="bar.y + bar.h + 12"
              class="year-label" text-anchor="end"
            >{{ birthYear(bar) }}</text>

            <!-- Death year label at bar end -->
            <text
              v-if="!bar.hasNoDate && deathYear(bar)"
              :x="bar.x + bar.w + 3" :y="bar.y + bar.h + 12"
              class="year-label" text-anchor="start"
            >{{ deathYear(bar) }}</text>

            <!-- Event markers (diamonds/symbols on the bar) -->
            <g v-for="(marker, mi) in bar.markers" :key="mi" class="event-marker">
              <text
                :x="marker.x"
                :y="bar.y - 3"
                class="marker-symbol"
                text-anchor="middle"
                dominant-baseline="auto"
              >{{ marker.symbol }}</text>
            </g>
          </g>

          <!-- Hover tooltip -->
          <foreignObject
            v-if="hoveredBar && !hoveredBar.hasNoDate"
            :x="tooltipX" :y="tooltipY"
            width="220" height="80"
            class="tl-tooltip-fo"
            style="pointer-events: none;"
          >
            <div xmlns="http://www.w3.org/1999/xhtml" class="tl-tooltip">
              <strong>{{ displayName(hoveredBar.person) }}</strong>
              <div v-if="birthYear(hoveredBar)">{{ $t('visualization.timelineBorn') }}: {{ birthYear(hoveredBar) }}</div>
              <div v-if="deathYear(hoveredBar)">{{ $t('visualization.timelineDied') }}: {{ deathYear(hoveredBar) }}</div>
              <div v-if="age(hoveredBar)">{{ $t('visualization.timelineAge') }}: {{ age(hoveredBar) }}</div>
            </div>
          </foreignObject>
        </svg>
      </template>
      <div v-else-if="!loading" class="chart-empty">—</div>
    </div>
    <div v-if="!readonly" class="zoom-controls">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in (Ctrl+scroll)">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeTimelineLayout } from '../../utils/chart-layout';
import { fetchTimelineEntries } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import type { TimelineLayout, BarLayout, TickMark, PersonNode } from '../../utils/chart-layout';
import { fullNameParts, truncateNameParts } from '../../utils/nameUtils';
import { yearFromDate } from '../../utils/chart-layout/utils';

useI18n();

const props = defineProps<{ personId: string | undefined; readonly?: boolean }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const LEFT = 164;
const RIGHT = 30;
const TOP = 20;

const loading = ref(true);
const layout = ref<TimelineLayout>({ bars: [], ticks: [], todayX: 0, svgWidth: 800, svgHeight: 100, axisY: 60 });
const hoveredId = ref<string | null>(null);
const containerWidth = ref(800);
const outerRef = ref<HTMLElement | null>(null);

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-timeline');

// Responsive width via ResizeObserver
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (outerRef.value) {
    containerWidth.value = outerRef.value.clientWidth;
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(outerRef.value);
  }
});
onUnmounted(() => {
  resizeObserver?.disconnect();
});

const hoveredBar = computed(() =>
  hoveredId.value ? layout.value.bars.find(b => b.person.id === hoveredId.value) ?? null : null,
);

const centuryTicks = computed(() =>
  layout.value.ticks.filter(t => t.year % 100 === 0),
);

const tooltipX = computed(() => {
  if (!hoveredBar.value) return 0;
  const bar = hoveredBar.value;
  const x = bar.x + bar.w / 2 - 110;
  return Math.max(LEFT, Math.min(x, layout.value.svgWidth - RIGHT - 220));
});

const tooltipY = computed(() => {
  if (!hoveredBar.value) return 0;
  return hoveredBar.value.y + hoveredBar.value.h + 4;
});

function barGradient(bar: BarLayout): string {
  if (bar.isFocal) return 'url(#tl-grad-focal)';
  switch (bar.person.sex) {
    case 'M': return 'url(#tl-grad-m)';
    case 'F': return 'url(#tl-grad-f)';
    default: return 'url(#tl-grad-u)';
  }
}

function birthYear(bar: BarLayout): number | null {
  return yearFromDate(bar.person.birthDate);
}

function deathYear(bar: BarLayout): number | null {
  return yearFromDate(bar.person.deathDate);
}

function age(bar: BarLayout): number | null {
  const b = birthYear(bar);
  const d = deathYear(bar);
  if (b === null) return null;
  if (d !== null) return d - b;
  if (bar.person.living) return new Date().getFullYear() - b;
  return null;
}

function displayName(person: PersonNode): string {
  return [person.givenName, person.surname].filter(Boolean).join(' ') || '?';
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    const entries = await fetchTimelineEntries(props.personId);
    layout.value = computeTimelineLayout(entries, new Date().getFullYear(), containerWidth.value);
  } finally {
    loading.value = false;
  }
}

// Re-layout when container resizes
watch(containerWidth, () => {
  if (layout.value.bars.length > 0) {
    // Re-run with stored entries not available — trigger full reload
    load();
  }
});

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
.chart-loading { color: var(--text-muted); padding: 40px; text-align: center; }
.chart-empty { color: var(--text-muted); padding: 40px; text-align: center; }

.timeline-svg { background: var(--surface); }

.timeline-row { cursor: pointer; }
.timeline-row.focal { cursor: default; }
.timeline-row:not(.focal):hover .tl-bar { filter: brightness(1.1); }
.timeline-row.hovered .tl-bar { filter: brightness(1.15); }

.tl-bar { transition: filter 0.15s ease; }

.row-label { fill: var(--tl-text); font-size: var(--font-sm); font-family: inherit; }
.focal-label { font-weight: 700; fill: var(--text-primary); }
.tick-label { fill: var(--tl-tick); font-size: var(--font-xs); font-family: inherit; }
.today-label { fill: var(--tl-today); font-size: var(--font-xs); font-family: inherit; font-weight: 600; }
.no-date-label { fill: var(--text-muted); font-size: var(--font-base); font-family: inherit; }
.year-label { fill: var(--tl-tick); font-size: 9px; font-family: inherit; }

.marker-symbol { fill: var(--tl-marker); font-size: 10px; font-family: inherit; }

.tl-tooltip {
  background: var(--tl-tooltip-bg);
  border: 1px solid var(--tl-tooltip-border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-xs);
  color: var(--tl-tooltip-text);
  box-shadow: var(--shadow-md);
  line-height: 1.5;
}
.tl-tooltip strong {
  display: block;
  margin-bottom: 2px;
}

.living-pulse circle {
  pointer-events: none;
}

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 3px 5px;
  box-shadow: var(--shadow-sm);
}
.zoom-btn {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: var(--font-base);
  border-radius: 3px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.zoom-btn:hover { background: var(--surface-hover); }
.zoom-level {
  padding: 0 4px;
  font-size: var(--font-xs);
  color: var(--text-muted);
  min-width: 38px;
  text-align: center;
}

/* Print: clean output, no zoom, no animations */
@media print {
  .zoom-controls { display: none; }
  .living-pulse { display: none; }
  .timeline-svg { background: #fff !important; }
  .tl-tooltip-fo { display: none; }
  .tl-bar { opacity: 1 !important; }
  .row-label { fill: #333 !important; }
  .tick-label { fill: #999 !important; }
  .marker-symbol { fill: #333 !important; }
}
</style>
```

---

## Task 7: Print styling for TimelineChartReport

**File:** `src/renderer/components/reports/TimelineChartReport.vue`

- [ ] Add `@media print` overrides to strip animations and force light colors
- [ ] Ensure responsive width works in print (use 100% container)

No changes needed to `TimelineChartReport.vue` — it already uses `:deep()` to force `overflow: visible` and `width: 100%`. The `@media print` rules in `TimelineChart.vue` (Task 6) handle print styling. The print path works because `TimelineChartReport` renders `TimelineChart` with `readonly=true`, and the print media query in the child hides zoom controls and animations.

---

## Task 8: i18n for new tooltip labels

**Files:** `src/renderer/i18n/en.ts`, `src/renderer/i18n/sv.ts`

- [ ] Add tooltip labels under `visualization` namespace

Add to the `visualization` section in `en.ts`:

```typescript
timelineBorn: 'Born',
timelineDied: 'Died',
timelineAge: 'Age',
```

Add to the `visualization` section in `sv.ts`:

```typescript
timelineBorn: 'Född',
timelineDied: 'Död',
timelineAge: 'Ålder',
```

---

## Verification

After all tasks:

```bash
npm run lint                                    # 0 errors
npm test -- --run tests/unit/chartLayout.test.ts # All timeline tests pass
npm test -- --run                               # Full suite passes
npm start                                       # Visual check: navigate to Visualization > Timeline
```

Visual checks:
1. Bars use theme colors (Forest green accent for focal, blue/pink/gray for sex)
2. Switch to Nordic theme — bars update
3. Switch to dark mode — background, bars, grid, text all adapt
4. Switch to high-contrast — bars are vivid, text has strong contrast
5. Hover a bar — tooltip shows name, born, died, age
6. Event markers (★ ♥ †) appear on bars for persons with events
7. Living persons have pulsing bar end
8. Birth/death years shown at bar ends
9. Resize window — chart width adapts
10. Print preview — clean output, no animations, no zoom controls

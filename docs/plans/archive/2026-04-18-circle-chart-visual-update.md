# Circle Chart Visual Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded hex colors in the circle chart with theme-aware, dark-mode-compatible, sex-aware-toggleable colors — matching the design quality level of the box chart overhaul.

**Architecture:** Extract a pure-TS `circleColors.ts` module that computes segment fills from CSS custom property values (read at runtime via `getComputedStyle`). `CircleChartSvg.vue` gains SVG `<defs>` gradients, CSS hover transitions, and an empty-segment pattern. `CircleChart.vue` gets a color-mode toggle (branch vs sex). Print mode strips all theme colors to grayscale.

**Tech Stack:** TypeScript (pure color functions), Vue 3 `<script setup>`, SVG gradients/patterns, CSS custom properties from `tokens.css`, Vitest unit tests.

---

## Task 1 — Theme-aware color generation module

Create `src/renderer/utils/circleColors.ts` with pure functions that derive circle chart colors from design token values. No DOM access in the pure functions — token values are passed as arguments.

- [ ] Create `src/renderer/utils/circleColors.ts`

```typescript
// src/renderer/utils/circleColors.ts
// Pure color computation for circle chart segments. No DOM dependencies.

export type CircleColorMode = 'branch' | 'sex';

export interface ThemeColors {
  accent: string;       // --accent
  sidebarBg: string;    // --sidebar-bg
  sexM: string;         // --sex-m-bg  (light mode) or darkened variant
  sexF: string;         // --sex-f-bg
  sexU: string;         // --sex-u-bg
}

/** Parse "#rrggbb" to [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Convert [r, g, b] back to "#rrggbb". */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

/** Lighten a hex color toward white by `amount` (0–1). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Darken a hex color toward black by `amount` (0–1). */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Rotate hue of a hex color by `degrees`. */
export function rotateHue(hex: string, degrees: number): string {
  const [r, g, b] = hexToRgb(hex);
  // Convert to HSL, rotate, convert back
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  h = ((h * 360 + degrees) % 360 + 360) % 360;
  // HSL to RGB
  if (s === 0) {
    const v = Math.round(l * 255);
    return rgbToHex(v, v, v);
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hN = h / 360;
  return rgbToHex(
    Math.round(hue2rgb(p, q, hN + 1/3) * 255),
    Math.round(hue2rgb(p, q, hN) * 255),
    Math.round(hue2rgb(p, q, hN - 1/3) * 255),
  );
}

/**
 * Generate 4 branch base colors from a theme accent color.
 * Each branch is a 90° hue rotation from the previous.
 */
export function branchBaseColors(accent: string): [string, string, string, string] {
  return [
    accent,
    rotateHue(accent, 90),
    rotateHue(accent, 180),
    rotateHue(accent, 270),
  ];
}

/**
 * Compute segment fill for branch color mode.
 * @param ahnNum   Ahnentafel number (1=focal, 2=father, 3=mother, ...)
 * @param gen      Generation (0=focal, 1=parents, ...)
 * @param isEmpty  Whether the segment has no person
 * @param branches 4 branch base colors from branchBaseColors()
 * @param isDark   Whether dark mode is active
 */
export function branchFill(
  ahnNum: number, gen: number, isEmpty: boolean,
  branches: [string, string, string, string],
  isDark: boolean,
): string {
  let base: string;
  if (gen === 0) {
    base = isDark ? '#e0e0e0' : '#2c3e50';
  } else if (gen === 1) {
    // Father side = branches 0+1 blended, Mother side = branches 2+3 blended
    base = ahnNum === 2 ? branches[0] : branches[2];
  } else {
    const rootAhn = ahnNum >> (gen - 2);    // range 4–7
    const branchIdx = rootAhn - 4;          // 0–3
    const lightenAmt = isDark ? (gen - 2) * 0.05 : (gen - 2) * 0.07;
    base = isDark
      ? darken(branches[branchIdx] ?? '#888', lightenAmt)
      : lighten(branches[branchIdx] ?? '#ccc', lightenAmt);
  }
  if (isEmpty) {
    base = isDark ? lighten(base, 0.15) : lighten(base, 0.55);
  }
  return base;
}

/**
 * Compute segment fill for sex-based color mode.
 */
export function sexFill(
  sex: 'M' | 'F' | 'U' | string,
  gen: number,
  isEmpty: boolean,
  theme: ThemeColors,
  isDark: boolean,
): string {
  const sexBaseMap: Record<string, string> = { M: theme.sexM, F: theme.sexF, U: theme.sexU };
  let base = sexBaseMap[sex] ?? theme.sexU;
  // In light mode the sex token colors are very pale — darken them for chart fill
  if (!isDark) base = darken(base, 0.35);
  // Lighten slightly per generation for depth
  base = isDark ? darken(base, gen * 0.03) : lighten(base, gen * 0.04);
  if (isEmpty) base = isDark ? lighten(base, 0.2) : lighten(base, 0.5);
  return base;
}

/**
 * Gradient stops for a single segment (radial depth effect).
 * Returns [innerColor, outerColor].
 */
export function segmentGradientStops(baseFill: string, isDark: boolean): [string, string] {
  return isDark
    ? [lighten(baseFill, 0.08), darken(baseFill, 0.06)]
    : [lighten(baseFill, 0.06), darken(baseFill, 0.08)];
}

/**
 * Focal circle fill.
 */
export function focalFill(sidebarBg: string, isDark: boolean): string {
  return isDark ? lighten(sidebarBg, 0.3) : sidebarBg;
}

/**
 * Print-mode fill: grayscale.
 * Focal=dark gray, gen 1-2=medium, gen 3-4=light, gen 5-6=very light.
 * Empty segments get a subtle dashed pattern (handled in SVG, not here).
 */
export function printFill(gen: number, isEmpty: boolean): string {
  if (isEmpty) return '#f5f5f5';
  const shades: Record<number, string> = {
    0: '#333333', 1: '#666666', 2: '#888888',
    3: '#aaaaaa', 4: '#bbbbbb', 5: '#cccccc', 6: '#dddddd',
  };
  return shades[gen] ?? '#dddddd';
}

/**
 * Read current theme token values from the DOM.
 * Call this once per render cycle (not per segment).
 */
export function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const get = (prop: string) => style.getPropertyValue(prop).trim();
  return {
    accent: get('--accent') || '#2d5a27',
    sidebarBg: get('--sidebar-bg') || '#1a2e1a',
    sexM: get('--sex-m-bg') || '#e0eaf2',
    sexF: get('--sex-f-bg') || '#f5e8ee',
    sexU: get('--sex-u-bg') || '#e8e8e8',
  };
}

/**
 * Detect dark mode from DOM.
 */
export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}
```

---

## Task 2 — Unit tests for color generation

- [ ] Create `tests/unit/circleColors.test.ts`

```typescript
// tests/unit/circleColors.test.ts
import { describe, it, expect } from 'vitest';
import {
  hexToRgb, rgbToHex, lighten, darken, rotateHue,
  branchBaseColors, branchFill, sexFill, segmentGradientStops,
  printFill, focalFill,
  type ThemeColors,
} from '../../src/renderer/utils/circleColors';

describe('hexToRgb', () => {
  it('parses #ff8040', () => {
    expect(hexToRgb('#ff8040')).toEqual([255, 128, 64]);
  });
  it('parses #000000', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });
});

describe('rgbToHex', () => {
  it('converts back to hex', () => {
    expect(rgbToHex(255, 128, 64)).toBe('#ff8040');
  });
  it('clamps values', () => {
    expect(rgbToHex(300, -5, 0)).toBe('#ff0000');
  });
});

describe('lighten', () => {
  it('lightens toward white', () => {
    const result = lighten('#000000', 0.5);
    expect(hexToRgb(result)).toEqual([128, 128, 128]);
  });
  it('amount=0 returns same color', () => {
    expect(lighten('#ff8040', 0)).toBe('#ff8040');
  });
  it('amount=1 returns white', () => {
    expect(lighten('#ff8040', 1)).toBe('#ffffff');
  });
});

describe('darken', () => {
  it('darkens toward black', () => {
    const result = darken('#ffffff', 0.5);
    expect(hexToRgb(result)).toEqual([128, 128, 128]);
  });
  it('amount=0 returns same color', () => {
    expect(darken('#ff8040', 0)).toBe('#ff8040');
  });
});

describe('rotateHue', () => {
  it('180° rotation of pure red gives cyan', () => {
    const result = rotateHue('#ff0000', 180);
    expect(result).toBe('#00ffff');
  });
  it('360° rotation returns same color', () => {
    const result = rotateHue('#2d5a27', 360);
    expect(result).toBe('#2d5a27');
  });
});

describe('branchBaseColors', () => {
  it('returns 4 colors', () => {
    const branches = branchBaseColors('#2d5a27');
    expect(branches).toHaveLength(4);
    expect(branches[0]).toBe('#2d5a27');
  });
  it('each branch differs from the previous', () => {
    const branches = branchBaseColors('#2d5a27');
    const unique = new Set(branches);
    expect(unique.size).toBe(4);
  });
});

describe('branchFill', () => {
  const branches = branchBaseColors('#2d5a27') as [string, string, string, string];

  it('focal (gen 0) returns dark color in light mode', () => {
    const fill = branchFill(1, 0, false, branches, false);
    expect(fill).toBe('#2c3e50');
  });

  it('focal (gen 0) returns light color in dark mode', () => {
    const fill = branchFill(1, 0, false, branches, true);
    expect(fill).toBe('#e0e0e0');
  });

  it('empty segments are lighter than filled in light mode', () => {
    const filled = branchFill(4, 2, false, branches, false);
    const empty = branchFill(4, 2, true, branches, false);
    // Empty should be lighter (higher RGB sum)
    const filledSum = hexToRgb(filled).reduce((a, b) => a + b, 0);
    const emptySum = hexToRgb(empty).reduce((a, b) => a + b, 0);
    expect(emptySum).toBeGreaterThan(filledSum);
  });

  it('gen 1 father uses branch 0', () => {
    const fill = branchFill(2, 1, false, branches, false);
    expect(fill).toBe(branches[0]);
  });

  it('gen 1 mother uses branch 2', () => {
    const fill = branchFill(3, 1, false, branches, false);
    expect(fill).toBe(branches[2]);
  });
});

describe('sexFill', () => {
  const theme: ThemeColors = {
    accent: '#2d5a27',
    sidebarBg: '#1a2e1a',
    sexM: '#e0eaf2',
    sexF: '#f5e8ee',
    sexU: '#e8e8e8',
  };

  it('male and female produce different fills', () => {
    const m = sexFill('M', 2, false, theme, false);
    const f = sexFill('F', 2, false, theme, false);
    expect(m).not.toBe(f);
  });

  it('empty is lighter than filled', () => {
    const filled = sexFill('M', 2, false, theme, false);
    const empty = sexFill('M', 2, true, theme, false);
    const filledSum = hexToRgb(filled).reduce((a, b) => a + b, 0);
    const emptySum = hexToRgb(empty).reduce((a, b) => a + b, 0);
    expect(emptySum).toBeGreaterThan(filledSum);
  });
});

describe('segmentGradientStops', () => {
  it('returns two different colors', () => {
    const [inner, outer] = segmentGradientStops('#6a9cc0', false);
    expect(inner).not.toBe(outer);
  });
  it('inner is lighter than outer in light mode', () => {
    const [inner, outer] = segmentGradientStops('#6a9cc0', false);
    const innerSum = hexToRgb(inner).reduce((a, b) => a + b, 0);
    const outerSum = hexToRgb(outer).reduce((a, b) => a + b, 0);
    expect(innerSum).toBeGreaterThan(outerSum);
  });
});

describe('printFill', () => {
  it('focal is darkest', () => {
    const focal = printFill(0, false);
    const gen3 = printFill(3, false);
    const focalSum = hexToRgb(focal).reduce((a, b) => a + b, 0);
    const gen3Sum = hexToRgb(gen3).reduce((a, b) => a + b, 0);
    expect(focalSum).toBeLessThan(gen3Sum);
  });
  it('empty is very light', () => {
    expect(printFill(3, true)).toBe('#f5f5f5');
  });
});

describe('focalFill', () => {
  it('returns sidebarBg in light mode', () => {
    expect(focalFill('#1a2e1a', false)).toBe('#1a2e1a');
  });
  it('lightens in dark mode', () => {
    const result = focalFill('#1a2e1a', true);
    const resultSum = hexToRgb(result).reduce((a, b) => a + b, 0);
    const origSum = hexToRgb('#1a2e1a').reduce((a, b) => a + b, 0);
    expect(resultSum).toBeGreaterThan(origSum);
  });
});
```

Run: `npm test -- tests/unit/circleColors.test.ts`

---

## Task 3 — Update circleLayout.ts to accept external fill function

Remove hardcoded color logic from `circleLayout.ts` and make fill computation pluggable.

- [ ] Edit `src/renderer/utils/circleLayout.ts`:

**Remove** `BRANCH_BASE`, `lightenHex`, and `computeFill` functions entirely.

**Change** the `computeCircleLayout` signature to accept an optional fill function:

```typescript
export function computeCircleLayout(
  tree: PedigreeTree,
  maxGen = 6,
  fillFn?: (ahnNum: number, gen: number, isEmpty: boolean, person: PersonNode | null) => string,
): CircleSegment[]
```

In the loop body, replace `computeFill(ahnNum, gen, isEmpty)` with:

```typescript
const fill = fillFn
  ? fillFn(ahnNum, gen, isEmpty, person)
  : isEmpty ? '#e0e0e0' : (gen === 0 ? '#2c3e50' : '#999');
```

This keeps the layout pure (no DOM access) while allowing callers to inject theme-aware fills.

---

## Task 4 — Update CircleChartSvg.vue for gradients, typography, hover, empty segments, focal glow

- [ ] Edit `src/renderer/components/charts/CircleChartSvg.vue`

### 4a — SVG `<defs>`: radial gradients + empty pattern

Add to the existing `<defs>` block (or create one if `curvedText` is off):

```html
<defs>
  <!-- Existing textPath defs ... -->

  <!-- Radial gradient per non-focal segment (subtle depth) -->
  <radialGradient
    v-for="seg in nonFocalSegments"
    :key="`grad-${seg.ahnNum}`"
    :id="`grad-${seg.ahnNum}`"
    cx="50%" cy="50%" r="70%"
  >
    <stop offset="0%" :stop-color="gradientStops(seg)[0]" />
    <stop offset="100%" :stop-color="gradientStops(seg)[1]" />
  </radialGradient>

  <!-- Subtle diagonal stripe pattern for empty segments -->
  <pattern id="empty-pattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" :stroke="emptyPatternStroke" stroke-width="0.5" />
  </pattern>

  <!-- Focal circle shadow filter -->
  <filter id="focal-shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="0" stdDeviation="3" :flood-color="focalShadowColor" flood-opacity="0.3" />
  </filter>
</defs>
```

### 4b — Segment path fill

Change segment `<path>` fill from `:fill="seg.fill"` to:

```html
<path
  :d="seg.pathD"
  :fill="seg.isEmpty ? `url(#empty-pattern)` : `url(#grad-${seg.ahnNum})`"
  :stroke="strokeColor"
  :stroke-width="strokeWidth"
  stroke-linejoin="round"
  class="seg-path"
/>
<!-- Background fill for empty segments (pattern needs a base color) -->
<path
  v-if="seg.isEmpty"
  :d="seg.pathD"
  :fill="seg.fill"
  :stroke="strokeColor"
  :stroke-width="strokeWidth"
  stroke-linejoin="round"
  style="pointer-events: none;"
/>
```

Actually, simpler approach: render the base fill path first, then overlay the pattern for empty:

```html
<path :d="seg.pathD" :fill="seg.isEmpty ? seg.fill : `url(#grad-${seg.ahnNum})`" :stroke="strokeColor" :stroke-width="strokeWidth" stroke-linejoin="round" class="seg-path" />
<path v-if="seg.isEmpty" :d="seg.pathD" fill="url(#empty-pattern)" style="pointer-events: none; opacity: 0.3;" />
```

### 4c — Focal circle

Add `filter="url(#focal-shadow)"` to the focal `<circle>` element. Increase focal text sizes: name from 10 to 11, dates from 8 to 9.

### 4d — Typography improvements

Update `nameFontSize` to use `--font-weight-bold` (600) for gen 1-2, `--font-weight-medium` (500) for gen 3+. Date text uses `--font-weight-normal` (400). Already mostly correct — just ensure the `font-weight` attributes reference the token values.

Change date text fill from `rgba(255,255,255,0.75)` to `rgba(255,255,255,0.7)` and name text to `fill="white"` with `font-weight="700"` for gen 1-2 (bolder names).

### 4e — New props

Add to Props interface:

```typescript
strokeColor?: string;        // defaults to 'white', overridden for dark/print
emptyPatternStroke?: string;  // defaults to 'rgba(0,0,0,0.15)'
focalShadowColor?: string;    // defaults to 'rgba(0,0,0,0.3)'
```

### 4f — New computed

```typescript
import { segmentGradientStops } from '../../utils/circleColors';

function gradientStops(seg: CircleSegment): [string, string] {
  return segmentGradientStops(seg.fill, props.strokeColor === 'rgba(255,255,255,0.3)');
}
```

### 4g — Hover transition CSS

Add to a `<style>` block (not scoped, since SVG uses it):

```css
.seg-path {
  transition: filter 0.15s ease;
}
.circle-seg.clickable:hover .seg-path {
  filter: brightness(1.12);
}
```

---

## Task 5 — Dark mode color adjustments

- [ ] Edit `src/renderer/components/charts/CircleChart.vue`

When computing fills, detect dark mode and pass it through:

```typescript
import {
  readThemeColors, isDarkMode, branchBaseColors, branchFill, sexFill, focalFill,
  type CircleColorMode,
} from '../../utils/circleColors';

const colorMode = ref<CircleColorMode>('branch');

const layout = computed<CircleSegment[]>(() => {
  if (!tree.value) return [];
  const dark = isDarkMode();
  const theme = readThemeColors();
  const branches = branchBaseColors(theme.accent);

  return computeCircleLayout(tree.value, selectedGens.value, (ahnNum, gen, isEmpty, person) => {
    if (colorMode.value === 'sex' && person) {
      return sexFill(person.sex, gen, isEmpty, theme, dark);
    }
    return branchFill(ahnNum, gen, isEmpty, branches, dark);
  });
});
```

Pass dark-mode-aware props to `CircleChartSvg`:

```html
<CircleChartSvg
  ...
  :stroke-color="dark ? 'rgba(255,255,255,0.15)' : 'white'"
  :empty-pattern-stroke="dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)'"
  :focal-shadow-color="dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)'"
/>
```

Add a computed `dark` ref:

```typescript
import { isDarkMode } from '../../utils/circleColors';
const dark = computed(() => isDarkMode());
```

Note: `isDarkMode()` reads from DOM. To make it reactive, watch for class changes on `<html>` via a MutationObserver, or re-read on each layout recompute (simpler, sufficient since theme changes trigger re-render).

---

## Task 6 — High-contrast mode support

- [ ] Edit `src/renderer/utils/circleColors.ts` — add high-contrast fill function
- [ ] Edit `src/renderer/components/charts/CircleChart.vue` — detect high-contrast

Add to `circleColors.ts`:

```typescript
/** Detect high-contrast mode from DOM. */
export function isHighContrast(): boolean {
  return document.documentElement.classList.contains('high-contrast');
}

/**
 * High-contrast fills: strong solid colors with maximum text contrast.
 * Uses fewer, more saturated colors. All text becomes pure white or black.
 */
export function highContrastBranchFill(
  ahnNum: number, gen: number, isEmpty: boolean,
  branches: [string, string, string, string],
): string {
  if (gen === 0) return '#000000';
  if (isEmpty) return '#ffffff';
  const rootAhn = gen >= 2 ? (ahnNum >> (gen - 2)) - 4 : (ahnNum === 2 ? 0 : 2);
  const branchIdx = Math.min(rootAhn, 3);
  // Saturate and darken for maximum contrast with white text
  return darken(branches[branchIdx] ?? '#555', 0.2);
}
```

In `CircleChart.vue`, detect high-contrast and choose fills accordingly:

```typescript
const highContrast = computed(() => isHighContrast());

// In the layout computed, add:
if (highContrast.value) {
  return computeCircleLayout(tree.value, selectedGens.value, (ahnNum, gen, isEmpty) => {
    return highContrastBranchFill(ahnNum, gen, isEmpty, branches);
  });
}
```

For high-contrast, disable gradients by passing a prop `noGradients` to `CircleChartSvg`:

```html
<CircleChartSvg ... :no-gradients="highContrast" />
```

In `CircleChartSvg.vue`, when `noGradients` is true, use `:fill="seg.fill"` directly instead of `url(#grad-...)`.

---

## Task 7 — Print mode (unthemed) styling

- [ ] Edit `src/renderer/components/reports/CircleChartReport.vue`

Pass a print-mode fill function:

```typescript
import { printFill } from '../../utils/circleColors';

const layout = computed<CircleSegment[]>(() =>
  tree.value
    ? computeCircleLayout(tree.value, gens.value, (ahnNum, gen, isEmpty) => printFill(gen, isEmpty))
    : [],
);
```

Pass print-specific props to `CircleChartSvg`:

```html
<CircleChartSvg
  ...
  stroke-color="#999"
  :no-gradients="true"
  empty-pattern-stroke="rgba(0,0,0,0.08)"
  focal-shadow-color="rgba(0,0,0,0.15)"
/>
```

Also add `@media print` CSS to the report:

```css
@media print {
  .chart-report :deep(.seg-path) {
    filter: none !important;
    transition: none !important;
  }
}
```

---

## Task 8 — Sex-based coloring toggle in CircleChart.vue

- [ ] Edit `src/renderer/components/charts/CircleChart.vue`

Add a toggle button to the zoom controls bar (next to the curved-text toggle):

```html
<span class="zoom-sep">|</span>
<button
  class="zoom-btn"
  :class="{ active: colorMode === 'sex' }"
  @click="toggleColorMode"
  :title="$t('visualization.circleColorMode')"
>
  {{ colorMode === 'branch' ? '🌳' : '♀♂' }}
</button>
```

Note: The emoji above is just for illustration. Use a simple text label instead:

```html
<button
  class="zoom-btn"
  :class="{ active: colorMode === 'sex' }"
  @click="toggleColorMode"
  :title="$t('visualization.circleColorMode')"
>{{ colorMode === 'branch' ? $t('visualization.circleColorBranch') : $t('visualization.circleColorSex') }}</button>
```

```typescript
function toggleColorMode() {
  colorMode.value = colorMode.value === 'branch' ? 'sex' : 'branch';
}
```

Persist the preference in localStorage:

```typescript
const colorMode = ref<CircleColorMode>(
  (localStorage.getItem('circle-color-mode') as CircleColorMode) || 'branch'
);
watch(colorMode, (v) => localStorage.setItem('circle-color-mode', v));
```

---

## Task 9 — i18n for new controls

- [ ] Edit `src/renderer/i18n/sv.ts`
- [ ] Edit `src/renderer/i18n/en.ts`

Add under the `visualization` namespace:

**Swedish (`sv.ts`):**
```typescript
circleColorMode: 'Färgläge',
circleColorBranch: 'Gren',
circleColorSex: 'Kön',
```

**English (`en.ts`):**
```typescript
circleColorMode: 'Color mode',
circleColorBranch: 'Branch',
circleColorSex: 'Sex',
```

---

## Task 10 — Integration test and lint check

- [ ] Run `npm test -- tests/unit/circleColors.test.ts tests/unit/circleLayout.test.ts` — all pass
- [ ] Run `npm run lint` — 0 errors
- [ ] Run `npm test` — all 1159+ existing tests still pass
- [ ] Manual verification: launch app with `npm start`, open circle chart, verify:
  - Forest/Nordic/Twilight themes each produce different color palettes
  - Dark mode inverts properly (no white-on-white text)
  - High-contrast mode shows strong solid fills
  - Sex-based coloring toggle works
  - Empty segments show subtle pattern
  - Focal circle has shadow/glow
  - Hover on segments shows brightness transition
  - Print mode (`CircleChartReport`) renders clean grayscale

---

## File change summary

| File | Action |
|------|--------|
| `src/renderer/utils/circleColors.ts` | **New** — pure color computation |
| `tests/unit/circleColors.test.ts` | **New** — unit tests |
| `src/renderer/utils/circleLayout.ts` | **Edit** — remove hardcoded colors, add `fillFn` param |
| `src/renderer/components/charts/CircleChartSvg.vue` | **Edit** — gradients, pattern, focal shadow, hover, new props |
| `src/renderer/components/charts/CircleChart.vue` | **Edit** — theme-aware fills, color mode toggle, dark/HC detection |
| `src/renderer/components/reports/CircleChartReport.vue` | **Edit** — print-mode fills |
| `src/renderer/i18n/sv.ts` | **Edit** — 3 new keys |
| `src/renderer/i18n/en.ts` | **Edit** — 3 new keys |

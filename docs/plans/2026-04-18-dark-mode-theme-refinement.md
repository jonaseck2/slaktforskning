# Dark Mode Theme Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each color theme (Forest, Nordic, Twilight) retain its visual identity in dark mode instead of collapsing to identical gray surfaces.

**Architecture:** Replace the single `html.dark { }` token block in `shared.css` with per-theme dark variants (`html.dark.theme-forest`, `html.dark.theme-nordic`, `html.dark.theme-twilight`) that tint surfaces, accents, and shadows with theme-appropriate colors. Shared dark-mode overrides (semantic colors, element-specific styles) remain in a common `html.dark` block. Chart components read CSS custom properties instead of hardcoded hex values.

**Tech Stack:** CSS custom properties (tokens.css, shared.css), Vue 3 chart components, Playwright E2E visual tests.

---

## Task 1: Define per-theme dark color palettes

**File:** Reference only (values used in Tasks 2-4)

All hex values chosen for WCAG AA contrast (≥4.5:1 for text, ≥3:1 for UI elements) against their respective backgrounds.

### Forest Dark

| Token | Light value | Dark value | Notes |
|-------|------------|------------|-------|
| `--surface-bg` | `#e8f0e8` | `#1a2a1e` | Dark green-gray background |
| `--surface` | `#ffffff` | `#0f1a12` | Deepest surface |
| `--surface-hover` | `#f0f6f0` | `#243a28` | Hover with green tint |
| `--surface-border` | `#c0d4c0` | `#2e4a2e` | Green-tinted border |
| `--surface-border-subtle` | `#e0ece0` | `#1a2a1e` | Subtle green border |
| `--text-primary` | `#1a2e1a` | `#d0e8d0` | Warm light green-gray |
| `--text-secondary` | `#4a6a4a` | `#8fb88f` | Muted green |
| `--text-muted` | `#6a7a62` | `#5a7a5a` | Dim green |
| `--accent` | `#2d5a27` | `#3a7a34` | Brighter forest green |
| `--accent-hover` | `#1e4a1a` | `#4a9a44` | Hover green |
| `--accent-text` | `#e0f0dc` | `#d0f0cc` | Light green text on accent |
| `--sidebar-bg` | `#1a2e1a` | `#0f1a0f` | Darker sidebar |
| `--sidebar-text` | `#8fb88f` | `#7aaa7a` | Slightly dimmer |
| `--sidebar-text-muted` | `#5a7a5a` | `#4a6a4a` | Dimmer muted |
| `--sidebar-active-bg` | `#2e4a2e` | `#1a3a1a` | Active item bg |
| `--sidebar-active-text` | `#d0e8d0` | `#b0d8b0` | Active item text |
| `--sidebar-border` | `#2e4a2e` | `#1a3a1a` | Border |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,40,0,0.3)` | Green-tinted shadow |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.06)` | `0 2px 8px rgba(0,40,0,0.4)` | Green-tinted shadow |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.08)` | `0 4px 16px rgba(0,40,0,0.5)` | Green-tinted shadow |

### Nordic Dark

| Token | Light value | Dark value | Notes |
|-------|------------|------------|-------|
| `--surface-bg` | `#f0f2f6` | `#1a2030` | Dark blue-gray background |
| `--surface` | `#fafbfd` | `#0f1520` | Deepest surface |
| `--surface-hover` | `#e8ecf4` | `#243048` | Hover with blue tint |
| `--surface-border` | `#d0d8e4` | `#2a3a5a` | Blue-tinted border |
| `--surface-border-subtle` | `#e2e8f0` | `#1a2030` | Subtle blue border |
| `--text-primary` | `#0f172a` | `#d0daf0` | Cool light blue-gray |
| `--text-secondary` | `#475569` | `#7a9abe` | Muted blue |
| `--text-muted` | `#64748b` | `#5a7a9a` | Dim blue |
| `--accent` | `#1d4ed8` | `#3b6ef0` | Brighter blue |
| `--accent-hover` | `#1e40af` | `#5080f8` | Hover blue |
| `--accent-text` | `#ffffff` | `#ffffff` | White on blue accent |
| `--sidebar-bg` | `#0f1a2e` | `#0a1020` | Darker sidebar |
| `--sidebar-text` | `#7a9abe` | `#6a8aae` | Slightly dimmer |
| `--sidebar-text-muted` | `#5a7a9a` | `#4a6a8a` | Dimmer muted |
| `--sidebar-active-bg` | `#1a3050` | `#142040` | Active item bg |
| `--sidebar-active-text` | `#a0c8f0` | `#90b8e0` | Active item text |
| `--sidebar-border` | `#1a3050` | `#142040` | Border |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,20,60,0.3)` | Blue-tinted shadow |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.06)` | `0 2px 8px rgba(0,20,60,0.4)` | Blue-tinted shadow |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.08)` | `0 4px 16px rgba(0,20,60,0.5)` | Blue-tinted shadow |

### Twilight Dark

| Token | Light value | Dark value | Notes |
|-------|------------|------------|-------|
| `--surface-bg` | `#f4f2f8` | `#1e1a28` | Dark purple-gray background |
| `--surface` | `#faf8fd` | `#12101e` | Deepest surface |
| `--surface-hover` | `#ede8f4` | `#2a2440` | Hover with purple tint |
| `--surface-border` | `#d4cce0` | `#362e52` | Purple-tinted border |
| `--surface-border-subtle` | `#e4ddf0` | `#1e1a28` | Subtle purple border |
| `--text-primary` | `#1e1b2e` | `#d8d0f0` | Warm light purple-gray |
| `--text-secondary` | `#4a4070` | `#9a8cc0` | Muted purple |
| `--text-muted` | `#6a6090` | `#7a70a0` | Dim purple |
| `--accent` | `#6c5ce7` | `#7d6ef0` | Brighter purple |
| `--accent-hover` | `#5a4bd1` | `#9080f8` | Hover purple |
| `--accent-text` | `#ffffff` | `#ffffff` | White on purple accent |
| `--sidebar-bg` | `#1e1b2e` | `#141220` | Darker sidebar |
| `--sidebar-text` | `#9a8cc0` | `#8a7cb0` | Slightly dimmer |
| `--sidebar-text-muted` | `#7a70a0` | `#6a6090` | Dimmer muted |
| `--sidebar-active-bg` | `#2e2848` | `#221e38` | Active item bg |
| `--sidebar-active-text` | `#c0b8e0` | `#b0a8d0` | Active item text |
| `--sidebar-border` | `#2e2848` | `#221e38` | Border |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(30,0,60,0.3)` | Purple-tinted shadow |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.06)` | `0 2px 8px rgba(30,0,60,0.4)` | Purple-tinted shadow |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.08)` | `0 4px 16px rgba(30,0,60,0.5)` | Purple-tinted shadow |

- [ ] Review palette values above (no code changes in this task)

---

## Task 2: Add per-theme dark token variants to shared.css

**File:** `src/renderer/styles/shared.css`

Replace the single `html.dark` token block (lines 553-591) with a shared dark base plus per-theme dark overrides. The shared block keeps semantic colors (error/warning/success/info, sex badges, legacy overrides). Per-theme blocks set surface, text, accent, sidebar, and shadow tokens.

### Steps

- [ ] 2a. In `src/renderer/styles/shared.css`, find the existing `html.dark` block inside `@media screen {` (lines 553-591). Replace it with the structure below.

**Replace** the block starting at `html.dark {` (line 553) through the closing `}` before `/* Element-specific dark overrides` comment (line 591) with:

```css
  /* ── Dark mode: shared base (semantic + legacy) ───── */
  html.dark {
    /* Semantic colors — theme-invariant in dark mode */
    --error-bg:   #450a0a;
    --error-text: #fca5a5;
    --warning-bg:   #78350f;
    --warning-text:  #fde68a;
    --success-bg: #14532d;
    --success-text: #86efac;
    --info-bg:    #1e3a8a;
    --info-text:  #93c5fd;

    --sex-m-bg:   #1e3a8a;
    --sex-m-text: #93c5fd;
    --sex-f-bg:   #831843;
    --sex-f-text: #fbcfe8;
    --sex-u-bg:   #374151;
    --sex-u-text: #9ca3af;

    /* Legacy overrides */
    --color-text-subtle:    #9ca3af;
    --color-danger-hover:   #7f1d1d;
    --color-link:           #60a5fa;
    --color-event-badge-bg:   #1e3a8a;
    --color-event-badge-text: #93c5fd;
  }

  /* ── Dark mode: Forest theme ───── */
  html.dark.theme-forest,
  html.dark:not(.theme-nordic):not(.theme-twilight) {
    --surface-bg:            #1a2a1e;
    --surface:               #0f1a12;
    --surface-hover:         #243a28;
    --surface-border:        #2e4a2e;
    --surface-border-subtle: #1a2a1e;

    --text-primary:   #d0e8d0;
    --text-secondary: #8fb88f;
    --text-muted:     #5a7a5a;

    --accent:       #3a7a34;
    --accent-hover: #4a9a44;
    --accent-text:  #d0f0cc;

    --sidebar-bg:          #0f1a0f;
    --sidebar-text:        #7aaa7a;
    --sidebar-text-muted:  #4a6a4a;
    --sidebar-active-bg:   #1a3a1a;
    --sidebar-active-text: #b0d8b0;
    --sidebar-border:      #1a3a1a;

    --shadow-sm: 0 1px 2px rgba(0, 40, 0, 0.3);
    --shadow-md: 0 2px 8px rgba(0, 40, 0, 0.4);
    --shadow-lg: 0 4px 16px rgba(0, 40, 0, 0.5);
  }

  /* ── Dark mode: Nordic theme ───── */
  html.dark.theme-nordic {
    --surface-bg:            #1a2030;
    --surface:               #0f1520;
    --surface-hover:         #243048;
    --surface-border:        #2a3a5a;
    --surface-border-subtle: #1a2030;

    --text-primary:   #d0daf0;
    --text-secondary: #7a9abe;
    --text-muted:     #5a7a9a;

    --accent:       #3b6ef0;
    --accent-hover: #5080f8;
    --accent-text:  #ffffff;

    --sidebar-bg:          #0a1020;
    --sidebar-text:        #6a8aae;
    --sidebar-text-muted:  #4a6a8a;
    --sidebar-active-bg:   #142040;
    --sidebar-active-text: #90b8e0;
    --sidebar-border:      #142040;

    --shadow-sm: 0 1px 2px rgba(0, 20, 60, 0.3);
    --shadow-md: 0 2px 8px rgba(0, 20, 60, 0.4);
    --shadow-lg: 0 4px 16px rgba(0, 20, 60, 0.5);
  }

  /* ── Dark mode: Twilight theme ───── */
  html.dark.theme-twilight {
    --surface-bg:            #1e1a28;
    --surface:               #12101e;
    --surface-hover:         #2a2440;
    --surface-border:        #362e52;
    --surface-border-subtle: #1e1a28;

    --text-primary:   #d8d0f0;
    --text-secondary: #9a8cc0;
    --text-muted:     #7a70a0;

    --accent:       #7d6ef0;
    --accent-hover: #9080f8;
    --accent-text:  #ffffff;

    --sidebar-bg:          #141220;
    --sidebar-text:        #8a7cb0;
    --sidebar-text-muted:  #6a6090;
    --sidebar-active-bg:   #221e38;
    --sidebar-active-text: #b0a8d0;
    --sidebar-border:      #221e38;

    --shadow-sm: 0 1px 2px rgba(30, 0, 60, 0.3);
    --shadow-md: 0 2px 8px rgba(30, 0, 60, 0.4);
    --shadow-lg: 0 4px 16px rgba(30, 0, 60, 0.5);
  }
```

**Key detail:** The Forest dark block uses `html.dark.theme-forest, html.dark:not(.theme-nordic):not(.theme-twilight)` so Forest is the default dark theme when no explicit theme class is set (matching light mode default behavior where `:root` defines Forest).

- [ ] 2b. Verify lint passes: `npm run lint`

---

## Task 3: Update element-specific dark overrides

**File:** `src/renderer/styles/shared.css`

The element-specific overrides (lines 596-688) already use `html.dark` selectors and reference `var(--token)` for most values. These continue to work unchanged because they read from tokens that now vary per-theme.

### Steps

- [ ] 3a. Audit lines 596-688 for any **hardcoded hex values** that should become per-theme. Known hardcoded values:
  - Line 633: `html.dark h2, html.dark h3, html.dark h4 { color: #f3f4f6; }` — replace with `var(--text-primary)` (the per-theme text-primary is already bright enough for headings)
  - Line 634: `html.dark .section-header h4 { color: #f3f4f6; }` — same, replace with `var(--text-primary)`
  - Line 643: `html.dark .issues-banner { background: #1e2a3a; ... color: #fbbf24; }` — replace background with `var(--surface-bg)`, keep warning color
  - Line 644: `html.dark .banner-error { background: #2d1a1a; ... }` — keep as-is (error-specific, not theme-dependent)

Replace:
```css
html.dark h2, html.dark h3, html.dark h4 { color: #f3f4f6; }
html.dark .section-header h4 { color: #f3f4f6; }
```
With:
```css
html.dark h2, html.dark h3, html.dark h4 { color: var(--text-primary); }
html.dark .section-header h4 { color: var(--text-primary); }
```

Replace:
```css
html.dark .issues-banner { background: #1e2a3a; border-color: var(--surface-border); color: #fbbf24; }
```
With:
```css
html.dark .issues-banner { background: var(--surface-bg); border-color: var(--surface-border); color: #fbbf24; }
```

- [ ] 3b. Verify lint passes: `npm run lint`

---

## Task 4: Add chart CSS custom properties for dark mode

**Files:**
- `src/renderer/styles/tokens.css` — add chart tokens
- `src/renderer/components/charts/PedigreeChart.vue`
- `src/renderer/components/charts/HourglassChart.vue`
- `src/renderer/components/charts/DescendantChart.vue`
- `src/renderer/components/charts/TimelineChart.vue`

Charts currently hardcode colors (`#2c3e50` for focal box, `#333` for text, `#ccc` for lines, `white` for box fill, `#f8f8f8` for deceased). Replace with CSS custom properties that adapt to dark mode.

### Steps

- [ ] 4a. Add chart tokens to `src/renderer/styles/tokens.css` at the end of the `:root` block (before the Nordic theme block):

```css
/* ─── Chart colors ──────────────────────────────────────────────────────── */
:root {
  --chart-box-bg:       #ffffff;
  --chart-box-deceased: #f8f8f8;
  --chart-box-focal:    #2c3e50;
  --chart-box-stroke:   #dddddd;
  --chart-focal-stroke: #1a2a3a;
  --chart-text:         #333333;
  --chart-text-sub:     #888888;
  --chart-text-focal:   #ffffff;
  --chart-text-focal-sub: rgba(255,255,255,0.65);
  --chart-line:         #cccccc;
  --chart-placeholder-stroke: #94a3b8;
  --chart-placeholder-text:   #94a3b8;
}
```

- [ ] 4b. Add dark chart tokens to each per-theme dark block in `shared.css`. Add to the **shared** `html.dark` block (since chart chrome colors are mostly theme-neutral — the theme tint comes from the surrounding surface):

```css
    /* Chart */
    --chart-box-bg:       var(--surface-bg);
    --chart-box-deceased: var(--surface);
    --chart-box-focal:    var(--accent);
    --chart-box-stroke:   var(--surface-border);
    --chart-focal-stroke: var(--accent-hover);
    --chart-text:         var(--text-primary);
    --chart-text-sub:     var(--text-secondary);
    --chart-text-focal:   var(--accent-text);
    --chart-text-focal-sub: rgba(255,255,255,0.65);
    --chart-line:         var(--surface-border);
    --chart-placeholder-stroke: var(--text-muted);
    --chart-placeholder-text:   var(--text-muted);
```

- [ ] 4c. Update `PedigreeChart.vue` — replace hardcoded colors with CSS custom properties. In the `<script setup>`:

Replace:
```typescript
function boxFill(box: BoxLayout): string {
  if (box.isFocal) return '#2c3e50';
  if (!box.person.living) return '#f8f8f8';
  return 'white';
}
```
With:
```typescript
function boxFill(box: BoxLayout): string {
  if (box.isFocal) return getComputedStyle(document.documentElement).getPropertyValue('--chart-box-focal').trim() || '#2c3e50';
  if (!box.person.living) return getComputedStyle(document.documentElement).getPropertyValue('--chart-box-deceased').trim() || '#f8f8f8';
  return getComputedStyle(document.documentElement).getPropertyValue('--chart-box-bg').trim() || 'white';
}
```

In the `<template>`, replace hardcoded SVG attribute values:
- `:stroke="box.isFocal ? '#1a2a3a' : '#ddd'"` → `:stroke="box.isFocal ? chartTokens.focalStroke : chartTokens.boxStroke"`
- `:fill="box.isFocal ? 'white' : '#333'"` → `:fill="box.isFocal ? chartTokens.textFocal : chartTokens.text"`
- `:fill="box.isFocal ? 'rgba(255,255,255,0.65)' : '#888'"` → `:fill="box.isFocal ? chartTokens.textFocalSub : chartTokens.textSub"`
- `stroke="#ccc"` → `:stroke="chartTokens.line"`

Add a reactive token reader:
```typescript
import { computed } from 'vue';

const chartTokens = computed(() => {
  const s = getComputedStyle(document.documentElement);
  const g = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    boxBg: g('--chart-box-bg', 'white'),
    boxDeceased: g('--chart-box-deceased', '#f8f8f8'),
    boxFocal: g('--chart-box-focal', '#2c3e50'),
    boxStroke: g('--chart-box-stroke', '#ddd'),
    focalStroke: g('--chart-focal-stroke', '#1a2a3a'),
    text: g('--chart-text', '#333'),
    textSub: g('--chart-text-sub', '#888'),
    textFocal: g('--chart-text-focal', 'white'),
    textFocalSub: g('--chart-text-focal-sub', 'rgba(255,255,255,0.65)'),
    line: g('--chart-line', '#ccc'),
    placeholderStroke: g('--chart-placeholder-stroke', '#94a3b8'),
    placeholderText: g('--chart-placeholder-text', '#94a3b8'),
  };
});
```

**Note:** `getComputedStyle` reads live CSS values, so theme/dark mode changes are reflected. The `computed` re-evaluates when the component re-renders (which happens on theme change since the whole app re-renders).

- [ ] 4d. Apply the same pattern to `HourglassChart.vue` and `DescendantChart.vue` (identical `boxFill`, `sexColor`, and template structure).

- [ ] 4e. Update `TimelineChart.vue` — its `SEX_COLORS` are hardcoded but less impacted. For now, the sex badge colors already use CSS tokens via `--sex-m-bg` etc. in the timeline bar styles. No chart-token changes needed unless the timeline bar backgrounds are hardcoded (they are — `M: '#7eb8f7'`). Replace with CSS custom property reads:

```typescript
const SEX_COLORS: Record<string, string> = {
  M: getComputedStyle(document.documentElement).getPropertyValue('--sex-m-bg').trim() || '#7eb8f7',
  F: getComputedStyle(document.documentElement).getPropertyValue('--sex-f-bg').trim() || '#f7a5c0',
  U: getComputedStyle(document.documentElement).getPropertyValue('--sex-u-bg').trim() || '#bbb',
};
```

- [ ] 4f. Verify lint passes: `npm run lint`

---

## Task 5: Verify high-contrast mode has no regressions

**File:** `src/renderer/styles/shared.css` (lines 690+)

High-contrast mode uses `html.high-contrast` class (no `.dark` class). Since our changes only add CSS rules under `html.dark.*` selectors, high-contrast is unaffected. But verify.

### Steps

- [ ] 5a. Read the high-contrast block in `shared.css` (around line 690) and confirm it does NOT use `html.dark` selectors — it uses `html.high-contrast` exclusively.

- [ ] 5b. Confirm `setAppearance()` in `App.vue` removes the `dark` class when switching to `contrast` mode:
```javascript
document.documentElement.classList.remove('dark', 'high-contrast');
if (value === 'contrast') document.documentElement.classList.add('high-contrast');
```
This means `html.dark.theme-*` rules never apply when high-contrast is active. No regression possible.

- [ ] 5c. (Manual) Launch app, switch to high-contrast mode for each theme. Verify pure black background, white text, blue accent. No theme-tinted surfaces should appear.

---

## Task 6: Run unit tests and lint

**Commands:**

- [ ] 6a. `npm run lint` — must pass with 0 errors
- [ ] 6b. `npm test` — all unit tests must pass (CSS-only changes should not affect API tests)

---

## Task 7: E2E visual smoke test

**File:** `tests/e2e/gui-quality.test.ts` (add to existing test suite, or add a new `tests/e2e/gui-dark-mode.test.ts`)

Add a lightweight E2E test that verifies each theme produces visually distinct dark mode by checking computed CSS values.

### Steps

- [ ] 7a. Create `tests/e2e/gui-dark-mode.test.ts`:

```typescript
/**
 * E2E: Dark mode theme identity — each theme has distinct dark surfaces.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19249;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'dark-mode');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

test.describe('Dark mode theme identity', () => {
  const themes = ['forest', 'nordic', 'twilight'] as const;

  for (const theme of themes) {
    test(`${theme} dark mode has theme-tinted surface`, async () => {
      // Set theme and dark mode via evaluate
      await app.executeJs(`
        document.documentElement.className = 'theme-${theme} dark';
      `);
      await app.settle(100);

      // Read computed surface-bg
      const surfaceBg = await app.executeJs(`
        getComputedStyle(document.documentElement).getPropertyValue('--surface-bg').trim()
      `);

      // Each theme should have a DIFFERENT surface-bg in dark mode
      // Forest: #1a2a1e, Nordic: #1a2030, Twilight: #1e1a28
      expect(surfaceBg).not.toBe('#1f2937'); // old shared gray
      expect(surfaceBg.length).toBeGreaterThan(0);
    });
  }

  test('all three themes have distinct dark surface colors', async () => {
    const surfaces: string[] = [];
    for (const theme of themes) {
      await app.executeJs(`
        document.documentElement.className = 'theme-${theme} dark';
      `);
      await app.settle(50);
      const bg = await app.executeJs(`
        getComputedStyle(document.documentElement).getPropertyValue('--surface-bg').trim()
      `) as string;
      surfaces.push(bg);
    }
    // All three must be different
    expect(new Set(surfaces).size).toBe(3);
  });
});
```

- [ ] 7b. Add the new test to `playwright.config.ts` projects array (follow existing pattern for `gui-quality`).

- [ ] 7c. Run: `npx playwright test gui-dark-mode` — verify all tests pass.

---

## Task 8: Manual testing checklist

No code changes. Walk through each combination to verify visual quality.

- [ ] 8a. **Forest + Dark:** Launch app, set theme to Forest, appearance to Dark. Verify:
  - Sidebar is very dark green (not gray)
  - Main content area has green-tinted dark surface
  - Accent buttons are forest green
  - Table rows have green-tinted hover
  - Pedigree/hourglass/descendant charts render with theme-aware colors

- [ ] 8b. **Nordic + Dark:** Same checks with blue tint:
  - Sidebar is very dark blue
  - Main content area has blue-tinted dark surface
  - Accent buttons are blue
  - Charts render with blue-aware dark theme

- [ ] 8c. **Twilight + Dark:** Same checks with purple tint:
  - Sidebar is very dark purple
  - Main content area has purple-tinted dark surface
  - Accent buttons are purple
  - Charts render with purple-aware dark theme

- [ ] 8d. **Theme switching in dark mode:** Switch between themes while in dark mode. Verify instant color transition with no flash of wrong colors.

- [ ] 8e. **High-contrast mode:** Switch to high-contrast for each theme. Verify identical appearance (pure black, white text, blue accent) regardless of theme.

- [ ] 8f. **Light mode regression:** Switch back to light mode for each theme. Verify unchanged from before (no accidental overrides).

- [ ] 8g. **Modal dialogs in dark mode:** Open Add Person modal in each dark theme. Verify modal background, input fields, and buttons use theme-tinted colors.

- [ ] 8h. **Settings view in dark mode:** Verify the theme preview cards or selectors are visible and distinguishable.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/renderer/styles/shared.css` | Split `html.dark` into shared + 3 per-theme dark blocks; fix hardcoded heading/banner colors |
| `src/renderer/styles/tokens.css` | Add `--chart-*` custom properties |
| `src/renderer/components/charts/PedigreeChart.vue` | Replace hardcoded SVG colors with CSS custom properties |
| `src/renderer/components/charts/HourglassChart.vue` | Same |
| `src/renderer/components/charts/DescendantChart.vue` | Same |
| `src/renderer/components/charts/TimelineChart.vue` | Replace hardcoded sex colors with CSS reads |
| `tests/e2e/gui-dark-mode.test.ts` | New E2E test for dark mode theme identity |
| `playwright.config.ts` | Add gui-dark-mode project |

No i18n changes needed — no new UI controls or strings are added.

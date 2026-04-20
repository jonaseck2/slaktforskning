# Chart Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign person boxes in all three chart types (pedigree, hourglass, descendant) to show portrait photos, wrapping names, birth/death places, curved connectors, and theme-aware colors.

**Architecture:** Extend PersonNode with place/photo data, add a text measurement utility for name wrapping, replace fixed BOX_H with per-node dynamic height computation, replace straight line connectors with curved SVG paths, and update all three chart Vue templates to render the new box layout.

**Tech Stack:** Vue 3, TypeScript, SVG, Canvas measureText API

**Spec:** [docs/plans/2026-04-18-chart-visual-overhaul-design.md](../../docs/plans/2026-04-18-chart-visual-overhaul-design.md)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/utils/chart-layout/types.ts` | Modify | Add birthPlace, deathPlace, photoUrl to PersonNode; add paths to ChartLayout |
| `src/renderer/utils/chart-layout/constants.ts` | Modify | New constants (BOX_W=200, MIN_BOX_H=58, V_GAP=24, H_GAP=70, GEN_GAP=70, PORTRAIT_W/H, CURVE_R, TEXT_AREA_W), keep BOX_H as deprecated alias |
| `src/renderer/utils/chart-layout/measure.ts` | Create | wrapName(), measureBoxHeight() — text measurement |
| `src/renderer/utils/chart-layout/connectors.ts` | Create | curvedElbow() — SVG path builder |
| `src/renderer/utils/chart-layout/pedigree.ts` | Modify | Dynamic heights, curved connectors |
| `src/renderer/utils/chart-layout/hourglass.ts` | Modify | Dynamic heights, curved connectors |
| `src/renderer/utils/chart-layout/descendant.ts` | Modify | Dynamic heights, curved connectors |
| `src/renderer/utils/chartData.ts` | Modify | Fetch place + media in fetchPersonNode() |
| `src/renderer/composables/useChartColors.ts` | Create | Theme-aware color resolution + export palette |
| `src/renderer/components/charts/PedigreeChart.vue` | Modify | New box template, path connectors, theme colors |
| `src/renderer/components/charts/HourglassChart.vue` | Modify | Same template changes |
| `src/renderer/components/charts/DescendantChart.vue` | Modify | Same template changes |
| `src/renderer/components/charts/ChartTooltip.vue` | Modify | Add birthPlace, deathPlace |
| `tests/unit/chartLayout.test.ts` | Modify | Update for new constants, dynamic heights |
| `tests/unit/chartMeasure.test.ts` | Create | Tests for wrapName(), measureBoxHeight() |
| `tests/unit/chartConnectors.test.ts` | Create | Tests for curvedElbow() |

---

### Task 1: Extend PersonNode Type + Constants

**Files:**
- Modify: `src/renderer/utils/chart-layout/types.ts`
- Modify: `src/renderer/utils/chart-layout/constants.ts`
- Modify: `src/renderer/utils/chart-layout/index.ts`
- Modify: `tests/unit/chartLayout.test.ts`

- [ ] **Step 1: Add new fields to PersonNode**

In `src/renderer/utils/chart-layout/types.ts`, add three fields to the `PersonNode` interface after `deathDate`:

```typescript
  birthPlace: string | null;   // place name from birth event
  deathPlace: string | null;   // place name from death event
  photoUrl: string | null;     // file_ref from first media link (sort_order 0)
```

Also add `paths: string[]` to the `ChartLayout` interface (after `lines`):

```typescript
  paths: string[];  // curved connector SVG path "d" attributes
```

- [ ] **Step 2: Update constants**

In `src/renderer/utils/chart-layout/constants.ts`, replace contents with:

```typescript
export const BOX_W = 200;
export const MIN_BOX_H = 58;
/** @deprecated Use MIN_BOX_H — box height is now dynamic per node. */
export const BOX_H = MIN_BOX_H;
export const V_GAP = 24;
export const H_GAP = 70;
export const GEN_GAP = 70;
export const PAD = 10;
export const ROW_H = MIN_BOX_H + V_GAP;

// Box internal layout
export const PORTRAIT_W = 34;
export const PORTRAIT_H = 44;
export const BOX_PAD_Y = 7;
export const BOX_PAD_X_LEFT = 6;
export const PORTRAIT_GAP = 6;
export const BOX_PAD_X_RIGHT = 8;
export const CURVE_R = 12;

/** Available width for text content inside a box. */
export const TEXT_AREA_W = BOX_W - BOX_PAD_X_LEFT - PORTRAIT_W - PORTRAIT_GAP - BOX_PAD_X_RIGHT;
```

Keep `BOX_H` as a deprecated alias so existing code compiles during incremental migration.

- [ ] **Step 3: Update index.ts exports**

Add new constants to the export line in `src/renderer/utils/chart-layout/index.ts`.

- [ ] **Step 4: Update test helper to include new PersonNode fields**

In `tests/unit/chartLayout.test.ts`, add `birthPlace: null, deathPlace: null, photoUrl: null` to the `p()` helper function defaults.

- [ ] **Step 5: Initialize `paths: []` in all layout functions**

In `pedigree.ts`, `hourglass.ts`, and `descendant.ts`, add `paths: []` to the returned `ChartLayout` object so the type is satisfied immediately.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 7: Commit**

```
feat: extend PersonNode with place/photo fields, update chart constants
```

---

### Task 2: Text Measurement Utilities

**Files:**
- Create: `src/renderer/utils/chart-layout/measure.ts`
- Create: `tests/unit/chartMeasure.test.ts`

- [ ] **Step 1: Write failing tests for wrapName and measureBoxHeight**

Create `tests/unit/chartMeasure.test.ts` with tests for:
- `wrapName`: short name returns 1 line, long name wraps to multiple lines, single word returns 1 line, empty string returns empty array, all words preserved when joined
- `measureBoxHeight`: returns `MIN_BOX_H` for short name with no dates, returns `MIN_BOX_H` for short name with birth+death, returns taller for long wrapping name with dates, counts birth line when birthDate or birthPlace exists

Use the `p()` helper pattern with the new PersonNode fields.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/chartMeasure.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement measure.ts**

Create `src/renderer/utils/chart-layout/measure.ts`:

- `wrapName(name, maxWidth, fontSize)`: Uses `document.createElement('canvas').getContext('2d')` to measure text width. Splits name on spaces, accumulates words per line until overflow, returns `string[]`. Cache the canvas context.
- `measureBoxHeight(node)`: Uses `formatFullName()` from `nameUtils.ts` to build the full name string, calls `wrapName()` to get line count, counts birth/death lines (1 each if date or place exists), computes `textBlockH = nameLines * 16 + dateLines * 14 + 2 * BOX_PAD_Y`, returns `max(MIN_BOX_H, textBlockH)`.

Line heights: name lines = 16px (12px font + 4px gap), date lines = 14px (10px font + 4px gap).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/chartMeasure.test.ts`
Expected: PASS.

- [ ] **Step 5: Add export to index.ts**

- [ ] **Step 6: Commit**

```
feat: add text measurement utilities for chart box sizing
```

---

### Task 3: Curved Connector Path Builder

**Files:**
- Create: `src/renderer/utils/chart-layout/connectors.ts`
- Create: `tests/unit/chartConnectors.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/chartConnectors.test.ts` with tests for:
- `curvedElbow("right")`: generates valid SVG path with M, Q, H, V commands
- `curvedElbow("down")`: generates valid SVG path
- Same-Y horizontal: returns simple `M x1,y H x2` (no curves needed)
- Same-X vertical: returns simple `M x,y1 V y2`
- Parent above child (toY < fromY): vertical segment goes upward

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement connectors.ts**

Create `src/renderer/utils/chart-layout/connectors.ts`:

- `curvedElbow(fromX, fromY, toX, toY, direction)`: Generates an SVG path `d` attribute string.
  - `"right"` (pedigree): `M fromX,fromY H midX-R Q midX,fromY midX,fromY±R V toY∓R Q midX,toY midX+R,toY H toX` where `midX = (fromX+toX)/2`. Clamp R to `min(CURVE_R, |dy|/2, |midX-fromX|)` to avoid overshooting.
  - `"down"` (hourglass/descendant): Same pattern but vertical-first.
  - Same-axis special cases: return straight line.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Add export to index.ts**

- [ ] **Step 6: Commit**

```
feat: add curved elbow connector path builder for charts
```

---

### Task 4: Extend fetchPersonNode with Place + Photo Data

**Files:**
- Modify: `src/renderer/utils/chartData.ts`

- [ ] **Step 1: Update fetchPersonNode**

Add `window.api.media.forEntity('person', id)` to the initial parallel fetch (4th promise). Add `place_id` to `RawEvent` type. Add `RawMedia` type.

After extracting birth/death events, fetch place names sequentially (depends on event having a `place_id`). Get profile photo from first media link's `file_ref`.

Return the three new fields: `birthPlace`, `deathPlace`, `photoUrl`.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All pass. chartData.ts is only used at runtime via IPC.

- [ ] **Step 3: Commit**

```
feat: fetch birth/death place and profile photo in chart data pipeline
```

---

### Task 5: Theme-Aware Chart Colors Composable

**Files:**
- Create: `src/renderer/composables/useChartColors.ts`

- [ ] **Step 1: Create the composable**

Create `src/renderer/composables/useChartColors.ts`:

- `ChartColors` interface with: surface, surfaceBorder, textPrimary, textMuted, accent, accentHover, accentText, connector, sexM/F/U, sexM/F/U-Bg, sexM/F/U-Text
- `EXPORT_COLORS` constant with hardcoded neutral palette
- `useChartColors(themed)`: returns `computed<ChartColors>` that reads CSS custom properties via `getComputedStyle(document.documentElement)` when themed, returns `EXPORT_COLORS` when not
- Helper: `readCssVar(style, name, fallback)` for safe property reading

- [ ] **Step 2: Run tests, commit**

```
feat: add useChartColors composable for themed/export chart rendering
```

---

### Task 6: Pedigree Chart — Dynamic Heights + Curved Connectors + New Box Template

**Files:**
- Modify: `src/renderer/utils/chart-layout/pedigree.ts`
- Modify: `src/renderer/components/charts/PedigreeChart.vue`
- Modify: `tests/unit/chartLayout.test.ts`

This is the largest task. The pedigree layout has ~25 BOX_H references.

- [ ] **Step 1: Add measurement pass to pedigree layout**

Import `measureBoxHeight` from `./measure`. After building the TreePerson graph, traverse all nodes to pre-compute heights into a `Map<string, number>`. Create a `boxH(id)` helper.

Replace every `BOX_H` in box creation with `boxH(node.person.id)`. Replace `BOX_H / 2` center calculations with `box.h / 2`. Keep `ROW_H` for leaf slot sizing (uses minimum height for even spacing — taller boxes extend within their slot).

- [ ] **Step 2: Replace line generation with curved paths**

Import `curvedElbow` from `./connectors`. Replace the fork pattern (3 lines: horizontal + vertical + horizontal per parent) with one `curvedElbow(..., "right")` call per parent. Push to `paths[]` instead of `lines[]`. Keep `lines[]` for any remaining straight connections (spouse vertical lines).

- [ ] **Step 3: Update PedigreeChart.vue template**

Replace `<line>` elements with `<path>` elements for curved connectors.

Replace the person box SVG template with new layout:
- Add `<defs>` with `<filter id="box-shadow">` for drop shadow
- Box `<rect>` with rx=6, themed fill/stroke
- Sex indicator bar: 3px wide, rx=1.5
- Portrait area: `<rect>` 34×44 with initials `<text>`, or `<image>` with `<clipPath>` when `photoUrl` exists
- Name: `<text>` with `<tspan>` per line from `wrapName()`, dy=16 for line spacing
- Birth line: `* {date} {place}` — shown when birthDate or birthPlace exists
- Death line: `† {date} {place}` — shown when deathDate or deathPlace exists

Add script helpers: `wrappedName()`, `initials()`, `boxFill()`, `boxStroke()`, `nameColor()`, `dateColor()`, `portraitBg()`, `portraitTextColor()`, `nameStartY()`, `birthY()`, `deathY()`.

Import and use `useChartColors(true)`.

Remove old `SEX_COLORS`, old `boxFill()`, `truncateNameParts` import.

- [ ] **Step 4: Update pedigree layout tests**

Update assertions for new constant values (BOX_W=200, H_GAP=70, V_GAP=24). Assert `box.h >= MIN_BOX_H` instead of `=== BOX_H`.

- [ ] **Step 5: Run tests**

Run: `npm test`

- [ ] **Step 6: Visual verification**

Launch with `npm start`, navigate to pedigree chart. Verify: portraits, wrapping names, places, curved connectors, focal accent color, placeholder boxes.

- [ ] **Step 7: Commit**

```
feat: pedigree chart visual overhaul — portraits, wrapping names, curved connectors
```

---

### Task 7: Hourglass Chart — Same Visual Overhaul

**Files:**
- Modify: `src/renderer/utils/chart-layout/hourglass.ts`
- Modify: `src/renderer/components/charts/HourglassChart.vue`

- [ ] **Step 1: Add measurement pass + dynamic heights**

Same pattern as pedigree. Hourglass has ~40 BOX_H references. Key: keep `MIN_BOX_H` for row positioning (`focalRowY`, `ancestorRowY`, `descRowY`) — rows use minimum spacing, taller boxes extend within. Use `boxH(id)` for box creation and center calculations.

Replace fork line patterns with `curvedElbow(..., "down")` for vertical connections, `curvedElbow(..., "right")` for horizontal spouse connections.

- [ ] **Step 2: Update HourglassChart.vue template**

Same box template as PedigreeChart (portrait, wrapped name, birth/death with place, theme colors). Same script helpers.

- [ ] **Step 3: Run tests and verify visually**

- [ ] **Step 4: Commit**

```
feat: hourglass chart visual overhaul — portraits, wrapping names, curved connectors
```

---

### Task 8: Descendant Chart — Same Visual Overhaul

**Files:**
- Modify: `src/renderer/utils/chart-layout/descendant.ts`
- Modify: `src/renderer/components/charts/DescendantChart.vue`

- [ ] **Step 1: Add measurement pass + dynamic heights + curved connectors**

Same pattern. Descendant has ~22 BOX_H references. Use `curvedElbow(..., "down")`.

- [ ] **Step 2: Update DescendantChart.vue template**

Same box template.

- [ ] **Step 3: Run tests and verify visually**

- [ ] **Step 4: Commit**

```
feat: descendant chart visual overhaul — portraits, wrapping names, curved connectors
```

---

### Task 9: Update ChartTooltip + Final Cleanup

**Files:**
- Modify: `src/renderer/components/charts/ChartTooltip.vue`
- Modify: `src/renderer/utils/chart-layout/constants.ts` (optional cleanup)
- Modify: `docs/PLAN.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add place to tooltip**

Add `birthPlace` and `deathPlace` to `TooltipPerson` interface. Show place after date in the tooltip: `* 1938 Malmö` / `† 2014 Lund`.

- [ ] **Step 2: Remove BOX_H alias if safe**

Search for remaining `BOX_H` imports. If only timeline.ts and circle chart use it (out of scope), keep the alias. If nothing uses it, remove.

- [ ] **Step 3: Update docs**

- Update PLAN.md: add implementation status row, mark roadmap entry as `[done]`
- Update CLAUDE.md: update constants section with new values, update chart rendering description

- [ ] **Step 4: Run full test suite**

Run: `npm run lint && npm test`

- [ ] **Step 5: Final visual verification**

Test all three charts with:
- Person with photo vs. without photo
- Short name vs. long wrapping name (3+ lines)
- With/without birth and death places
- Living person (no death line)
- Focal person with accent color
- Placeholder boxes and outline injection
- Collapse/expand buttons
- Zoom and pan
- Theme switching (Forest/Nordic/Twilight)

- [ ] **Step 6: Version bump and commit**

Bump minor version in `package.json`.

```
feat: chart visual overhaul — portraits, wrapping names, places, curved connectors

Redesigns person boxes in pedigree, hourglass, and descendant charts.
200px wide dynamic-height boxes with 34×44px portrait photo/initials,
wrapping names, birth/death places, curved elbow connectors, and
theme-aware colors with unthemed export mode.
```

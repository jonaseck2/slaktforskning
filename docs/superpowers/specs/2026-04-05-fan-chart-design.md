# Fan Chart Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-circle (360°) fan chart ancestor view as a new tab in VisualizationView, showing 6 generations with branch-based color coding.

**Architecture:** Pure SVG arc paths computed in a new `fanLayout.ts` module, rendered by a new `FanChart.vue` component. Reuses existing `fetchPedigreeTree` data, `useChartZoom` composable, and the `navigate` event pattern from other charts. No new dependencies.

---

## Shape and depth

- **360° full circle.** Focal person at center, ancestors radiate outward in concentric rings.
- **6 generations** (focal + 5 ancestor rings): focal → parents → grandparents → great-grandparents → great-great-grandparents → great-great-great-grandparents.
- Max 127 ancestor slots (1 + 4 + 8 + 16 + 32 + 64). Empty slots (no data) shown as pale empty segments.

---

## Ring layout

SVG viewBox: `700×700`, center at `(350, 350)`. Fixed ring radii:

| Ring | Ahnentafel numbers | Segments | Sweep/seg | Inner r | Outer r |
|------|--------------------|----------|-----------|---------|---------|
| Focal | 1 | 1 circle | 360° | 0 | 32 |
| Gen 1 | 2–3 | 4 × 90° | 90° | 32 | 85 |
| Gen 2 | 4–7 | 4 × 90° | 90° | 85 | 145 |
| Gen 3 | 8–15 | 8 × 45° | 45° | 145 | 205 |
| Gen 4 | 16–31 | 16 × 22.5° | 22.5° | 205 | 255 |
| Gen 5 | 32–63 | 32 × 11.25° | 11.25° | 255 | 300 |
| Gen 6 | 64–127 | 64 × 5.625° | 5.625° | 300 | 338 |

**Gen 1 is split into 4 × 90° sectors** (not 2 × 180°) so the four branch colors are visible from the innermost ring. The father (ahnentafel 2) occupies the two left-hand sectors; the mother (ahnentafel 3) occupies the two right-hand sectors.

**Segment path formula** for a person in generation `g` at position `p` (0-indexed within generation):
```
sweepDeg = 360 / 2^g   (use 90° for g=1 since gen 1 = 4 segments)
startAngle = -90 + p * sweepDeg   (–90° = top of circle = 12 o'clock)
endAngle   = startAngle + sweepDeg
SVG arc path: M cx,cy  L x_start,y_start  A r_outer  large-arc-flag  x_end,y_end  L x_inner_end  A r_inner (reversed)  Z
```

---

## Color scheme — branch-based

Four ancestor lines, one muted color per grandparent (ahnentafel 4–7). Each outer generation lightens the base color by 12% per ring.

| Branch | Ahnentafel root | Base color | Swedish label |
|--------|----------------|------------|---------------|
| Paternal grandfather | 4 | `#6a9cc0` (slate blue) | Far-far |
| Paternal grandmother | 5 | `#6aaa78` (sage green) | Far-mor |
| Maternal grandfather | 6 | `#c07848` (terracotta) | Mor-far |
| Maternal grandmother | 7 | `#a078b0` (dusty mauve) | Mor-mor |

**Color assignment for ahnentafel number `n` in generation `g`:**
- `g === 0`: focal, always `#2c3e50`
- `g === 1`: sector index 0–1 → father's side; index 2–3 → mother's side. Use the two branch colors for father's and mother's respective halves.
- `g >= 2`: `branchIndex = Math.floor(n / Math.pow(2, g - 2)) - 4` → 0–3 → look up base color, then lighten by `(g - 2) * 12%`.

**Empty segments** (no ancestor data): branch base color at 25% opacity, white stroke. Not interactive.

---

## Text rendering

Radial text: each label uses `transform="rotate(midAngle, cx, cy)"` then a horizontal `<text>` at the computed radius. Text that exceeds the segment arc width is clipped via a `<clipPath>` keyed to the segment.

| Ring | Text content | Font size |
|------|-------------|-----------|
| Focal | Full name + birth–death years | 11px name / 9px dates |
| Gen 1 | Full name + birth year | 10px / 8px |
| Gen 2 | Full name + birth year | 9px / 7.5px |
| Gen 3 | Surname + birth year | 8.5px / 7px |
| Gen 4 | Surname only | 8px |
| Gen 5 | Surname only | 7px |
| Gen 6 | None (too narrow) | — |

Gen 6 segments show no text. A native SVG `<title>` on each segment provides a hover tooltip (works in Electron's WebView) with full name + dates.

---

## Interactivity

- **Click populated segment** → emits `navigate(personId)`. `VisualizationView.navigateTo` handles it identically to other charts (sets focus store, sets `selectedPersonId`).
- **Click empty segment** → no-op.
- **Hover** → 10% opacity darken on segment fill.
- **Zoom** → `useChartZoom` composable, persisted as `viz-zoom-fan` in localStorage.
- **No collapse/expand buttons** — all 6 generations are always rendered; missing ancestors show as empty segments.

---

## Tab integration

New tab added between Pedigree and Hourglass in `VisualizationView.vue`:

```
Pedigree | Cirkel | Timglas | Tidslinje
```

`activeTab` adds value `'fan'`.

i18n additions:
- `sv.ts`: `visualization: { tab: { fan: 'Cirkel' } }`
- `en.ts`: `visualization: { tab: { fan: 'Fan Chart' } }`

---

## Files

| File | Action | Description |
|------|--------|-------------|
| `src/renderer/utils/fanLayout.ts` | Create | `computeFanLayout(tree, cx, cy)` → `FanSegment[]`. Pure math, no DOM/IPC. |
| `src/renderer/components/charts/FanChart.vue` | Create | SVG render, zoom, click handler |
| `src/renderer/views/VisualizationView.vue` | Modify | Add Fan tab, import FanChart |
| `src/renderer/i18n/sv.ts` | Modify | Add `visualization.tab.fan` |
| `src/renderer/i18n/en.ts` | Modify | Add `visualization.tab.fan` |
| `tests/unit/fanLayout.test.ts` | Create | Unit tests for `computeFanLayout` |

No schema changes. No IPC changes. No MCP changes.

---

## `FanSegment` type (output of `computeFanLayout`)

```typescript
export interface FanSegment {
  ahnNum: number;          // ahnentafel number (1 = focal)
  generation: number;      // 0 = focal, 1 = parents, …, 6
  person: PersonNode | null;  // null = empty slot
  pathD: string;           // SVG path d attribute (pie slice)
  clipPathD: string;       // same arc, used for text clipping
  fill: string;            // computed branch color
  textX: number;           // text anchor x (after rotation)
  textY: number;           // text anchor y
  textAngle: number;       // rotation angle in degrees
  midAngle: number;        // midpoint angle of segment (for tooltip positioning)
  isEmpty: boolean;
}
```

---

## Unit tests (`fanLayout.test.ts`)

- Focal person at ahnentafel 1 → `generation === 0`, correct center circle
- Gen 1 produces exactly 4 segments covering 360° total
- Gen 6 produces exactly 64 segments covering 360° total
- Color for ahnentafel 4 = base blue; ahnentafel 8 = lightened blue
- Empty slot (no person in tree) → `isEmpty: true`, fill at 25% opacity
- `pathD` closes back to center (pie slice, not annulus arc — for simplicity)

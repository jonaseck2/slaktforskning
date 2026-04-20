# Chart Visual Overhaul — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Goal

Bring the pedigree, hourglass, and descendant chart visualizations to competitor parity. Current boxes are 155×54px with 20-character name truncation, no photos, no places, hardcoded colors, and straight-line connectors. The overhaul addresses all of these.

## Scope

- All three chart types: Pedigree, Hourglass, Descendant
- Person box redesign (content, sizing, styling)
- Connector redesign (curved elbows)
- Layout constant changes
- Data pipeline extension (photo, place)
- Theme-aware rendering + unthemed export mode
- Placeholder boxes updated to match new style

**Out of scope:** Fan chart, circle chart, timeline chart. New chart types. Chart interaction changes (selection, navigation, collapse buttons — these stay as-is).

---

## 1. Person Box Design

### Layout

```
┌─┬──────┬────────────────────┐
│ │      │ Name line 1        │
│ │  📷  │ Name line 2 (wrap) │
│ │      │ * 1938 Malmö       │
│ │      │ † 2014 Lund        │
└─┴──────┴────────────────────┘
 3   34w        flex
```

- **Sex indicator bar**: 3px wide left edge, same sex colors as today (`M: #7eb8f7`, `F: #f7a5c0`, `U: #ccc`)
- **Portrait area**: fixed 34×44px, 4px border radius, vertically centered in box
  - With photo: `<image>` element, portrait crop (cover, top-aligned)
  - Without photo: initials on sex-tinted background (`--sex-m-bg`/`--sex-f-bg`/`--sex-u-bg`)
- **Name**: wraps freely across multiple lines, no character limit, no ellipsis. 12px, font-weight 600.
- **Birth line**: `* {date} {place_name}` — 10px
- **Death line**: `† {date} {place_name}` — 10px
- Lines omitted when data is missing (no birth → no birth line, etc.)

### Sizing

- **Width**: 200px (fixed, was 155)
- **Height**: dynamic, computed per node
  - `box_h = max(portrait_h + 2*PAD_Y, text_h + 2*PAD_Y)`
  - Portrait height (44px) + padding (2×7px) = 58px minimum
  - Text with 1-line name + birth + death ≈ 58px (matches portrait)
  - Text with 2-line name + birth + death ≈ 72px (text drives height)
  - `PAD_Y = 7`, `PAD_X_LEFT = 6` (portrait margin), `PAD_X_RIGHT = 8` (text right padding)

### Colors

**Themed (desktop):**

| Element | Normal box | Focal box |
|---------|-----------|-----------|
| Background | `--surface` | `--accent` |
| Border | `--surface-border` | `--accent-hover` |
| Name text | `--text-primary` | `--accent-text` |
| Date/place text | `--text-muted` | `--accent-text` at 65% opacity |
| Portrait bg (no photo) | `--sex-{m,f,u}-bg` | `rgba(255,255,255,0.12)` |
| Portrait initials | `--sex-{m,f,u}-text` | `--accent-text` at 80% opacity |

**Unthemed (export):**

| Element | Normal box | Focal box |
|---------|-----------|-----------|
| Background | `#ffffff` | `#2c3e50` |
| Border | `#cccccc` | `#1a2a3a` |
| Name text | `#222222` | `#ffffff` |
| Date/place text | `#666666` | `rgba(255,255,255,0.65)` |

### Additional styling

- Border radius: 6px (was 4px)
- Drop shadow: `0 1px 3px rgba(0,0,0,0.06)` via SVG `<filter>` with `<feDropShadow>`
- Tooltip: unchanged (already shows full name on hover)

---

## 2. Connectors

### Current

Straight `<line>` elements with fork pattern:
```
box ── fork ── box
              │
              └── box
```
Color: `#ccc`, stroke-width: 1.5, `vector-effect: non-scaling-stroke`.

### Proposed

SVG `<path>` elements with Q-bezier curved elbows. Each parent gets its own path from child box to parent box — no shared vertical fork line.

```
box ─── ╮
        ╰──── parent_box
box ─── ╮
        ╰──── parent_box
```

Path template (pedigree, child right edge → parent left edge):
```
M {child_x + BOX_W},{child_cy}
H {midX - R}
Q {midX},{child_cy} {midX},{child_cy ± R}
V {parent_cy ∓ R}
Q {midX},{parent_cy} {midX + R},{parent_cy}
H {parent_x}
```
Where `midX = child_x + BOX_W + H_GAP/2`, `R = 12` (curve radius).

**Connector color**: theme-aware, derived from `--surface-border` but softer. Fallback: `#a8c0a8`.

**Placeholder connectors**: dashed (`stroke-dasharray: 5 3`), lighter color (`#94a3b8`).

Stroke-width: 1.5, `vector-effect: non-scaling-stroke` (preserved).

---

## 3. Layout Constants

| Constant | Current | Proposed | Notes |
|----------|---------|----------|-------|
| `BOX_W` | 155 | 200 | Fixed width |
| `BOX_H` | 54 | removed | Dynamic per-node |
| `V_GAP` | 20 | 24 | Between sibling boxes |
| `H_GAP` | 50 | 70 | Between generations (pedigree) |
| `GEN_GAP` | 60 | 70 | Between generations (hourglass/descendant) |
| `PAD` | 10 | 10 | Edge padding (unchanged) |
| `ROW_H` | 64 | removed | Was `BOX_H + V_GAP`, no longer meaningful |
| `PORTRAIT_W` | — | 34 | New |
| `PORTRAIT_H` | — | 44 | New |
| `BOX_PAD_Y` | — | 7 | New: vertical padding inside box |
| `CURVE_R` | — | 12 | New: connector curve radius |
| `MIN_BOX_H` | — | 58 | New: portrait + 2*PAD_Y |

---

## 4. Data Pipeline

### PersonNode type extension

```typescript
export interface PersonNode {
  // existing fields unchanged
  id: string;
  givenName: string | null;
  surname: string | null;
  preferredName: string | null;
  nickname: string | null;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthDate: string | null;
  deathDate: string | null;
  // new fields
  birthPlace: string | null;   // place name from birth event
  deathPlace: string | null;   // place name from death event
  photoUrl: string | null;     // file_ref from first media link (sort_order 0)
}
```

### fetchPersonNode() changes

Current: fetches person, names, events in parallel.

Proposed: also fetch birth/death event places and profile photo.

```typescript
export async function fetchPersonNode(id: string): Promise<PersonNode> {
  const [person, names, events, mediaLinks] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
    window.api.media.forEntity('person', id),
  ]);
  // ... existing name/date extraction ...
  const birthEvent = events.find(e => e.event_type === 'birth');
  const deathEvent = events.find(e => e.event_type === 'death');
  // Fetch place names for birth/death events (if place_id exists)
  const birthPlace = birthEvent?.place_id
    ? (await window.api.places.get(birthEvent.place_id))?.name ?? null
    : null;
  const deathPlace = deathEvent?.place_id
    ? (await window.api.places.get(deathEvent.place_id))?.name ?? null
    : null;
  // Profile photo: first media link by sort_order
  const profileMedia = mediaLinks?.[0];
  const photoUrl = profileMedia?.file_ref ?? null;
  return { ...existing, birthPlace, deathPlace, photoUrl };
}
```

The place fetches are sequential (depend on event result) but each is a single `getPlace()` call — fast enough. Media fetch runs in parallel with the initial batch.

---

## 5. SVG Rendering

### Name wrapping

SVG `<text>` doesn't wrap. Approach: **pre-measure with CanvasRenderingContext2D, split into `<tspan>` lines**.

```typescript
function wrapName(name: string, maxWidth: number, fontSize: number): string[] {
  // Use an offscreen canvas to measure text width
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = `600 ${fontSize}px system-ui`;
  const words = name.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
```

Available text width: `BOX_W - PAD_X_LEFT - PORTRAIT_W - GAP - PAD_X_RIGHT` = `200 - 6 - 34 - 6 - 8` = **146px**.

### Box height measurement pass

Before the layout algorithm runs, compute each node's height:

```typescript
function measureBoxHeight(node: PersonNode): number {
  const nameLines = wrapName(fullName(node), 146, 12);
  let textLines = nameLines.length;
  if (node.birthDate || node.birthPlace) textLines++;
  if (node.deathDate || node.deathPlace) textLines++;
  const lineHeight = 14; // ~12px font + 2px gap
  const textH = textLines * lineHeight;
  const textBlockH = textH + 2 * BOX_PAD_Y;
  return Math.max(MIN_BOX_H, textBlockH);
}
```

Store computed height on `BoxLayout.h` (already exists, currently always `BOX_H`).

### Portrait rendering

```svg
<!-- With photo -->
<clipPath id="portrait-{id}">
  <rect x="{x+9}" y="{cy - 22}" width="34" height="44" rx="4"/>
</clipPath>
<image href="{photoUrl}" x="{x+9}" y="{cy - 22}" width="34" height="44"
       preserveAspectRatio="xMidYMin slice" clip-path="url(#portrait-{id})"/>

<!-- Without photo (initials) -->
<rect x="{x+9}" y="{cy - 22}" width="34" height="44" rx="4" fill="{sexBg}"/>
<text x="{x+26}" y="{cy+4}" text-anchor="middle" font-size="13"
      font-weight="600" fill="{sexText}">{initials}</text>
```

### Connector path generation

Replace the current `lines.push()` calls with a path builder:

```typescript
function curvedElbow(
  fromX: number, fromY: number,
  toX: number, toY: number,
  direction: 'right' | 'left' | 'down' | 'up',
): string {
  const R = CURVE_R;
  // For pedigree (right): horizontal from child, curve, vertical, curve, horizontal to parent
  if (direction === 'right') {
    const midX = (fromX + toX) / 2;
    const dy = toY - fromY;
    const signY = dy > 0 ? 1 : -1;
    return `M ${fromX},${fromY} H ${midX - R} Q ${midX},${fromY} ${midX},${fromY + signY * R} V ${toY - signY * R} Q ${midX},${toY} ${midX + R},${toY} H ${toX}`;
  }
  // For hourglass/descendant (down): vertical from parent, curve, horizontal, curve, vertical to child
  if (direction === 'down') {
    const midY = (fromY + toY) / 2;
    const dx = toX - fromX;
    const signX = dx > 0 ? 1 : -1;
    return `M ${fromX},${fromY} V ${midY - R} Q ${fromX},${midY} ${fromX + signX * R},${midY} H ${toX - signX * R} Q ${toX},${midY} ${toX},${midY + R} V ${toY}`;
  }
  // 'up' is the reverse of 'down', 'left' is the reverse of 'right'
  return ''; // unreachable in practice
}
```

The layout algorithms (`pedigree.ts`, `hourglass.ts`, `descendant.ts`) switch from pushing `Line` objects to pushing path strings. The `ChartLayout.lines` type changes from `Line[]` to `string[]` (SVG path `d` attributes), or a new `paths: string[]` field is added alongside lines for backwards compatibility during migration.

---

## 6. Theme / Export Mode

### How it works

Charts receive a `themed: boolean` prop (default `true`). When `themed=true`, box colors read from CSS custom properties via `getComputedStyle()` at render time. When `themed=false` (export), hardcoded neutral colors are used.

The chart components already run in SVG which doesn't inherit CSS custom properties into attributes. So colors are resolved in the component script:

```typescript
const colors = computed(() => {
  if (!props.themed) return EXPORT_COLORS;
  const style = getComputedStyle(document.documentElement);
  return {
    surface: style.getPropertyValue('--surface').trim(),
    surfaceBorder: style.getPropertyValue('--surface-border').trim(),
    textPrimary: style.getPropertyValue('--text-primary').trim(),
    textMuted: style.getPropertyValue('--text-muted').trim(),
    accent: style.getPropertyValue('--accent').trim(),
    accentHover: style.getPropertyValue('--accent-hover').trim(),
    accentText: style.getPropertyValue('--accent-text').trim(),
    connector: style.getPropertyValue('--surface-border-subtle').trim(),
    // sex colors are theme-invariant, always same
  };
};
```

### Export usage

The existing chart screenshot / export code passes `themed: false` to get clean, neutral output suitable for PDF or image export.

---

## 7. Affected Files

| File | Change |
|------|--------|
| `src/renderer/utils/chart-layout/types.ts` | Add `birthPlace`, `deathPlace`, `photoUrl` to `PersonNode` |
| `src/renderer/utils/chart-layout/constants.ts` | Update `BOX_W`, `V_GAP`, `H_GAP`, `GEN_GAP`; add `PORTRAIT_W`, `PORTRAIT_H`, `BOX_PAD_Y`, `CURVE_R`, `MIN_BOX_H`; remove `BOX_H`, `ROW_H` |
| `src/renderer/utils/chartData.ts` | Extend `fetchPersonNode()` with place + media fetches |
| `src/renderer/utils/nameUtils.ts` | Add `wrapName()` function |
| `src/renderer/utils/chart-layout/pedigree.ts` | Dynamic box heights, curved path generation, updated spacing |
| `src/renderer/utils/chart-layout/hourglass.ts` | Same changes as pedigree |
| `src/renderer/utils/chart-layout/descendant.ts` | Same changes as pedigree |
| `src/renderer/components/charts/PedigreeChart.vue` | New box template (portrait + wrapped name + place), `<path>` connectors, theme colors |
| `src/renderer/components/charts/HourglassChart.vue` | Same template changes |
| `src/renderer/components/charts/DescendantChart.vue` | Same template changes |
| `src/renderer/components/charts/ChartTooltip.vue` | Add place to tooltip (already shows full name) |
| `src/renderer/styles/tokens.css` | No changes needed (tokens already exist) |
| `tests/unit/` | Update layout tests for new constants and dynamic heights |

---

## 8. Migration Strategy

The three chart components share identical box rendering logic (copy-pasted SVG template). This overhaul is a good opportunity to extract a shared `ChartPersonBox` render helper or composable, but that's an implementation decision, not a design requirement.

The `ChartLayout` type keeps both `lines: Line[]` (for backwards compat during migration) and adds `paths: string[]` for curved connectors. Once all three charts are migrated, `lines` can be removed.

---

## 9. What Stays the Same

- Selection, navigation, collapse/expand buttons — unchanged
- Placeholder outline injection logic (`injectOutlines`) — unchanged, just styled differently
- Chart zoom and pan — unchanged
- Keyboard navigation and accessibility — unchanged
- Chart tooltip — enhanced with place but same interaction
- Add-person popover on hover — unchanged

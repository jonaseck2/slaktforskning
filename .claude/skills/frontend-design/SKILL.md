---
name: frontend-design
description: Frontend design patterns for Släktforskning — Vue 3 components, layout, colors, modals, i18n, error handling. Use when building any new view, component, or UI change in the renderer.
---

# Frontend Design Skill — Släktforskning

Use this skill when building any new view, component, or UI change in the renderer. It documents the established patterns that all views must follow for consistency.

**Before committing any UI change:** verify it works in the running app via the UI server (`curl -s http://127.0.0.1:19241/status`) or Chrome DevTools MCP. See the `/test` and `/electron-dev` skills for the full verification workflow. Never commit UI changes based solely on unit tests passing.

---

## Three-Sheet Layout

The app uses a **three-sheet layout**: nav (sidebar), main content (left sheet), and optional side panel (right sheet). All three sit on the `--surface-bg` background as separate elevated sheets at the same visual level.

### App shell (`App.vue`)

```css
.app {
  display: flex;
  height: 100vh;
  background: var(--surface-bg);   /* page background visible between sheets */
  padding: var(--space-md);
  gap: var(--space-md);
}
.sidebar { /* dark themed sheet */ border-radius: var(--radius-lg); }
.content { /* white sheet */ background: var(--surface); border-radius: var(--radius-lg); padding: 24px; }
```

### Paneled views — implementation checklist

Every time you build a paneled view, follow all steps in order. Missing any step produces the wrong layout.

**Step 1 — Register the route** in `App.vue:219`:
```typescript
const PANELED_ROUTES = ['/persons', '/relationships', '/sources', '/places', '/groups', '/research-tasks', '/media', '/reports', '/my-new-route'];
```
- `PANELED_ROUTES` — prefix match (catches `/route/123` sub-paths too)
- `PANELED_ROUTES_EXACT` — exact match only (use when sub-paths should NOT be paneled)

This applies `.content-paneled` which removes outer padding/background so the view owns its own sheets:
```css
.content-paneled { padding: 0; background: transparent; border-radius: 0; overflow: hidden; }
```

**Step 2 — View root**: flex row, fills the full content area, small gap between the two sheets:
```css
.my-view { display: flex; flex-direction: row; height: 100%; gap: var(--space-xs); }
```

**Step 3 — Left sheet** (main content area, fills remaining space):
```css
.left-sheet {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-lg);              /* ← sheet owns the breathing room */
}
.left-sheet-content {
  flex: 1; min-height: 0;
  overflow-y: auto;                      /* ← only the body scrolls; header stays put */
}
```
**Layout contract — every list view follows it:**
- Sheet has `display: flex; flex-direction: column; overflow: hidden; padding: var(--space-lg)`. The padding lives on the sheet, not on each child.
- Header (`.header`), filter row (`<FilterChips>` direct, no wrapper), and the scrollable content wrapper (`<x>-list-content` with `flex: 1; min-height: 0; overflow-y: auto`) are direct children. No per-child padding overrides.
- Spacing between header → filter row → body comes from the shared `.header { margin-bottom: 16px }` and `.count-label { margin: 0 0 8px }` defaults — do not redefine them in the view.
- `<FilterChips>` is dropped in directly. **Never wrap it in another div** — the chip pill is the bar.

**Every center list view has a `<FilterChips>` row.** Persons, Places, Media, Sources, Relationships, Groups, Research Tasks, Quality, Duplicates — all of them. The chip row sits between header and table; it is part of the standard layout, not an optional extra. If a view feels like it has "nothing to filter on", that's a sign you haven't looked at the data — pick the next-most-useful split.

- Derive the chip set **from the data, not from a hardcoded enum.** Iterate the loaded entities, bucket them by the chosen dimension, and emit a chip per non-empty bucket with `count`. Buckets with zero rows must not show. The `place_type` chips were a cautionary tale: a hardcoded enum produced an "All / Other" pair on every database because nobody had typed types — a derived split (country) is immediately meaningful instead.
- Lead with `{ value: 'all', label: t('common.all'), count: total }`, sort the rest by count desc, push any `unresolved` / `unknown` / `none` bucket to the end.
- For derived/computed dimensions (gazetteer-resolved country, has-coordinates, has-events, missing-on-disk), compute at render — never persist the bucket key. Show a single placeholder chip (`{ value: 'all', label: t('common.loading'), count: total }`) while the resolver/loader warms up.
- Pick the dimension by **what genealogists actually want to slice on**, not what's easiest. Country / decade / period for places, event type for events, status for tasks, source type for sources, missing-file / orphaned / face-tagged for media. When in doubt, look at the panel sections — the same facets that earn a section header usually earn a filter chip.

Reference views: PersonsView, PlacesView (country), MediaView (type/status/face-tags), ResearchTasksView (status), QualityView (severity), DuplicatesView. Do not invent a new padding scheme.

**Infinite scroll is mandatory — never a hardcoded slice.** Every list/table view (entity registries, derived lists like duplicates and quality issues, search results, anything tabular) drives its rows through `usePagedList` and renders a sentinel `<div>` after the table that triggers `loadMore`. A view that calls `find(100)` and stops, or `list()` and renders the whole array, is a bug — the second the dataset grows past one screen the user has no way to see the rest, and there's no signal that data is hidden.

The wiring is the same every time:

```vue
<template>
  <p v-if="total > 0" class="count-label">
    {{ $t('myEntity.showingOf', { shown: items.length, total }) }}
  </p>
  <div class="my-list-scroll">
    <table class="data-table"> … </table>
    <div ref="sentinel" class="scroll-sentinel"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { usePagedList } from '../composables/usePagedList';

type SortBy = 'name' | 'created_at';
const { items, total, loading, searchQuery, sortBy, sortDir, reload, toggleSort, attachSentinel } =
  usePagedList<MyRow, SortBy>({
    defaultSortBy: 'name',
    storageKey: 'my-entity',
    fetchPage: async (limit, offset, sortBy, sortDir, query) => {
      try {
        return await window.api.myEntity.listPage(limit, offset, sortBy, sortDir, query)
          as { items: MyRow[]; total: number };
      } catch (err) {
        console.error('[MyView] fetchPage failed:', err);
        toast.error(t('errors.loadFailed'));
        return { items: [], total: 0 };
      }
    },
  });

const sentinel = ref<HTMLElement | null>(null);
watch(sentinel, (el) => attachSentinel(el));
</script>

<style scoped>
.my-list-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.my-list-scroll :deep(.data-table thead th) {
  position: sticky; top: 0; background: var(--surface); z-index: 1;
  box-shadow: inset 0 -1px 0 var(--surface-border-subtle);
}
</style>
```

**API contract for paged lists:** the IPC must accept `(limit, offset, ...)` and return `{ items, total }` in a single call (single DB scan). If the existing API only returns rows, add a `*Page` variant before building the view — don't call `findX(big_limit)` and slice client-side. For O(N²) derived lists like duplicates, returning `items` and `total` from the same scan also avoids running the heavy computation twice (once for the rows, once for the badge count).

**Summary line is mandatory.** Above the scrollable container, render `<p class="count-label">{{ $t('entity.showingOf', { shown: items.length, total }) }}</p>` (e.g. "Showing 100 of 247 places"). The shown/total split tells the user there's more below the fold and roughly how much. When `total === items.length`, swap to a singular/plural total (`{count} place | {count} places`).

**Reset on filter/sort.** `usePagedList` already does this — when `searchQuery`, `sortBy`, or `sortDir` change, it re-fetches from offset 0 with the new params. Do not reimplement filtering/sorting client-side over a partial slice; the whole point is that the server filters and sorts the full set.

**Modal pickers count too.** This rule isn't only for top-level views. Any modal that shows a filterable list of rows (place picker, person picker, source picker) follows the same shape: `.list-filter` wrapper, `.list-filter-input`, `usePagedList`, sentinel, count-label. Bind the input to the composable's `searchQuery` — never write a parallel client-side filter. **Tree-shaped pickers**: switch modes — empty filter renders the lazy-expand tree, ≥2-char filter swaps to a flat `usePagedList` of search results (e.g. `places.listPage(limit, offset, 'name', 'asc', query)`). Trying to filter the tree itself by walking every subtree and expanding matches will fan out into thousands of IPC calls and hang the modal. See `PlaceTreePickerModal.vue` for the canonical two-mode pattern.

Reference: SourcesView, PlacesView, MediaView, RelationshipsView, DuplicatesView, PlaceTreePickerModal.

**Step 4 — Drag handle + resizable panel** (always RIGHT side, always resizable):

Script setup:
```typescript
import { ref } from 'vue';
import { usePanelResize } from '../composables/usePanelResize';

const viewRef = ref<HTMLElement | null>(null);
const { panelWidth, startResize } = usePanelResize({
  storageKey: 'myview-panel-width',  // unique key per view — persisted in localStorage
  defaultWidth: 300,
  minWidth: 200,
});
```

Template — drag handle between the sheets, wrapper on the right with dynamic width:
```html
<div class="my-view" ref="viewRef">
  <div class="left-sheet">...</div>
  <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, viewRef!)"></div>
  <div class="panel-wrapper" :style="{ width: panelWidth + 'px' }">
    <MyPanel ... />
  </div>
</div>
```

Drag handle + wrapper CSS:
```css
.panel-drag-handle {
  width: 6px; flex-shrink: 0;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  position: relative;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }
.panel-wrapper { flex-shrink: 0; height: 100%; }
```

**Step 5 — Panel component** (PersonPanel, PlacePanel, MediaPanel, ReportPanel, etc.) must own its sheet look. The wrapper controls width; the component fills it. **Every entity panel follows the same shell** — diverging means a future audit will route it back. Reference: PersonPanel / PlacePanel / SourcePanel / RelationshipPanel / GroupPanel / ResearchTaskPanel / MediaPanel.

**Template shell:**
```html
<template>
  <div class="my-panel">
    <!-- Empty state when no entity selected -->
    <div v-if="!entityId" class="panel-empty">{{ $t('panel.noEntitySelected') }}</div>

    <template v-else-if="entity">
      <!-- Header: title + badge + close button -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ entity.name }}</div>
            <span v-if="entity.type" class="entity-type-badge">{{ entity.type }}</span>
          </div>
        </div>
        <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </div>

      <!-- Sections: each one is a SectionHeader + body, collapsible -->
      <div class="panel-section">
        <SectionHeader :title="$t('section.foo')" :collapsed="!sections.foo" @toggle="toggleSection('foo')" />
        <div v-if="sections.foo" class="panel-section-body">…</div>
      </div>
    </template>
  </div>
</template>
```

**Section state** — use the shared composable, never inline `localStorage` calls:
```typescript
import { usePanelSections } from '../composables/usePanelSections';

const { sections, toggleSection } = usePanelSections(
  'myentity-panel-section-',                            // unique storage prefix
  { foo: true, bar: false, quality: false },            // editor defaults
  { foo: true, bar: true, quality: false },             // (optional) static-export defaults — typically all-open
);
```
Static-mode defaults are only needed if the panel is rendered in `VITE_STATIC_MODE` (website export). When omitted, the editor defaults are used in both modes.

**Section order convention** — apply this order so all panels feel the same:
1. Main entity fields (compact form / read-only display)
2. Linked entities (events, persons, places, citations, members, …) — most-relevant first
3. Media — always present, just before quality
4. Notes — if separate from main fields
5. Quality — always last

**Required CSS** (do not deviate):
```css
.my-panel {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-sm);   /* ← required, sets base font for all panel text */
}

/* Empty state */
.panel-empty {
  display: flex; align-items: center; justify-content: center;
  height: 100%;
  color: var(--text-muted);
  padding: var(--space-xl);
  text-align: center;
}

/* Header: title row + close button. Use align-items: flex-start so the
   close button anchors to the top-right corner regardless of how tall the
   header content grows (e.g. PersonPanel's add-relative button row). */
.panel-header {
  display: flex;
  align-items: flex-start;
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.panel-header-content {
  padding: var(--space-md) var(--space-lg);
  flex: 1; min-width: 0;
}
/* Sections — same horizontal padding as header */
.panel-section {
  padding: 0 var(--space-lg);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }
```

**Don't redefine `.panel-close-btn` in scoped styles.** It's a shared global rule in [`shared.css`](../../../src/renderer/styles/shared.css) — anchored top-right via `align-self: flex-start` + `margin: var(--space-sm) var(--space-sm) 0 0`, aligned with the heading row. Scoped redefinitions outrank the shared rule and break consistency across panels.

**Header variants** — when the entity has an avatar/thumbnail (PersonPanel, MediaPanel), put the avatar **outside** `.panel-header-content` as a sibling. The close button stays anchored to the top-right corner regardless:
```html
<div class="panel-header">
  <AppAvatar :person-id="…" size="lg" />
  <div class="panel-header-content">…</div>
  <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
</div>
```
Use `padding: var(--space-md) 0 var(--space-md) var(--space-lg)` on `.panel-header` so the avatar gets left-padding while the close button sits flush against the right edge with its own margin.

**Empty-state inside sections** — use `<SectionEmpty :message="$t('empty.foo')" />`, not inline divs. **Never pass `:action-label`** when the parent `<SectionHeader>` already has an `actionLabel` for the same action — the empty state and the header would render two identical "+ X" buttons stacked. The header button is the single entry point; the empty state shows only the message.

### Content feathering

For maps specifically, the map fills its content wrapper (no extra padding — the sheet already provides it) and gets its own border-radius and border:
```css
.base-map-container { border: 1px solid var(--surface-border-subtle); border-radius: var(--radius-md); }
```

---

## Research View Pattern (Tree/List/Map/Gallery toggles)

The three main research views follow a consistent pattern:

| View | Nav label | Toggle options | Default |
|------|-----------|---------------|---------|
| People | People | Tree / List | Tree |
| Places | Places | List / Map | Map |
| Media | Media | Gallery / Table | Gallery |

### Header layout

All three share the same header structure:

```html
<div class="header">
  <h2>{{ $t('nav.viewName') }}</h2>
  <div class="header-right">
    <div class="view-toggle">
      <AppButton :variant="mode === 'a' ? 'soft' : 'ghost'" size="sm" @click="setMode('a')">A</AppButton>
      <AppButton :variant="mode === 'b' ? 'soft' : 'ghost'" size="sm" @click="setMode('b')">B</AppButton>
    </div>
    <AppButton variant="soft" @click="showAdd = true">+ {{ $t('entity.add') }}</AppButton>
  </div>
</div>
```

```css
.header-right { display: flex; align-items: center; gap: 8px; }
.view-toggle { display: flex; gap: 2px; }
```

### Toggle button styling

- **Active**: `variant="soft"` (filled, muted accent)
- **Inactive**: `variant="ghost"` (transparent, text only)
- Never use `primary`/`secondary` for view toggles

### View mode persistence

Store in localStorage with a descriptive key:
```typescript
const viewMode = ref<ViewMode>(
  (localStorage.getItem('persons-view-mode') as ViewMode) || 'tree'
);
function setViewMode(mode: ViewMode) {
  viewMode.value = mode;
  localStorage.setItem('persons-view-mode', mode);
}
```

### Embedding one view inside another

When a view has two modes (Tree/List, Map/List), the secondary mode can embed an existing view component with an `embedded` prop that hides its header:

```html
<!-- In the host view -->
<GuestView v-if="viewMode === 'list'" embedded />

<!-- In the guest view -->
<div v-if="!embedded" class="header">...</div>
```

The host view's header provides the toggle buttons for both modes.

---

## Colors and Typography

**Never use hardcoded hex values.** Use design tokens from `src/renderer/styles/tokens.css`. Three themes (Forest, Nordic, Twilight) define all token values. Dark and high-contrast modes override tokens in `shared.css` **per theme** — `html.dark.theme-forest`, `html.high-contrast.theme-nordic`, etc. Each theme × appearance combination has its own palette.

**Contrast is enforced by tests.** Any token change must pass `tests/unit/wcagContrast.test.ts`:
- High-contrast mode palettes target **WCAG 2.1 AAA** (≥7:1 body / ≥4.5:1 large / ≥3:1 non-text UI)
- Light + dark palettes target **WCAG 2.1 AA** (≥4.5:1 body / ≥3:1 large / ≥3:1 non-text UI)

Run `npx vitest run tests/unit/wcagContrast.test.ts` after any color token change. Failure messages include the exact ratio and the threshold needed — adjust the token until the pair clears. Math utility: `src/renderer/utils/wcag.ts`.

Key token categories:
```css
/* Surface */     --surface-bg, --surface, --surface-hover, --surface-border, --surface-border-subtle
/* Text */        --text-primary, --text-secondary, --text-muted
/* Accent */      --accent, --accent-hover, --accent-text
/* Fan branches */--fan-branch-1..4 (per theme; read by readThemeColors() in fanColors.ts)
/* Semantic */    --error-bg/text, --warning-bg/text, --success-bg/text, --info-bg/text
/* Entity */      --entity-{person,event,source,citation,place,relationship,task,group,name,identifier,neutral}-text/-bg/-border
/* Spacing */     --space-xs(4) --space-sm(8) --space-md(12) --space-lg(16) --space-xl(24)
/* Typography */  --font-xs(11) --font-sm(13) --font-base(14) --font-md(15) --font-lg(16)
/* Shape */       --radius-sm(4) --radius-md(6) --radius-lg(10)
/* Shadows */     --shadow-sm, --shadow-md, --shadow-lg
```

**Entity color consumption.** Per-entity tokens (light defaults in `tokens.css :root`; dark + HC overrides in `shared.css` under `html.dark` / `html.high-contrast`, theme-invariant) are aliased into element-scoped names by attribute selectors in `shared.css`:
```css
[data-entity="person"] { --entity-text: var(--entity-person-text); --entity-bg: var(--entity-person-bg); --entity-border: var(--entity-person-border); }
```
Set `data-entity="<type>"` on any container (BaseSubPanel does it on the modal root); descendants reference `var(--entity-text)` / `var(--entity-bg)` / `var(--entity-border)` and flip with mode + theme automatically. **Never** apply entity colors via inline `:style` or by importing hex values from JS — `entityMeta.ts` carries only `EntityType` + `icon` + `labelKey`, not colors. Entity borders are decorative pastels (no theme/mode WCAG requirement); the modal's structural border is `--surface-border` which the existing `surface-border on surface-bg` UI test already covers.

### Reactive theme/appearance updates in charts

Theme (forest / nordic / twilight) and appearance (light / dark / high-contrast) are applied by toggling classes on `document.documentElement` — see `setTheme` / `setAppearance` in `App.vue`. CSS-var-driven properties (`color: var(--text-primary)`) update automatically via the cascade, but anything that reads theme tokens through JS (e.g. `:fill="nameColor(box)"` where `nameColor` pulls from a cached color object) will **not** re-render on the class change unless it depends on a reactive signal.

The signal lives in [`src/renderer/composables/useThemeSignal.ts`](../../../src/renderer/composables/useThemeSignal.ts): a module-level `themeVersion` ref incremented by a `MutationObserver` on `document.documentElement`'s `class` attribute. Two consumers already wire it up:

- `useChartColors(true)` reads `themeVersion.value` inside its `computed`, so any chart using it (Pedigree, Hourglass, Descendant, and future charts) re-renders on theme change automatically.
- `useFanThemeColors()` wraps the pure Fan helpers (`readThemeColors`, `isDarkMode`, `isHighContrast` from `utils/fanColors.ts`) in the same pattern.

**Rule for new charts:** never call `getComputedStyle(document.documentElement)` or `readThemeColors()` directly inside a `computed`. Go through one of the two composables — they handle both the DOM read and the reactivity. `useChartColors(false)` deliberately does **not** depend on the signal, so exports stay invariant.

Regression test: `tests/components/themeSignal.test.ts`.

### Chart zoom controls and shared settings

All interactive charts use the shared [`ZoomControls`](../../../src/renderer/components/ZoomControls.vue) component. Two positioning modes:
- default (`position: fixed`) — floating bar at bottom-right of viewport. Used by `ReportsView` as its global paper-zoom bar.
- `overlay` — `position: absolute` inside a `position: relative` chart container. Used by Pedigree/Hourglass/Descendant/Timeline/Fan as their in-chart bars.

Chart-specific extras (Gens, Arc, Color mode) slot into `ZoomControls` using the shared `zoom-extra-label`, `zoom-extra-btn`, `zoom-extra-value`, `zoom-extra-sep` classes — defined once in `ZoomControls.vue`, styled via theme tokens.

Charts hide their overlay when `readonly=true` (report wrappers pass this). Inside a report preview only `ReportsView`'s bottom bar drives state — we don't want competing bars.

**Per-chart-type settings reused between viz and reports** live as module-level refs in [`useChartGenerations.ts`](../../../src/renderer/composables/useChartGenerations.ts):

```ts
export const pedigreeGenerations = ref(load('pedigree'));
// ...hourglass, descendant, timeline, fan
```

Each ref persists to its own `chart-gens-{type}` localStorage key. Charts import the ref and use it directly (in place of a local `ref(N)` for `genTarget`); `ReportsView` imports the same refs and renders generation +/− controls in the bottom bar. Any instance's update propagates to all mounted consumers and survives reload. Non-timeline/fan charts add a `watch(genTarget)` that re-runs `applyGenerationDepth`/`load` so external mutations trigger the same behaviour as the chart's own buttons.

**Unified color mode.** `FanColorMode = 'branch' | 'sex' | 'bw'` in `fanColors.ts`. Both the interactive `FanChart` cycle button and the `ReportsView` / `AncestorBookReport` dropdowns speak the same enum. `bw` uses `printFill` (greyscale + no gradients + print-style strokes) in both contexts.

### Export and print surfaces

Anything that gets captured as a static artefact (PDF via `window.api.print.exportPdf()`, SVG via chart export, a PNG screenshot) **must not pick up the current theme or appearance**. Users have repeatedly been burned by dark / high-contrast / theme overrides leaking into saved files.

Two separate mechanisms cover the two classes of export:

1. **On-screen content that gets PDF-exported** (Reports, anything hit by `printToPDF`): wrap the content in `.export-scope` (defined in `tokens.css`). The class pins `--text-primary`, `--text-secondary`, `--text-muted`, `--accent*`, `--surface*`, and legacy `--color-*` aliases to hardcoded neutrals, and re-asserts `color` + `background` on the scope itself so descendants inherit values resolved from the pinned tokens (not from `body`, which is still themed). `ReportsView` wears it on its root — any new export surface should do the same.
2. **Live-SVG chart export** (`useChartExport` + `ChartExportControls`): serializes the live chart DOM via `XMLSerializer`. Color invariance comes from `useChartColors(false)` returning `EXPORT_COLORS` — a hardcoded constant — so the rendered SVG never reads CSS variables from the themed document. Use `useChartColors(false)` in any chart component that is rendered into an export path.

Regression test: `tests/components/exportTextColorInvariance.test.ts` for the scoped DOM path. Touching `tokens.css`, `shared.css`, or `useChartColors.ts`? Run it before committing.

**No text shadowing on report/print surfaces.** Do not add `text-shadow`, SVG `stroke` halos via `paint-order: stroke fill`, or filter-based glows to text rendered inside reports or chart exports. These are legibility hacks that work against light backgrounds in interactive views (where the halo is `var(--surface)` to mask underlying graphics) but turn into a visible smudge in dark mode and high-contrast mode, where the halo color does not match the report's pinned neutrals. If a chart component uses such an effect for the live view, override it inside the report wrapper (`.chart-report :deep(.marker-symbol) { stroke: none; paint-order: normal; }`) rather than removing it from the chart itself.

### Shared CSS classes

Defined in `src/renderer/styles/shared.css`. **Never redefine these in `<style scoped>`** — scoped styles override the CSS variables that power the text-size accessibility feature.

Shared classes include: `.header`, `.data-table`, `.clickable-row`, `.btn-add`, `.btn-sm`, `.btn-delete`, `.btn-cancel`, `.modal-overlay`, `.modal`, `.modal-actions`, `.person-link`, `.sex-badge`, `.tab-bar`, `.tab-btn`, `.filter-chips`, `.chip`, `.count-label`, `.empty`, `.scroll-sentinel`.

---

## Avatars and profile pictures

Person profile pictures use **one** component everywhere outside MediaView/MediaViewer: `<AppAvatar>` ([`src/renderer/components/ui/AppAvatar.vue`](../../../src/renderer/components/ui/AppAvatar.vue)). It's used in list rows, panel headers, mini cards, the Person panel's Linked Persons / Members tables, MediaPanel's face-tag list, etc.

**Avatars are square, not round.** The component uses `border-radius: var(--radius-sm)` and `aspect-ratio: 1 / 1`. The same shape applies whether the avatar shows a photo or the sex-coloured initials placeholder, so list rows align cleanly with the rounded-square portrait area inside chart boxes. Don't override `border-radius` in scoped styles to make a "round version" — if a layout needs a circle, push back on the design instead of forking the avatar.

```vue
<AppAvatar :person-id="p.id" :given-name="p.given_name" :surname="p.surname" :sex="p.sex" size="sm" />
```

**Sizes:** `sm`=20, `md`=28, `lg`=36, `xl`=56, `2xl`=64, plus `auto` (parent controls width/height — use this when embedding in a container with its own dimensions, e.g. a print frame). Default is `md`.

### Avatar resolution (single, shared rule — no exceptions)

Every avatar in the app — list rows, panel headers, mini cards, tree boxes, report frames — resolves its image through the same chain. There is **no per-surface override**. Trees, list rows, and the duplicates list all use it. Adding a new avatar surface? It already follows this chain by going through `<AppAvatar>` (or `chartData.fetchPersonNode` for SVG charts).

The chain (priority order):

1. **Face-tagged region (any media)** → cropped face. The DB is queried for any `media_regions` row tagging this person; the first match wins, regardless of which media it lives in. Cropped to a 128×128 jpeg via `cropImageToDataUrl(raw, region)`.
2. **Starred linked media** → raw image. The "star" in the Person panel's media table and in MediaPanel's link list marks the first‑sort‑order link. Used as-is, no cropping.
3. **Initials placeholder** → sex‑tinted square with the person's initials.

Implementation: `getPersonProfilePicRef` in [`src/api/media.ts`](../../../src/api/media.ts) returns either `{ mediaId, region }` (step 1), `{ mediaId, region: null }` (step 2), or `null` (step 3). Both `useProfilePicStore` ([`src/renderer/stores/profilePic.ts`](../../../src/renderer/stores/profilePic.ts)) and `chartData.resolvePersonPhotoUrl` ([`src/renderer/utils/chartData.ts`](../../../src/renderer/utils/chartData.ts)) consume that ref and produce the final data URL — they crop when `region` is set, otherwise pass the raw URL through. The store dedupes per-photo IPC fetches inside a batch (3 people in 1 photo = 1 read).

**MediaView and MediaViewer are the only places that bypass this chain** — they render the raw media directly because that's the point of those views.

**Cache invalidation.** When code mutates a person's profile pic (reorder media, set as profile, add/remove a face tag), call `useProfilePicStore().invalidatePerson(personId)`. The store automatically propagates that into the chart-data photo cache (`chartData.invalidatePersonPhoto`), so list/panel avatars and tree boxes refresh together. There is no need to call the chart invalidator directly.

---

## Form fields (input / select / textarea)

Every text input, select, and textarea in the app uses **one** consistent treatment — gray-rest, white-on-focus:

```css
background: var(--surface-bg);             /* rest */
border:     1px solid var(--surface-border);
color:      var(--text-primary);
font-family: inherit;

/* on focus */
outline:    2px solid var(--accent);
outline-offset: 1px;
border-color: var(--accent);
background: var(--surface);
```

This is the rule for **modal forms, panel inputs, settings forms, and one-off inputs alike**. Don't introduce a separate "modal" treatment — when modal forms used `var(--surface)` (white) at rest while panel inputs used `var(--surface-bg)`, every modal opened from a panel section produced a visible color jump.

**The canonical class is `.ep-input`** (with `.ep-textarea`, `.ep-search-input`, `.ep-seg-opt` for related controls — all defined in `shared.css`). Use it whenever possible. If you need a one-off rule for a non-`.ep-*` input:

- **Never** hardcode `#ccc` or any other hex border. Use `var(--surface-border)`.
- **Never** set `background: var(--surface)` at rest — that's the focus state.
- **Always** include both rest and `:focus` rules so the affordance stays consistent.

The only intentional exception is `MediaPanel.media-title-input` — an in-place title editor that sits transparent in the header until focused. If you build another in-place editor (looks like a label until clicked), follow that same transparent-rest pattern; otherwise stick to gray-rest/white-focus.

### Date fields

**Always use `DateInput` (with `date_type`) or `SimpleDateInput` (plain `YYYY-MM-DD` v-model) — never roll a date input by hand.** Both render a single monospace text field with the calendar icon embedded on the right edge, matching the native `<input type="date">` look used for citation `date_accessed`. The text accepts partial dates (`1842`, `1842-03`, `1842-03-15`); the calendar icon opens the native picker for a full date.

**Don't:**
- Don't add separate Y / M / D inputs side-by-side. The single field is the canonical pattern; auto-advancing across three boxes was abandoned because it conflicted visually with the native date picker shown elsewhere in the same modal.
- Don't put a calendar icon outside the field as a sibling button. The icon lives **inside** the field's right edge (absolute-positioned over a hidden native `<input type="date">` so `showPicker()` works).
- Don't drop `font-family: ui-monospace, …` from the date text. The monospace digits are what makes the field read as a date and align with the native picker's rendering.

If you need a date field for a new entity, reuse `DateInput` (full genealogy semantics — type, value, end value, original) or `SimpleDateInput` (plain ISO date, e.g. `date_accessed`).

---

## Buttons

**Label conventions:**
- Use `+ Noun` format for buttons that create or add something: `+ Person`, `+ Event`, `+ Place`
- Never `+ Add Noun` (the `+` already means add)
- Never use `…` (ellipsis) on any button label
- Keep labels short — `+ Task` not `+ Research Task`
- Submit buttons use action verbs: `$t('common.create')` for new, `$t('common.save')` for updates

**Button variants (AppButton):**
| Variant | Usage |
|---------|-------|
| `primary` | Primary submit action in modals |
| `soft` | Header action buttons (`+ Person`), active toggle |
| `ghost` | Inactive toggle, back button, secondary actions |
| `secondary` | Cancel buttons in modals |
| `danger` | Destructive actions |

---

## Section Headers (Side Panels)

Every collapsible section in a side panel uses `<SectionHeader>`:

```html
<SectionHeader
  :title="$t('section.title')"
  :count="itemCount"
  :collapsed="!sections.sectionKey"
  :action-label="'+ ' + $t('section.addLabel')"
  @toggle="toggleSection('sectionKey')"
  @action="handleAdd()"
/>
```

Rules:
- **Always include `:count`** when the section has countable items — visible even when collapsed
- **Include `:action-label`** for sections where adding makes sense (Events, Citations, Media, Names, etc.)
- **Omit `:action-label`** for derived/read-only sections (People at a place, Timeline, Quality)
- Action labels use the `+ Noun` pattern

---

## Side Panel Design

Side panels (PersonPanel, PlacePanel, MediaPanel, ReportPanel) are self-contained sheet components:

```css
.panel {
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
}
.panel-header {
  padding: var(--space-lg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  border-bottom: 1px solid var(--surface-border-subtle);
}
.panel-section {
  padding: 0 var(--space-lg);
  border-bottom: 1px solid var(--surface-border-subtle);
}
```

Section order matters — put the most-used sections first:
- **PersonPanel**: Person > Names > Events > Timeline > Identifiers > Relationships > Groups > Media > Media Timeline > Research Tasks > Quality
- **PlacePanel**: Place Details > People > Events > Citations > Media > Media Timeline > Address > Hierarchy
- **MediaPanel**: Header (thumbnail + editable title input + Open button → emits `open-viewer` so MediaView can call `openViewerById`) > Notes > Linked Persons > Linked Places > Linked Events > Face Tags (★ sets profile pic) > Quality. After title/notes save (on blur), MediaPanel emits `media-updated` so MediaView can patch its items array — this keeps the MediaViewer caption preview in sync with the panel without a reload.

### ReportPanel data sourcing pattern

ReportPanel differs from PersonPanel/PlacePanel/MediaPanel: it sources configuration from **useReportConfigStore** (Pinia) rather than fetching data from window.api. Changes in the panel immediately update the adjacent report preview without requiring scrolling. This real-time preview pattern works because all state (subject IDs, appearance settings, toggles) lives in a shared Pinia store that both the panel and the preview consume.

### Auto-select on load

Paneled views should auto-select an item so the panel is never empty:
- **Media**: select focus person's first media, fallback to first item
- **Places/Map**: select focus person's first place, fallback to first place
- **People/Tree**: panel shows the selected/focal person
- **Reports**: ReportPanel always visible alongside the preview; no auto-select needed

---

## Modal Dialogs

All create/edit forms open in a modal. **Always use `<BaseSubPanel>`** (in `src/renderer/components/modals/`). `BaseModal` is now only the internal overlay/backdrop primitive that BaseSubPanel uses — never instantiate it directly. Click-outside does NOT close modals; Escape does.

```html
<BaseSubPanel
  entity-type="person"
  :title="$t('persons.addTitle')"
  :mode="mode"
  @cancel="$emit('cancel')"
  @save="handleSave"
  @close="$emit('close')"
>
  <div class="ep-fields">
    <div class="ep-field">
      <span class="ep-field-label">{{ $t('persons.name') }}</span>
      <input class="ep-input" v-model="form.name" />
    </div>
  </div>
</BaseSubPanel>
```

**Entity color theming.** `BaseSubPanel` writes `data-entity="<type>"` on its root; the modal header (`var(--entity-bg)` background, `var(--entity-text)` color), save button (`var(--entity-text)` background, `var(--surface-bg)` text), and accent border (`var(--entity-border)`) all flip with mode + theme automatically via the entity-token aliasing rules in `shared.css`. Never apply colors via inline `:style` in any modal — the directive system covers it. The `meta` computed (`ENTITY_META[entityType]` from `entityMeta.ts`) gives you `icon` + `labelKey` only — no colors there.

**Header narration.** BaseSubPanel sets `v-narrate="headerNarration"` on `.ep-header` so screen readers and TTS announce `"{Entity} modal: {Title}"` (Swedish: `"{Entity}-dialog: {Title}"`) — extra wiring is not needed.

**Modes.** `mode="standalone"` (default) renders a centered overlay; `mode="subpanel"` renders side-by-side inside a parent modal's `#subpanels` slot for nested flows (e.g. picking a source from inside an event modal).

### Reusable modals

Extract modals into components when used in multiple views:
- `PersonModal` — single modal for add and edit. With the `relatedTo` prop it also handles the legacy AddRelatedPersonModal flow (creates the relationship + parent_child link, infers sex, pre-fills surname). Used by PersonsView (both tree and list) and PersonPanel
- `EventModal`, `CitationModal`, `PersonNameModal`, `SourceModal`, `RelationshipModal`, `GroupModal`, `ResearchTaskModal`, `PersonIdentifierModal` — all built on `BaseSubPanel`; opened from inside the matching side panel

---

## i18n

Every user-visible string goes through `$t()` / `t()`. Add keys to **both** `sv.ts` and `en.ts`.

Key naming for add buttons: use short nouns, not verb phrases:
```typescript
addPerson: 'Person',        // renders as "+ Person"
addSource: 'Source',         // renders as "+ Source"
addTask: 'Task',             // renders as "+ Task"
// NOT: addPerson: 'Add Person'  // would render as "+ Add Person"
```

---

## Error Handling

Every `await window.api.*` call that mutates data must have try/catch with toast:

```typescript
const toast = useToast();
try {
  await window.api.things.create(form);
  emit('saved');
} catch (err) {
  console.error('[ComponentName] save failed:', err);
  toast.error(t('errors.saveFailed'));
}
```

---

## Leaflet / OpenStreetMap Maps

All maps use `BaseMap.vue` which wraps `@vue-leaflet/vue-leaflet`'s `LMap`. Leaflet is imported synchronously and exposed as `window.L` so vue-leaflet skips its async dynamic import (prevents race conditions).

### BaseMap configuration

```html
<BaseMap
  ref="baseMapRef"
  :initial-zoom="4"
  :initial-center="[55, 15]"
  :scroll-wheel-zoom="true"
  @ready="onMapReady"
>
  <!-- markers, geojson, etc. -->
</BaseMap>
```

BaseMap sets these Leaflet options globally:
- `preferCanvas: true` — all vector layers (circles, polylines, geojson) render on a single `<canvas>` instead of individual SVG/DOM elements
- `zoomSnap: 0.5` / `zoomDelta: 0.5` — half-step zoom levels for smooth scrolling
- `wheelDebounceTime: 80` / `wheelPxPerZoomLevel: 120` — prevents rapid-fire double-zoom on scroll

### Marker performance

**Never use `LMarker` with default icons for many markers.** Each default `LMarker` creates an `<img>` DOM element. With hundreds of markers this causes sluggish zoom/pan.

Options (fastest to slowest):
1. **`LCircleMarker`** — canvas-rendered (with `preferCanvas`), zero DOM elements per marker. Best for homogeneous data points.
2. **`LMarker` + `L.divIcon`** — one `<div>` per marker with inline SVG. Use when markers need custom shapes (pins, triangles). Cache icons to avoid per-render allocation.
3. **`LMarker` + default icon** — one `<img>` per marker. Only for a handful of markers.

### SVG pin markers (MapView pattern)

MapView uses `L.divIcon` with inline SVG for accurate point-down pins:

```typescript
function makePinIcon(selected: boolean, resolved: boolean) {
  const color = selected ? SELECTED_COLOR : resolved ? RESOLVED_COLOR : BASE_COLOR;
  const size = selected ? 14 : 11;
  return L.divIcon({
    className: '',                              // no default leaflet-div-icon styling
    iconSize: [size * 2, size * 2 + 6],
    iconAnchor: [size, size * 2 + 6],           // anchor at triangle tip (bottom center)
    popupAnchor: [0, -(size * 2 + 4)],          // popup above pin
    html: `<svg ...>
      <circle ... />                             <!-- circle head -->
      <polygon ... />                            <!-- triangle tip pointing down -->
    </svg>`,
  });
}
```

Key rules:
- **Cache icons** — only 4 variants (normal/selected × resolved/exact), create once and reuse
- **`iconAnchor` at the triangle tip** — so the point sits exactly on the coordinate
- **Thin stroke (0.5–1px white)** — separates overlapping pins without creating visual noise
- **Lower opacity for resolved/inferred coordinates** — communicates uncertainty

### invalidateSize and resize handling

When the map container changes size (panel open/close, drag resize, window resize), call `baseMapRef.value?.invalidateSize()`. But **always debounce**:

```typescript
// ResizeObserver — debounce to avoid feedback loops during zoom animations
resizeObserver = new ResizeObserver(() => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => baseMapRef.value?.invalidateSize(), 150);
});

// Panel width watcher — debounce per-pixel drag events
watch(panelWidth, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => baseMapRef.value?.invalidateSize(), 50);
});
```

Without debouncing, `invalidateSize()` triggers a resize → observer fires → `invalidateSize()` again → feedback loop that causes jank during zoom animations.

### Computed data for markers

When building marker data in a `computed`, avoid per-item allocations:
- Build lookup Maps **once** at the top of the computed, not inside the loop
- The `usePlaceResolver` composable caches resolve results — safe to call in a computed loop

### Map reactivity on data changes

Maps load data once on mount and cache it at module level. **Pins do not move automatically when entities are edited via a side panel.** The pattern to fix this:

1. **Panel emits `'entity-updated'`** after saving:
   ```typescript
   const emit = defineEmits<{ 'entity-updated': [id: string]; /* ... */ }>();
   async function saveField(field: string, value: unknown) {
     await window.api.entity.update(id, { [field]: value });
     (entity.value as Record<string, unknown>)[field] = value;
     emit('entity-updated', id);
   }
   ```

2. **Map view listens and refreshes that specific item** (not the full list):
   ```typescript
   async function refreshPlace(id: string) {
     const updated = (await window.api.places.get(id)) as PlaceRow | null;
     if (!updated) return;
     const idx = places.value.findIndex(p => p.id === id);
     if (idx >= 0) {
       places.value[idx] = updated;
       places.value = [...places.value]; // trigger reactivity
       cachedPlaces = places.value;
       invalidate();        // clear resolver cache
       await ensureLoaded(); // rebuild resolver
     }
   }
   ```

3. **Wire up in template:**
   ```html
   <PlacePanel :place-id="selectedId" @place-updated="refreshPlace" />
   ```

**Key rule:** always invalidate the `usePlaceResolver` cache after name changes — the old name's resolved coordinates are stale. Call `invalidate()` then `ensureLoaded()`.

---

## Refreshing Views on Data Changes

**The mechanism (read-only background):** `preload/index.ts` wraps every mutating IPC call in `mutating()`, which fans out to `dataChangedListeners`. `App.vue` consumes that to bump `dataVersionStore.version` (used by quality / research / duplicates badges). For everything else — list views, panels, charts, maps, timelines, sections — the data-loading composables own the subscription.

### The rule: composables own reactivity

Every list+panel route shows three things at once — a **left list**, a **right side panel**, and a **center view** (chart / map / timeline). All three must refresh after any mutation, without the user navigating away.

- Use `useEntityData(idRef, loader)` for any self-loading section, panel data load, single-entity chart, or one-row view. It auto-subscribes to `onDataChanged` (debounced ~150 ms), reloads on mutation, and unsubscribes on scope dispose. Race-safe via a generation counter.
- Use `usePagedList({ ..., fetchPage })` for any list view. Same auto-subscription, reload on mutation, race guard via sequence id.
- **Never call `window.api.onDataChanged(...)` directly from a component or view.** If you find yourself reaching for it, the answer is one of:
  - "I'm not using the composable" → use it.
  - "I need a targeted single-item update" → see Pattern 1 below.
  - "I'm doing app-wide cross-entity fan-out" → only `App.vue` is allowed (badges).
- Opt-out: `useEntityData(idRef, loader, { subscribe: false })` for snapshot/read-only views (report previews, undo viewers). Rare.

### Pattern 1: Panel-emits-refresh (targeted single-row update)

Used **on top of** the auto-subscription, only when a full reload is too expensive or causes visible flash. The map repins one place rather than rebuilding the whole resolver; the media library hot-swaps one row's thumbnail. See the "Map reactivity on data changes" section above for the full PlacePanel + MapView wiring.

The panel emits `entity-updated` after saving. The parent view's handler does the targeted refresh — and that's it; the composable will also reload, but the targeted refresh wins because it commits before the debounced reload fires.

### What NOT to do

- ❌ `watch(() => dataVersionStore.version, () => loadAll())` in a view — this is Task-15 cleanup. Use `usePagedList` (or `useEntityData`); both auto-react.
- ❌ `onMounted(() => window.api.onDataChanged(...))` in a panel or chart — composables own it. Past components that did this (`PersonsView` chart bridge, `usePersonPanelData`) have been or are being migrated.
- ❌ Manual `watch(() => props.personId, load, { immediate: true })` in a self-loading section — use `useEntityData` so the section also reacts to mutations, not just id changes.

---

## PlacePicker as Name Editor

When a field needs gazetteer-aware autocomplete for place names, **reuse `PlacePicker`** — don't build custom autocomplete. PlacePicker already has database search, gazetteer search, keyboard navigation, and create-new.

### Using PlacePicker to rename a place

Point the picker at the current place's ID. When the user selects a different place, copy its data onto the current place:

```html
<PlacePicker :model-value="placeId" @select="onNamePlaceSelected" />
```

```typescript
async function onNamePlaceSelected(selected: { id: string; name: string }) {
  if (selected.id === currentId) return;
  const source = await window.api.places.get(selected.id);
  const path = await window.api.places.getPath(selected.id);
  const updates: Record<string, unknown> = { name: path || selected.name };
  if (source) {
    if (source.latitude != null) updates.latitude = source.latitude;
    if (source.longitude != null) updates.longitude = source.longitude;
    if (source.place_type) updates.place_type = source.place_type;
    if (source.parent_place_id) updates.parent_place_id = source.parent_place_id;
  }
  await window.api.places.update(currentId, updates);
  await reload();
}
```

**Key rule:** always copy lat/lon, type, and parent — not just the name. Otherwise the map pin won't move and fields go stale.

---

## Design Principles

- **Sheets, not borders** — visual separation comes from elevation (shadow + background contrast), not borders between areas
- **No lines between siblings** — remove `border-bottom` between adjacent areas within a sheet (e.g. between toolbar and content). Lines only between collapsible sections
- **Content feathering** — content never touches sheet edges; padding creates breathing room
- **Consistent toggle placement** — view mode toggles always in the header row, right-aligned before the action button
- **External links open in system browser** — use `shell.openExternal()`
- **Enrich at render time** — never store computed/inferred data in the database

# Nav orientation toggle + list-on-left in Persons / Places

## Why
Genealogists with wide screens want the chart and the person list visible at
the same time. Today `PersonsView` is a tab toggle (tree XOR list); the user
has to context-switch every time they want to scan the list while a tree is
focused. Same problem for places (map XOR list).

A second, smaller frustration: vertical sidebar eats horizontal space the
chart desperately needs. Letting users pick a horizontal top-bar gives them
~220 px back across the whole window.

This plan ships **two independent things behind a single setting**:

1. **Nav orientation:** `Utseende → Meny: Lodrät | Vågrät`. Lodrät is today's
   left sidebar; Vågrät is a two-row top bar (meta + section dropdowns).
2. **List-on-left:** `PersonsView` and `PlacesView` get a permanent left list
   column (between the nav and the chart/map). The right `PersonPanel` /
   `PlacePanel` stays as it is.

The existing tab system on `PersonsView` becomes redundant once the list is
permanent — we drop it.

## Out of scope
- Static-website export (no chart, no map; keeps its current layout).
- `MediaView`, reports, sources etc. — they keep today's layout. Only Persons
  and Places change.
- The nav-orientation setting is a UI preference, persisted in
  `localStorage` (key `slaktforskning-nav-orientation`). NOT in db_settings.

## Tasks

- [ ] **A. Nav orientation toggle** — `src/renderer/App.vue`
  - Add `navOrientation: 'vertical' | 'horizontal'` ref, persist in
    `localStorage`, default `vertical`.
  - Render the existing left sidebar template under `v-if="navOrientation === 'vertical'"`.
  - Add a `v-else` top-bar template:
    - Row 1 (meta): brand · search · "Vald person" chip · ⚠/🔬 badges if applicable
    - Row 2 (nav): four section dropdowns (Forskning / Organisera / Granska /
      Presentera) + spacer + Import / Inställningar (quiet) + 🎨 popover
  - Sections data lives in a single `computed` so both layouts share the
    source of truth.
  - 🎨 popover hosts the same Appearance / Theme / Text size / Read aloud /
    Language tabs as today, plus a new "Meny" row at the top.

- [ ] **B. SettingsView appearance tab** — `src/renderer/views/SettingsView.vue`
  - Mirror the "Meny" segmented control in the Appearance tab.
  - Both controls write to the same `localStorage` key and reactive ref.

- [ ] **C. List-on-left in PersonsView** — `src/renderer/views/PersonsView.vue`
  - Drop the `viewMode: 'list' | 'tree'` toggle. List is always visible left
    of the chart now.
  - New layout:
    `[ list 280px ] [ chart flex 1 ] [ panel 320px when selected ]`
  - Reuse `PersonsListTab` as the list column (with its filter/pagination/etc).
  - Two `usePanelResize` instances — one for the list (`persons-list-width`),
    one for the panel (`persons-panel-width`).
  - List clicks already call `navigateTo(id)` after the recent click-refocus
    fix → no event-routing changes needed.
  - `centerOnFocal()` in the chart components subtracts the list width from
    viewport when computing scrollLeft. (Or chart wraps in a flex container
    that already excludes the list — preferred, simpler.)
  - Drop `CACHED_VIEWS = ['PersonsListView']` since list is no longer a
    standalone keep-alive view.

- [ ] **D. List-on-left in PlacesView** — `src/renderer/views/PlacesView.vue`
  - Same shape as PersonsView. Map stays in the center, list on the left.
  - Drop the existing list/map tab toggle.

- [ ] **E. Collapsible list column**
  - Add a ▶ collapse button on the list column (matches the existing ▶ on
    the right panel). Persisted per-view in `localStorage`.
  - Default: list visible.

- [ ] **F. Tests**
  - WCAG: run `tests/unit/wcagContrast.test.ts`. Top-bar uses existing
    `--sidebar-*` tokens, so this is a regression check.
  - Component: a smoke test on PersonsView that mounts in both modes and
    verifies the nav switches.
  - E2E: add one Playwright test that toggles orientation in 🎨 and asserts
    the layout container changes.

- [ ] **G. Docs**
  - Update `CLAUDE.md` routes table — note that `/persons` and `/places` no
    longer have a list/tree tab toggle; list is always left.
  - Update `frontend-design` skill if the layout pattern is referenced.
  - Add a CHANGELOG entry.

## Risks
- `centerOnFocal()` and the screen-reader chart-nav computation read
  `scrollRef.value.clientWidth` directly. Adding a left list column should be
  invisible to them as long as the chart's scroll container is the same DOM
  element — confirm with a quick check.
- `usePanelResize` panel width uses a global `localStorage` key today;
  introducing a second instance needs a `storageKey` parameter (the
  composable already accepts one — verify).
- `useChartBridge` exposes `chartBoxes` to the HTTP test harness. List
  permanently visible doesn't affect chart geometry, but `selectedPersonId`
  source of truth (URL) stays the same — bridge unaffected.

## Sequence
1. A + B (nav orientation) — independent of list-on-left, ship-as-you-go.
2. C + D + E (list-on-left) — bigger refactor; do PersonsView first, copy
   the pattern to PlacesView.
3. F + G (tests + docs).

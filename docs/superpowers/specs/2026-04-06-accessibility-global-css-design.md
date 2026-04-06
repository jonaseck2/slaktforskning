# Accessibility & Global CSS Design

**Date:** 2026-04-06  
**Status:** Approved

## Overview

Two related goals:
1. **Consistency** — eliminate duplicate per-view CSS by extracting shared styles into one global file, based on QualityView as the reference implementation.
2. **Accessibility** — add a Settings panel with dark mode, text size (S/M/L), and language controls. Text size scaling is CSS-only; no view-level changes needed.

---

## Architecture: Global CSS (Option C — Hybrid)

### Why

Previous attempts added consistent CSS by copying the same class definitions into each view's `<style scoped>` block. This breaks immediately when a new view is added or a token changes, because there's no single source of truth.

### What

New file: `src/renderer/styles/shared.css`

- Imported once in `src/renderer/main.ts` (unscoped, global)
- Contains CSS custom properties, accessibility overrides, and all shared class definitions
- Dark mode overrides move here from `App.vue` (they remain in `@media screen {}`)

### Structure

```css
/* 1. CSS custom properties */
:root {
  --font-xs:   11px;
  --font-sm:   13px;
  --font-base: 14px;
  --font-md:   15px;
  --font-lg:   16px;
}

/* 2. Text size tiers (screen only — never affects print/export) */
@media screen {
  html.text-medium {
    --font-xs:   13px;
    --font-sm:   17px;
    --font-base: 18px;
    --font-md:   19px;
    --font-lg:   20px;
  }
  html.text-large {
    --font-xs:   15px;
    --font-sm:   21px;
    --font-base: 22px;
    --font-md:   23px;
    --font-lg:   24px;
  }
}

/* 3. Dark mode overrides (moved from App.vue, stay in @media screen) */
@media screen {
  html.dark body { ... }
  /* ...all existing dark overrides... */
}

/* 4. Shared class definitions using the CSS vars */
.data-table { ... }
.chip { font-size: var(--font-sm); ... }
.btn-add { ... }
/* etc. */
```

### Shared classes extracted

All of the following are defined once in `shared.css` and removed from every view's `<style scoped>`:

**Layout:** `.header`, `.count-label`, `.running-hint`, `.empty`, `.empty-hint`, `.scroll-sentinel`

**Table:** `.data-table`, `.data-table th`, `.data-table td`, `.clickable-row`, `.clickable-row:hover`

**Filter chips:** `.filter-chips`, `.chip`, `.chip:hover`, `.chip.active`

**Buttons:** `.btn-add`, `.btn-add:hover`, `.btn-sm`, `.btn-delete`, `.btn-delete:hover`, `.btn-cancel`, `.btn-cancel:hover`

**Modal:** `.modal-overlay`, `.modal`, `.modal h3`, `.modal-actions`, `form > label`, `form input`, `form select`, `form textarea`

**Person links:** `.person-link`, `.person-link:hover`

**Tabs (Tree + Reports):** `.tab-bar`, `.tab-btn`, `.tab-btn.active`, `.tab-btn:hover`  
(ReportsView already uses `.tab-btn`; VisualizationView currently uses `.tab` — migrate to `.tab-btn` to match)

### What stays scoped

Each view keeps `<style scoped>` only for elements unique to that view:

| View | Stays scoped |
|------|-------------|
| QualityView | `.severity-badge`, `.badge-error/warning/notice`, `.row-ignored` |
| ResearchTasksView | `.priority-badge`, `.priority-0/1/2/3`, `.status-chip`, `.status-open/in_progress/done/stopped`, `.expanded-row`, `.expanded-content` |
| RelationshipsView | `.type-badge`, `.role-label` |
| PlacesView | `.place-type-badge` (if added) |
| VisualizationView | `.viz-body`, `.viz-chart-area`, chart-specific layout |
| ReportsView | `.preview-area`, `.zoom-floating`, `.btn-print`, `.btn-pdf`, report-specific layout |
| MediaView | `.file-ref-cell`, `.missing-badge`, `.missing-file` |

---

## View Alignment

Every list view gets: **header → summary line → filter chips (if applicable) → table**.

### Summary lines

| View | Format | Notes |
|------|--------|-------|
| Persons | `Showing 400 of 833 persons` | Lazy-loaded |
| Relationships | `Showing 400 of 833 relationships` | Fix current "persons" bug |
| Places | `272 places` | Not lazy-loaded |
| Sources | `519 sources` | Not lazy-loaded |
| Groups | `12 groups` | Add summary line (currently missing) |
| Media | `12 files · 2 missing` | Add summary line (currently missing) |
| Research Tasks | `14 research tasks · 14 open` | "open" = open + in_progress |
| Data Quality | `550 issues · 0 errors · 550 warnings · 285 notices` | Already present ✓ |

### Filter chips with counts

**Relationships** — add type filter chips:
`All (N)` · `Couple (N)` · `Parent-child (N)` · `Sibling (N)` · `Godparent (N)` · `Other (N)`  
Filters the already-loaded page client-side. Counts reflect full dataset (not just loaded page).

**Places** — replace type column with type filter chips:
`All (N)` · `Country (N)` · `Region (N)` · `City (N)` · `Parish (N)` · `Farm (N)` · `Other (N)`

**Research Tasks** — existing chips, add counts:
`All (N)` · `Open (N)` · `In progress (N)` · `Done (N)` · `Stopped (N)`

**Data Quality** — already has chips with counts ✓

---

## Settings Panel (Sidebar Accordion)

### What changes in App.vue

- Remove: `<button class="dark-mode-toggle">` emoji toggle
- Remove: `<select class="locale-switcher">` language dropdown
- Keep: `div.focus-indicator` in the sidebar — this is the single place the focus person is displayed

The focus person name is redundant inside the Tree and Reports views because it's always visible in the sidebar. Remove it from view content:
- VisualizationView: remove `div.viz-focal-label` (person name shown left of tabs)
- ReportsView: remove `.focal-person-display` span (name shown in ancestor chart controls)
- ReportsView: remove person name display above individual summary and ancestor book previews

### Settings accordion

Add a new "⚙️ Inställningar" nav item at the sidebar bottom (above the database and import/export links). Clicking toggles an `isSettingsOpen` ref.

When open, renders inline below the nav item:

```
UTSEENDE
  [☀ Ljust]  [● Mörkt]      ← replaces dark-mode-toggle button

TEXTSTORLEK  
  [S]  [M]  [L]             ← 3 buttons; active one highlighted

SPRÅK
  [Svenska]  [English]       ← replaces locale-switcher select
```

### Persistence

All three settings stored in `localStorage`:
- `darkMode` — already exists (`'true'`/`'false'`)
- `textSize` — new (`'small'` | `'medium'` | `'large'`; default `'small'`)
- `locale` — already persisted via `saveLocale()`

On `onMounted` in App.vue, all three are applied to `document.documentElement` before first render:
- `darkMode` → `html.dark` class (already done)
- `textSize` → `html.text-medium` or `html.text-large` class (or neither for small)
- `locale` → already handled by `saveLocale()`

---

## Export Behavior

All accessibility overrides (`html.dark`, `html.text-medium`, `html.text-large`) live inside `@media screen {}`. The `@media print` rules in App.vue are untouched.

- **Print/PDF**: always renders with base `:root` values — dark backgrounds and large text never appear in print output.
- **GEDCOM export**: text format, unaffected by CSS.
- **Report preview**: picks up current theme/size while composing (correct — user sees what they're working with); printed output is always clean.

No additional implementation needed — the `@media screen` wrapper provides this guarantee automatically.

---

## Implementation Order

1. Create `shared.css` with CSS vars + all shared class definitions (based on QualityView)
2. Import in `main.ts`
3. Migrate dark mode overrides from App.vue into `shared.css`
4. Remove duplicate scoped styles from each view (Persons, Relationships, Places, Sources, Groups, Media, ResearchTasks, DataQuality, Tree, Reports)
5. Add/fix summary lines on all views
6. Add type filter chips to Relationships and Places; add counts to ResearchTasks chips
7. Fix Relationships summary "persons" → "relationships"
8. Fix Media button color (blue → dark via shared `.btn-add`)
9. Unify tab classes between VisualizationView and ReportsView to shared `.tab-bar` + `.tab-btn`
10. Remove focus person name from VisualizationView and ReportsView content
11. Add Settings accordion to App.vue (dark/light, S/M/L, language)
12. Implement text size: `html.text-medium`/`html.text-large` class toggle + localStorage persistence

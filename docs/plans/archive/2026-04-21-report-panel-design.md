# ReportPanel Design Spec

**Date:** 2026-04-21  
**Status:** Approved

## Problem

In `ReportsView`, report configuration controls (checkboxes, selects, print buttons) sit above the preview in a `.tab-header` block. Changing an option requires scrolling away from the preview and back. The controls and preview compete for the same vertical space.

## Solution

Move all print configuration controls into a `ReportPanel` side panel, following the exact same visual and structural pattern as `PersonPanel`, `PlacePanel`, and `MediaPanel` — the "two sheets of paper" floating sheet aesthetic. The preview fills the remaining space and is always visible while adjusting settings.

## Layout

```
┌─────────────────────────────────────┬────────────────┐
│  Tab groups (FilterChips, unchanged) │                │
│  Keepsake: [A Life] [A Marriage] … │                │
│  Framable: [Pedigree] [Hourglass] … │                │
├─────────────────────────────────────┤  ReportPanel   │
│                                     │  (~220px wide) │
│         Preview area                │                │
│   (zoomed report, scrollable)       │                │
│   Zoom controls stay here           │                │
│                                     │                │
└─────────────────────────────────────┴────────────────┘
```

- The tab bar (FilterChips) stays at the top, unchanged.
- The `.tab-header` block and its `.controls-row` / `.toggles-row` / `.print-actions` children are removed.
- `ReportPanel` is a fixed right-side panel, always visible when a report tab is active.
- Zoom controls remain in the preview pane — they are a preview concern, not a print concern.

## ReportPanel Structure

Same component architecture as `PersonPanel` / `PlacePanel`:

### Header

Shows the report name and current subject:

```
A Life
Per Andersson
```

### Section: Subject

A `SectionHeader` labeled "Person" / "Relationship" / "Place" depending on the active report. Body contains the appropriate picker:
- `PersonPicker` — for A Life, Your Ancestors, Life on One Page, chart prints
- A couple picker for A Marriage — a `PersonPicker` labeled "Person 1" feeding into relationship lookup, or a searchable relationship dropdown (see note below)
- `PlacePicker` — for Place Chronicle
- Photo Album — a mode selector (Person / Relationship / Place / All) followed by the appropriate picker; when "All" is selected no picker is shown
- Family in Year X — a year number input (no picker)

The picker replaces the current implicit `focusStore`-based subject selection (which required navigating away).

> **Note on relationship selection:** No `RelationshipPicker` component exists. For A Marriage, the implementation should build a simple inline component: a `PersonPicker` that, once a person is selected, loads their couple relationships and shows a second dropdown to pick one. This component lives inside `ReportPanel` and does not need to be extracted as a standalone shared component.

### Section: Options

A `SectionHeader` labeled "Options". Body contains the report-specific checkboxes — one per toggle. Label sits beside checkbox. Expanded by default (unlike PersonPanel sections) because these are the primary controls.

Each report's checkbox set:

| Report | Checkboxes |
|--------|-----------|
| A Life | Life Map, Photos, Documents, Sources, Biography, Photo captions, Redact living |
| A Marriage | Life Map, Photos, Sources, Photo captions, Redact living |
| Your Ancestors | Events, Photos, Sources, Redact living |
| Place Chronicle | Photos, Sources, Redact living |
| Life on One Page | _(no toggles — fixed layout)_ |
| Family in Year X | Redact living |
| Photo Album | Redact living |
| Chart prints | _(no Options section — Appearance only)_ |

When a report has no checkboxes, the Options section is omitted entirely.

### Section: Appearance

A `SectionHeader` labeled "Appearance". Body contains selects and range inputs. Labels sit above their control (not beside) to fit the narrow width. Collapsed by default.

Controls by report:

| Report | Controls |
|--------|---------|
| Your Ancestors | Color mode (select), Density (select), Generations (range) |
| Pedigree Print | Paper size (select), Orientation (Portrait/Landscape toggle buttons), Color mode (select), Tile count (read-only info) |
| Hourglass Print | Paper size, Orientation, Color mode, Tile count |
| Descendant Print | Paper size, Orientation, Color mode, Tile count |
| Fan Chart Print | Paper size, Orientation, Color mode |
| Timeline Print | Paper size, Orientation, Color mode |
| A Life, A Marriage, others | _(no Appearance section)_ |

Orientation is rendered as two adjacent buttons (Portrait / Landscape) rather than a select, matching the existing `ChartExportControls` pattern.

### Print / Export buttons

Sticky at the panel bottom (outside the collapsible sections), always visible. Not a section. Two full-width buttons:
- **Primary** (solid): "Print" — calls `printCurrent()`
- **Secondary** (outlined): "Export PDF" — calls `exportPdf()` (or "Save SVG" / "Save PDF (tiled)" for chart prints)

Buttons are disabled when no subject is selected.

## State

`ReportPanel` receives its state via props from `ReportsView` and emits updates back. `ReportsView` continues to own all report configuration state (`aLifeShowLifeMap`, `yourAncestorsColorMode`, etc.) — no state migrates into the panel.

The panel is not generic/dynamic. Each report type gets its own conditional block inside `ReportPanel` (using `v-if="activeTab === 'alife'"` etc.), mirroring the existing per-tab structure in `ReportsView`.

## Zoom

Zoom controls stay exactly where they are in the preview pane. No change.

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/renderer/components/ReportPanel.vue` | New component |
| `src/renderer/views/ReportsView.vue` | Remove `.tab-header` blocks; add `<ReportPanel>` in layout |
| `CLAUDE.md` | Add `ReportPanel` to Shared Components table |
| `.claude/skills/frontend-design/SKILL.md` | Document ReportPanel pattern |

## Non-Goals

- No redesign of the tab bar or FilterChips
- No changes to report components themselves
- No changes to zoom behavior
- No generic/dynamic panel (each report's section is explicit)

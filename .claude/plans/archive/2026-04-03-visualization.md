# Design: v0.5.0 — Visualization

**Date:** 2026-04-03
**Status:** Done

## Overview

Add SVG-based genealogy visualization to Släktforskning. Three chart types — Pedigree, Hourglass, and Timeline — accessible from a new `/visualisering/:personId` route. The visualization is the **primary navigation surface** of the app; the flat person list is secondary. Users navigate through their data by clicking persons in the tree, which re-centers the view on that person.

No new dependencies. No new API, IPC, or MCP tools. All data is fetched via existing IPC channels.

---

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/visualisering` | `VisualizationView` | Entry point. Shows PersonPicker if no focal person. Persists last viewed person ID to `localStorage` and redirects there on re-entry. |
| `/visualisering/:personId` | `VisualizationView` | Main view. Focal person in header, three chart tabs. |

The sidebar reorders "Visualisering" to the **top** of the nav list (above "Personer"), reflecting its role as primary navigation.

`PersonDetailView` gets a **"Visa i träd →"** button in the header that navigates to `/visualisering/:id`.

---

## New Files

```
src/renderer/
├── views/
│   └── VisualizationView.vue          # Top-level route component
└── components/
    └── charts/
        ├── PedigreeChart.vue          # Ancestors SVG (3 generations)
        ├── HourglassChart.vue         # Ancestors + descendants SVG
        └── TimelineChart.vue          # Lifespans on time axis
```

---

## VisualizationView

- Loads focal person via `window.api.persons.get(personId)` on mount and on route param change
- Shows person name + birth year in header, with a "Visa detaljer →" link to `PersonDetailView`
- Back button returns to previous route
- Three tabs: **Stamtavla** / **Timglas** / **Tidslinje** — tab selection persisted to `localStorage` so the user returns to the same chart type
- Passes `personId` as prop to the active chart component
- Persists `personId` to `localStorage['viz-focal-person']` on each navigation so `/visualisering` can redirect back

### Empty state

When no persons exist in the database, shows a prompt: "Lägg till en person för att börja visualisera."

---

## Chart Components

All three charts share the same **person box** design:

| Property | Value |
|----------|-------|
| Box size | 155 × 44px, `rx=4` |
| Left border | 4px: `#7eb8f7` (M) / `#f7a5c0` (F) / `#ccc` (U) |
| Focal person | `#2c3e50` fill, white text, blue left border |
| Deceased | `#f8f8f8` fill, muted text |
| Hover | `stroke-width` increases to 2, `cursor: pointer` |
| Click | `router.push('/visualisering/' + person.id)` |
| Focal person click | No-op (already focused) |

Each box shows: **given name + surname** (line 1), **birth year** or **birth–death years** (line 2).

SVG scaling: all charts use `viewBox` with `width="100%"` and `max-width` capped at a reasonable maximum. The SVG scales to the container width so it works on small and large monitors without horizontal scroll. The outer `.viz-area` is a scrollable flex container for very tall charts.

---

## PedigreeChart

**Shows:** Focal person + up to 2 generations of ancestors (max 7 boxes).

**Data fetching:**
1. `getRelationshipsOfPerson(personId)` — filter to `parent_child` where focal is the child role
2. From each parent relationship: fetch both persons, recurse one more generation
3. All fetched in parallel where possible

**Layout algorithm:**

```
boxH = 44, boxW = 155, vGap = 20, hGap = 50

Gen 2 (grandparents): 4 rows
  rowH = boxH + vGap = 64
  svgH = 4 * boxH + 3 * vGap = 236
  GP[i].y = i * rowH

Gen 1 (parents):
  Father.cy = midpoint(GP[0].cy, GP[1].cy)
  Mother.cy = midpoint(GP[2].cy, GP[3].cy)

Gen 0 (focal):
  Focal.cy = midpoint(Father.cy, Mother.cy)

Gen x position: x = genIndex * (boxW + hGap)
```

**Connectors:** Right-angle polylines. From a person's right center, a horizontal segment to a shared fork x, a vertical segment spanning both children, horizontal segments out to each child's left center.

**Missing ancestors:** Empty slots are skipped — no placeholder boxes.

---

## HourglassChart

**Shows:** Focal person, up to 2 generations of ancestors above, 1 generation of children below.

**Data fetching:**
- Ancestor traversal: same as PedigreeChart (2 levels up)
- Children: `getRelationshipsOfPerson(personId)` filtered to `parent_child` where focal is the parent role

**Layout:** Two passes from the focal center:
- **Upward pass:** same algorithm as pedigree, focal at vertical center
- **Downward pass:** children spread symmetrically below focal

**Couple connectors:** When two parents share a child, a horizontal bar with a filled dot (●) connects them above the child lines. This uses `event_participants` role data to identify co-parents.

**Generation labels** (left margin, small muted text): "Morföräldrar / Farföräldrar", "Föräldrar", "Fokusperson", "Barn".

---

## TimelineChart

**Shows:** Focal person's nuclear family — parents, siblings, spouse(s), children. Sorted by birth year, oldest at top.

**Data fetching:**
1. `getRelationshipsOfPerson(personId)` — collect all directly related persons
2. For each person: `getEventsForPerson(id)` — extract birth (`birth`) and death (`death`) event dates
3. Date parsing: use `date_value` field (ISO date string or year string) — extract 4-digit year with a regex

**Layout:**

```
leftMargin = 160  (person name labels)
rightMargin = 20
scale = (svgW - leftMargin - rightMargin) / (maxYear - minYear)
x(year) = leftMargin + (year - minYear) * scale

rowH = 36, barH = 22
Person[i].y = topPadding + i * rowH
```

**Edge cases:**
- No birth date: short stub bar starting at a `?` marker at leftMargin
- Living persons (no death date): bar extends to current year with an `→` arrowhead beyond the right edge
- Only one person with dates: still renders; axis shows ±10 years around that person

**Axis:** Decade tick marks and labels. A dashed red "Idag" line at the current year.

---

## Sidebar Change

Current order:
1. Personer
2. Relationer
3. Platser
4. Källor
5. Visualisering (new in v0.4.0 plan)
6. Sök

New order:
1. **Visualisering** ← moved to top
2. Personer
3. Relationer
4. Platser
5. Källor
6. Sök

---

## What Is Out of Scope (v0.4.1)

- More than 3 generations (depth control deferred)
- Zoom and pan controls
- Export to image / print
- Network/force-directed graph (dropped in favor of SVG-only)
- MCP tools for visualization (charts are UI-only, no data model changes)
- Schema changes (none required)

---

## i18n

New strings needed in `src/renderer/i18n/sv.ts` (Swedish) and `en.ts` (English):

- Tab labels: `visualization.tab.pedigree`, `visualization.tab.hourglass`, `visualization.tab.timeline`
- Generation labels: `visualization.generation.grandparents`, `.parents`, `.focal`, `.children`
- Legend: `visualization.legend.male`, `.female`, `.unknown`, `.deceased`, `.focal`
- Empty state: `visualization.empty`
- PersonDetailView button: `personDetail.viewInTree`
- Sidebar entry: already uses the `nav.visualization` key (add if missing)

---

## Testing

- Unit tests: layout algorithm functions (pure TS, no DOM) — given a set of persons+relationships, assert correct box positions and connector coordinates
- E2E: navigate from PersonDetailView → "Visa i träd" → confirm chart renders with correct focal person name; click an ancestor → confirm focal person changes
- No new IPC to test (existing channels only)

---

## Brainstorm Mockups

Saved in `.claude/plans/brainstorm/2026-04-03-visualization/`:

- `viz-mockup.html` — full app mockup with all three chart tabs (open in browser to view)
- `viz-styles.html` — initial visualization paradigm comparison (pedigree / hourglass / network / timeline)
- `cytoscape-vs-svg.html` — Cytoscape.js vs custom SVG effort comparison per chart type

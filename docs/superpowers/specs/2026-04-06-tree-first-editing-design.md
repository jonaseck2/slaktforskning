# Design: Tree-First Editing with Full-Featured Person Panel

**Date:** 2026-04-06  
**Status:** Approved

## Overview

Make the visualization view the primary place to do genealogy work. A "+" button on any chart node lets the user add a parent, spouse, or child without leaving the tree. The right-side panel becomes a full editing surface so the user never has to navigate away to PersonDetailView for routine tasks.

---

## 1. "+" Add Relative on Chart Nodes

A `⊕` icon appears at the bottom edge of each person box when the user hovers over it. It works on any node — not just the focal person.

Clicking the icon opens a small inline popover with three buttons:

- **+ Förälder** — creates a new person and links them as parent of the hovered node
- **+ Partner** — creates a new person and links them as spouse (couple relationship)
- **+ Barn** — creates a new person and links them as child of the hovered node

The popover reuses the existing `AddRelatedPersonModal` after the relationship type is selected. After saving, the newly created person becomes the selected person in the panel (panel opens if closed).

The same three buttons also appear in the panel header (see §2) so the action is reachable from both the chart and the panel.

**Implementation notes:**
- The `⊕` icon sits inside each `<g>` group in PedigreeChart, HourglassChart (and optionally CircleChart). It is rendered in SVG as a circle with a `+` text element.
- Hover state is tracked with `@mouseenter`/`@mouseleave` on the `<g>` group.
- The popover is a small absolutely-positioned HTML element overlaid on the SVG (not an SVG element), positioned near the hovered node.
- CircleChart nodes are small and wedge-shaped — skip the hover icon there for now. The header buttons in the panel are sufficient.

---

## 2. PersonPanel Redesign

`PersonPanel.vue` is extended in place (Approach A: incremental enhancement). All sections are collapsible, state persisted in localStorage.

### 2.1 Header

**Background:** white  
**Content:**
- Left accent bar (sex color: blue/pink/grey)
- Person's primary full name (given + preferred/tilltalsnamn underlined + surname)
- Birth line: `* 12 mars 1842, Göteborg` (full date + place from birth event, if available)
- Death line: `† 5 nov 1901, Göteborg` (full date + place from death event, if available)
- Three dark-blue buttons: `+ Förälder` · `+ Partner` · `+ Barn` (each directly invokes AddRelatedPersonModal with the appropriate mode)

The header is read-only display. Editing basic person data is done in the Person section below. The existing "Open →" link is kept as a small secondary link — PersonDetailView still covers research tasks, media, and name advanced fields not exposed in the panel.

### 2.2 Person Section

Collapsible section (default: collapsed). Uses the same form controls as `PersonDetailView` — compact but identical elements:

| Field | Control |
|-------|---------|
| Kön | `<select>`: Man / Kvinna / Okänt — auto-saves on change |
| Status | `<select>`: Levande / Avliden — auto-saves on change |
| Anteckningar | `<textarea>` — auto-saves on blur |

### 2.3 Namn Section

Collapsible section (default: collapsed). Lists all `PersonName` records for the person.

- Each row: given name + preferred name (underlined) + surname + name type label + delete button
- Primary name (sort_order = 0) shows a ★ instead of delete
- Clicking a non-primary row opens a name-edit modal (same as PersonDetailView)
- `+ Namn` button in section header opens the add-name modal

### 2.4 Händelser Section

Collapsible section (default: **expanded**).

- Renders `<EventList :person-id="personId" />` — **without** `:readonly="true"` (currently passed as `true`, just remove it)
- EventList already supports full add/edit/delete with modals
- `+ Händelse` button is already part of EventList's own header

### 2.5 Relationer Section

Collapsible section (default: collapsed). Existing read-only relationship list, unchanged.

- Adds `+ Relation` button in the section header — clicking shows a small inline 3-button picker (`+ Förälder / + Partner / + Barn`) directly in the section, then opens `AddRelatedPersonModal` with the chosen mode. `AddRelatedPersonModal` requires a `mode` prop, so the picker step is necessary here (unlike the chart node, which has the buttons already visible on hover).

### 2.6 Källor Section

New collapsible section (default: collapsed).

- Lists all citations where `person_id = personId` (via `window.api.sources.getCitationsForPerson`)
- Each row: source title + page/notes excerpt + confidence badge (●●●) + delete button
- `+ Källa` button in section header opens `CitationForm` modal with `personId` pre-filled
- On citation deleted: reload the list

### 2.7 Grupper Section

New collapsible section (default: collapsed).

- Lists all groups the person belongs to (via `window.api.groups.getGroupsForPerson`)
- Each row: group name (clickable → navigates to GroupDetailView) + remove button
- `+ Grupp` button opens an inline GroupPicker (the existing `GroupPicker.vue` component) to search and add a group membership
- On member added/removed: reload the list

---

## 3. Section Order

```
Header (white, always visible)
├── Person        (collapsed by default)
├── Namn          (collapsed by default)
├── Händelser     (expanded by default)
├── Relationer    (collapsed by default)
├── Källor        (collapsed by default)
└── Grupper       (collapsed by default)
```

---

## 4. Data Loading

The panel already re-loads on `personId` prop change. New sections (Källor, Grupper) follow the same pattern: load on mount + on personId change. Birth/death dates in the header are fetched from events (already done for year display — extend to full date + place).

Full date formatting for the header: prefer `date_original` (the source text as written) if available; otherwise format `date_value` as a Swedish locale date string.

---

## 5. What Does NOT Change

- `PersonDetailView` is unchanged — it remains the canonical deep-edit view and is still reachable via the "Open →" link (removed from panel header, since editing now happens in the panel itself — or kept as a fallback link).
- The `AddRelatedPersonModal` component is reused as-is.
- `EventList`, `EventForm`, `CitationForm`, `GroupPicker` are reused as-is.
- Chart layout, zoom, pan, collapse/expand — all unchanged.

---

## 6. Out of Scope

- Places: handled within EventForm (no dedicated panel section)
- Research tasks: not in panel (ResearchTasksView handles these)
- Media: not in panel (MediaView handles these)
- Assertions: not in panel (future work)
- CircleChart hover "+" icon: skipped (node geometry too constrained)

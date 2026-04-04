# Design Spec: Visualisation as Primary Working View

**Date:** 2026-04-04  
**Status:** Approved

---

## Overview

The hourglass/pedigree visualisation becomes the primary workspace. Clicking any person in the chart opens a collapsible detail panel on the right — no page navigation required. The sidebar gets icon+label navigation, renamed in Swedish.

---

## Layout

```
┌──────────┬─────────────────────────────────────┬──────────────────┐
│          │  [Anträd | Timglas | Tidslinje]      │ Lena Maja Holm   │
│  Sidebar │                                      │ f.1843 · d.1915  │
│  (icons) │         Chart area                   │ [Visa i träd]    │
│          │         (flex: 1, scrollable)        ├──────────────────┤
│          │                                      │ ▾ Händelser      │
│          │                                      │   Födseln 1843   │
│          │                                  [◀] ├──────────────────┤
│          │                                      │ ▸ Relationer     │
│          │                                      ├──────────────────┤
│          │                                      │ ▸ Anteckningar   │
└──────────┴─────────────────────────────────────┴──────────────────┘
```

- **Chart area** shrinks when panel is open; expands when panel is collapsed
- **Panel** has a draggable left edge — user sets their preferred width
- Panel width: min 200px, max 520px, default 300px, persisted to `localStorage` as `viz-panel-width`
- Panel open/closed state persisted to `localStorage` as `viz-panel-open`
- `[◀]` toggle button on the panel's left edge collapses the panel to zero (becomes `[▶]` on the chart edge to reopen)

---

## Sidebar

Redesign from text-only links to icon + short label, matching the mockup:

| Icon | Label | Route |
|------|-------|-------|
| 🌳 | Träd | `/visualisering` |
| 👤 | Personer | `/` |
| 🔗 | Relationer | `/relationships` |
| 📍 | Platser | `/places` |
| 📚 | Källor | `/sources` |

Active route highlighted with tinted background + accent colour. Bottom items (Database, Import/Export) remain as small text links.

---

## Interaction model

| Gesture | Action |
|---------|--------|
| Single click on any person in chart | Select → show in right panel (chart stays focused) |
| "Visa i träd" button in panel header | Re-focus chart on this person (navigate to `/visualisering/:id`) |
| "Öppna →" link in panel header | Navigate to full PersonDetailView (`/persons/:id`) |
| Click selected person again | Deselect (panel goes to empty state) |

**Chart `@navigate` events** (currently emitted on click) are renamed to `@select` in VisualizationView — the charts still emit on single click, VisualizationView handles it as selection rather than navigation.

---

## PersonPanel component

**File:** `src/renderer/components/PersonPanel.vue`  
**Props:** `personId: string | null`

### Header (always visible)
- Full preferred name (bold), birth–death years
- Sex colour bar on left edge (matching chart box style)
- `[Visa i träd]` button → emits `focus(personId)` to parent
- `Öppna →` link → `router-link` to `/persons/:id`

### Empty state
When `personId` is null: centred text "Klicka på en person i trädet"

### Collapsible sections

Each section header is a clickable row with a `▾`/`▸` chevron. State persisted to `localStorage` as `viz-panel-section-{name}` (default: Händelser open, others closed).

**Händelser**
- Uses existing `EventList` component (read-only: hide add/edit/delete buttons)
- Pass `personId` prop

**Relationer**
- List of relationships from `window.api.relationships.forPerson(personId)`
- Each row: relationship type + the other person's name as a clickable link
- Clicking a person link emits `select(personId)` to update the panel (does not re-focus chart)

**Anteckningar**
- Person's `notes` field, displayed as plain text
- If empty: "Inga anteckningar"

---

## Draggable panel resize

A 6px-wide drag handle sits on the left edge of the panel (`cursor: col-resize`).

On `mousedown`:
1. Attach `mousemove` and `mouseup` listeners to `document`
2. On `mousemove`: compute `newWidth = containerRight - event.clientX`, clamp to [200, 520]
3. On `mouseup`: remove listeners, persist final width to `localStorage`

The panel width is stored as a CSS variable `--panel-width` on the VisualizationView root, used by both the chart flex child and the panel. This avoids thrashing Vue reactivity on every mousemove pixel.

---

## VisualizationView changes

- Add `selectedPersonId: ref<string | null>(null)`
- Replace `@navigate="navigateTo"` with `@select="selectedPersonId = $event"` on all three chart components
- Layout: `display: flex; flex-direction: row` with `<div class="viz-chart-area">` (flex: 1) + `<PersonPanel>` + drag handle
- `navigateTo(id)` remains as the re-focus handler, called from panel's `focus` emit
- When `personId` route param changes (new focal), clear `selectedPersonId`

---

## EventList read-only mode

Add a `readonly: boolean` prop (default `false`) to `EventList.vue`. When true:
- Hide "Lägg till händelse" button
- Hide edit/delete buttons on each row

---

## Out of scope

- Editing from the panel (events, names, etc.) — use "Öppna →" for that
- Inline person creation from the panel
- Keyboard navigation between panel persons

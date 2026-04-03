# Plan: UI Consistency — Event Rows + Place Parent Input

Small polish pass fixing two specific inconsistencies identified in the UI.

---

## Issue 1: EventList — Edit Button vs Clickable Row

**Current state:** Event rows in `EventList.vue` have an explicit "Edit" button in the actions column (line 31). Every other list/table in the app (PersonsView, RelationshipsView, SourcesView, PlacesView) makes the entire row clickable to open the detail/edit view. The edit button is redundant and inconsistent.

**Fix:** Remove the `.btn-edit` button. Make the entire event row clickable (`@click="editEvent(event)"` on the `<tr>`). Keep the "Cite Sources" and delete buttons in the actions column with `@click.stop` to prevent row-click propagation — same pattern used everywhere else.

**Files:**
- `src/renderer/components/EventList.vue` — remove edit button, add `@click="editEvent(event)"` on `<tr>`, add `@click.stop` on Cite and Delete buttons

**Test:** update component tests if any test the edit button selector; confirm clicking the row opens the EventForm.

---

## Issue 2: PlaceDetailView — Parent Place Input Width

**Current state:** The "Förälderplats" (parent place) field uses `PlacePicker` wrapped in a `label` with `grid-column: 1 / -1` (full-width, spanning both columns). The Name and Type fields sit in a 2-column grid. The parent place picker jumps to full width, which looks inconsistent with the two-column rhythm of the rest of the form.

**Fix:** Constrain the parent place `label` wrapper to one grid column (remove `full-width` / `grid-column: 1 / -1`). If the picker needs more room than one column, span it to 2 columns — matching how Name is handled — but do not blow out to full page width when the other fields do not.

**Files:**
- `src/renderer/views/PlaceDetailView.vue` — remove `full-width` class / `grid-column: 1 / -1` from the parent place label; confirm visual consistency with Name and Type fields

---

## Implementation Steps

- [ ] **EventList.vue** — remove `.btn-edit` button; add `@click="editEvent(event)"` on `<tr>`; add `@click.stop` on Cite and Delete action buttons
- [ ] **PlaceDetailView.vue** — fix parent place `label` grid-column styling to match Name/Type column width
- [ ] **Tests** — update any component tests that reference the edit button; add a test that row click opens EventForm

---

## Skills to Update

- **`add-feature`** — after this is done, the "clickable row, no edit button" pattern is now universal. Update the List view pattern section to explicitly state: event rows use row-click, not an Edit button.

## What Does NOT Change

- The EventForm modal itself — no changes needed
- The CitationForm or citation affordances (covered in the sourcing plan)
- Any other view's row-click behaviour

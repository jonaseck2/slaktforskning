# Tree-First Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the visualization view the primary place to do genealogy work. A ⊕ hover button on chart nodes lets the user add a parent, spouse, or child without leaving the tree. The right-side `PersonPanel` becomes a full editing surface — person data, names, events, relationships, sources, and groups — without navigating to PersonDetailView.

**Architecture:** `PersonPanel.vue` is extended in place (no view/edit toggle, no tabs). Each section is a collapsible accordion (state in localStorage). New sections reuse existing components: `EventList`, `CitationForm`, `GroupPicker`, `AddRelatedPersonModal`. The ⊕ button is rendered as an SVG overlay on PedigreeChart and HourglassChart nodes; the popover is a positioned HTML element (not SVG).

**Design spec:** `docs/superpowers/specs/2026-04-06-tree-first-editing-design.md`

---

## File Map

| File | Role |
|------|------|
| `src/renderer/components/PersonPanel.vue` | Main change: header, Person section, Namn section, remove readonly from EventList, Relationer + button, new Källor section, new Grupper section |
| `src/renderer/components/charts/PedigreeChart.vue` | Add ⊕ hover button + popover |
| `src/renderer/components/charts/HourglassChart.vue` | Add ⊕ hover button + popover |

---

## Task 1: PersonPanel — white header with full dates and add-relative buttons

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Extend data loading to fetch full birth/death date + place**
  - In `loadPerson()`, extend the events fetch to also get `date_original`, `date_value`, `place_address`, and `place_id` for birth and death events
  - Load the place name for birth/death via `window.api.places.get(place_id)` if `place_id` is set
  - Store `birthLine` and `deathLine` strings on `person.value` (e.g. `"12 mars 1842, Göteborg"`): prefer `date_original` text; fall back to `date_value` formatted as Swedish locale date

- [ ] **Step 2: Redesign the header template**
  - Change header background from `#1a2a3a` to `white` with `border-bottom: 1px solid #e5e7eb`
  - Keep the left sex-color accent bar
  - Replace year-only display with two lines: `* {{ birthLine }}` and `† {{ deathLine }}` (omit line if no data)
  - Replace the `router-link "Open →"` with a small secondary text link (keep it — PersonDetailView still covers research tasks, media, advanced name fields)
  - Add three dark-blue buttons below the dates: `+ Förälder`, `+ Partner`, `+ Barn`
  - Each button sets `addRelativeMode.value` (`'parent' | 'spouse' | 'child'`) and `showAddRelative.value = true`

- [ ] **Step 3: Wire AddRelatedPersonModal in PersonPanel**
  - Import `AddRelatedPersonModal`
  - Show it when `showAddRelative` is true, passing `:person-id="personId"` and `:mode="addRelativeMode"`
  - On `@saved`: call `loadPerson(personId)` to refresh dates/header; emit a `'relative-added'` event so VisualizationView can refresh the chart
  - On `@close`: reset `showAddRelative = false`

---

## Task 2: Person section (editable)

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Add "Person" collapsible section after the header**
  - Section key: `'person'`, default collapsed
  - Fields: Kön (`<select>` M/F/U, auto-save on `@change` via `window.api.persons.update`), Status (`<select>` Levande/Avliden, auto-save on `@change`), Anteckningar (`<textarea>`, auto-save on `@blur`)
  - Use same `<select>` + `<label>` markup style as PersonDetailView `.field-grid` but compact (font-size 12px, padding 4px 6px)
  - On save: update `person.value` locally (no full reload needed)

---

## Task 3: Namn section

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Add "Namn" collapsible section**
  - Section key: `'names'`, default collapsed
  - Load names via `window.api.persons.getNames(personId)`, sorted by `sort_order`
  - Each row: `<PersonName>` component + name type label (`$t('nameTypes.' + name.name_type)`) + delete button (hidden for `sort_order === 0`, replaced with ★)
  - Clicking a row (non-primary): open inline name-edit using a small modal (reuse the same fields as PersonDetailView's name edit modal — given_name, surname, name_type select)
  - `+ Namn` button in section header: open add-name modal (same fields, on save: `window.api.persons.addName`, reload names)
  - On delete: `window.api.persons.deleteName(id)`, reload names

---

## Task 4: Händelser section — remove readonly

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Remove `:readonly="true"` from `<EventList>`**
  - Currently: `<EventList :person-id="personId" :readonly="true" />`
  - Change to: `<EventList :person-id="personId" />`
  - EventList already renders its own `+ Händelse` button and edit/delete modals when not in readonly mode
  - No other changes needed

---

## Task 5: Relationer section — add + Relation button

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Add + Relation button with inline mode picker**
  - Add `+ Relation` button to the Relationer section header
  - Clicking it toggles `showRelationPicker.value = true`, which renders a small inline row of three buttons inside the section body: `+ Förälder`, `+ Partner`, `+ Barn`
  - Clicking one of those sets `addRelativeMode` and `showAddRelative = true` (same modal as Task 1)
  - On `@saved`: reload relationships list + reload person header (same as Task 1 §3)

---

## Task 6: Källor section (new)

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Add Citations data loading**
  - Add `citations` ref (array)
  - Load in `loadPerson()` via `window.api.sources.getCitationsForPerson(personId)`
  - Also need source title: for each citation, fetch `window.api.sources.get(source_id)` to get the title. Batch: load all at once with `Promise.all`.

- [ ] **Step 2: Add "Källor" collapsible section**
  - Section key: `'sources'`, default collapsed
  - Each row: source title + page/notes excerpt (truncate at 40 chars) + confidence badge (●●● colored by level) + delete button
  - Delete: `window.api.sources.deleteCitation(id)`, reload citations
  - `+ Källa` button in section header: show `CitationForm` modal with `:person-id="personId"` pre-filled; on `@saved`: reload citations

---

## Task 7: Grupper section (new)

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Add Groups data loading**
  - Add `groups` ref (array)
  - Load in `loadPerson()` via `window.api.groups.getGroupsForPerson(personId)`

- [ ] **Step 2: Add "Grupper" collapsible section**
  - Section key: `'groups'`, default collapsed
  - Each row: group name as a `<router-link>` to `/groups/:id` + remove button
  - Remove: `window.api.groups.removeMember(group.id, personId)`, reload groups
  - `+ Grupp` button in section header: toggle `showGroupPicker = true`, render inline `<GroupPicker>` component
  - On GroupPicker `@select(group)`: call `window.api.groups.addMember(group.id, personId)`, reload groups, hide picker

---

## Task 8: ⊕ hover button on PedigreeChart

**Files:**
- Modify: `src/renderer/components/charts/PedigreeChart.vue`
- Modify: `src/renderer/views/VisualizationView.vue` (handle `relative-added` event to reload chart)

- [ ] **Step 1: Track hover state**
  - Add `hoveredPersonId = ref<string | null>(null)` 
  - Add `@mouseenter="hoveredPersonId = box.person.id"` and `@mouseleave="hoveredPersonId = null"` to each `<g class="person-box">` group

- [ ] **Step 2: Render ⊕ SVG icon**
  - Inside each `<g class="person-box">`, render a `<g class="add-btn">` conditionally when `hoveredPersonId === box.person.id`
  - Position: centered horizontally on the box, at `box.y + box.h - 8` (bottom edge, half overlapping)
  - SVG circle (`r="8"`, fill white, stroke `#2c3e50`) + text `+` (font-size 12, centered)
  - Add `cursor: pointer` style

- [ ] **Step 3: Popover HTML element**
  - Add `addPopover = ref<{ personId: string; x: number; y: number } | null>(null)` 
  - On ⊕ click: compute screen position from the SVG box coordinates + zoom + scroll offset; set `addPopover`
  - Render a `<div class="add-popover">` (position absolute over the chart-outer div) with three buttons: `+ Förälder`, `+ Partner`, `+ Barn`
  - Clicking a button: set `addRelativePersonId` + `addRelativeMode`, show `AddRelatedPersonModal`, hide popover
  - Close popover on outside click (`@click.self` on overlay or a `document` click listener)

- [ ] **Step 4: After save, emit navigate to new person**
  - `AddRelatedPersonModal` emits `saved` — after save, the modal closes. Reload the chart by re-fetching (`load()`) and emit `navigate(newPersonId)` so VisualizationView selects the new person in the panel.
  - Note: the modal doesn't return the new person's id directly. Workaround: intercept in a local `handleAddRelativeSaved()` that emits `'reload'` to VisualizationView; VisualizationView re-fetches the chart tree.

---

## Task 9: ⊕ hover button on HourglassChart

**Files:**
- Modify: `src/renderer/components/charts/HourglassChart.vue`

- [ ] **Step 1–4:** Same as Task 8, applied to HourglassChart box layout.
  - HourglassChart uses the same `box.x / box.y / box.w / box.h` layout structure — the SVG icon and popover logic are identical.

---

## Task 10: VisualizationView — handle reload after add-relative

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`

- [ ] **Step 1: Listen for `relative-added` from PersonPanel and `reload` from charts**
  - PersonPanel emits `relative-added` on modal saved → VisualizationView calls the active chart's reload method (charts already reload on `personId` change; simplest approach: re-push the same route to trigger `load()`)
  - Charts emit `reload` after add-relative saved → same handler

---

## Section Order in PersonPanel

```
Header (white, always visible)
  ↳ sex accent bar, full name, * birth line, † death line, "Open →" link
  ↳ + Förälder · + Partner · + Barn buttons
├── Person        (collapsed by default)  ← new
├── Namn          (collapsed by default)  ← new
├── Händelser     (expanded by default)   ← was readonly, now full CRUD
├── Relationer    (collapsed by default)  ← + Relation button added
├── Källor        (collapsed by default)  ← new
└── Grupper       (collapsed by default)  ← new
```
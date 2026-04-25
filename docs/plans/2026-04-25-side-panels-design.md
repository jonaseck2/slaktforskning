# Design: Universal Side Panels

**Date:** 2026-04-25  
**Status:** Approved

## Goal

Every entity type lives in a list/tree view with a resizable side panel. Clicking a row opens the entity in the panel. No detail view components. No back buttons. Navigation is through the sidebar menu only.

## Pattern

One consistent model across all views:

- The list/map/tree is the left pane
- A drag-resizable panel is the right pane
- Clicking a row sets `selectedId` → panel shows that entity
- Panels have collapsible sections, section state persisted to localStorage
- `:id` routes navigate to the list view with the panel pre-selected (not to a separate component)
- Editing happens in modals opened from within the panel
- Cross-entity links (e.g. a source citation in PersonPanel) open an edit modal — they do not navigate

## Routing

All `:id` routes point to the list view with the entity pre-selected:

| Route | Target |
|---|---|
| `/persons` | PersonsView (tree + list tabs + PersonPanel) |
| `/persons/:id` | PersonsView with `selectedPersonId = :id` |
| `/places` | PlacesView (map + list tabs + PlacePanel) |
| `/places/:id` | PlacesView with `selectedPlaceId = :id` |
| `/relationships` | RelationshipsView + RelationshipPanel |
| `/relationships/:id` | RelationshipsView with `selectedRelationshipId = :id` |
| `/sources` | SourcesView + SourcePanel |
| `/sources/:id` | SourcesView with `selectedSourceId = :id` |
| `/groups` | GroupsView + GroupPanel |
| `/groups/:id` | GroupsView with `selectedGroupId = :id` |
| `/research-tasks` | ResearchTasksView + ResearchTaskPanel |

Old `/visualisering` and `/visualisering/:personId` redirect to `/persons` and `/persons/:id`.

## Existing Panels (no structural changes)

**PersonPanel** — already complete, hosted in VisualizationView (to be renamed PersonsView). Tab-switch and click behaviour already fixed.

**PlacePanel** — already complete, hosted in PlacesView. Map-mode visibility already fixed. Tab order: map first, list second.

**MediaPanel** — no changes.

## New Panels

### SourcePanel

Hosted in SourcesView. Sections:

1. **Source** — editable: title, author, publication info, URL, source type, call number, abstract
2. **Citations** — citations list + CitationForm for adding; clicking a citation opens edit modal
3. **Repositories** — linked repositories with add/remove
4. **Media** — EntityMediaSection
5. **Quality** — source quality checks

### RelationshipPanel

Hosted in RelationshipsView. Sections:

1. **Relationship** — type/subtype dropdowns, notes, PersonPicker × 2 for person1/person2
2. **Events** — EventList with `relationshipId` prop
3. **Citations** — relationship-level citations via CitationForm
4. **Media** — EntityMediaSection

### GroupPanel

Hosted in GroupsView. Sections:

1. **Group** — editable: name, notes
2. **Members** — member list with PersonPicker add + remove button per row

### ResearchTaskPanel

Hosted in ResearchTasksView. Sections:

1. **Task** — editable: task text, notes, result, status (`<select>`), priority, linked person (PersonPicker)

The status chip-cycling affordance stays in the table row only (one-click "mark done" from the list). The panel uses a regular `<select>` so all fields edit consistently.

## Quality View

No panel. Each quality issue row gets a navigate action:

- Person issue → `router.push('/persons/' + personId)` → PersonPanel opens, quality section expanded
- Place issue → `router.push('/places/' + placeId)` → PlacePanel opens, quality section expanded

## Cleanup

**Components deleted:**
- `PersonDetailView.vue`
- `PlaceDetailView.vue`
- `RelationshipDetailView.vue`
- `SourceDetailView.vue`
- `GroupDetailView.vue`

**Component renamed:**
- `VisualizationView.vue` → `PersonsView.vue`

**Route renamed:**
- `/visualisering` → `/persons`; old route redirects

**Sidebar nav entry:**
- The sidebar uses an icon link `to="/"` (no visible "Visualisering" label), so no UI text changes. The redirect handles `/` → `/persons`.
- The screen-reader hotkey description `screenReader.hotkeyVisualization` is renamed to `hotkeyPersons` in `sv.ts` + `en.ts`, and the `useScreenReaderMode` hotkey pushes `/persons` instead of `/visualisering`.

**Inline-expand removed:**
- `ResearchTasksTable` row click selects task in panel instead of expanding inline

**Back buttons removed:**
- All `router.back()` calls and navigation-to-list buttons deleted across all views and components

## Reuse Inventory

New panels reuse these existing components — no new primitives needed:

| Component | Used by |
|---|---|
| `EventList` | RelationshipPanel (already supports `relationshipId`) |
| `EntityMediaSection` | SourcePanel, RelationshipPanel |
| `CitationForm` | SourcePanel, RelationshipPanel |
| `PersonPicker` | RelationshipPanel, GroupPanel, ResearchTaskPanel |
| `ResearchTasksTable` | ResearchTaskPanel (table without inline-expand) |
| `usePanelResize` | All four new panel-hosting views |
| Inline section-state pattern (per panel) | All four new panels — `useSectionState` is hardcoded for PersonPanel and not reusable; replicate the small `loadBool` + `reactive` + `toggleSection` pattern in each panel, optionally extracted to per-panel composables (`useSourcePanelSections`, etc.) for symmetry with `usePlacePanelSections` |

## Implementation Order

1. Rename VisualizationView → PersonsView; update route `/visualisering` → `/persons`
2. Build SourcePanel + wire into SourcesView; delete SourceDetailView
3. Build RelationshipPanel + wire into RelationshipsView; delete RelationshipDetailView
4. Build GroupPanel + wire into GroupsView; delete GroupDetailView
5. Build ResearchTaskPanel + wire into ResearchTasksView; remove inline-expand from ResearchTasksTable
6. Update Quality view row actions to navigate to entity panels
7. Sweep: remove all back buttons and cross-nav buttons

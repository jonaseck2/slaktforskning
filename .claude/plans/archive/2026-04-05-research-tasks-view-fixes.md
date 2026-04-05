# Fix: ResearchTasksView styling, person names, and person editing

## Problem
Three issues in ResearchTasksView:
1. The table looked visually inconsistent with other views (PersonsView, etc.)
2. The Person column was always empty despite tasks having a `person_id`
3. The expanded edit form had no way to link/change the associated person

Additionally, the sidebar research badge did not update reactively when tasks were mutated.

## Root Cause

**Table styling**: `ResearchTasksView` used the `data-table` CSS class but defined no local styles for it. `PersonsView` defines `.data-table` in its own scoped styles; there is no global definition in `App.vue`.

**Empty person column**: `load()` called `window.api.persons.get(task.person_id)` which maps to `getPerson()` → returns `Person` (`{ id, sex, living, notes, ... }`) — no name fields. The `given_name`/`surname` fields only exist on rows returned by `listPersons()` or `getPersonNames()`.

**No person editing**: `editForm` reactive object had no `person_id` field. `toggleExpand()` did not initialize it. The expanded row template had no PersonPicker. `saveEdit()` did not pass `person_id` to the update call. `updateResearchTask()` in the API also didn't accept `person_id` as an updatable field.

**Stale research badge**: `App.vue` wired `loadResearchBadge` to mount and `data-imported`, but not to `onDataChanged`. Mutating a task (status cycle, save edit) fired `onDataChanged` but the badge count didn't refresh.

## Fix

- Added `.data-table` CSS to `ResearchTasksView` matching `PersonsView`
- Changed person name loading to use `window.api.persons.getNames(person_id)` (returns `PersonName[]` with `given_name`/`surname`)
- Added `person_id` field to `editForm`, initialized in `toggleExpand`, saved in `saveEdit`
- Added `PersonPicker` + "Visa →" link to the expanded edit row
- Added `person_id?: string | null` to `updateResearchTask()` API function and the MCP `update_research_task` schema
- Added `common.view` i18n key (sv: "Visa", en: "View")
- Wired `loadResearchBadge` to `onDataChanged` callback in `App.vue` (400ms debounce)

## Files Changed
- `src/api/research_tasks.ts` — added `person_id` to `updateResearchTask` params
- `src/mcp/createServer.ts` — added `person_id` to `update_research_task` schema
- `src/renderer/App.vue` — wire `loadResearchBadge` to `onDataChanged`
- `src/renderer/i18n/en.ts` / `sv.ts` — added `common.view` key
- `src/renderer/views/ResearchTasksView.vue` — all view fixes above

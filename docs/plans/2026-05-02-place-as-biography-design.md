# Place-as-Biography — Design Spec

**Status:** Approved (2026-05-02)
**Implementation plan:** `2026-05-02-place-as-biography.md` (sibling, to be written next)

## User goal

Opening a Place panel feels like opening a biography of that place — the same way opening a Person panel feels like opening a biography of that person. The user sees a hero photo of the place, scans its events in chronological order, sees who lived there and roughly when, browses photos of the building, and tracks open research tasks against the place. None of this requires switching views or building a report. The flow matches PersonPanel's narrative shape so the two panels feel like siblings rather than cousins.

## Scope

This is a `PlacePanel.vue`-only refactor in the renderer, with one API extension (`getPersonsForPlace`), one new API surface (place-scoped research tasks), and one new IPC/MCP exposure. **No new database schema** — all new affordances derive from data the user already authors via existing entry points (events, media links, research tasks).

### In scope

1. **PlacePanel header** — `src/renderer/components/PlacePanel.vue` lines ~9–14: add a hero-photo block above the place name, sized like PersonPanel's profile-photo. Hero = lowest `media_links.sort_order` for this place where the file resolves to an image. "Image" check: `media.format` matches `image/*` OR `media.file_ref` ends in `.jpg|.jpeg|.png|.gif|.webp|.heic|.heif` (case-insensitive). Falls back to text-only header if no qualifying media (no broken-image placeholder). Click → navigate to MediaPanel for that media id.

2. **`getPersonsForPlace()` enhancement** — `src/api/places.ts:260`:
   - Add `WHERE ep.role = 'primary'` to filter out witnesses/godparents/officiants/etc.
   - Add `MIN(substr(e.date_value, 1, 4)) AS first_year, MAX(substr(e.date_value, 1, 4)) AS last_year` (extracted from ISO `date_value` for events with a date).
   - Default sort `ORDER BY first_year ASC NULLS LAST, surname, given_name` so chronologically-earliest residents appear first; undated last; ties broken by name.
   - Return type `{ id, sex, given_name, surname, event_count, first_year, last_year }` — `first_year`/`last_year` are `string | null`.
   - Keep the function name and existing call sites' contract; the new fields are additive.

3. **`PlacePersonsSection.vue` — Years column** — display `first_year–last_year`, collapsing to `first_year` when equal, blank when both null. No new sort controls in v1; chronological default is the right read order for biography.

4. **New `PlaceTimelineSection.vue`** — mirrors `PersonTimelineSection.vue`. Self-loading via `useEntityData(toRef(props, 'placeId'), () => window.api.places.getEvents(placeId))` (the same data the Events section consumes). Default-collapsed. Read-only chronological list. Row click → `EventModal` in edit mode (same wiring as Events section). No `+ Add` action — authoring stays in Events.

5. **Place-scoped research tasks** — full vertical slice:
   - **api**: `src/api/research_tasks.ts` — extend the existing person-link helpers so they accept `entity_type: 'person' | 'place'` rather than hard-coding `'person'`. Add `listForPlace(db, placeId)` returning the same row shape as `listForPerson`. The `task_links` table is already polymorphic — no schema change.
   - **shared/channels**: add `research-tasks:listForPlace`, `research-tasks:linkPlace`, `research-tasks:unlinkPlace` (mirroring the person variants).
   - **main/ipc + db-worker**: register the new channels.
   - **preload**: extend `window.api.researchTasks` (or whichever namespace it lives under) with `listForPlace` / `linkPlace` / `unlinkPlace`.
   - **mcp**: extend `add_research_task` and `update_research_task` MCP tools to accept `place_id` linking; expose `list_research_tasks_for_place` if a person-equivalent tool exists (mirror existing pattern).
   - **renderer**: new `PlaceTasksSection.vue`, self-loading. Reuses `ResearchTasksTable.vue` (already used by `PersonPanel`). Add: opens `ResearchTaskModal` preset to link this place. Edit/delete: same flow as PersonPanel.
   - **`ResearchTaskModal.vue`**: extend to accept a `placeId` prop and link the new task to the place on save (mirroring `personId` handling).

6. **Section reorder in `PlacePanel.vue`** — new order, top to bottom:
   1. Place (identity, current first)
   2. Events (was 3rd)
   3. Timeline (new, default-collapsed)
   4. Persons (was 2nd, enhanced with year-range)
   5. Media (was 5th)
   6. Media Timeline (was 6th, default-collapsed — already is)
   7. Research Tasks (new)
   8. Citations (was 4th)
   9. Address (was 8th, default-collapsed — already is)
   10. Hierarchy (was 9th, default-collapsed — already is)
   11. Quality (was 7th, default-collapsed)

7. **i18n keys** — add new keys to both `sv.ts` and `en.ts`:
   - `placePanel.timelineTitle`, `placePanel.tasksTitle`
   - `placePanel.years` (column header for Persons section)
   - Any task-related strings missing from the place context (most exist for persons already; reuse where keys are scope-agnostic).

8. **`docs/UX_INVENTORY.md`** — update the PlacePanel section index (lines 109–122) and add Purpose statements for the rethought sections per `ux-intent-mapping`.

### Scope deviations (explicit)

- **No Gantt-style residents visualization in the panel.** The user has parked this as a future report (printable one-place-study artifact). Without it, "who was here in year X?" requires scanning the Persons table's year-range column rather than reading a single visual sweep — accepted tradeoff. Reason: the panel is a biography, not a wall chart; the wall chart belongs in `src/renderer/components/reports/`.
- **No `cover_media_id` schema column on `places`.** Hero photo derives from existing `media_links.sort_order`, which the user already controls via the Media section's drag-reorder. Reason: data fidelity (no new authored field for something already expressible in existing data) and avoids a schema migration.
- **No face-tagging or person-in-photo regions for place-tagged media.** Media regions remain person-only as today. Reason: explicitly out of scope per user.
- **No new event types or `place_residences` table for "lived here from–to."** Residence is a derived read at render time from `MIN/MAX` over the person's events at this place, primary-role only. Reason: Prime Directive — the user authored the events; we never persist an inferred "lived here from X" as if they had typed it.
- **`getPersonsForPlace` keeps its name and existing return shape extended additively.** Not renamed to `getResidentsForPlace`. Reason: user explicitly rejected renaming Persons → Residents — the existing language is fine.
- **Sections retain their current names.** "Events" not "Chronology"; "Persons" not "Residents"; "Citations" not "Sources". Per user.

## Architecture

### Data flow (new pieces only)

```
PlacePanel.vue (header hero)
  └→ window.api.media.listForEntity('place', placeId)        [EXISTING]
       sort_order ASC, take first image-format → hero src

PlacePersonsSection.vue
  └→ window.api.places.getPersons(placeId)                    [EXTENDED return shape]
       returns rows { ..., first_year, last_year }

PlaceTimelineSection.vue                                      [NEW component]
  └→ useEntityData(placeIdRef, () =>
       window.api.events.forPlace(placeId))                   [EXISTING ipc; same as EventList in PlacePanel]

PlaceTasksSection.vue                                         [NEW component]
  └→ useEntityData(placeIdRef, () =>
       window.api.researchTasks.listForPlace(placeId))        [NEW ipc → NEW api fn]
  + ResearchTaskModal.vue (extended to accept placeId)
```

### Composable usage

Both new sections (`PlaceTimelineSection`, `PlaceTasksSection`) use `useEntityData(toRef(props, 'placeId'), loader)` exclusively for data loading — never roll their own `watch(props.placeId, …)` and never call `window.api.onDataChanged` directly. This is mandatory per `.claude/rules/renderer.md`.

### Why no new schema

Every "biography of the place" affordance maps to data the user already authors:

| Biography affordance | Backed by |
|---|---|
| Hero photo | First `media_links` row by `sort_order` (user reorders via Media section) |
| Events chronology | `events.place_id` (user authors via EventModal) |
| Timeline derived view | Same `events` rows, render-time chronological sort |
| Residents with year range | `event_participants` (role='primary') + `events.date_value`, `MIN/MAX` at query time |
| Place-level research tasks | `task_links.entity_type='place'` (already polymorphic in schema) |
| Place-level sources | `citations.place_id` (already exists) |

No row in the database knows it's part of a biography. Biography is the read-time arrangement of authored facts.

## Verification

User-observable outcomes — checked in the running Electron app, not just in tests:

1. **Hero photo appears.** Open a Place that has at least one image attached. The PlacePanel header shows the photo above the name, sized like PersonPanel's profile photo block. Reorder media in the Media section: the hero updates to the new first image after reload.
2. **Hero falls back gracefully.** Open a Place with no media attached. Header is text-only — no broken image, no empty box.
3. **Persons section shows year ranges.** Open a Place with multiple residents authored across decades. The Persons table is sorted by earliest-first, each row shows its year range (e.g., `1842–1879`), and persons whose only role at this place is `witness`/`godparent`/`officiant` are absent.
4. **Persons section degrades gracefully.** A Place with only undated events shows the rows with empty Year columns, sorted by name.
5. **Timeline section renders.** Expand the Timeline section. Events appear in chronological order, identical data to the Events section. Clicking a row opens the same EventModal as the Events section.
6. **Tasks section renders and authors.** Click `+ Add task` in the Research Tasks section of a Place panel. Fill in the task. Save. The task appears in the list, AND the same task appears in the global Research Tasks view linked to this place. Edit and delete from the place panel mirror person-panel behavior.
7. **MCP can author place-tasks.** Calling `add_research_task` with `{ place_id: '...' }` via the MCP server creates a task linked to the place. The renderer's PlaceTasksSection shows it after refresh.
8. **Section order matches the spec.** All 11 sections appear in the order listed in §6 above. Default-collapsed sections start collapsed on first open of a Place; expanded sections start expanded.
9. **No regressions in PersonPanel, ResearchTasksView, MapView, or PlacesView.** All four still load, render, and accept edits as before.

Tests:

- **Unit (Vitest, real in-memory SQLite):**
  - `getPersonsForPlace` returns `first_year`/`last_year` and excludes non-primary roles.
  - `research_tasks.listForPlace` returns linked tasks; `linkPlace`/`unlinkPlace` round-trip.
- **Coverage tests** (already exist) must pass:
  - `tests/unit/ipc-worker-coverage.test.ts`
  - `tests/unit/preload-coverage.test.ts`
  - `tests/unit/static-api-coverage.test.ts`
  - `tests/components/panel-layout-consistency.test.ts`
- **Smoke check by user** — outcomes 1–8 above, in the running app, before merge.

## Failure modes / RCA reference

Patterns to avoid, learned from prior plans:

- **Don't persist the hero photo selection as a new column.** That's an inferred-from-existing-data value (sort_order=0 already means "first"). Persisting it would violate the Prime Directive (CLAUDE.md) — same class of mistake as persisting gazetteer-resolved coords. The migration would also be silently broken for users with existing media but no new "cover" choice yet.
- **Don't write residence ranges back to the DB.** `first_year`/`last_year` are computed in the SQL `SELECT` and rendered. They MUST NOT be added as columns on `persons` or a `place_residences` table. Same Prime Directive class.
- **Don't roll a manual `watch` + `onDataChanged` in the new sections.** Use `useEntityData` exclusively. The panel-composables refactor learned this the hard way (`.claude/rules/plans.md` cites it).
- **All-or-nothing pattern migration.** When extending `research_tasks` API to be polymorphic over `entity_type`, every existing person-link helper must move to the new shape in the same change — no half-migrated mix of `addPersonLink` + `addLink({entity_type})`. Per `.claude/rules/renderer.md` "Pattern migrations are all-or-nothing."
- **MCP exposure must land with renderer exposure.** A new IPC channel without an MCP equivalent leaves agents unable to author place-tasks even though the data model supports it. The plan must wire both.
- **Don't introduce a new class name without the shared.css collision check** (`.claude/rules/renderer.md`). The hero block's CSS class needs `grep -RIn '\.<new-class>' src/renderer/styles/ src/renderer/components/ src/renderer/views/` first.

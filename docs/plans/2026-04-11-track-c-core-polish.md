# Track C: Core Polish

Source: [competitor gap analysis](2026-04-11-competitor-gap-analysis.md)

Features users expect from a serious genealogy app. Each milestone is independent.

---

## C1: Undo/Redo [feature]

Transaction-based undo/redo for all data mutations. Table stakes for a data-entry-heavy app.

### Steps

- [ ] Design: command pattern with action recording
  - Each mutation records: description (i18n key), undo function, redo function
  - Group related operations (e.g. createPerson + addPersonName = one undo step)
- [ ] Create `src/api/undo.ts`:
  - [ ] `UndoManager` class: `push(action)`, `undo()`, `redo()`, `canUndo()`, `canRedo()`, `getUndoLabel()`, `getRedoLabel()`
  - [ ] Undo stack and redo stack (in memory, not persisted)
  - [ ] `beginGroup(label)` / `endGroup()` for compound operations
  - [ ] Max stack depth (e.g. 100 actions) to bound memory usage
- [ ] Wrap API mutations to record undo actions:
  - [ ] Person: create/delete, update (snapshot old values), name add/update/delete
  - [ ] Relationship: create/delete, update
  - [ ] Event: create/delete, update, participant add/remove
  - [ ] Source: create/delete, update
  - [ ] Citation: create/delete
  - [ ] Place: create/delete, update
  - [ ] Group: create/delete, update, member add/remove
  - [ ] Research task: create/delete, update
  - [ ] Media: create/delete, link/unlink, reorder
- [ ] IPC channels: `undo:undo`, `undo:redo`, `undo:state` (returns { canUndo, canRedo, undoLabel, redoLabel })
- [ ] Preload: expose `window.api.undo.*`
- [ ] Keyboard shortcuts: Cmd+Z / Ctrl+Z (undo), Cmd+Shift+Z / Ctrl+Shift+Z (redo)
- [ ] Electron menu: Edit > Undo / Redo with dynamic labels
- [ ] Renderer: Pinia store for undo state, updated after each data operation
- [ ] Toast notification showing what was undone/redone
- [ ] Clear undo stack on database switch
- [ ] Unit tests: undo/redo for each entity type, compound operations, stack overflow
- [ ] i18n for undo labels ("Undo: Delete person", "Redo: Add event", etc.)

### Dependencies
None.

### Key decisions
- In-memory only — no persistence across sessions (matches user expectations)
- Command pattern, not database snapshots — more efficient and gives meaningful labels
- Grouped operations prevent partial undos (creating a person should undo name + person together)
- Stack depth capped at 100 to prevent memory bloat in long sessions

---

## C2: Person Timeline View [feature]

Chronological view of all events for a person. Visual timeline for spotting gaps and understanding a life story.

### Steps

- [x] Create PersonTimeline.vue (self-loading component, `personId` prop):
  - [ ] Watch personId for changes (PersonPanel pattern)
  - [ ] Load events via `window.api.events.getForPerson(personId)`
  - [ ] Sort by date_value (handle null/unknown dates)
- [x] Timeline rendering:
  - [ ] Vertical layout with date axis
  - [ ] Event cards: type badge/icon, formatted date, place name, description
  - [ ] Source indicator: citation count badge on each event
  - [ ] Date type handling:
    - Exact: precise position
    - About/before/after: position with uncertainty indicator (dashed border or fade)
    - Between: span bar between start and end dates
    - Unknown: separate "Undated" section at bottom
- [x] Gap detection: highlight gaps > 20 years between consecutive events
- [x] Click event card to open EventForm for editing
- [x] Add as tab in PersonDetailView (alongside existing sections)
- [x] Add as collapsible section in PersonPanel
- [x] Expose via `defineExpose({ reload })` for parent refresh
- [x] i18n for timeline labels, gap warnings, date formatting
- [x] Unit tests for date sorting logic and gap detection

### Dependencies
None — uses existing event API.

### Key decisions
- Vertical layout (not horizontal) — better for variable content length and scrolling
- Self-loading component following PersonPanel pattern (watch personId, not onMounted)
- Gap detection is a visual hint, not a quality check (quality checks already cover missing events)

---

## C3: Place Map Visualization [feature]

Interactive map showing places on OpenStreetMap. Person life maps and global place overview.

### Steps

- [x] Install dependencies: `leaflet`, `@types/leaflet`, `vue3-leaflet` (or `@vue-leaflet/vue-leaflet`)
- [x] Create MapView.vue — standalone route (/map):
  - [ ] Load all places with coordinates via `window.api.places.list()`
  - [ ] OpenStreetMap tile layer (no API key needed)
  - [ ] Marker per place with popup: place name, event count, link to place detail
  - [ ] Marker clustering when zoomed out (leaflet.markercluster)
  - [ ] Auto-fit bounds to show all markers
  - [ ] Filter panel: filter by place type, search by name
- [x] Add route `/map` to router
- [x] Add Map entry to sidebar navigation
- [x] Create PersonMap.vue component (embeddable, personId prop):
  - [ ] Load person's events with places
  - [ ] Markers for each event location
  - [ ] Lines connecting events chronologically (life path)
  - [ ] Color-code markers by event type (birth=green, death=red, etc.)
  - [ ] Popup: event type, date, place name
- [x] Add PersonMap as tab in PersonDetailView
- [x] Add PersonMap section in PersonPanel
- [x] PlaceDetailView: show map centered on place with child places as markers
- [x] Handle places without coordinates: show count of unmapped places, encourage adding lat/lon
- [x] i18n for map UI, popups, filter labels
- [x] Tests for coordinate validation and edge cases (null coords, 0/0 coords)

### Dependencies
None — uses existing place data with lat/lon.

### Key decisions
- OpenStreetMap (free, no API key) via Leaflet
- Global map view is a separate route; person map is an embedded component
- Life path lines show the chronological movement of a person through places
- Places without coordinates are acknowledged but not shown (no geocoding built-in)

---

## C4: GEDCOM Hardening [feature]

Edge case testing against real-world GEDCOM files from major programs. Bulletproof import to reduce switching apprehension.

### Steps

- [ ] Collect sample GEDCOM files:
  - [ ] RootsMagic 10 export
  - [ ] Gramps 6.0 export
  - [ ] Legacy Family Tree export
  - [ ] Family Tree Maker export
  - [ ] Ancestris export
  - [ ] MacFamilyTree export
  - [ ] MyHeritage export
  - [ ] FamilySearch GEDCOM 7.0 export
- [ ] Create integration test suite: `tests/unit/gedcom_compat.test.ts`
  - [ ] Import each sample → verify entity counts match expected
  - [ ] Verify relationships are correctly linked
  - [ ] Verify events have correct types and dates
  - [ ] Verify sources and citations are preserved
  - [ ] Verify character encoding (UTF-8, ANSEL, ASCII)
- [ ] Fix identified parsing issues:
  - [ ] Non-standard extension tags (graceful skip with warning)
  - [ ] Malformed dates (best-effort parsing, preserve in date_original)
  - [ ] Character encoding detection and conversion
  - [ ] Nested NOTE continuations (CONT/CONC)
  - [ ] Multi-media references across programs
- [ ] Import preview: before committing, show summary (X persons, Y relationships, Z events, W sources, N warnings)
- [ ] Import progress indicator for large files (> 1000 records)
- [ ] Improve ValidationReport:
  - [ ] Per-program quirk warnings ("RootsMagic uses non-standard _MTTAG")
  - [ ] Data loss warnings ("3 events had no recognizable type, imported as 'other'")
  - [ ] Character encoding warnings
- [ ] Document compatibility notes in README or help section
- [ ] Add synthetic GEDCOM test files covering edge cases:
  - [ ] Maximum nesting depth
  - [ ] Unicode in all fields
  - [ ] Empty/minimal GEDCOM
  - [ ] GEDCOM with only custom tags
  - [ ] Very large GEDCOM (10,000+ records)

### Dependencies
None — extends existing GEDCOM import.

### Key decisions
- Goal is "never crash, always import something useful" — graceful degradation over strict parsing
- Sample files from real programs are the gold standard for testing
- Import preview gives users confidence before committing to a large import
- Progress indicator prevents "is it stuck?" anxiety on large files

# Fix: E2E test suite Windows compatibility

## Problem
All E2E GUI tests (gui-persons, gui-sources-rels, gui-places, gui-viz) failed on Windows
while passing on macOS. Multiple independent root causes across all four test files.

## Root Causes and Fixes

### 1. Tests referenced removed CitationBadge (gui-persons)
`CitationBadge` was removed from `EventList.vue` in commit f1019d9 (April 6) but tests from
April 3 still checked for "Unsourced" text, `source-count-badge`, and `evidence-summary`.
**Fix:** Replaced 3 tests with "Event List" tests that wait for event date strings like '1850'.

### 2. Search test cross-dependency (gui-persons)
`search finds persons by name` navigated to `/search?q=Erik` expecting Erik Svensson created
by an earlier test. Failed if test order changed or DB was fresh.
**Fix:** Test now creates its own person (Ingrid Searchable) before searching.

### 3. Wrong empty state text (gui-sources-rels)
Test expected "No relationships yet" but i18n key `relationships.emptyState` renders
"No relations yet. Click 'Add Relation' to get started."
**Fix:** Changed to `waitForText('No relations yet')`.

### 4. Back button router history (gui-sources-rels)
`relationship detail back button returns to list` navigated straight to detail without first
visiting `/relationships`, so `router.back()` returned to the wrong route.
**Fix:** Added `await app.navigate('/relationships')` before navigating to detail.

### 5. CitationBadge classes in relationship/place views (gui-sources-rels, gui-places)
Both suites searched for `unsourced-badge` / `source-count-badge` classes never present
in RelationshipDetailView or PlaceDetailView.
**Fix:** Replaced relationship test with EventList date check ('1900'); replaced place test
with "Place Details" section heading check.

### 6. Missing data-testid in viz panel (gui-viz)
Test expected `visualization-focal-name` data-testid which was never added. Person name
renders in PersonPanel inside `.panel-name` div.
**Fix:** Changed to `expect(dom).toContain('panel-name')`.

### 7. Missing btn-detail class (gui-viz)
Test clicked `.btn-detail` which does not exist. Navigation to person detail is done via
`a.panel-section-header-action` (the Edit router-link in PersonPanel Person section header).
**Fix:** Changed selector to `a.panel-section-header-action`.

### 8. viz-focal-person localStorage pollution (gui-viz)
Empty state tests passed on first run but failed on retry. After "with persons" tests ran,
`viz-focal-person` was set in localStorage. On retry, `load()` detected it and redirected to
the stored person ID, bypassing the empty state entirely.
**Fix:** Added `localStorage.removeItem('viz-focal-person')` before each empty state navigation.

### 9. Docker executable path on Windows (genney import)
`spawn('docker', ...)` failed when Docker Desktop was installed but only on user PATH (not
system PATH, which Electron's main process uses).
**Fix:** Added `getDockerExecutable()` helper in `src/import/genney/index.ts` that probes
PATH first, then falls back to known Windows install paths under `%ProgramFiles%` / `%LOCALAPPDATA%`.

## Files Changed
- `tests/e2e/gui-persons.test.ts` — CitationBadge removed, Event List tests, self-contained search
- `tests/e2e/gui-sources-rels.test.ts` — correct empty state text, back button history, event list
- `tests/e2e/gui-places.test.ts` — replace citation badge test with Place Details section test
- `tests/e2e/gui-viz.test.ts` — panel-name testid, correct detail link, localStorage cleanup
- `src/import/genney/index.ts` — Windows Docker path resolution via `getDockerExecutable()`

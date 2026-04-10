# Fix: Flaky E2E Tests — Three Root Causes

## Problem
The Playwright e2e suite had persistent failures and flakiness:
- `fetch()` hanging indefinitely causing `beforeAll` to time out after 120 s
- Tests hitting the wrong button (dark-mode toggle instead of Add button)
- `place list shows type badge when place_type is set` always failing (stale list)
- `View details link` and `back button` in viz tests always failing (buttons not found)

## Root Causes

### 1. `fetch()` without timeout + no retry on AbortError
`post()` in `fixture.ts` had no timeout on `fetch()` calls, so if the Electron renderer
became temporarily unresponsive the call hung forever, causing the 120 s Playwright
`beforeAll` timeout to fire. After adding `AbortSignal.timeout(15_000)`, the new error
(`TimeoutError`, `err.name === 'TimeoutError'`) was not in the retry condition
(`err instanceof TypeError`), so it was rethrown immediately instead of retried.

### 2. `click('button')` hitting dark-mode toggle
The dark-mode toggle `<button class="dark-mode-toggle">` in the sidebar is the first
`<button>` in the DOM, before the content area's `.btn-add`. `click('button')` thus
clicked the toggle instead of the Add button, and the resulting failure was masked for a
long time by startup failures that caused tests to be skipped.

### 3. Missing `mutating()` wrappers in preload
`places:create` (and all other `places`, `sources`, `citations`, `groups`,
`repositories`, `researchTasks`, `media` write calls) were not wrapped with `mutating()`
in `src/preload/index.ts`. The `mutating()` wrapper fires `dataChangedListeners`, which
increments `dataVersionStore.version`. Views use `onActivated` guards that only reload
when `version !== loadedVersion`. Without the wrapper, creating a place via
`window.api.places.create()` in a test driver (or from another view) did not increment
the version, so `PlacesView.onActivated` never reloaded — stale data was shown.

### 4. Missing `.btn-back` / `.btn-detail` in VisualizationView
The e2e tests expected `.btn-back` (go back) and `.btn-detail` (navigate to person
detail) buttons to exist in `VisualizationView.vue`. These were never added to the
template, so `click('.btn-back')` / `click('.btn-detail')` threw "Script failed to
execute" errors.

## Fix

**`tests/e2e/fixture.ts`:**
- Added `AbortSignal.timeout(20_000)` to all `fetch()` calls in `post()` and `getDom()`
- Extended retry condition: `err instanceof TypeError || err.name === 'TimeoutError'`
- Also added Phase 2 startup check (polls `!!window.__vue_router`) to ensure Vue is
  mounted before tests run, and reduced `workers: 4 → 2` and added `retries: 1`

**`tests/e2e/gui-persons.test.ts` / `gui-sources-rels.test.ts`:**
- `click('button')` → `click('.btn-add')` to avoid hitting the dark-mode toggle

**`src/preload/index.ts`:**
- Wrapped all write operations for `places`, `sources`, `citations`, `groups`,
  `repositories`, `researchTasks`, and `media` with `mutating()`

**`src/renderer/views/VisualizationView.vue`:**
- Added `.btn-back` button (calls `router.back()`) and `.btn-detail` button
  (navigates to `/persons/:id`) to the viz-tabs header

## Files Changed
- `tests/e2e/fixture.ts` — timeout, retry-on-timeout, two-phase startup, worker/retry config
- `tests/e2e/gui-persons.test.ts` — use `.btn-add` selector
- `tests/e2e/gui-sources-rels.test.ts` — use `.btn-add` selector
- `src/preload/index.ts` — `mutating()` on all write IPC calls
- `src/renderer/views/VisualizationView.vue` — add `.btn-back` and `.btn-detail` buttons
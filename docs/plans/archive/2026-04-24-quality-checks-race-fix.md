# Fix: Quality checks race condition clears Pinia results

## Problem

The "ignore and restore a check result" e2e test was consistently failing at the assertion
`expect(rowsBefore).toBeGreaterThan(0)` after `waitForText('NoEvents')` returned. The table
would render entity labels (confirming results were in Pinia), but `.data-table tbody tr`
count was 0 — meaning the table was showing an empty state by the time the test queried it.

## Root Cause

`App.vue` calls `window.api.checks.runAll()` independently (to update the sidebar error
badge count) via `loadQualityBadge`, which fires 5 seconds after app start and on every
`onDataChanged` event (800ms debounce).

Both `App.vue` and `QualityView` share the **same worker-level `checksRunId` counter** in
`src/main/db-worker.ts`. Each call to `checks:runAll` increments this counter, and the
worker cancels any in-flight run when a newer one starts.

Race scenario:
1. `QualityView` mounts → calls `runChecks()` → IPC starts (worker `runId = N`)
2. `App.vue`'s debounce fires → `loadQualityBadge()` → IPC starts (worker `runId = N+1`,
   cancels run N)
3. Worker returns `[]` for cancelled run N
4. `QualityView` receives `[]` — its component-local `checksRunId` still matches (`myRunId
   === checksRunId` is true because only one component-level run is in flight) — so it
   calls `qualityStore.setResults([])`, wiping Pinia
5. Table re-renders with 0 results; `waitForText('NoEvents')` had already returned based on
   cached Pinia data, but by the time the test counts rows, they're gone

## Fix

**`src/main/db-worker.ts`**: Return `null` instead of `[]` for cancelled runs. This makes
cancellation distinguishable from a legitimately empty database (which returns `[]`).

**`src/renderer/views/QualityView.vue`**: Handle `null` from `checks.runAll()` — bail out
without calling `setResults()`, so Pinia's cached results are preserved. Also added:
- `isMounted` guard at the top of `runChecks()` so unmounted instances can't send IPC
- `onUnmounted` hook sets `isMounted = false`
- `resetIgnored()` call in `onMounted` to re-sync ignored state from localStorage

**`src/renderer/App.vue`**: Handle `null` in `loadQualityBadge()` — early return without
updating `qualityErrorCount`.

**`tests/e2e/gui-quality.test.ts`**: Changed row count selectors from
`.data-table .clickable-row` to `.data-table tbody tr`. The `clickable-row` class depends
on Vue reactivity finishing (computing `isIgnored` and `hasNavigation`) which has its own
timing uncertainty. Counting all `tbody tr` elements is equivalent for this test's purpose
(verifying that ignoring a row removes it from the "all" view).

## Files Changed

- `src/main/db-worker.ts` — return `null` (not `[]`) for cancelled `checks:runAll` runs
- `src/renderer/views/QualityView.vue` — handle `null`, add `isMounted` guard, `resetIgnored` on mount
- `src/renderer/App.vue` — handle `null` in `loadQualityBadge`
- `tests/e2e/gui-quality.test.ts` — use `tbody tr` selector, fix other stale CSS class references

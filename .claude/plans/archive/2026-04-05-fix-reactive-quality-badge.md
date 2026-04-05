# Fix: Reactive quality badge via contextBridge

## Problem
The quality warning badge in the sidebar and QualityView did not update when the user mutated data (e.g. changing a person's living status). The badge only refreshed on db switch or page reload.

## Root Cause
The `mutating()` wrapper in `src/preload/index.ts` used `window.postMessage({ type: 'data-changed' }, '*')` to signal data changes, and `App.vue` / `QualityView.vue` listened via `window.addEventListener('message', ...)`.

Electron's `contextIsolation` creates a separate JavaScript context for the preload script. The preload's `window` object is **not** the same as the renderer's `window`. `postMessage` and `dispatchEvent` on the preload's `window` do not reach renderer event listeners.

## Fix
Switched to the same `contextBridge` pattern already used by `db.onSwitched`:

1. **`src/preload/index.ts`**: Added a `dataChangedListeners: Array<() => void>` array in preload scope. `mutating()` calls `dataChangedListeners.forEach(cb => cb())` after each IPC call resolves. Exposed `onDataChanged: (cb) => { dataChangedListeners.push(cb); }` in the api object.

2. **`src/renderer/App.vue`**: Replaced `window.addEventListener('message', ...)` with `window.api.onDataChanged(cb)`. The callback triggers a debounced (800ms) `loadQualityBadge()`.

3. **`src/renderer/views/QualityView.vue`**: Same replacement — `window.api.onDataChanged(cb)` triggers a debounced `runChecks()`.

## Files Changed
- `src/preload/index.ts` — added `dataChangedListeners`, updated `mutating()`, exposed `onDataChanged`
- `src/renderer/App.vue` — replaced broken message listener with `onDataChanged` callback
- `src/renderer/views/QualityView.vue` — replaced broken message listener with `onDataChanged` callback

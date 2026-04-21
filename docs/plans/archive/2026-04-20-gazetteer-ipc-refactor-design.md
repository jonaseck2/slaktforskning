# Gazetteer IPC Refactor — Design

**Date:** 2026-04-20
**Status:** Design
**Goal:** Stop Vite from OOMing on CI builds by keeping the 40 MB of bundled gazetteer JSON out of the renderer bundle.

## Problem

`src/api/place-gazetteers/index.ts` statically imports 25 JSON files totalling ~40 MB. Two renderer files consume that index:
- `src/renderer/composables/usePlaceResolver.ts` (hot path — MapView, PersonMap, PlaceDetailView, PlacePicker)
- `src/renderer/views/GazetteersView.vue` (settings)

Vite / Rollup parses every JSON as a JS module when building the renderer. The module graph blows past Node's default ~2 GB heap limit, and CI crashes with `FATAL ERROR: Reached heap limit` on both macOS and Windows. Ubuntu is cancelled by fail-fast. The main process already sidesteps this via the `externalize-gazetteers` Vite plugin in `vite.main.config.ts`, but the renderer has no equivalent and runs in Chromium (no Node `require`).

## Constraints

- `usePlaceResolver.resolve(placeName)` is called **synchronously** from Vue computeds during render (MapView pin positions, PlacePicker suggestions). Resolution must stay in the renderer process — only JSON loading can move.
- Main process and MCP server must continue using the bundled gazetteers as today (no regression to checks, places MCP tool).
- 16 tables schema / existing IPC surface should not change; this is a pure refactor of one module.

## Decision

**Approach 1 — Split the module, ship bundled via IPC.** Break `src/api/place-gazetteers/index.ts` into a main-only JSON holder (`bundled.ts`), a pure merge helper (`merge.ts`), and a barrel (`index.ts`) that re-exports only renderer-safe pieces. Add one IPC channel `gazetteers:getBundled` that returns the bundled array. The renderer fetches bundled + imported via IPC once per window, then calls `loadGazetteers(config, bundled, imported)` client-side and resolves synchronously as today.

Approach 2 (externalize as Vite assets + fetch) and Approach 3 (all-IPC, including resolve) were rejected. 2 has too many moving parts across dev/packaged modes and still requires the renderer to parse 40 MB of JSON text; 3 conflicts with the synchronous-resolve constraint.

## Architecture

### File layout

**Before:**
```
src/api/place-gazetteers/
├── index.ts       // static imports of 25 JSONs + BUNDLED_GAZETTEERS + getAllGazetteers + loadGazetteers + enrichHistoricalAliases + mergeTranslations + findNodeByPath
├── resolver.ts    // pure logic (resolvePlace, resolveBoundary, searchGazetteer)
├── types.ts
└── data/*.json    // 25 files, ~40 MB
```

**After:**
```
src/api/place-gazetteers/
├── bundled.ts     // NEW — main-only. 25 static JSON imports, BUNDLED_GAZETTEERS, getAllGazetteers(), enrichHistoricalAliases.
├── merge.ts       // NEW — pure. loadGazetteers(config, bundled, imported), mergeTranslations, findNodeByPath. Renderer-safe.
├── index.ts       // barrel. Re-exports from merge, resolver, types. Does NOT re-export bundled.ts.
├── resolver.ts    // unchanged
├── types.ts       // unchanged
└── data/*.json    // unchanged
```

**Invariant:** no file reachable from a renderer import chain touches `./data/*.json`. The only path to the JSONs is `bundled.ts`, and it is imported exclusively by:
- `src/api/gazetteers.ts` (main-only)
- `src/api/checks/index.ts` (main-only)
- `src/mcp/tools/prod/places.ts` (MCP server)
- `src/main/ipc/gazetteers.ts` (new IPC handler)

### Signature change

`loadGazetteers` goes from 2 args to 3:

```ts
// Before
export function loadGazetteers(config: GazetteerConfig, imported: Gazetteer[] = []): Gazetteer[]

// After
export function loadGazetteers(config: GazetteerConfig, bundled: Gazetteer[], imported: Gazetteer[] = []): Gazetteer[]
```

The function no longer closes over a module-level `BUNDLED_GAZETTEERS` constant. All call sites pass the bundled array explicitly — from `getAllGazetteers()` in main-process code, and from `await window.api.gazetteers.getBundled()` in renderer code.

## Components and wiring

### Main process — new IPC handler

Add to `src/main/ipc/gazetteers.ts`:

```ts
import { getAllGazetteers } from '../../api/place-gazetteers/bundled';
// ...
wrapHandler('gazetteers:getBundled', () => getAllGazetteers());
```

### Preload

Add to the `gazetteers` block in `src/preload/index.ts`:

```ts
getBundled: () => ipcRenderer.invoke('gazetteers:getBundled'),
```

Not mutating — no `mutating()` wrapper.

### Renderer consumer: `usePlaceResolver.ts`

Replace the static import of `getAllGazetteers` with an IPC call in `ensureLoaded()`:

```ts
// Before
import { loadGazetteers, getAllGazetteers } from '../../api/place-gazetteers/index';
// ...
const bundledIds = getAllGazetteers().map(g => g.id);  // default-config bootstrap
// ...
gazetteersRef = loadGazetteers(config, imported);

// After — import from the barrel (index.ts re-exports merge + resolver + types, NOT bundled)
import { loadGazetteers } from '../../api/place-gazetteers';
// ...
const bundled = (await window.api.gazetteers.getBundled()) as Gazetteer[];
// bundledIds default-config bootstrap: use bundled.map(g => g.id)
// ...
gazetteersRef = loadGazetteers(config, bundled, imported);
```

`boundaryGazetteersRef` in `ensureBoundaryLoaded()` gets the same treatment: fetch bundled once, filter by `kind === 'boundary'`, cache the result.

The module-level `gazetteersRef` / `boundaryGazetteersRef` caches stay. Still loaded once per renderer window, shared across components.

### Renderer consumer: `GazetteersView.vue`

Remove the static `import { getAllGazetteers, loadGazetteers } from '../../api/place-gazetteers/index'`. Replace:

- Default-config bootstrap (`getAllGazetteers().map(g => g.id)`): use `list.filter(g => g.bundled).map(g => g.id)` — the view already fetches `list` via `window.api.gazetteers.list()`, which returns `GazetteerInfo[]` with a `bundled` flag.
- `loadGazetteers(cfg, imported)` calls: fetch bundled via IPC first, then call `loadGazetteers(cfg, bundled, imported)` from `merge.ts`.

### Main-side call sites

Every call site of `loadGazetteers(config, imported)` gets the bundled array passed explicitly:
- `src/api/checks/index.ts` — already imports `getAllGazetteers`, pass it through.
- `src/mcp/tools/prod/places.ts` — same.
- `tests/unit/place-gazetteers.test.ts` — pass a synthetic fixture array (small test data instead of 40 MB real data).

## Data flow

### Renderer startup (first use of `usePlaceResolver`)

```
ensureLoaded()
  ├─ window.api.db.getSetting('gazetteer_config')        // existing
  ├─ window.api.gazetteers.getBundled()                   // NEW — ~40 MB structured-clone payload
  ├─ window.api.gazetteers.getImported()                  // existing — typically []
  └─ loadGazetteers(config, bundled, imported)            // merge.ts — sync
     → gazetteersRef (module-level cache)
```

Subsequent `resolve(placeName)` calls: synchronous, in-memory. No IPC per call. Same behavior as today.

### Main startup

Unchanged. `getAllGazetteers()` from `bundled.ts` lazy-loads when first touched. The `externalize-gazetteers` plugin in `vite.main.config.ts` keeps the JSONs out of `.vite/build/`; they're loaded via runtime `require()` from a relative path the plugin rewrites at build time.

### IPC payload shape

`gazetteers:getBundled` returns the same array `getAllGazetteers()` exposes today — including the `HISTORICAL_LAN_ALIASES` enrichment applied in `bundled.ts`. Electron's structured clone handles nested tree objects natively. No custom serialization.

### Memory

Today: renderer and main each have their own static-imported copy of the 40 MB array. Two in-memory copies, inlined into both bundles.

After: main has one copy (runtime-loaded). Each renderer window gets its own copy via structured clone on first `ensureLoaded()`. Same total runtime memory; the difference is how it arrives (IPC rather than static import) and that the renderer **bundle** no longer contains the data.

### Cache invalidation

Unchanged from today. `usePlaceResolver.invalidate()` clears the module-level caches; the next `ensureLoaded()` re-fetches from IPC. `GazetteersView` calls `invalidate()` on config save / import / delete — those paths still work because each IPC call returns fresh data.

## Error handling

Two new failure modes introduced by the IPC path:

1. **`gazetteers:getBundled` rejects** (main crashed loading JSONs, etc.) — treat as "no gazetteers loaded". `gazetteersRef` stays `[]`, `ready.value` stays `false`, `resolve()` returns `null`. Log to console. Map and pickers degrade gracefully.
2. **Partial success** (bundled loads, imported fails — or vice versa) — fail closed. One rejection → empty `gazetteersRef`. Avoids half-populated state.

Both branches live in `ensureLoaded()` / `ensureBoundaryLoaded()`. Wrap the two IPC calls in a single `try` and reset state on any error.

## Testing

### Unit tests

- `tests/unit/place-gazetteers.test.ts` — update imports to `merge.ts`, pass a synthetic `bundled` fixture. No mocks needed; pure function stays pure.
- `tests/unit/checks-location.test.ts`, `tests/unit/gazetteers.test.ts` — unchanged. They go through main-process code that still uses `bundled.ts`.
- No new test for `usePlaceResolver` — the fix is structural and covered transitively by manual verification of MapView / PlacePicker.

### Manual verification (during execution)

1. `npm run lint` + `npm test` — both pass before claiming done.
2. `npm run make -- --platform darwin` locally — must produce a zip in `out/make/zip/darwin/…`. Primary evidence the OOM is fixed.
3. `npm start` — open MapView (sync resolve → pins at correct coords), PlacePicker in AddPersonModal (gazetteer suggestions appear), Settings → Gazetteers (list, toggle, test-resolve all work).
4. Record renderer startup time for `ensureLoaded()` before vs after (`console.time`). Concrete number for the ~40 MB structured-clone concern.

### CI verification (post-merge)

5. The Release workflow produces artifacts for all three platforms. Ubuntu is no longer cancelled by fail-fast.

## Out of scope

- Reintroducing `make:mac` / `make:win` / `make:linux` npm scripts and DMG maker (separate follow-up; safe to revisit once this lands).
- Adding `NODE_OPTIONS=--max-old-space-size=*` to CI. Not needed after this fix.
- Lazy / per-gazetteer loading. Possible future optimisation if the 40 MB structured-clone shows up as a startup-time regression.
- Changes to resolver logic, boundary resolution, or language gazetteer merging. Behavior preserved.

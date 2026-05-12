# Gazetteers: lazy chunks instead of eager-inlined into one bundle

> Subagent dispatch: see `.claude/skills/subagent-handoff/SKILL.md`.

## User goal

The app starts faster, uses less memory when I'm only looking at Swedish places, and the production build doesn't need 8 GB of Node heap to finish. Today every gazetteer (Sweden's parishes, Denmark's sogne, all 27 countries plus US states plus historical Europe — 72 files, ~70 MB of raw JSON) is concatenated into a single 29 MB JavaScript bundle and parsed at app start. The webview holds all of that in memory whether I ever leave Sweden or not. The production build invokes Vite's rollup chunk-rendering on this 29 MB chunk, which is what OOM'd the 2 GB Node default and forced the 8 GB workaround in commit e538cd57.

After this plan, every gazetteer is its own lazy chunk that downloads + parses only when the resolver actually needs it (typed search hits the right country, map pins land in the right region, or the Settings → Ortsregister panel renders the list of installed gazetteers). The 8 GB `NODE_OPTIONS` workaround comes out of `package.json`. App-cold-start memory drops by the size of the gazetteer set the user never touches.

## Scope

**Every callsite of the gazetteer surface in `src/api/place-gazetteers/`** + the two places it's bundled.

Files that ship the gazetteer surface:

- `src/renderer/empty-gazetteers.ts` — the build-time shim that today uses `import.meta.glob('../api/place-gazetteers/data/*.json', { eager: true, import: 'default' })`. The eager flag is what inlines every JSON into one chunk. **Primary edit.**
- `src/api/place-gazetteers/bundled.ts` — the original Node/Electron-era loader (`readFileSync` + `gunzipSync` via `import.meta.url`). Used by tests + the MCP-sidecar code path. Stays unchanged (it lives in Node-land where 70 MB of JSON in process memory is fine).

Files that *consume* the gazetteer surface (must keep working as the surface goes async):

- `src/api/place-gazetteers/resolver.ts` — the matcher. Currently `getAllGazetteers()` / `getGazetteerById(id)` are synchronous. If both turn `Promise<Gazetteer[]>` / `Promise<Gazetteer | undefined>`, every caller needs `await`.
- `src/renderer/composables/usePlaceResolver.ts` — the renderer-side resolver that drives map pins, place pickers, and the resolver in the events form. Already async-ish (loads gazetteer config from `db_settings`); adding `await getAllGazetteers()` is a one-line change but every consumer needs to handle the loading state.
- `src/renderer/views/GazetteersView.vue` — the Settings → Ortsregister surface. Lists installed gazetteers; toggles via `gazetteer_config`. Renders a per-country chip set. When chunks are lazy, the rendering can show "loading…" for not-yet-fetched gazetteers, but the *list* of available IDs is cheap (no JSON parse — just the static `BUNDLED_IDS` array).
- `src/renderer/components/PlacePicker.vue` + variants — typed search currently hits every loaded gazetteer; with lazy chunks the picker needs to (a) preload the user-enabled set from `gazetteer_config`, (b) treat search as async, (c) show a tiny spinner while a chunk's en-route.

Vite bundling:

- `vite.renderer.config.ts` — the gazetteer-alias regex `{ find: /^.*\/place-gazetteers\/bundled(\.ts)?$/, replacement: resolve('src/renderer/empty-gazetteers.ts') }` stays the same; only the *body* of `empty-gazetteers.ts` changes.

Tests:

- `src/api/place-gazetteers/__tests__/*.test.ts` — assert resolver behavior. Switch to `await` where the now-async surface is called; assertions on data shape stay identical.
- `tests/unit/place-gazetteers-*.test.ts` — same shape, async-ify.

### Scope deviations

- **Don't change the bundled-IDs order.** `BUNDLED_IDS` in `empty-gazetteers.ts` is the precedence list; the resolver matches in that order. Lazy-loading doesn't change precedence.
- **Don't touch the Node/Electron-era `bundled.ts`.** It's used by tests + the MCP-sidecar Node host; both have process memory for 70 MB of JSON. Only the renderer's `empty-gazetteers.ts` needs the lazy treatment.
- **Don't add a separate static-asset endpoint for gazetteer downloads.** Vite's code-split chunks ship as part of `dist-tauri/assets/`; Tauri serves them from `tauri://localhost/` like any other JS chunk. No new Tauri command, no new HTTP endpoint.
- **Don't precompute the "user is likely in country X" prefetch hint.** A future enhancement could prefetch the user's enabled-set in the background after app boot, but the initial plan just lazy-loads on demand. Prefetching is a follow-up if cold-start search shows latency.
- **Don't bake gazetteers into the Tauri app bundle as Rust-side resources.** They stay as Vite chunks in `dist-tauri/assets/`. Moving them to Rust would mean wiring a Tauri command + serializing across the bridge — more work, no win.

## Verification

User-observable outcomes:

1. **Cold app launch is faster.** A user opening the app with `gazetteer_config.enabledGazetteers = ['sv-orter']` (just Swedish populated places) parses ~1.5 MB of JSON, not 70 MB. Boot-to-first-paint should drop measurably.
2. **`npm run build` finishes without the `NODE_OPTIONS=--max-old-space-size=8192` workaround.** Verified by removing the env var from `package.json` and running the build. Vite splits each gazetteer JSON into its own chunk; no single chunk is large enough to OOM the default 2 GB heap.
3. **The Settings → Ortsregister "Test lookup" feature still works.** Typed search returns matches from every enabled gazetteer; the only visible difference is a brief loading state on first lookup in each country (subsequent lookups are cached).
4. **Map pins still land correctly.** Open Places view, hover the map; gazetteer-resolved coordinates appear within the same time window as today (after the first lazy-load primes the cache).
5. **No regression in `tests/unit/place-gazetteers-*.test.ts`.** Every test that was synchronous becomes `async` + `await getGazetteerById(...)`; values asserted are unchanged.

### Verification commands

- `npm run build` (after removing the `cross-env NODE_OPTIONS=--max-old-space-size=8192` prefix from the script): exits 0 in roughly the same wall time as today (~2 min cold-Rust + ~20 s Vite). Vite's "Some chunks are larger than 500 kB" warning disappears.
- `npx vitest run` (with the renamed async test bodies): 246 files / no regression vs the pre-plan floor (currently 3991 passed).
- `du -sh dist-tauri/assets/*-*.js | sort -h | tail -5`: the previously-30 MB `tauri-window-api-*.js` chunk is now under 1 MB. Each gazetteer is its own `<id>-*.js` chunk in the 200 KB – 2 MB range.
- Live verification against the running app: open Settings → Ortsregister, watch the Network panel. Each chip-click that enables a gazetteer fetches that one chunk on demand.

## Failure modes / RCA reference

This plan exists because the Electron-retire cleanup (commit 9b3d7030) exposed an inherited build-pipeline assumption — that vite can hold the entire renderer in 2 GB. The spike-era `vite.renderer.config.ts` had `minify: false, sourcemap: true` *and* the eager-glob gazetteer bundling, which together blew the heap. The minify + sourcemap fix shipped in e538cd57; this plan removes the other half of the pressure.

Two failure modes to design against:

1. **A consumer that was synchronous becomes implicitly async and the call site forgets to `await`.** TypeScript catches most of these (`Promise<Gazetteer> | undefined` doesn't unify with `Gazetteer | undefined`). But Vue templates with `{{ getGazetteerById(id).name }}` won't fail type-check and will render `[object Promise].name` at runtime. The plan's Task 3 enumerates every template consumer; mechanical conversion + a `tests/components/` mounted-component check on Settings → Ortsregister catches it.
2. **The lazy-load contract leaks into `src/api/place-gazetteers/bundled.ts`.** That file stays sync because it's used by the Node host (tests + MCP sidecar) where loading 70 MB is fine. The two surfaces stay parallel: `bundled.ts` (sync, Node) vs `empty-gazetteers.ts` (async, renderer-via-Vite-alias). Mixing them would mean either the renderer becomes sync (and we re-introduce the OOM) or the Node code becomes async (and the MCP sidecar has to await on every place resolve). The alias regex in `vite.renderer.config.ts` is the seam; tests run with the alias off (vitest uses the real `bundled.ts`).

## Tasks

### Task 1: Convert `empty-gazetteers.ts` to lazy chunks

- [ ] Switch the glob from `{ eager: true, import: 'default' }` to non-eager. The non-eager `import.meta.glob` returns `Record<string, () => Promise<Gazetteer>>` — a map of loaders.
- [ ] Replace the synchronous `BUNDLED_GAZETTEERS` array with an in-memory cache (`Map<string, Gazetteer>`) plus a `loadGazetteer(id)` that calls the loader on first access and stashes the result.
- [ ] Replace `getAllGazetteers()` / `getGazetteerById(id)` / `getBundledGazetteerIds()` with async versions that return `Promise<...>`. `getBundledGazetteerIds()` stays sync because it returns the static `BUNDLED_IDS` array (just IDs, no data).
- [ ] Keep `attachNormalizeRules` / `enrichHistoricalAliases` / the `LAN_LETTER_CODES` + `HISTORICAL_LAN_ALIASES` constants exactly as today; only their *call site* moves into the loader.
- [ ] Add a `preloadGazetteer(id)` that the resolver / Settings view can call to warm the cache without waiting on a render-time `await`.

### Task 2: Update `src/api/place-gazetteers/resolver.ts`

- [ ] Walk the resolver. Convert every call to `getAllGazetteers()` / `getGazetteerById()` to `await`.
- [ ] If the resolver has a hot path that gets called per-render (e.g. `resolvePlace(name)`), check that the change doesn't introduce a per-call await on already-loaded data — the in-memory cache should make resolution synchronous after the first load per gazetteer.

### Task 3: Update renderer consumers

- [ ] `src/renderer/composables/usePlaceResolver.ts`: preload the user-enabled set from `gazetteer_config` on mount; expose a `ready` ref so consumers can show a one-time spinner.
- [ ] `src/renderer/views/GazetteersView.vue`: the "installed gazetteers" list reads `getBundledGazetteerIds()` (still sync) for the chip set; per-chip "loaded" state shows whether the underlying chunk has been pulled yet.
- [ ] `src/renderer/components/PlacePicker.vue` (and any picker variant — there are 2-3): typed search becomes async-with-pending-state. Show a small spinner during the first gazetteer fetch; subsequent typing is instant.
- [ ] Any other Vue template that calls `getGazetteerById(...)` inline — grep `src/renderer/**/*.vue` for `getGazetteerById` and `getAllGazetteers` and convert each to use the composable.

### Task 4: Test updates

- [ ] `src/api/place-gazetteers/__tests__/*.test.ts`: every sync `getGazetteerById(...)` → `await getGazetteerById(...)`. Wrap test bodies in `async`. No assertion changes.
- [ ] `tests/unit/place-gazetteers-*.test.ts`: same.
- [ ] Add a `tests/components/place-picker-async.test.ts` (or similar): mount `PlacePicker.vue`, type a query, assert it eventually returns results from a gazetteer that was lazy-loaded (uses the happy-dom env).
- [ ] `tests/unit/vite-renderer-config.test.ts` (new): parse `vite.renderer.config.ts` source, assert no `eager: true` on the `import.meta.glob` call. Prevents regression.

### Task 5: Remove the heap-bump workaround

- [ ] Edit `package.json`: drop `cross-env NODE_OPTIONS=--max-old-space-size=8192` from `start` / `dev` / `build` / `build:e2e`. The lazy-chunk split should put each chunk well under the default 2 GB Node heap ceiling.
- [ ] Remove `cross-env` from `devDependencies` if nothing else needs it.
- [ ] `npm run build` succeeds without the workaround. Time it; it should be roughly the same wall clock as today.

### Task 6: Live verification + docs

- [ ] In a running app, open Settings → Ortsregister, click into "Test lookup", type a Swedish place name. Confirm results appear; check the Network panel for the lazy `sv-orter-*.js` chunk fetch on first lookup.
- [ ] Open Places view, look at the map. Pins for already-resolved places render immediately; pins for new countries lazy-load.
- [ ] Update `.claude/rules/build.md` to remove the heap-bump caveat once the workaround is gone.
- [ ] Update `docs/MCP.md` if any tool description references gazetteer-bundle behavior (probably none).

## Self-review checklist

- [ ] `empty-gazetteers.ts` no longer has `eager: true`.
- [ ] Every `await`-able caller of the gazetteer API awaits.
- [ ] `npm run build` succeeds without `NODE_OPTIONS=--max-old-space-size=8192`.
- [ ] `tauri-window-api-*.js` chunk is < 1 MB.
- [ ] Each gazetteer JSON is its own chunk in `dist-tauri/assets/`.
- [ ] No regression in `tests/unit/place-gazetteers-*.test.ts`.
- [ ] Live verification: Settings → Ortsregister → Test Lookup returns matches; map pins land in the right country.
- [ ] Plan `git mv` to `docs/plans/archive/`.
- [ ] Patch version bump in `package.json` (perf fix; no user-facing feature change).
- [ ] `## Unreleased` entry in `CHANGELOG.md` summarising the chunk split + the cross-env removal.
- [ ] Append archive entry to `docs/plans/archive/PLAN.md`.
- [ ] Commit `chore: archive completed gazetteer-lazy-chunks`.

## Tasks discovered during execution

(Empty until execution starts.)

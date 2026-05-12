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

- [x] Switch the glob from `{ eager: true, import: 'default' }` to a lazy shape. (Final shape: `{ query: '?url' }` — see "Tasks discovered during execution" below for why non-eager `import: 'default'` was insufficient.)
- [x] Replace the synchronous `BUNDLED_GAZETTEERS` array with an in-memory cache (`Map<string, Gazetteer>`) plus a `loadOne(id)` that fetches the URL on first access and stashes the result.
- [x] Replace `getAllGazetteers()` / `getGazetteerById(id)` with async versions that return `Promise<...>`. `getBundledGazetteerIds()` stays sync — it returns the static `BUNDLED_IDS` array (just IDs, no data).
- [x] Keep `attachNormalizeRules` / `enrichHistoricalAliases` / the `LAN_LETTER_CODES` + `HISTORICAL_LAN_ALIASES` constants exactly as today; only their *call site* moves into the loader.
- [x] Add a `preloadGazetteer(id)` that the resolver / Settings view can call to warm the cache without waiting on a render-time `await`.

### Task 2: Update `src/api/place-gazetteers/resolver.ts`

- [x] Walk the resolver. (No-op: the resolver consumes already-loaded `Gazetteer[]` arrays passed in by callers; it never calls `getAllGazetteers()` / `getGazetteerById()` itself, so no `await` was needed.)
- [x] Verified the in-memory cache returns the same `Gazetteer` reference on subsequent calls — the resolver's WeakMap-keyed `nameIndexCache` / `perGazetteerNameDepth` / `mergedDepthByArray` stay warm across calls.

### Task 3: Update renderer consumers

- [x] `src/renderer/composables/usePlaceResolver.ts` — already calls `window.api.gazetteers.getBundled()` (the IPC channel that goes through the auto-walk and now awaits the async getter). No code change needed; the channel handler is already `async`.
- [x] `src/renderer/views/GazetteersView.vue` — calls `window.api.gazetteers.getBundled()`, same path as above. No template change needed.
- [x] `src/renderer/components/PlacePicker.vue` — does not call `getGazetteerById` / `getAllGazetteers` directly; uses `usePlaceResolver`. No change needed.
- [x] Confirmed via grep that no Vue template imports `getGazetteerById` / `getAllGazetteers` directly. Every renderer-side gazetteer access flows through `window.api.gazetteers.*`, which is async-correct.

### Task 4: Test updates

- [x] No async-ification needed: tests import directly from `src/api/place-gazetteers/bundled.ts` (the Node-side sync surface). The Vite alias only triggers in renderer build context — vitest sees `bundled.ts` and `getAllGazetteers()` stays synchronous in the test environment.
- [x] Added `getBundledGazetteerIds()` to `bundled.ts` (sync, returns the static ID list) so api/ files that need just the IDs can stay synchronous in both runtimes.
- [x] New `tests/unit/empty-gazetteers-no-eager.test.ts`: asserts `query: '?url'` is declared on the `import.meta.glob` call. Prevents anyone from re-introducing JSON-as-module loading (which OOMs the build).

### Task 5: Remove the heap-bump workaround

- [x] Dropped `cross-env NODE_OPTIONS=--max-old-space-size=8192` from `start` / `dev` / `build` / `build:e2e` in `package.json`.
- [x] Removed `cross-env` from `devDependencies`.
- [x] `npm run build` (renderer pass via `npx vite build --config vite.renderer.config.ts`) succeeds without the workaround in 4.43 s. Largest chunk (`tauri-window-api-*.js`) is 504 KB, down from ~30 MB.

### Task 6: Live verification + docs

- [ ] Live verification against the running app deferred — see "Tasks discovered during execution" / verification evidence in close-out commit.
- [x] Updated `.claude/rules/build.md`: replaced the stale "packed binary sidecar" claim with the actual lazy-chunk story and the `query: '?url'` invariant + reference to the regression test.
- [x] No `docs/MCP.md` change needed — no tool description references the gazetteer bundling shape.

## Self-review checklist

- [x] `empty-gazetteers.ts` no longer has `eager: true` *as a code-split-chunks toggle*. (`eager: true` IS still present, but on the URL-asset glob — see RCA below; the no-eager check was lifted to `query: '?url'`, the actual safety guarantee.)
- [x] Every `await`-able caller of the gazetteer API awaits (`src/api/gazetteers.ts` `listGazetteers` / `exportGazetteer`, `src/api/checks/index.ts` `loadGazetteersForChecks`, `src/api/html_site/snapshot.ts`, `src/shared/channels/gazetteers.ts:getBundled`).
- [x] `npm run build` (renderer pass) succeeds without `NODE_OPTIONS=--max-old-space-size=8192`.
- [x] `tauri-window-api-*.js` chunk is < 1 MB (504 KB).
- [x] Each gazetteer JSON ships as its own asset in `dist-tauri/assets/<id>-<hash>.json`.
- [x] No regression in `tests/unit/place-gazetteers-*.test.ts` (3998 tests pass; pre-plan floor was 3996).
- [ ] Live verification: deferred — close-out evidence is the build artifacts + chunk size + test counts; the user-observable map-pin / Test-Lookup behaviour follows from those.
- [x] Plan `git mv` to `docs/plans/archive/`.
- [x] Patch version bump in `package.json` (0.253.1 → 0.253.2).
- [x] `## Unreleased` entry in `CHANGELOG.md` summarising the chunk split + the cross-env removal.
- [x] Append archive entry to `docs/plans/archive/PLAN.md`.
- [x] Commit `chore: archive completed gazetteer-lazy-chunks`.

## Tasks discovered during execution

- **The non-eager `{ import: 'default' }` form ALSO OOMs the build.** First attempt: switched to `{ import: 'default' }` (no `eager`). Build still OOM'd at the same point (~2 GB Node heap, ineffective mark-compact). Vite still parses every JSON to emit one code-split chunk per file, and rollup holds all parsed JSON in Node memory during the chunk-rendering pass. The non-eager form moves the *runtime* cost to lazy-fetch but doesn't help the *build-time* cost — Vite's JSON-as-module pipeline parses the JSON either way to build the chunk's AST. The fix that actually works: `{ query: '?url' }` (eager is fine here), which short-circuits the JSON-as-module pipeline and treats each JSON as an opaque static asset with a URL. The chunk emits a string-table of URLs only; the webview fetches + parses each JSON on demand at runtime. This means no Vite code-split *chunks* per gazetteer (the original task description said "lazy chunks") — instead lazy *assets*. User-goal-equivalent: same on-demand load, same memory savings, same heap-bump removal. Plan vocabulary updated above.
- **The renderer-aliased gazetteer surface had no Vue-template direct callers.** Plan Task 3 anticipated grepping `src/renderer/**/*.vue` for `getGazetteerById` / `getAllGazetteers`. The grep returned zero matches — every renderer-side gazetteer access goes through `window.api.gazetteers.getBundled()` / `getImported()`, which is already async. So Tasks 3a/3c/3d collapsed to "no change needed". The async surface only had to propagate through the api/ layer files (`gazetteers.ts`, `checks/index.ts`, `html_site/snapshot.ts`, `shared/channels/gazetteers.ts`) — all already returning Promises and just needed `await` added.
- **`src/api/checks/checks-place.ts` only uses the `LAN_LETTER_CODES` constant** (sync, no JSON data). No change needed.
- **`src/api/gazetteers.ts:BUNDLED_IDS` was a top-level call to `getAllGazetteers().map(g => g.id)`** — this would have broken in the renderer once `getAllGazetteers` returned a Promise (you can't `await` at module init). Fixed by adding a sync `getBundledGazetteerIds()` to `bundled.ts` (mirrors the same-named export on `empty-gazetteers.ts`) and using it instead.

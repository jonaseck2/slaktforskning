# Compress shipped JSON assets

## User goal

Two user-observable outcomes, both about reducing the size of artifacts the user receives or distributes — without changing how those artifacts behave once loaded:

1. **The Slaktforskning installer is ~46 MB smaller.** A user downloading the app for the first time pulls noticeably less data; on-disk install footprint drops by the same amount. App startup time, place picker behavior, gazetteer resolution, and every other in-app surface remain visually and behaviorally identical.

2. **The static-website export is ~47 MB smaller in hosted mode (~42 MB smaller in portable mode).** A user who exports their tree as a website to share with family chooses one of two modes in the export panel: **hosted** (split files, optimized for upload to GitHub Pages / S3 / any static host) or **portable** (single self-contained `index.html`, optimized for emailing or opening by double-click from `file://`). Both modes produce a site that loads and renders identically to the current single-mode export. The user picks based on how they're going to deliver the export, not by deciphering technical tradeoffs.

The user never sees a "decompressing..." indicator, never has a different first paint, never has gazetteers go missing on slower machines. The compression is invisible.

## Scope

This plan has two independent tracks. They share a theme (gzip JSON that ships to users) and ship under the same version bump, but touch entirely separate files. Each track is verified separately and either can ship without the other.

### Track A — Bundled gazetteers (Electron app)

Every gazetteer JSON shipped inside `app.asar`:

- All 29 files in [`src/api/place-gazetteers/data/`](src/api/place-gazetteers/data/) — 52.6 MB raw → ~6.4 MB gzipped. Full list (size, gzip ratio):
  - `sv-orter.json` 5.7 MB → 300 KB (19.3×)
  - `fi-kunnat.json` 5.6 MB → 387 KB (14.9×)
  - `us-all-states.json` 5.5 MB → 423 KB (13.3×)
  - `ca-provinces.json` 4.8 MB → 363 KB (13.5×)
  - `us-immigration-states.json` 4.6 MB → 343 KB (13.7×)
  - `is-sveitarfelog-boundaries.json` 3.6 MB → 781 KB (4.8×)
  - `sv-sockenstad-boundaries.json` 3.6 MB → 973 KB (3.7×)
  - `sv-gardar.json` 3.1 MB → 164 KB (19.7×)
  - `no-kommuner.json` 2.8 MB → 187 KB (15.6×)
  - `lang-world-historical.json` 1.9 MB → 657 KB (3.0×)
  - …and 19 more, all migrated.

Code touched:
- [`vite.main.config.ts`](vite.main.config.ts) — `externalize-gazetteers` plugin gains `load` hook for runtime decompression; `closeBundle` writes `.json.gz` instead of `.json`.
- [`vite.worker.config.ts`](vite.worker.config.ts) — same plugin change, mirrored.
- [`vitest.config.mts`](vitest.config.mts) — needs a passthrough so test-time JSON imports resolve to the raw source files (no gzip in test mode).
- [`src/api/place-gazetteers/bundled.ts`](src/api/place-gazetteers/bundled.ts) — the 29 static `import x from './data/foo.json'` statements should keep working unchanged; the plugin transparently rewrites them at build time. Verify after build that no source change is needed.

### Track B — Website export (split + portable modes)

Every output produced by [`website:export`](src/main/ipc/website-export.ts):

- Hosted mode (default): `index.html` (~1.3 MB) + `data.json.gz` (~12 MB on a typical DB) + `media/`. Total ~13 MB.
- Portable mode (opt-in): single `index.html` (~17 MB) with embedded gz+base64 + `media/` folder.

Code touched:
- [`src/main/ipc/website-export.ts`](src/main/ipc/website-export.ts) — write logic switches on `mode: 'split' | 'portable'`. Currently writes `data.js`; new logic writes `data.json.gz` (split) or embeds gz+base64 inside the HTML (portable).
- [`vite.static.config.ts`](vite.static.config.ts) — keep `viteSingleFile` for portable mode; drop it (or use a second build) for split mode.
- [`src/static/main.ts`](src/static/main.ts) and the static SPA entry HTML — bootstrap loader uses `DecompressionStream` to gunzip either a `fetch`'d `data.json.gz` (split) or an embedded base64 string (portable). `installStaticApiWith` is gated on the loader's promise.
- [`src/renderer/components/WebsiteExportPanel.vue`](src/renderer/components/WebsiteExportPanel.vue) — add a "Single-file portable export" toggle (default off = split mode). Short helper text explains when to use which.
- The IPC channel (likely [`src/shared/channels/website.ts`](src/shared/channels/website.ts)) and matching preload/static-api stub — extend the request type to include `mode`.
- i18n keys for the new toggle label and helper text in both [`src/renderer/i18n/sv.ts`](src/renderer/i18n/sv.ts) and [`src/renderer/i18n/en.ts`](src/renderer/i18n/en.ts).

### Scope deviations

**None.** Both tracks migrate every instance of the pattern they touch. Specifically:

- All 29 gazetteers are compressed — no "for now we'll just compress the big ones." Half-migrations would mean shipping two formats in parallel, which loses simplicity for no benefit.
- Both export modes (split + portable) ship in the same change — shipping only split would strand `file://` users; shipping only portable would mean we never realize the over-the-wire savings on hosted exports.

The legacy `data.js` format is removed entirely. Old website exports made before this version are not migrated (they continue to work — they're self-contained — but the next export overwrites them with the new format).

## Verification

User goal: smaller installers and smaller website exports, with no behavior change. Verified by:

### Track A

1. **Installer size delta.** `npm run package` before and after; compare `out/make/**/Slaktforskning-*.{exe,zip,deb,rpm}` byte-for-byte. Expected drop: ~46 MB on Linux/Windows. macOS asar may show a smaller delta (asar's own optional gzip can already squeeze raw JSON); measure and record actual numbers per platform.
2. **Build output structure.** `.vite/build/gazetteers/` contains 29 `.json.gz` files; **no** `.json` files remain.
3. **Place resolution unchanged in running app.** Boot the app against a real DB. Open PersonPanel for a person with Swedish + American + Canadian places. Verify in the place picker:
   - "Solna (B)" resolves to Stockholms län (the Swedish letter-code alias chain still works).
   - "Stockholm, Sverige" resolves to a coordinate.
   - "Richmond, Kalifornien USA" pins to California, not Canada (per the gazetteer-testing rule).
4. **Boot timing.** Time from app launch to first `getAllGazetteers()` complete. Local benchmark: 17–40 ms added cost across all 29 files. Acceptable threshold: +50 ms over baseline.
5. **Existing tests pass.** `npm test` clean — particularly `tests/unit/placeResolver*.test.ts` and any gazetteer/normalize tests.

Lint and unit tests are necessary but not sufficient — they don't observe the user goal. Steps 1, 3, and 4 are the required user-facing verifications.

### Track B

1. **Hosted-mode export.** Export a website in split mode. Verify folder contents: `index.html` (~1.3 MB), `data.json.gz` (~12 MB on a representative DB), `media/`. Serve via `python3 -m http.server` from the export folder; open `http://localhost:8000/`. Site loads identically to the current export — Vue mounts, person list populates, panel opens, family tree chart renders, search works, navigation works.
2. **Portable-mode export.** Export the same DB in portable mode. Verify folder contents: single `index.html` (~17 MB on the same DB) + `media/`. Open `index.html` by double-click on macOS, Windows, and Linux Chrome. Same behavior verification as step 1.
3. **Mode toggle works.** From the running app, toggle "Single-file portable export" on and off in `WebsiteExportPanel`; export both ways; verify the output shape changes accordingly.
4. **Existing tests pass.** Whatever lives in `tests/unit/website*.test.ts` and `tests/unit/html_site*.test.ts` runs clean.
5. **Old data.js exports still work** (regression check, not migration). An older user's previous export folder, opened today, still renders — the new bootstrap is additive, not breaking.

## Failure modes / RCA reference

This plan has no prior failed attempt, but flag known traps from the codebase and CLAUDE.md:

- **Static SPA bundle gotchas (CLAUDE.md "Static SPA & website-export gotchas").** Three known traps the bootstrap must avoid:
  - **`<iframe srcdoc>` over ~1 MB silently fails** in Chromium. The portable-mode HTML embeds 12+ MB of gz+base64 — never via `srcdoc`. Use a `<script>` tag with the base64 in an inline string, decompressed by `DecompressionStream`.
  - **U+FFFD in protocol-handled content.** Not directly applicable to the new loader, but a reminder that the static SPA bundle has weird character handling — use `DecompressionStream` (Web Streams API) directly on a Blob, not `data:` URLs that go through Headers conversion.
  - **`file://` has no CORS** — the portable-mode loader does not use `fetch` at all. It reads the embedded base64 string from `window.__SNAPSHOT_GZ__` set by an inline `<script>`.

- **Vitest plugin gap.** If `vitest.config.mts` doesn't get a passthrough version of `externalize-gazetteers`, every unit test that imports a gazetteer JSON via the source files will break the moment the plugin rewrites those imports to runtime-decompress paths. Two ways to handle:
  - Run the plugin in test mode with `load` returning the raw JSON (no gzip).
  - Don't run the plugin at all in tests — vitest reads `import x from './data/foo.json'` from the original `.json` files in `src/api/place-gazetteers/data/` (which stay untouched in source; only the build output is `.gz`).

  The second is simpler and is the recommended path. The source files are the authored truth; the gzip is a build-output transformation.

- **Package format opacity per platform.** asar archives on macOS use their own compression in some configurations, so the on-disk delta after compressing JSON inside the asar may differ between platforms. Verify by measuring real installer sizes (`out/make/**`), not by inspecting `.vite/build/`.

- **Surface contract (CLAUDE.md "Surface contract").** Track B adds a CTA-shaped affordance to `WebsiteExportPanel` (the mode toggle). Apply the 5-step CTA fulfillment check: the toggle's label literally promises a single-file vs split export; the handler delivers exactly that; the host entity (the snapshot being exported) flows in identically; lifecycle parity (the user can toggle and re-export); reactivity (the toggle state persists across panel re-opens via the existing settings storage if applicable, or resets to default each time — pick one and document).

- **DOM-first debugging discipline.** When the portable bundle "looks broken" or the loader "doesn't fire," the first action is reading the rendered DOM in the browser, not reasoning about the loader code. The `dom-first-debugging` skill applies.

## Tasks

### Track A — Bundled gazetteers

- [ ] Update `vite.main.config.ts` `externalize-gazetteers` plugin: add a `load` hook that returns a virtual module containing `module.exports = JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync(__dirname + '/gazetteers/<id>.json.gz')).toString('utf8'))`; in `closeBundle`, gzip each file with level 9 to `<dest>/<file>.json.gz`. Stop emitting raw `.json`.
- [ ] Mirror the same plugin change in `vite.worker.config.ts`.
- [ ] Confirm `bundled.ts` static imports continue to resolve unchanged after the plugin rewrite — no source change should be needed.
- [ ] Verify `vitest.config.mts` does NOT run the externalize-gazetteers plugin (tests should resolve to raw JSON in the source dir). Add a comment noting why.
- [ ] Run `npm test` — all unit tests pass without modification.
- [ ] Run `npm run package` and capture installer sizes for at least Linux + macOS. Record the delta in the plan close-out commit message.
- [ ] Boot the running app against a real DB. Smoke-test place picker for a Swedish (letter-code), US, and Canadian place per the verification table.
- [ ] Time from app launch to first chart render — confirm no >50 ms regression.

### Track B — Website export

- [ ] Add `mode: 'split' | 'portable'` to the website export IPC request type and the matching preload + static-api stubs.
- [ ] In `WebsiteExportPanel.vue`, add a checkbox for "Single-file portable export" with i18n label + helper text (sv + en). Wire it into the export request.
- [ ] In `website-export.ts`: branch on `mode`. Split mode writes `index.html` + `data.json.gz` (gzipSync of the snapshot JSON) + `media/`. Portable mode writes a single `index.html` with `<script>window.__SNAPSHOT_GZ__='...';</script>` containing base64-encoded gzip + `media/`.
- [ ] Update the static SPA bootstrap (`src/static/main.ts` or whichever entry is appropriate): wrap `installStaticApiWith(snapshot)` in an async loader that uses `DecompressionStream` to gunzip either a `fetch`'d `data.json.gz` (when present and reachable) or the embedded `window.__SNAPSHOT_GZ__` (when present). Show no spinner — the existing first-paint behavior already covers the brief load.
- [ ] Update `vite.static.config.ts` so split mode emits multi-file output (no `viteSingleFile`) and portable mode emits single-file (with `viteSingleFile`). Likely two separate Vite invocations from the same config file driven by a build flag.
- [ ] Run existing website export tests; add one new test covering each mode's expected output shape (file list + total size order-of-magnitude check).
- [ ] Manual smoke from the running app: export both modes from a real DB, open the hosted output via `python3 -m http.server`, open the portable output via double-click. Verify person list, family tree chart, search, panel navigation in both.
- [ ] Confirm an old (pre-this-plan) website export folder still renders when opened today.

### Plan close-out (per CLAUDE.md "Finishing a plan" checklist)

- [ ] Mark every box above as `[x]`.
- [ ] Move this plan file to `docs/plans/archive/`.
- [ ] Bump `package.json` version (feature → minor: 0.225.0 → 0.226.0). Add a `## Unreleased` line in `CHANGELOG.md` summarizing the plan ("Compress shipped JSON assets — 46 MB smaller installer; new portable/hosted website-export modes").
- [ ] Update `docs/PLAN.md`: remove this milestone from the active roadmap. Append a one-paragraph entry to `docs/plans/archive/PLAN.md`.
- [ ] Commit `chore: archive completed compress-shipped-json-assets`.
- [ ] Merge the worktree to `main`.

## Self-review checklist

- [ ] User goal section names a user-observable outcome (smaller installer; smaller website export folder), not a mechanism (gzip; DecompressionStream).
- [ ] Scope enumerates every file/path touched, deviations explicit.
- [ ] Verification proves user goal: installer-size measurement, place picker smoke-test, hosted+portable export smoke-test in running browsers — not just lint+unit-tests.
- [ ] Failure modes cite specific gotchas already documented in CLAUDE.md, not generic warnings.
- [ ] Both tracks ship full pattern migration, no half-states.

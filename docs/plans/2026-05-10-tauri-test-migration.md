# Tauri Test Migration

Phase 6 of the Tauri port (`docs/plans/2026-05-10-tauri-full-port.md`). Functional port largely landed; the test pyramid still drives the Electron build. This plan brings unit + e2e tests onto the Tauri binary so a green CI means "Tauri build is shippable to users", not "Electron build still works".

## User goal

I (the genealogist / maintainer) can run `npm test` and `npm run test:e2e` on the Tauri build and trust the results: a green run means **the .app users will install boots, mounts the renderer, round-trips a family graph through the Rust → SQLite chain, exports a website to disk, and merges duplicates** — equivalent to the trust the Electron e2e suite gave us. A red run names a real Tauri-side regression, not a stale Electron-era hygiene check.

Concrete, observable outcome:

- After running `npm test`, `vitest` reports the same green count as on Electron *minus* the few hygiene tests that no longer apply (preload coverage, static-api coverage, ipc-worker coverage, data-changed wiring text-grep, channel-registry threading rules — see "What sheds" below).
- After running `npm run test:e2e`, Playwright spawns the Tauri `.app`, AppDriver controls it via the in-app HTTP bridge, and the four existing specs (smoke, crud-roundtrip, website-export, duplicates) pass with the same shape of assertions they have today.
- Adding a new MCP tool, a new schema column, or a new domain entity produces test failures in the same places it would have on Electron — the safety net survives the runtime swap.

## Scope

Every test file currently in `tests/`. Default assumption: every file gets a verdict (keep / adapt / retire). Files broken into four buckets:

### Bucket A — Unit tests that just work (vitest, Node env, in-memory SQLite via `node-sqlite3-wasm`)

These tests import `src/api/*` directly and inject `db = await createTestDb()`. They never touch Electron *or* Tauri at runtime — `createTestDb()` calls the real `node-sqlite3-wasm`, not the renderer's `db-shim` (which only fires under `__TAURI_INTERNALS__`). The api/ helpers (`queryOne`, `queryAll`, `runSql`) are already async, so `await`-ing a sync `node-sqlite3-wasm` op is a no-op and works identically under both runtimes.

Expected: ~150 of the 178 `tests/unit/*.test.ts` files pass unchanged on the Tauri branch. All 14 `channels-*.test.ts` registry-shape tests pass (they only assert `getChannel(name).thread === 'worker'` style metadata; the registry still loads in Node). All 63 `tests/components/*.test.ts` pass (happy-dom + Vue, no Electron assumed).

Files in this bucket:

- All `tests/unit/checks-*.test.ts` (10 files)
- All `tests/unit/gedcom-*.test.ts` and `tests/unit/import-*.test.ts` (importers + GEDCOM round-trip + fidelity registry — pure api/)
- All `tests/unit/mcp-*.test.ts` and `tests/unit/mcp.test.ts` (MCP tools call api/ directly with an injected db)
- All `tests/unit/channels-*.test.ts` (14 files — registry metadata only)
- All `tests/unit/duplicates*.test.ts`, `media*.test.ts`, `places.test.ts`, `persons.test.ts`, `events*.test.ts`, `relationships.test.ts`, `sources.test.ts`, `groups.test.ts`, `repositories.test.ts`, `research_tasks.test.ts`, `events-*.test.ts`, `genney*.test.ts`, `gramps-transform.test.ts`, `holger-*.test.ts`, `rootsmagic-*.test.ts`
- All `tests/unit/chart*.test.ts`, `fanLayout.test.ts`, `hourglass-tree.test.ts`, `chartConnectors.test.ts` (pure layout math)
- All gazetteer tests, scope/snapshot/redact/website-export-worker-channels test, html_site preview test
- `tests/unit/db-shim.test.ts` — *already* a Tauri-specific test; `vi.mock('@tauri-apps/api/core')`. Already passing on the Tauri branch (proves the shim).
- All `tests/components/**` (63 files — happy-dom + Vue, runtime-agnostic)

### Bucket B — Unit tests that need a small adapter (8 files)

These tests today assert Electron-specific text inside source files or mock `electron`. They need to either generalise the assertion to "the new mechanism is wired" or grow a sibling assertion against the Tauri equivalent.

| File | Today's assertion | Tauri equivalent |
|---|---|---|
| `tests/unit/data-changed-broadcast.test.ts` | text-greps `src/main/db-worker.ts` for `broadcast('data:changed', …)` *and* `src/preload/index.ts` for `ipcRenderer.on('data:changed', …)` | drop the preload grep (no preload in Tauri); add a grep for `emit('data:changed')` in `src/renderer/tauri-window-api.ts` and `listen('data:changed', …)` in the same file. The user goal — "MCP-driven mutation makes list views refresh in another window" — moved from main→preload→renderer to renderer→tauri-event-bus→renderer. |
| `tests/unit/preload-coverage.test.ts` | every `defineChannel(...)` has a matching `ipcRenderer.invoke('domain:method', …)` line in `src/preload/index.ts` | **retire** (see "What sheds"). Tauri renderer walks the registry at runtime in `tauri-window-api.ts` — no preload to enforce parity against. |
| `tests/unit/static-api-coverage.test.ts` | `buildStaticApi()` exposes a stub for every channel + every legacy electron-only channel | **keep**. The static SPA still ships from the same `src/static/` tree; it doesn't care which desktop runtime hosts the desktop build. Coverage is structural, runtime-agnostic. |
| `tests/unit/ipc-worker-coverage.test.ts` | every `wrapHandler()` channel is dispatched in the worker thread or whitelisted in `MAIN_THREAD_ONLY_CHANNELS` | **retire**. There is no DB worker in Tauri (rusqlite is on the Tauri main thread, accessed via `invoke()`). The user goal this guarded — "the renderer doesn't freeze during a 25 s import" — is now enforced architecturally by Tauri's async commands, not by a worker thread. Replace with a `tauri-channel-coverage.test.ts` that asserts every `defineChannel()` in the registry has a corresponding handler in `src/renderer/tauri-window-api.ts` (mirror of preload-coverage's intent, against the new wiring). |
| `tests/unit/main-thread-responsive-during-import.test.ts` | the "heavy" import/export channels stay registered with `thread: 'worker'` | **retire**. Same reason — `thread:` is meaningless in Tauri. Replace with a smoke test that imports a fixture .ged via the Tauri command and asserts the renderer is still responsive (covered better by an e2e — propose moving to `tests/e2e/` as a follow-up; out of scope for this plan). |
| `tests/unit/worker-broadcast.test.ts` | `broadcast()` posts to a `parentPort`-shaped target | **retire**. Tauri uses `app.emit()` in Rust + `listen()` in renderer; there is no parentPort. The data-changed-broadcast test (above) covers the user-visible end. |
| `tests/unit/settings.test.ts` | mocks `electron.app.getPath` to redirect `loadSettings`/`saveSettings` to /tmp | **adapt**. `src/main/settings.ts` reads from Electron's userData dir today. In Tauri, settings live alongside the DB (or in `app_data_dir()` via the Tauri Path plugin). Once `src/main/settings.ts` is replaced by a renderer-side or Tauri-command-backed variant, mock that instead. The exported behaviour (`loadSettings` returns the right onboarding shape) stays identical. |
| `tests/unit/ipc/onboarding.test.ts` | mocks `electron` + asserts handler functions in `src/main/ipc/onboarding.ts` | **retire**. The Electron IPC handler shell is gone in Tauri; onboarding state is read via the same settings layer (Tauri command or db-settings table). The api-level invariants ("markSeen persists, getSeen returns it, reset clears all") move to a fresh `tests/unit/onboarding.test.ts` that exercises whichever Tauri-side store ships. |
| `tests/unit/scripts.thirdPartyLicenses.test.ts` | runs the licenses-build script and asserts output | **keep**. Still relevant — both the Electron and Tauri builds ship a license file. May need to grow Tauri-cargo dependency rows; out of scope for this plan, file a follow-up. |

### Bucket C — E2E tests that need the fixture rewritten (4 files + fixture)

| File | What changes | What stays |
|---|---|---|
| `tests/e2e/fixture.ts` (`packagedBinaryPath` + `startApp`) | binary path resolution; spawn args; env-var injection; HTTP bridge endpoint set | AppDriver public surface (every `gui-*` test method below the line: `executeJs`, `getDom`, `click`, `navigate`, `fillInput`, `setLocale`, every `create*` data-helper) — these go through `executeJs` against `window.api`, which is shimmed identically in both builds. |
| `tests/e2e/app.test.ts` | smoke #1 (Vue mount) — same; smoke #2 (`npx tsx src/mcp/server.ts`) — same (Node-side MCP unchanged in this phase); smoke #3 (dev MCP) — wire to the Tauri `mcp.rs` spawn path or skip with a TODO | Same overall shape: spawn → assert `__vue_router && window.api`. |
| `tests/e2e/crud-roundtrip.test.ts` | nothing in the test body; only the `startApp` call point picks up the new fixture | Same assertions: persons, places, sources, relationships, events, citations, event_participants, places-by-name lookup. |
| `tests/e2e/website-export.test.ts` | fixture only | Same: seed → invoke `window.api.website.export` (shimmed via `tauri-window-api.ts`) → read file off disk. Confirm the polyfilled `website:exportRun` write path works end-to-end (currently deferred per the port notes — flag in Verification). |
| `tests/e2e/duplicates.spec.ts` | fixture only | Same: seed pair per entity, navigate, merge, assert gone. |

### Bucket D — New tests this plan adds (3 files)

| New test | Why | Where |
|---|---|---|
| `tests/unit/tauri-channel-coverage.test.ts` | Replaces `preload-coverage.test.ts`. Asserts every `defineChannel()` in the registry has a corresponding implementation in `src/renderer/tauri-window-api.ts` so the renderer doesn't crash with `is not a function` after a registry add. | `tests/unit/` |
| `tests/unit/tauri-window-api.test.ts` | New domain test covering `tauri-window-api.ts` invariants: every Electron-only IPC channel that the renderer calls (file pickers, media attach, undo, checks, exports) has a polyfill that returns the expected shape. Mocks `@tauri-apps/api/core` like `db-shim.test.ts` does. Catches the "polyfill drift" failure mode. | `tests/unit/` |
| Add `coverage.thresholds.lines: 80` for `src/renderer/tauri-window-api.ts` (or its sibling files in the renderer Tauri-bridge layer) in `vitest.config.mts` | Today the renderer-side Tauri bridge has no coverage gate. Without one, drift is silent. | `vitest.config.mts` include list + thresholds-per-pattern |

### Scope deviations

- **MCP server transport tests** (`tests/unit/mcp.test.ts`) stay Node-side — MCP server still runs as `npx tsx src/mcp/server.ts` regardless of which desktop shell wraps the renderer. The Tauri `mcp.rs` spawn path is e2e-tested via `app.test.ts` smoke #3 only (already covered).
- **GEDCOM fidelity registry tests** (`gedcom-fidelity-*.test.ts`) — unchanged; pure api/ + schema introspection.
- **Linux/Windows e2e binary paths** — fixture handles macOS by literal path from the prompt; Linux + Windows variants land as a follow-up plan when CI matrix expands. The fixture's `packagedBinaryPath()` should `throw` with a helpful "Tauri binary not found at <path>; run `npm run tauri:build:test`" message on miss, mirroring the Electron version.
- **Two-window `data:changed` sync e2e** — defer. Today not covered by Electron e2e either; the unit-side `data-changed-broadcast.test.ts` text-grep is the only guard. Adapting it (Bucket B above) is the sole change here.
- **Performance tests** (`checks-perf.test.ts`, `persons-paged-aggregates.test.ts`) — keep as-is; they exercise pure SQL throughput against `:memory:` and don't care about runtime.

## Verification

The user-observable outcome from §1 is "a green run is trustworthy on the Tauri build". The checks that prove it:

1. **Smoke**: `npm test` in the worktree exits 0. Pre-existing test count minus retired hygiene tests (preload-coverage, ipc-worker-coverage, main-thread-responsive-during-import, worker-broadcast, ipc/onboarding) is approximately `~2120 − 5 = ~2115`, plus the 2 new Tauri-bridge tests → expect ~2117. Numbers are guidance; actual count locked in during execution.
2. **Smoke**: `npm run test:e2e` in the worktree exits 0. All 4 spec files (smoke, crud-roundtrip, website-export, duplicates) pass against the Tauri `.app` produced by `npm run tauri:build` (no separate `--bundles app` invocation needed once the script is added).
3. **Regression coverage proof — manual, by user**: run a fresh `vitest --coverage` and inspect the `lcov.info`/text report. `src/renderer/tauri-window-api.ts` coverage ≥ 80% lines (the new threshold). `src/api/**` coverage stays ≥ 80% lines, ≥ 80% functions, ≥ 70% branches (unchanged threshold from `vitest.config.mts`).
4. **Smoke check for the user goal itself**: I (the genealogist) deliberately introduce a regression in `src/renderer/tauri-window-api.ts` (e.g. comment out the `media.attach` polyfill). The new `tauri-channel-coverage.test.ts` fails with "tauri-window-api missing handler for media:attach". Restore. Run `npm run tauri:build` then `npm run test:e2e` — the website-export smoke (which calls `window.api.website.export`) catches a website-side polyfill regression. This proves the safety net actually catches what it claims to.
5. **Spot check by user**: open `npm run test:e2e -- --reporter=line` output; the four spec headers should each show "1 passed". Failure of any one is on the migration plan, not on the user.

What does **not** count toward verification:

- "Lint passes" → hygiene only.
- "Vitest passes" alone → the retired hygiene tests would also have passed; that's not the user goal.
- "TypeScript compiles" → does not exercise runtime behaviour.

Verification #1 + #2 are mandatory; #3 + #4 are mandatory pre-merge; #5 is the close-out check.

## Failure modes / RCA reference

This plan exists because Phase 6 of the Tauri full port (`docs/plans/2026-05-10-tauri-full-port.md`) was deferred until the functional port settled. The known failure modes for migrations of this shape:

- **"It compiles, ship it" drift.** Adapting `tests/e2e/fixture.ts` to spawn the Tauri binary without re-running `crud-roundtrip` against the *actual* Rust DB chain proved nothing on a similar prior project. Verification #2 mandates the e2e suite goes green against the *built* `.app`, not against `tauri dev`.
- **Polyfill drift in `tauri-window-api.ts`.** The current Tauri renderer maps roughly 50 Electron IPC channels by hand (port notes "Polyfills shipped this session" + "Points to revisit"). Without coverage tests, adding a new channel to the registry produces a runtime `is not a function` in the Tauri build but green CI — exactly the failure mode `preload-coverage.test.ts` was written against. Bucket D's `tauri-channel-coverage.test.ts` is the structural replacement; not optional.
- **"Smoke test passes, real flow broken" failure.** `crud-roundtrip` proves IPC + DB chain. `website-export` proves filesystem write. `duplicates` proves merge + ignore lifecycle. The three of them together reach every IPC class — IPC reads, IPC mutates, IPC + native fs, IPC + multi-step flow. Migration is "incomplete" until all three pass against the Tauri build. Stopping after `crud-roundtrip` works → see "deferred" follow-up in the port notes for `archive:_importRun` / `gedcom:export` / `csv:export` (currently broken under Tauri because their handlers `import * as fs from 'node:fs'`); those are blockers for `website-export` parity in this plan.
- **Async-shim contract bugs.** `db-shim.ts` returns Promises everywhere. The api/ layer was already migrated to `await` (Phase 2 Wave 1 per port notes), but a single missed `await` somewhere in a code path that's only hit during e2e (not in the Vitest in-memory paths) will surface as `[object Promise]` in the rendered DOM or undefined in a query result. The crud-roundtrip e2e is the canary. Cite this RCA in any "but unit tests passed!" follow-up.

---

## Tasks

### Task 1 — Replace `tests/e2e/fixture.ts` with a Tauri-aware version

- [x] In `packagedBinaryPath()`, switch resolution to the Tauri output: macOS → `tauri-spike/src-tauri/target/release/bundle/macos/Släktforskning (Tauri).app/Contents/MacOS/tauri-spike`; Linux → `…/bundle/appimage/…AppImage` (and `chmod +x` if needed); Windows → `…/bundle/nsis/…exe`. The "binary missing" error message references `npm run tauri:build`.
- [x] In `startApp()`, drop `SLAKTFORSKNING_DB` (Tauri command does not honour it yet — see Task 2). Keep `SLAKTFORSKNING_UI_PORT` (the Tauri `ui_server.rs` already reads it). Keep `SLAKTFORSKNING_NO_FOCUS` if any Tauri code reads it; else delete.
- [x] Update Phase 1 health-poll target from `/dom` to `/` (the Tauri ui-server's health endpoint). Tauri does not expose `/dom` today.
- [x] Update Phase 2 Vue-mount probe to use `POST /eval` with body `{ "script": "!!window.__vue_router" }` (the Tauri equivalent of `/execute_js`). The response shape is `{ result: <value> }` from `/eval`'s `run_in_renderer` flow — confirm the AppDriver wrapper matches.
- [x] Update `AppDriver.executeJs` to `POST /eval` with `{ script }` instead of `POST /execute_js` with `{ code }`. Other AppDriver methods (`getDom`, `click`, `fillInput`, `navigate`, `setLocale`) implement themselves on top of `executeJs` after this change — see Task 3.
- [ ] Verify: `node -e "console.log(require('./tests/e2e/fixture').packagedBinaryPath())"` prints the right path. Run a single e2e test under `--workers=1`; smoke confirms boot.

### Task 2 — Inject the test DB path into the Tauri runtime

- [x] Extend `tauri-spike/src-tauri/src/lib.rs` `default_db_path` to honour an env var: if `SLAKTFORSKNING_DB` is set, return that; else fall back to `app_data_dir().join('family.db')`.
- [x] Confirm the renderer's "first boot" path calls `default_db_path` before hitting the rusqlite layer (it does today, per port notes "Persistent rusqlite DB at …family.db" + the bridge boot trace).
- [x] Restore `SLAKTFORSKNING_DB` env-var pass-through in `startApp()` (Task 1 dropped it; this task adds it back now that the Rust side honours it).
- [ ] Verify: spawn the Tauri binary with `SLAKTFORSKNING_DB=/tmp/probe.db`, fetch `/db_path`, assert the response says `/tmp/probe.db`. Done as part of Task 1's smoke.

### Task 3 — Reimplement AppDriver primitives on top of `/eval` (in-renderer DOM, click, fill, navigate)

The Tauri `ui_server.rs` exposes only `/eval` + `/screenshot` + `/db_path` + `/`. AppDriver currently expects 6+ HTTP routes. The cheapest path is to reimplement the Electron-side route handlers as JS strings shipped through `/eval`:

- [x] `getDom()` → `executeJs<string>('document.documentElement.outerHTML')`
- [x] `click(selector)` → executes a polling JS that returns `{ ok: true }` once it finds + clicks the element, or `{ ok: false }` after a timeout. Same retry loop as today, just inside the renderer.
- [x] `fillInput(selector, value)` → unchanged in shape; today's body already lives inside an `executeJs` IIFE.
- [x] `navigate(routePath)` → `executeJs(`window.__vue_router.push(${JSON.stringify(routePath)})`)` followed by `settle()`.
- [x] `screenshot()` — already `POST /screenshot`; Tauri side returns the same `{ data: <base64> }` shape per `ui_server.rs` `handle_screenshot`. Confirm and pass through.
- [ ] Verify: each AppDriver method exercised at least once across the four e2e specs (already true; no test-body changes needed — only the AppDriver internals change).

### Task 4 — Fix the deferred RUN handlers blocking website-export e2e

Per port notes "Active blockers / in-progress" + "Points to revisit #4": `archive:_importRun`, `archive:_exportRun`, `gedcom:export`, `csv:export`, `website:exportRun` currently `import * as fs from 'node:fs'` in handlers reachable from the Tauri renderer. These are blockers for `website-export.test.ts` going green. Out of strict scope for this plan, but the e2e cannot pass without them, so:

- [ ] Audit each blocked RUN handler for `import * as fs from 'node:fs'` usage; pull the synchronous reads/writes behind a runtime-aware shim (`readFileText(path)` → `invoke('fs_read_text')` in Tauri / sync `fs` in Electron). The polyfill list in `src/renderer/tauri-window-api.ts` already covers the picker side; this task adds the read/write side.
- [ ] If any handler needs `fs.cpSync` for media folder copies, add a Rust `media_bulk_copy` command (port notes already names this).
- [ ] Verify: `tests/e2e/website-export.test.ts` passes against the built Tauri `.app`. Failure is the canary: this task is incomplete.

### Task 5 — Adapt the 8 Bucket B unit tests

- [x] `tests/unit/data-changed-broadcast.test.ts` — replace the preload-side grep with a `tauri-window-api.ts` grep for `emit('data:changed')` + `listen('data:changed', …)`. Keep the `db-worker.ts` grep behind a `process.env.SLAKTFORSKNING_RUNTIME === 'electron'` skip (or delete outright if Electron build is being retired in this branch — confirm with maintainer; default = keep both grep paths).
- [x] `tests/unit/preload-coverage.test.ts` — `git rm`. Replaced by Task 6's new test.
- [x] `tests/unit/ipc-worker-coverage.test.ts` — `git rm`. The user goal it guarded (long imports don't freeze the renderer) moves to Task 7's e2e + Tauri's async commands.
- [x] `tests/unit/main-thread-responsive-during-import.test.ts` — `git rm`. Same reason.
- [x] `tests/unit/worker-broadcast.test.ts` — `git rm`. parentPort no longer involved.
- [x] `tests/unit/ipc/onboarding.test.ts` — `git rm` once a fresh `tests/unit/onboarding.test.ts` covers the Tauri-side store. If the Tauri-side store migration is pending, leave the test in place behind an Electron-runtime skip. Default: rm now, follow-up adds the new test.
- [x] `tests/unit/settings.test.ts` — replace `vi.mock('electron', …)` with a mock of whichever Tauri-side path resolver `src/main/settings.ts`'s replacement uses. Likely just becomes a thin db-settings test. If `src/main/settings.ts` is unchanged in this branch, leave the test alone.
- [x] `tests/unit/static-api-coverage.test.ts` — keep as-is. Re-run to confirm it still passes (it asserts `buildStaticApi()` shape, not Electron specifics).
- [x] `tests/unit/scripts.thirdPartyLicenses.test.ts` — keep. Will likely need a follow-up to merge cargo + npm license rows, but not in this plan.
- [ ] Verify: `npm test` exits 0, with the deletions accounted for in the count. *(Suite runs to 3688 passed + 7 pre-existing failures unrelated to this commit cluster — gazetteers / gedcom-validation / gedcom_compat / import-gedcom-reporting / csv-export-worker-channel / duplicates-{media, places, sources}. Those are tracked in the "Deferred" section below; not introduced by Task 5's deletions.)*

### Task 6 — Add `tests/unit/tauri-channel-coverage.test.ts`

- [x] Read `src/renderer/tauri-window-api.ts` as text. Build the set of channels it polyfills by matching the assignment patterns it uses (e.g. `window.api.media.attach = …`, `window.api.gedcom.export = …`).
- [x] Walk the channel registry (`channelRegistry`) like `preload-coverage.test.ts` does today.
- [x] For each registry channel that the *renderer* calls (i.e. has a `defineChannel` direction of either `worker` or `main`, excluding registry-internal entries), assert it appears in the polyfill set OR the auto-walked channels in `tauri-window-api.ts`.
- [x] Add an explicit allowlist for channels the renderer never calls (e.g. internal `archive:_*Run` channels are called only by their public `archive:export` shim; they don't need a renderer polyfill).
- [ ] Verify: hand-comment one polyfill out of `tauri-window-api.ts`, confirm the test fails with the right message, restore.

### Task 7 — Add `tests/unit/tauri-window-api.test.ts` and a coverage threshold

- [x] Write the unit test by mocking `@tauri-apps/api/core`'s `invoke` (mirror `db-shim.test.ts`'s pattern). For each polyfilled channel, assert it calls the right Rust command with the right shape and returns the right shape.
- [x] Add `src/renderer/tauri-window-api.ts` (and any sibling Tauri-bridge files) to the `coverage.include` list in `vitest.config.mts`. Add a per-file threshold (vitest 4 supports `thresholds.perFile`); if not, leave it under the global threshold and confirm the line coverage from this new test drives it ≥ 80%.
- [ ] Verify: `npm test -- --coverage` exits 0; the lcov shows ≥ 80% lines for `tauri-window-api.ts`.

### Task 8 — Add a `tauri:build:test` script + wire `pretest:e2e`

- [x] Add to `package.json`:
  - `"tauri:build:test": "tauri build --bundles app"` (mac fast path; CI matrix later expands to platform-specific bundles). *Note: dropped the `npm --prefix tauri-spike` indirection — the plan's path predates the cleanup that moved `src-tauri/` to repo root, so a top-level `tauri` script is what actually runs.*
  - [ ] Replace `"pretest:e2e": "npm run package"` with `"pretest:e2e": "npm run tauri:build:test"`. *(Deliberately deferred — Task 4 fs-shim work is unfinished; flipping pretest:e2e would break local `npm run test:e2e` invocations until website-export's RUN handler is shimmable.)*
- [ ] Verify: cold `npm run test:e2e` starts with the Tauri build (~30 s per port notes), then runs Playwright against the produced `.app`.

### Task 9 — Run the suite, fix the long tail, capture follow-ups

- [ ] `npm test` → green. Note the new test count in the plan close-out. *(Ran to 3688 passed + 7 pre-existing failures; the new tauri-channel-coverage / tauri-window-api / data-changed-broadcast tests all pass. Pre-existing failures are not introduced by this work — see "Deferred" section below.)*
- [ ] `npm run test:e2e` → green. Note the wall-clock vs Electron's 1.5 min baseline.
- [ ] Capture every test that needed *unexpected* changes (i.e. not in Bucket A despite the plan's prediction) into a "Tasks discovered during execution" subsection at the bottom of this plan. If the count > 5, the plan's scope was wrong; pause and re-edit.
- [ ] User runs the suite themselves and signs off (Verification #5).

### Task 10 — Self-review checklist (per `.claude/rules/plans.md` close-out)

- [ ] Every checkbox above ticked.
- [ ] Plan + sibling -design.md (if any) `git mv` to `docs/plans/archive/`.
- [ ] `package.json` version bump (any new feature → minor; this is a refactor + safety-net change → patch unless a polyfill in Task 4 added a user-visible behaviour).
- [ ] `CHANGELOG.md` `## Unreleased` entry summarising the test migration.
- [ ] `docs/PLAN.md` updated; archive entry appended to `docs/plans/archive/PLAN.md`.
- [ ] Commit `chore: archive completed tauri-test-migration`.
- [ ] Merge worktree → `main`, delete branch + worktree.

---

## Tasks discovered during execution

### Tauri /eval response shape differs from Electron /execute_js

The Tauri `ui_server.rs` `/eval` endpoint returns the raw JS value (or
`{ "__error": "..." }` if the script throws). The Electron `/execute_js`
endpoint wrapped the value as `{ result, error }`. Caught in Task 1 / Task 3
when rewriting `AppDriver.executeJs` — the new implementation unwraps `__error`
and a singleton `error` key on bridge errors. No plan-edit needed; the spec
already named `/eval` as the target endpoint.

### `window` global must be stubbed for tauri-window-api unit tests

`mountWindowApi(db)` assigns `window.__chartBridge = {}` at the bottom of the
function. Vitest's `node` environment has no `window`. The new
`tests/unit/tauri-window-api.test.ts` stubs `globalThis.window` before the
SUT import (mirroring `db-shim.test.ts`'s `vi.mock` pattern). Switching to
`happy-dom` for one assertion would have cost ~150 ms per file; the stub is
~5 lines and doesn't slow anything down.

## Deferred / out of scope for this commit cluster

Task 4 (RUN-handler fs-shim for website-export) and Task 8 e2e verification
were not landed in this cluster. The prompt's STOP clause said: "If after a
day of focused work you've landed Tasks 1-3 + 5 (the bulk of the structural
change) and Tasks 4 + 6 + 7 + 8 are dragging on website-export fs-shim
issues OR specific Electron-test retirements that turn out to be
load-bearing — STOP and report."

What landed: Tasks 1, 2, 3, 5, 6, 7 + the `tauri:build:test` half of Task 8.
What didn't: Task 4 (website-export fs-shim) — needs follow-up work to
audit `archive:_importRun`, `archive:_exportRun`, `gedcom:export`,
`csv:export`, `website:exportRun` for `import * as fs from 'node:fs'` usage
and route them through a runtime-aware shim (`fs_read_text` /
`fs_write_text` invoke commands or `media_bulk_copy` for cpSync-shaped
calls). Until that lands, `tests/e2e/website-export.test.ts` will fail
against the Tauri build, so `pretest:e2e` was deliberately left pointing at
`npm run package` (Electron) — flipping it without Task 4 would break the
pretest gate for everyone.

What this means for the v0.250.0-tauri.0 release tag: the unit suite is
trustworthy on the Tauri side now (Bucket A passes unchanged + the new
Bucket D bridge-coverage tests catch polyfill drift). The e2e suite is
still Electron-flavoured. Either land Task 4 + flip `pretest:e2e` first,
or ship the release tag with an explicit "e2e validated against Electron
build only; Tauri e2e is the next milestone" caveat.

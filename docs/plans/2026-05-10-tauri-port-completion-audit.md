# Tauri Port — Completion Audit

> Companion audit to `docs/plans/2026-05-10-tauri-full-port.md`. Reads the
> current `tauri-full-port` branch as it stands after Phase 2.5 + the bulk
> of Phase 3 + the test-migration plan landed (commit `28f79751` and
> earlier). Inventories what's left between today and shipping a Tauri
> build that *replaces* the Electron build for users.
>
> No code changes here. The output is a per-channel diff, a skills audit,
> a legacy-code retire list, a distribution checklist, and a sequenced
> todo. Each finding cites the file it was sourced from so a follow-up
> plan can be written against this document without re-walking the tree.

## User goal

I (the user) install one Slaktforskning binary, get the Tauri app, and
nothing about my workflow changes. The 280 MB Electron installer is gone.
The agent workflows still work. Imports from Holger / Genney /
RootsMagic / Gramps / GEDCOM / archive `.zip` still run end-to-end and
land my data in the rusqlite DB. Exports — GEDCOM, archive, CSV,
website — still produce identical files. I never see "this feature is
not yet wired in the Tauri build (deferred)" because every such surface
either works or has been intentionally retired with my consent. When a
new Claude Code release ships, I get it through the same auto-update
mechanism I get today.

## Scope

This audit covers six areas. Each is enumerated explicitly so a follow-up
plan can pick a single area, scope work to it, and ship.

1. **Channel-by-channel coverage table.** Every entry in
   `src/preload/index.ts` (the Electron preload's `window.api` surface)
   compared to what is wired in `src/renderer/tauri-window-api.ts` +
   what auto-walks from `src/shared/channels/*.ts`.
2. **Test migration.** Defers in full to
   `docs/plans/2026-05-10-tauri-test-migration.md` — that plan owns the
   test pyramid; this audit only flags how it interlocks with the
   release cut.
3. **Skills audit.** Every `.claude/skills/*/SKILL.md` graded
   keep / update / retire / new for a Tauri-only world.
4. **Legacy code to retire.** Every file/dir that exists *only* for the
   Electron build, with sequencing.
5. **Distribution + release.** MCP sidecar packaging, code-signing,
   auto-update, cross-platform smoke, and the cut-mainline ritual that
   replaces Electron in `package.json`.
6. **Sequencing + effort.** Coarse S/M/L per item; "must-do for v0.250.0"
   vs "post-launch follow-up."

### Scope deviations

- **Re-doing the test plan.** Out of scope; that plan
  (`2026-05-10-tauri-test-migration.md`) is the source of truth and is
  cited rather than restated.
- **MCP server rewrite to Rust.** Out of scope; deferred per the original
  plan's Task 18 "option (c)" ("multi-month effort. Defer.").
- **Mobile (iOS / Android).** Out of scope per original plan.
- **Static SPA migration.** Out of scope. The static SPA does not host a
  desktop runtime; its `static-api.ts` shim is runtime-agnostic.
- **Performance regression hunt.** Out of scope. The original plan's
  Verification table (RSS, cold start, install size) is the gate; this
  audit assumes those numbers will be measured during Phase 7 Cross-platform
  smoke and not before. If a measurement comes in below threshold, that's
  a new RCA-driven plan, not a checkbox here.

## Verification

The user-observable outcome from §1 is "I install the Tauri build and
nothing about my workflow changes." The mechanical checks that prove it:

1. **Channel parity smoke (manual, by user).** Walk every domain in
   `src/preload/index.ts` against the Tauri build. Each method either
   (a) works, (b) shows a clear error from the polyfill (deliberately
   deferred with user consent), or (c) is unreachable from any UI / MCP
   surface we ship. No third "silently does nothing" state.
2. **Channel coverage test (automated).** The new
   `tests/unit/tauri-channel-coverage.test.ts` from the test-migration
   plan asserts every `defineChannel()` in the registry has either a
   matching auto-walk handler or a polyfill in
   `src/renderer/tauri-window-api.ts`. **This audit assumes that test is
   already landed when its findings are executed.** If it isn't,
   the gap-table below is the manual stand-in.
3. **Round-trip imports.** GEDCOM, Holger, RootsMagic, Genney, Gramps,
   archive `.zip`. Each importer roundtrips its `tests/fixtures/`
   payload through the Tauri renderer. All five of `import:*Run`
   handlers + `archive:_importRun` + `gedcom:import` exit 0.
4. **Round-trip exports.** GEDCOM (5.5.1 + 7.0), archive `.zip`, CSV
   (every entityType the renderer offers), website export. Files land
   on disk. GEDCOM + archive re-imports round-trip per the fidelity
   registry.
5. **MCP via packaged sidecar.** External `claude` CLI connects via
   `.mcp.json` to the *bundled* sidecar (not `npx tsx`). `tools/list`
   returns ≥ 34 prod tools. One representative tool round-trips.
6. **Auto-update from N → N+1.** Build 0.250.0, build 0.250.1, install
   0.250.0, watch updater download + apply 0.250.1.
7. **No remaining `notWired(...)` polyfill stubs in
   `src/renderer/tauri-window-api.ts`** when the release is cut. (As of
   today: `holgerRun`, `rootsmagicRun`, `genneyRun`, `genneyDiscover`,
   `archive.export`, `archive.import` — see §1.)

What does **not** count toward verification:

- "Lint passes" — hygiene only.
- "Vitest passes" alone — see test-migration plan §Failure modes; the
  unit tests run against `node-sqlite3-wasm` in-memory, not the Tauri
  rusqlite chain. Green vitest is necessary, not sufficient.
- "tauri build succeeds" — the binary running ≠ the binary working.

Verification #1 + #3 + #4 + #5 are the gates for cutting v0.250.0.
#6 + #7 gate "stop maintaining Electron in main" (Phase 9).

## Failure modes / RCA reference

This audit exists because the Tauri port spread across roughly nine
phases of work landed in the running notes
(`2026-05-10-tauri-full-port-notes.md`) without a single document that
says "and here's what's still missing before we can pull the Electron
plug." The known failure modes for migrations of this shape:

- **Drift between "spike works" and "users can't switch."** The spike
  proved metrics; the renderer polyfill proved most flows; nobody has
  asked "can a user with a Holger 8 database actually move to this
  build?" The §1 channel table is the artifact that answers that.
- **Polyfill rot.** `tauri-window-api.ts` is hand-maintained. The
  test-migration plan's Bucket D
  (`tauri-channel-coverage.test.ts`) is the structural guard. Until
  that test lands, every `defineChannel()` add is a silent
  Tauri-build regression.
- **Skills lying about runtime.** `.claude/skills/sqlite-wal/`,
  `.claude/skills/worker-thread-ipc-split/`,
  `.claude/skills/electron-dev/` describe Electron-only failure modes.
  An LLM-driven contributor reading them while editing Tauri code
  will produce wrong output. §3 is the audit that catches this.
- **"Cut the release, archive Electron, then realize Cmd+N doesn't open a
  second window" failure.** Original plan Phase 4 (menus + dialogs +
  multi-window + auto-update) is largely *not done* per the running
  notes ("Active blockers / in-progress" empty, but "Points to revisit
  #6, #7, #8, #9" all open). §5 captures these as release blockers, not
  follow-ups.
- **Per `feedback_dont_invent_when_revert_works.md`:** if the v0.250.0
  cut surfaces a regression that needs >2 weeks to fix, ship a
  transitional `0.250.0-tauri.0` pre-release alongside the Electron
  `0.249.x` line — don't ship a half-broken Tauri-only mainline.
- **Per `feedback_no_silent_string_replace.md`:** any handler in
  `tauri-window-api.ts` that returns `{ success: false, error: '…' }`
  on miss instead of throwing is the same anti-pattern as a silent
  string replace. §1's "throws-on-call" rows must produce visible UI
  errors, not be silently swallowed. Verification #1 catches this.

---

## §1 — Channel coverage table (Electron preload → Tauri status)

Read alongside `src/preload/index.ts` (~330 lines, 162 method entries
across 25 domains) and `src/renderer/tauri-window-api.ts` (~523 lines,
hand-polyfills ~50 of those + auto-walks the rest from
`src/shared/channels/registry.ts`).

**Status legend:**

- `auto` — auto-walked from `channelRegistry` by `tauri-window-api.ts`
  (covers every `defineChannel({ thread: 'worker' | 'main' })` whose
  handler is engine-agnostic). Works because rusqlite + the api/ layer
  run in the renderer; no extra wiring needed.
- `polyfill` — explicitly overridden in `tauri-window-api.ts` because it
  needs Tauri runtime services (file dialog, app data dir, fs, native
  shell, second window, etc.).
- `throws` — polyfill stub returns `{ success: false, error: '… not yet
  wired in the Tauri build (deferred)' }`. The UI shows the error; the
  user can't complete the action.
- `pickup-only` — file picker side wired (user can choose a file) but
  the run handler throws.
- `partial` — wired but with a known gap vs Electron behaviour. Listed
  in Notes.
- `N/A` — Electron-only mechanism that has no Tauri counterpart and is
  intentionally absent (e.g. `chart:onGetVisiblePersons` IPC `replyChannel`
  pattern — replaced by a `__chartBridge` global).

### domain: persons (15 methods)

| domain.method | Tauri status | Notes |
|---|---|---|
| `persons.create` | auto | mutating channel; auto-walk fires `data:changed` |
| `persons.createWithEvent` | auto | |
| `persons.get` | auto | |
| `persons.list` | auto | |
| `persons.update` | auto | |
| `persons.delete` | auto | |
| `persons.search` | auto | |
| `persons.addName` | auto | |
| `persons.getNames` | auto | |
| `persons.updateName` | auto | |
| `persons.deleteName` | auto | |
| `persons.addIdentifier` | auto | |
| `persons.getIdentifiers` | auto | |
| `persons.deleteIdentifier` | auto | |
| `persons.listPage` | auto | |
| `persons.searchWithDetails` | auto | |
| `persons.listUnsourcedPage` | auto | |
| `persons.refreshQualityIssueCounts` | auto | |
| `persons.getQualityIssueCounts` | auto | |

### domain: relationships (8)

All `auto`. Same shape as persons.

### domain: eventParticipants (3)

All `auto`.

### domain: events (7)

All `auto`.

### domain: sources (7)

All `auto`.

### domain: citations (10)

All `auto`.

### domain: gedcom (4)

| method | status | Notes |
|---|---|---|
| `gedcom.selectFile` | polyfill | `pickFile('Select GEDCOM File', …)` via `dialog_pick` |
| `gedcom.preview` | polyfill | Reads bytes via `fs_read_bytes_base64`; decodes + parses in renderer; runs `previewGedcomImport` |
| `gedcom.import` | polyfill | Same shape as preview but writes via `importGedcom`. Calls `fireDataChanged()` after. **Missing:** progress events (`import:genneyProgress`, etc. listeners are renderer-side `ipcRenderer.on` patterns — see import section); GEDCOM doesn't emit progress today so OK |
| `gedcom.export` | polyfill | Builds `.ged` text in renderer via `exportGedcom`; writes via `fs_write_text` |

### domain: import (15)

| method | status | Notes |
|---|---|---|
| `import.genneyCheckDocker` | partial | Returns `{ available: false }` always — Genney import via Docker not available in Tauri. Acceptable if Genney runs without Docker (the .gcc / .backup paths) |
| `import.genneySelectDerby` | polyfill | `pickFolder('Välj Genney Derby-databasmapp')` |
| `import.genneySelectArchive` | polyfill | `pickFile(['gcc','backup','zip'])` |
| `import.genneySelectMedia` | polyfill | `pickFolder('Select Genney media folder (optional)')` |
| `import.genneyDiscover` | throws | "genneyDiscover not yet wired in Tauri build" |
| `import.genneyRun` | throws | `notWired('Genney')` — does directory walks + Java spawn for .backup; needs Rust commands for fs walk + maybe sidecar. **Blocker for any Genney user.** |
| `import.onProgress` | partial | Subscribes to `import:genneyProgress` IPC events — Tauri uses `@tauri-apps/api/event`. Currently no-op (handler never fires because the run handler throws). Wire when `genneyRun` ships. |
| `import.holgerSelectFile` | polyfill | `pickFile(['mdb'])` |
| `import.holgerSelectMedia` | **MISSING** | Not in `tauri-window-api.ts`. Call to it would crash with `TypeError: window.api.import.holgerSelectMedia is not a function`. **Bug.** |
| `import.holgerRun` | throws | `notWired('Holger')` — needs `.mdb` extraction via `mdbtools` or a Rust crate, sqlite-on-sqlite import. **Blocker for any Holger user (Ben — the project's primary beta tester).** |
| `import.onHolgerProgress` | partial | Same shape as `onProgress` — needs Tauri event wiring once `holgerRun` ships |
| `import.rootsmagicSelectFile` | polyfill | `pickFile(['rmtree','rmgc'])` |
| `import.rootsmagicRun` | throws | `notWired('RootsMagic')`. RootsMagic is also sqlite-in-sqlite; less involved than Holger but still blocked |
| `import.onRootsmagicProgress` | partial | Same as above |
| `import.grampsSelectFile` | polyfill | `pickFile(['gramps','xml','gpkg'])` |
| `import.grampsRun` | polyfill | **WORKS** — reads bytes via `fs_read_bytes_base64`, decodes, runs `importFromGrampsBytes`. Reference implementation for the other importers |
| `import.onGrampsProgress` | partial | Wire via Tauri events when needed |

### domain: db (9)

| method | status | Notes |
|---|---|---|
| `db.getCurrent` | polyfill | `invoke('db_current_path')` |
| `db.getRecent` | partial | Returns `[]` always. Original Electron build maintains a recent-files list in `src/main/settings.ts`; not yet ported to Tauri-side store. **Minor regression — recent files menu will be empty.** |
| `db.openExisting` | polyfill | `invoke('db_pick_existing')` + `switchDbTo(path, false)` |
| `db.createNew` | polyfill | `invoke('db_pick_new')` + `switchDbTo(path, true)` (initialises schema) |
| `db.switchTo` | polyfill | `switchDbTo(path, false)` |
| `db.onSwitched` | **MISSING** | Electron uses `ipcRenderer.on('db:switched', cb)`. Tauri polyfill calls `fireDataChanged()` on switch but doesn't notify a discrete `db:switched` listener. Renderer code that registered `onSwitched` (per `App.vue` `?.` guard noted in `.claude/rules/renderer.md`) silently never fires. **Likely UX bug — list views may show stale DB after switch.** |
| `db.getSetting` | auto | |
| `db.setSetting` | auto | |
| `db.deleteSetting` | auto | |

### domain: shell (1)

| method | status | Notes |
|---|---|---|
| `shell.openExternal` | **MISSING** under `shell.*` | Polyfill exists at `app.openExternal` (`invoke('plugin:opener|open_url')`). The renderer calls both names depending on the call site; `shell.openExternal` isn't aliased. Risk: low (most call sites use `app.openExternal`); **probe** with grep before merge |

### domain: places (12)

All `auto`. Including `findOrCreate` and `findOrCreateWithChain` (mutating).

### domain: groups (12)

All `auto`.

### domain: repositories (8)

All `auto`.

### domain: researchTasks (11)

All `auto`.

### domain: reports (7)

All `auto`. (Read-only, single-table reads.)

### domain: duplicates (15)

All `auto`.

### domain: checks (5)

| method | status | Notes |
|---|---|---|
| `checks.runAll` | polyfill | Calls `api/checks` directly + enriches with names/places/media/sources |
| `checks.forPerson` | polyfill | Loops `checks.getAllCheckFunctions()` |
| `checks.forPlace` | polyfill | `checks.runChecksForPlace` |
| `checks.forMedia` | polyfill | `checks.runChecksForMedia` |
| `checks.runForEvent` | polyfill | `checks.runChecksForEvent` |
| `checks.cancel` | partial | No-op. Electron supports cancellation via worker-local state. Acceptable: re-runs are fast on rusqlite |

### domain: media (20)

| method | status | Notes |
|---|---|---|
| `media.list` | auto | |
| `media.listPage` | auto | |
| `media.get` | auto | |
| `media.create` | auto | |
| `media.delete` | auto | **TODO probe:** does delete remove the file from `<dbname>-media/`? In Electron yes (worker-side fs). In Tauri the api/ delete is renderer-side and can't touch fs. Likely partial. |
| `media.update` | auto | |
| `media.forEntity` | auto | |
| `media.linksForMedia` | auto | |
| `media.addLink` | auto | |
| `media.removeLink` | auto | |
| `media.reorder` | auto | |
| `media.profilePicRef` | auto | |
| `media.profilePicRefs` | auto | |
| `media.attach` | polyfill | Picks file via `media_pick_and_copy`; calls `media.createMedia` + `media.addMediaLink` |
| `media.createFromFile` | **MISSING** | Polyfill absent. `media.attach` covers most call sites but `createFromFile` is the path the Holger / Genney importers use during media ingestion; aligned with §1 import status |
| `media.openFile` | **MISSING** | No polyfill. Call would crash. **Bug** — UI's "Open file" button on media rows |
| `media.getFilePath` | polyfill | Returns the relative `file_ref` (consumer derives full path or hits `readAsDataUrl`) |
| `media.readAsDataUrl` | polyfill | `invoke('media_read_as_data_url', { fileRef })` |
| `media.thumbnailDataUrl` | **MISSING** | Electron generates thumbnails server-side via `nativeImage`. Tauri has no equivalent. Renderer call would crash. **Bug** for the Media library view |
| `media.getTimeline` | auto | |

### domain: archive (2)

| method | status | Notes |
|---|---|---|
| `archive.export` | throws | `notWired('Archive export')`. **Blocker for offline backup workflow.** Per port notes Phase 4 follow-up: needs api/archive_*.ts refactored to thread fs read/write callbacks. Or a Rust `archive_*` command set |
| `archive.import` | throws | `notWired('Archive import')`. **Blocker for migrating between machines via .zip** |

### domain: mediaRegions (5)

All `auto`. (These are the face-tagging coordinates — rusqlite-friendly rows.)

### domain: export (1)

| method | status | Notes |
|---|---|---|
| `export.openFolder` | polyfill | `invoke('shell_reveal', { path })` |

### domain: website (3)

| method | status | Notes |
|---|---|---|
| `website.export` | **MISSING** polyfill, status uncertain | Channel `website:exportRun` exists in registry; the public `website:export` method in preload is a wrapper. Auto-walk would reach `website:exportRun` if it's `defineChannel`'d as worker. **Probe:** does the renderer call `window.api.website.export(opts)` work? Per test-migration plan Verification #1 + Failure modes "the website-export e2e is the canary". Today: **broken** (per port notes "Active blockers / in-progress" referencing fs-in-handlers issue) |
| `website.previewSnapshot` | auto | (registry has it as worker) |
| `website.buildPreviewHtml` | **MISSING** | Electron uses `nativeImage` to bake thumbnail JPEGs into the preview HTML (per `.claude/rules/renderer.md` "Preview iframe can't reach local media"). No Tauri equivalent. Preview iframe will likely show broken images. **Bug** |

### domain: print (2)

| method | status | Notes |
|---|---|---|
| `print.print` | polyfill | Calls `window.print()` — opens native print dialog |
| `print.exportPdf` | partial | Calls `window.print()` and returns a note. Argument list (defaultPath, landscape, headerFooter) is **ignored**. The Electron build saves a PDF directly with header/footer; Tauri delegates to the user clicking "Save as PDF" in the print dialog. **Functional regression** — research-note headers don't appear in saved PDF unless the user manually adds them via the print dialog. Acceptable for v0.250.0 if documented; ideal fix is a Rust-side PDF rendering path |

### domain: csv (1)

| method | status | Notes |
|---|---|---|
| `csv.export` | polyfill | Reuses `csv:_exportRun` worker channel from the registry (so this is "polyfill that delegates to auto") + writes via `fs_write_text` |

### domain: backup (2)

| method | status | Notes |
|---|---|---|
| `backup.backup` | **MISSING** | No polyfill. Electron has dialog + fs.copyFile-shaped logic in `src/main/ipc/database.ts`. Call would crash. **Bug** for the Backup button in Settings |
| `backup.restore` | **MISSING** | Same. **Bug** |

### domain: gazetteers (7)

All `auto`. (Gazetteer mutations write to db_settings rows; render-time loading is via Vite glob per port notes.)

### domain: undo (7)

| method | status | Notes |
|---|---|---|
| `undo.undo` | polyfill | `await undoManager.undo()` + `fireDataChanged()` |
| `undo.redo` | polyfill | Same shape |
| `undo.getState` | auto | (`undo:state` registry channel) |
| `undo.beginGroup` | auto | (`undo:beginGroup`) |
| `undo.endGroup` | auto | |
| `undo.onChanged` | **MISSING** | Electron uses `ipcRenderer.on('undo:changed', cb)`. Tauri polyfill doesn't emit this. Toolbar undo/redo button enabled-state may not refresh after undoable op. **Functional regression** — likely cosmetic if `onDataChanged` is fired; verify |
| `undo.onPerformed` | **MISSING** | Same shape — emits a toast in Electron ("Undid: <label>"). Tauri build has no toast on undo. **Minor UX regression** |

### domain: app (4)

| method | status | Notes |
|---|---|---|
| `app.getVersion` | partial | Returns hard-coded string `'0.0.1-tauri'`. Should read from `tauri.conf.json` or `Cargo.toml` via `invoke('app_version')`. **Bug** — Settings → About shows wrong version |
| `app.openExternal` | polyfill | `invoke('plugin:opener|open_url')` |
| `app.onOpenAbout` | partial | No-op. Comment says "menu wires this in main.ts". Native menu isn't wired (per port notes #7), so About menu item doesn't exist in Tauri build. Once menu lands, this needs a Tauri event subscription |
| `app.readThirdPartyLicenses` | partial | Returns empty string `''`. Settings → About → Third-party licenses will be blank. **Functional regression** — license attribution is a release-blocker for the OSS commitments. See §5 distribution |

### domain: onboarding (3)

| method | status | Notes |
|---|---|---|
| `onboarding.getSeen` | **MISSING** | No polyfill; auto-walk doesn't apply (channel is in `src/main/ipc/onboarding.ts`, not the registry). New onboarding callouts won't dismiss. **Bug** — first-run users see the same callouts forever |
| `onboarding.markSeen` | **MISSING** | Same |
| `onboarding.reset` | polyfill | Implemented via db_settings keys. Good — if `getSeen`/`markSeen` are wired through the same db_settings store, all three become consistent |

### domain: chart (5 + reply-channel handlers)

| method | status | Notes |
|---|---|---|
| `chart.saveSvg` | **MISSING** | Channel `chart:saveSvg` is main-only in Electron (uses `dialog.showSaveDialog`). No Tauri polyfill. Call would crash. **Bug** for the Reports view's "Save SVG" |
| `chart.savePdf` | **MISSING** | Same shape. **Bug** for Reports "Save PDF" |
| `chart.onGetVisiblePersons` | polyfill | Stores callback on `window.__chartBridge` global for `/eval` / dev MCP to call |
| `chart.onSelectPerson` | polyfill | Same |
| `chart.onFocusPerson` | polyfill | Same |
| `chart.onGetLayout` | polyfill | Same |
| `chart.removeAllChartHandlers` | polyfill | Cleanup |

### domain-level (2)

| method | status | Notes |
|---|---|---|
| `onDataChanged` | polyfill | Top-level on `api` (not nested) |
| `offDataChanged` | polyfill | Top-level |

### Summary count

- **Auto-walked (works as-is):** ~120 methods
- **Polyfilled (works):** ~32 methods
- **`throws` deferred:** 7 methods (`gedcom:export` was throws, now polyfill — re-verify in build) — currently `holgerRun`, `rootsmagicRun`, `genneyRun`, `genneyDiscover`, `archive.export`, `archive.import`. Plus `import.holgerSelectMedia` is missing entirely.
- **Missing polyfill (calls would crash):** ~14 methods. Highest-impact:
  `media.openFile`, `media.thumbnailDataUrl`, `media.createFromFile`,
  `db.onSwitched`, `backup.backup`, `backup.restore`,
  `chart.saveSvg`, `chart.savePdf`, `onboarding.getSeen`,
  `onboarding.markSeen`, `undo.onChanged`, `undo.onPerformed`,
  `import.holgerSelectMedia`, `website.buildPreviewHtml`.
- **Partial / known regression:** ~6 methods.
  `db.getRecent` (empty list), `print.exportPdf` (ignores args),
  `app.getVersion` (hard-coded), `app.readThirdPartyLicenses` (empty),
  `app.onOpenAbout` (no-op), `import.genneyCheckDocker` (always false),
  `checks.cancel` (no-op).

### Things this audit revealed are BROKEN that the running notes thought were fine

Flagged for the final summary message back to the user:

1. **`db.onSwitched` doesn't fire.** Renderer code that subscribes to it
   (per `.claude/rules/renderer.md` "Static SPA & website-export
   gotchas" `db.onSwitched` is mentioned as needing a `?.` guard) will
   silently miss DB-switch events. Polyfill fires `data:changed` instead,
   which composables subscribe to — so list views *do* refresh — but any
   code that wanted the discrete event won't get it.
2. **Multiple media operations missing polyfills:** `openFile`,
   `thumbnailDataUrl`, `createFromFile`. The Media library view will
   crash or render no thumbnails on first open. Not in the running notes'
   "Points to revisit" list.
3. **`backup.backup` / `backup.restore` missing entirely.** The Backup
   button in Settings is a release-blocker.
4. **Onboarding state isn't read on first run.** First-time UX shows
   every callout forever. Acceptable for beta tester rollout (Bengt /
   Ben already past first-run), regression for new users.
5. **`chart.saveSvg` / `chart.savePdf` missing.** The Reports view's
   "Save SVG" and "Save PDF" buttons crash.
6. **`app.readThirdPartyLicenses` returns empty string.** OSS license
   attribution is missing from the About panel. This is a license
   compliance issue, not just a UX regression.
7. **`app.getVersion` hard-coded `'0.0.1-tauri'`.** Settings shows wrong
   version; bug reports will say "0.0.1-tauri" instead of "0.250.0".
8. **`import.holgerSelectMedia` missing.** Even if `holgerRun` is later
   wired, the media-folder picker step crashes.

These are the items that would surface in Verification #1 (manual walk
of the preload) but currently aren't in any task list.

---

## §2 — Test migration

See `docs/plans/2026-05-10-tauri-test-migration.md` for the Vitest +
Playwright migration. Cross-reference: this audit assumes that plan
executes alongside the gap-closing work; tests gate the release cut. In
particular, Bucket D's `tauri-channel-coverage.test.ts` is the structural
guard against §1's "missing polyfill" class of bug, and the Bucket C
`website-export.test.ts` revival depends on the §1 archive + website
polyfills landing.

If the test-migration plan slips behind the gap-closing work, the
release ships with §1's gap table as the manual stand-in for the
automated coverage gate — acceptable for v0.250.0 if explicitly
acknowledged, but not for the post-launch rhythm.

---

## §3 — Skills audit (`.claude/skills/`)

Walked every `SKILL.md` in `.claude/skills/`. Verdicts:

### Keep (still applies in Tauri, no changes needed)

- `a11y` — ARIA / WCAG patterns are runtime-agnostic.
- `add-feature` — needs **update** (see below) but the layered-architecture
  message stays.
- `commit` — git workflow.
- `data-modeling` — schema / data shape, runtime-agnostic.
- `dom-first-debugging` — DOM truth-finding works in any webview.
- `frontend-design` — Vue patterns, components, layouts. Runtime-agnostic.
- `gazetteer-testing` — pure data-quality skill.
- `gazetteers` — build pipeline; runs at build time on Node, output is
  consumed by the bundle regardless of host.
- `gedcom` — pure parser/exporter skill, lives in `src/gedcom/` (api/-side).
- `gedcom-fidelity-registry` — Prime Directive guard, schema-driven.
  Runtime-agnostic.
- `interview-synthesis` — research skill.
- `oss-release` / `oss-stale` / `oss-triage` / `oss-welcome` — GitHub
  maintenance, runtime-agnostic.
- `reports` — chart / PDF / SVG / print CSS. **Caveat:** the print path
  changes in Tauri (no `webContents.printToPDF`) — see update list.
- `slaktforskning-mcp` — agent uses MCP tools; mechanism unchanged.
- `slaktforskning-mcp-dev` — needs **update** (see below) for the
  bridge architecture.
- `subagent-handoff` — workflow skill.
- `test` — vitest + Playwright; the test-migration plan changes what
  they target, not how they run.
- `tree-layout` — layout math.
- `undo-redo-patterns` — undo manager + UndoAction shape; lives in
  `src/api/undo.ts`, runtime-agnostic. **Caveat:** the preload's
  `mutating()` wrapper is replaced by `tauri-window-api.ts`'s
  `fireDataChanged()` call. The skill mentions "the preload `mutating()`
  wrapper" — see update list.
- `ux-intent-mapping` — UX skill.
- `web-research` — research skill.

### Update (still relevant; body references Electron-only patterns)

- `add-feature` — currently documents the layered stack as
  "schema → api → IPC channel → preload → MCP → Vue". In Tauri the IPC
  step is "either auto-walk picks it up from the registry OR add a
  polyfill in `tauri-window-api.ts`". The "preload" step doesn't exist.
  The skill should describe both the auto-walk path (preferred — engine-agnostic)
  and the polyfill path (needed only when the channel uses Tauri runtime
  services like file dialog, fs, native shell, second window).
  Also: the test-coverage check should reference
  `tauri-channel-coverage.test.ts` (not just `preload-coverage.test.ts`).

- `import-format-add` — currently documents the multi-file import
  pattern: `src/import/<format>/`, IPC channel, file picker, **preload +
  static-api**, UI tab, MCP auto-detect. In Tauri the preload step is
  replaced by a polyfill in `tauri-window-api.ts` that reads file bytes
  via `invoke('fs_read_bytes_base64')`. The skill should ship the Gramps
  polyfill as the reference implementation (it's the only importer
  fully wired today; see §1) and document the recipe: file picker via
  `dialog_pick`, byte-read via `fs_read_bytes_base64`, decode + parse +
  import in renderer, `fireDataChanged()` after.

- `slaktforskning-mcp-dev` — currently focuses on the
  `createProdServer.ts` / `createDevServer.ts` + `defineChannel` +
  preload + static-api stack. Needs an addendum on the bridge: how the
  dev MCP UI server (`src-tauri/src/ui_server.rs` — the `/eval`,
  `/screenshot`, `/db_path`, `/dom`, `/click`, `/fill`, `/navigate`,
  `/reload`, `/console`, `/query_styles` endpoints) provides the same
  surface as Electron's `src/main/ui-server.ts`. Should also call out
  that the MCP server itself (`src/mcp/server.ts`) is engine-agnostic
  — only the bridge changed.

- `reports` — the print path changed. Electron uses
  `webContents.printToPDF` (called via `print:exportPdf` IPC). Tauri
  delegates to `window.print()` + native dialog. Update the print-path
  section to document this regression and the workaround (instruct the
  user to click "Save as PDF" in the dialog). Also note the
  research-name header/footer args are ignored in Tauri (per §1).

- `undo-redo-patterns` — the `mutating()` preload wrapper section needs
  to mention the Tauri equivalent: `tauri-window-api.ts`'s auto-walk
  fires `fireDataChanged()` after mutating channels, and `undo:undo` /
  `undo:redo` polyfills do the same. The user-observable outcome
  (data:changed fires after every mutation) is unchanged; the mechanism
  differs.

### Retire (Electron-only concept; no Tauri equivalent)

- `worker-thread-ipc-split` — Tauri has no DB worker thread.
  rusqlite is on the Tauri backend, accessed via `invoke()` which is
  async by default. The user goal this skill guarded ("renderer doesn't
  freeze during long imports") is satisfied architecturally. The skill's
  bug history is still valuable as historical RCA — move the body to
  `docs/plans/archive/notes-electron-worker-split.md` and delete the
  skill file.

- `electron-dev` — Electron-specific dev loop instructions. Replaced by
  the Tauri equivalent: `npm run tauri:dev` for HMR, `npm run tauri:build`
  for packaging. Either retire entirely or rename/rewrite to
  `tauri-dev`.

- `sqlite-finalize` — node-sqlite3-wasm-specific WASM heap finalize
  pattern (`db.prepare().finalize()`). rusqlite manages statement
  lifetimes via Rust borrow checker; no manual finalize needed. Skill
  is obsolete the moment node-sqlite3-wasm leaves the codebase.
  **Caveat:** the test pyramid still uses `node-sqlite3-wasm` for
  in-memory tests (per test-migration plan Bucket A). Don't retire
  until the test pyramid migrates *or* until in-memory rusqlite
  becomes the test backend (post-v0.250.0 follow-up). For now: **keep
  but mark as Electron-runtime-only**; retire when the in-memory test
  backend swaps.

- `sqlite-wal` — documents that node-sqlite3-wasm silently ignores
  `PRAGMA journal_mode = WAL`. rusqlite supports WAL natively, but the
  Tauri build deliberately uses DELETE journaling per the original
  plan's tech-stack note (users copy `.db` files; -wal/-shm sidecars are
  a UX footgun). The skill's *recommendation* (use DELETE journaling,
  not WAL) becomes the canonical guidance. **Update**, don't retire:
  rewrite to "DELETE journaling is mandatory; here's why" rather than
  "WAL silently no-ops; here's how to detect it." Move the
  node-sqlite3-wasm-specific failure-mode notes to a "Historical:
  Electron-era constraints" appendix.

- `performance-profiling` — currently documents Electron's CPU
  profile workflow (DevTools → Performance tab on the renderer + main
  process attach). Most of it transfers to Tauri (DevTools still
  works on the webview), but the main-process profile path is
  Electron-specific. **Update** the main-process section to reference
  `cargo flamegraph` or `samply` against the Rust binary.

### New (Tauri-specific skills that should exist)

- `tauri-bridge` — how the renderer talks to Rust. Covers
  `tauri-window-api.ts`'s auto-walk vs polyfill pattern, when to add a
  Rust command vs polyfill in renderer, `invoke()` shape, the
  `dialog_pick` / `fs_read_bytes_base64` / `fs_read_text` / `fs_write_text`
  / `shell_reveal` / `media_pick_and_copy` / `media_read_as_data_url`
  generic commands. Trigger on: editing `tauri-window-api.ts`,
  editing `src-tauri/src/lib.rs`, adding a polyfill that needs fs / dialog.

- `rusqlite-patterns` — rusqlite-side DB patterns: connection lifecycle,
  parameter binding (named vs positional), transaction wrappers, the
  `db_run` / `db_get` / `db_all` / `db_batch` / `db_run_changes`
  command surface in `src-tauri/src/db.rs`. Replaces the
  node-sqlite3-wasm-specific guidance in `sqlite-finalize` once the
  test pyramid migrates.

- `tauri-renderer-polyfill-pattern` (or fold into `tauri-bridge`) —
  the recipe for "I added a `defineChannel` and the auto-walk picks it
  up, but I need fs access". Documents: (1) check whether channel is
  truly `auto`-able; (2) if not, add Rust command in `src-tauri/src/lib.rs`;
  (3) add polyfill in `tauri-window-api.ts`; (4) add row to
  `tauri-channel-coverage.test.ts`.

- `tauri-mcp-bridge` — documents `src-tauri/src/ui_server.rs` (the dev
  MCP HTTP control plane), the `scripts/mcp-tauri.mjs` launcher, and
  how `app_status.dbPath` propagates from the running app to the MCP
  server. Trigger on editing any of those files. Could also fold into
  the updated `slaktforskning-mcp-dev`.

---

## §4 — Legacy code to retire

Files / dirs that exist *only* for the Electron build. Sequencing
matters: nothing can be deleted until §1 has zero `throws` /
`MISSING` / `partial` rows that depend on it.

| Target | Why retire | Risk | Sequencing |
|---|---|---|---|
| `forge.config.ts` | Electron Forge config; replaced by `src-tauri/tauri.conf.json` | None once `npm run package` / `npm run make` are removed from package.json | After Phase 8 cut-mainline |
| `vite.main.config.ts` | Builds Electron main process; no equivalent in Tauri (the host is Rust) | None | After Phase 8 |
| `vite.preload.config.ts` | Builds the contextBridge preload; replaced by `tauri-window-api.ts` (built by `vite.tauri-renderer.config.ts`) | None | After Phase 8 |
| `vite.worker.config.ts` | Builds the DB worker bundle; no DB worker in Tauri | None | After Phase 8 |
| `vite.renderer.config.ts` | Builds the Electron-target renderer bundle; replaced by `vite.tauri-renderer.config.ts` | Used by static SPA dev? **Probe** before deleting — `vite.static.config.ts` may extend it | After Phase 8; verify static SPA still builds |
| `src/main/` (entire dir) | Electron main-process code: `index.ts`, `database.ts`, `db-worker.ts`, `db-worker-state.ts`, `db-worker-broadcast.ts`, `settings.ts`, `preview-html-inject.ts`, `preview-protocol.ts`, `ui-server.ts`, `ipc/*.ts` | High — `preview-html-inject.ts` is consumed by the static SPA per `.claude/rules/renderer.md`. Move that file to `src/api/html_site/` (engine-agnostic) before deleting `src/main/`. Also: `ui-server.ts` is the dev MCP control plane; Tauri's `src-tauri/src/ui_server.rs` replaces it (already shipped per port notes) — verify parity before deletion | After Phase 8; with `src/main/preview-html-inject.ts` moved first |
| `src/preload/index.ts` | Electron contextBridge; replaced by `tauri-window-api.ts` | None once `tauri-channel-coverage.test.ts` is the parity guard | After Phase 8; `preload-coverage.test.ts` retired by test-migration plan |
| `src/main/ipc/*.ts` (all 6 files) | Electron IPC handler registrations | None — all logic delegates to api/ functions; api/ is preserved | After Phase 8; with `src/main/` |
| `src/main/db-worker.ts` + sibling worker-state files | Worker thread for serialised SQLite access; redundant with rusqlite + Tauri async commands | None | After Phase 8; with `src/main/` |
| `src/main/ui-server.ts` | Electron-side dev MCP HTTP control plane | None (parity confirmed via `src-tauri/src/ui_server.rs` exposing same endpoints per port notes) | After Phase 8 |
| `tests/unit/preload-coverage.test.ts` | Asserts every registry channel is in `src/preload/index.ts` | None — replaced by `tauri-channel-coverage.test.ts` per test-migration plan Bucket B | When test-migration plan executes |
| `tests/unit/ipc-worker-coverage.test.ts` | Worker-thread routing assertion | None — Tauri has no worker thread | When test-migration plan executes |
| `tests/unit/main-thread-responsive-during-import.test.ts` | Asserts heavy imports stay on `thread: 'worker'` | None — `thread:` is meaningless in Tauri | When test-migration plan executes |
| `tests/unit/worker-broadcast.test.ts` | Asserts `broadcast()` posts to `parentPort` | None — Tauri uses `app.emit()` | When test-migration plan executes |
| `tests/unit/ipc/onboarding.test.ts` | Mocks `electron` for onboarding handler | Replaced by Tauri-side onboarding store test (test-migration plan Task 5) | When test-migration plan executes |
| `tests/unit/static-api-coverage.test.ts` | **Keep** per test-migration plan — runtime-agnostic | None | N/A |
| `.devcontainer/` xvfb shim parts | Electron tests need Xvfb on Linux for headed mode; Tauri needs xvfb too if WebKitGTK runs headed, but the dev container shape is otherwise reusable | Low — only the xvfb startup + Electron-specific `apt` packages. Replace Electron deps (`libgtk-3-0`, `libgbm-dev`, etc.) with Tauri equivalents (`libwebkit2gtk-4.1-dev`, `librsvg2-dev`) | When CI matrix moves to Tauri |
| `src/renderer/empty-stub.ts` + `empty-fs-promises.ts` | Vite aliases that no-op out `node:fs/promises`, `worker_threads`, `child_process` for the Tauri renderer | **Keep** — these aren't Electron-only; they're the bedrock of the Tauri renderer's "no Node fs" guarantee. Audit only when a polyfill in `tauri-window-api.ts` legitimately needs fs (then add Rust command) | N/A |
| `src/renderer/empty-genney.ts` | Vite alias that no-ops out the Genney Java/Docker importer because it can't run in renderer | Retire only when `import:genneyRun` ships via Rust (probably never — Genney needs Docker/Java sidecar) | After Genney import is wired or formally deferred |
| `src/renderer/empty-gazetteers.ts` | Vite alias for `bundled.ts`; per port notes shipped with `import.meta.glob` to bundle 72 gazetteers | **Keep** — this is the Tauri-specific gazetteer loader, not Electron legacy | N/A |
| `node-sqlite3-wasm` npm dependency | The WASM SQLite binding | High — still used by every vitest unit test (test-migration plan Bucket A). Cannot retire until the test backend swaps to in-memory rusqlite. **Keep through v0.250.0**, retire as a follow-up plan |
| `electron`, `electron-forge` + makers, `electron-squirrel-startup` | npm dependencies | None once Phase 8 lands and binaries stop building from these | After Phase 8 |
| `package.json` scripts: `start`, `package`, `make` | Electron Forge entry points | None — replaced by `tauri:dev`, `tauri:build`, plus Phase 8 should rebind `start` to `tauri:dev` | At Phase 8 |

### Sequencing summary

1. **Before v0.250.0 cut:** §1 gap-closing (no `throws` / `MISSING`),
   test-migration plan executes (retires the 5 Electron-only test files,
   adds the 2 Tauri-specific ones), `tauri-channel-coverage.test.ts`
   gating CI.
2. **At Phase 8 (cut v0.250.0):** package.json `start` → `tauri:dev`,
   `package` / `make` → `tauri:build`. Electron build stays runnable from
   archived scripts for one release cycle in case rollback is needed.
3. **After 2-4 weeks of stable Tauri mainline:** delete `src/main/`,
   `src/preload/`, `forge.config.ts`, `vite.main/preload/worker.config.ts`,
   electron-* npm deps. Skills retired per §3. `node-sqlite3-wasm`
   stays until in-memory rusqlite test backend lands.

---

## §5 — Distribution + release

The original plan's Phases 5 / 7 / 8 / 9 are largely *not done*. This
section enumerates them with the precision missing from the running
notes.

### MCP sidecar packaging (original Phase 5, Task 18)

Currently: `scripts/mcp-tauri.mjs` spawns `npx tsx src/mcp/server.ts`.
Works in dev because Node + `tsx` are on PATH. Fails for users without
Node (most genealogists).

The original plan recommends option (a): bundle Node + MCP source as a
Tauri sidecar via `bundle.externalBin` + `@yao-pkg/pkg`.

- **Effort:** M. ~1-2 days to set up the `pkg` build pipeline producing
  `mcp-server-<triple>` per OS, add to `tauri.conf.json` `bundle.externalBin`,
  update `src-tauri/src/mcp.rs` to spawn the sidecar binary instead of
  `npx tsx`, smoke-test on each OS.
- **Verification:** External `claude` CLI connects via `.mcp.json` to
  the sidecar. `tools/list` returns ≥ 34 prod tools. One representative
  tool round-trips a write.
- **Release-blocker?** Yes for MCP users. The user goal explicitly
  includes "MCP-driven agent workflows still work."

### Code signing (original Phase 1 Task 3 + Phase 4 stretch)

- **macOS:** Apple Developer ID notarization. Tauri 2 supports via
  `tauri.conf.json` `bundle.macOS.signingIdentity` + `tauri-action`
  GitHub workflow notary integration. Reuse existing Developer ID cert.
  - Effort: S. ~half day if cert + Apple ID app password are already in
    GitHub Secrets.
  - Release-blocker? Yes — unsigned macOS apps trip Gatekeeper.
- **Windows:** Authenticode signing via existing certificate.
  - Effort: S. ~half day.
  - Release-blocker? Yes for Windows users — SmartScreen warning otherwise.
- **Linux:** AppImage signed with project GPG key.
  - Effort: S. ~few hours.
  - Release-blocker? Soft-yes — many distros warn on unsigned AppImages.

### Auto-update (original Phase 4 Task 17)

`tauri-plugin-updater` + update manifest hosted on GitHub Releases.

- **Effort:** M. ~1 day to wire the plugin, generate signing keys, host
  the manifest, write the in-app updater UI (dialog: "Update available
  → Download → Apply").
- **Verification:** Build 0.250.0, build 0.250.1, install 0.250.0,
  observe in-app updater detect + download + apply 0.250.1 on each OS.
- **Release-blocker?** Soft. Users can manually re-download from the
  releases page if the in-app updater isn't ready. But given the user
  goal explicitly says "Auto-update lands the next version
  transparently", call it a release-blocker.

### Native menus + window management (original Phase 4 Task 14)

Currently: Tauri default menu bar (generic). Cmd+N second window not
wired.

- **Effort:** M. ~1-2 days. `tauri::menu::MenuBuilder` for File / Edit /
  View / Window / Help. Localization (Tauri menus support per-item
  labels — wire i18n keys). Cmd+N → `WebviewWindowBuilder`.
- **Release-blocker?** Soft for menus. Hard for Cmd+N — multi-window is
  a documented workflow (per `CLAUDE.md` "Each `BrowserWindow` runs an
  independent Vue app … New windows: `Cmd+N` / `Ctrl+N`.").

### Cross-platform smoke (original Phase 7 Task 22)

Per running notes, user has confirmed Windows builds work this session.
Linux unverified.

- **Effort:** M. Half day per OS to run the 10 highest-traffic UI flows
  (open person, edit, save, search places, generate report, export
  GEDCOM, import GEDCOM, etc.) and capture metrics into the original
  plan's Verification table.
- **Release-blocker?** Yes. The recommendation's percentage-improvement
  thresholds (≥50% disk, idle RAM, loaded RAM, cold start, list scroll)
  must be validated on each OS before cut.

### Beta tester rollout (original Phase 7 Task 23)

`0.250.0-tauri.0` pre-release sent to existing beta testers (per
memory: Bengt + Ben, with Ben specifically being the Holger 8 reference
user). **Bengt is the user; Ben is the beta tester with limited vision
who uses Holger 8 as reference.**

- **Effort:** S to send. Variable to fix what comes back.
- **Release-blocker?** Yes — but per the user goal, "Their existing
  GEDCOM imports round-trip the same way they do today" implies we
  cannot cut v0.250.0 with `holgerRun` throwing. So either:
  - (a) Wire Holger import before cut, OR
  - (b) Defer Tauri release until Holger ships, OR
  - (c) Keep Electron `0.249.x` available through `0.250.0-tauri.0`
        pre-release period and only cut mainline after Holger ships.
  Recommendation: (c). Ship a transitional pre-release; don't promote
  to mainline until §1 has zero blockers for Holger users.

### Cut mainline 0.250.0 (original Phase 8 Task 24)

- Bump `package.json` to `0.250.0`.
- Replace `start` script: `"start": "tauri dev"`.
- Replace `package` / `make` scripts: `"package": "tauri build"`,
  `"make": "tauri build"` (keep the names so npm scripts in CI still
  work, but they now invoke Tauri).
- Update `CHANGELOG.md` with the headline message from the original
  plan: "Slaktforskning is now built on Tauri. Same app, dramatically
  lighter — installer is N MB (was 280 MB), idle memory is M MB (was
  400-500 MB), and the app launches near-instantly on older laptops.
  Your data, your imports, your agent workflows are unchanged."
- Tag, push, attach signed binaries to GitHub Release.
- Update README install paths.

### Archive Electron infrastructure (original Phase 9 Task 25)

After 2-4 weeks of stable Tauri mainline (no rollback): retire the
files in §4 that depend on Phase 8. Document the Electron archive in
`docs/plans/archive/` so historical context isn't lost.

---

## §6 — Sequencing + effort estimate

Group into "must-do for v0.250.0" (the tauri-only mainline cut) vs
"post-launch follow-up." Effort: S = ≤ 1 day, M = 2-5 days, L = 1+ week.

### Must-do for v0.250.0

| # | Item | Effort | Source | Notes |
|---|---|---|---|---|
| 1 | Wire Holger import (`import:holgerRun`) | L | §1 | Blocker for Ben (primary beta tester) and any Holger user. Needs Rust command for `.mdb` extraction (mdbtools or native crate) + sqlite-on-sqlite import. **Or** stay on Electron until this lands |
| 2 | Wire RootsMagic import | M | §1 | Sqlite-in-sqlite. Less involved than Holger but same shape |
| 3 | Wire Genney import (.gcc + .backup paths) | L | §1 | Genney `.gcc` needs zip extraction + sqlite-on-sqlite. `.backup` needs Java sidecar (or Rust port of the Derby reader) |
| 4 | Wire archive `.zip` export + import | M | §1 | Refactor `api/archive_*.ts` to thread fs read/write callbacks, OR add Rust `archive_*` commands. Blocker for offline backup workflow |
| 5 | Add missing media polyfills (`openFile`, `thumbnailDataUrl`, `createFromFile`) | M | §1 | Media library view crashes without them. `thumbnailDataUrl` needs a Rust thumbnail-generation command (`image` crate is already in Cargo.toml) |
| 6 | Wire `backup.backup` / `backup.restore` | S | §1 | Settings → Backup buttons. Trivial — file copy with `dialog_pick` + `fs_*` commands |
| 7 | Wire `chart.saveSvg` / `chart.savePdf` | S | §1 | Reports view "Save SVG" + "Save PDF" buttons |
| 8 | Fix `app.getVersion` (read from `tauri.conf.json` via `invoke('app_version')`) | S | §1 | Settings → About shows wrong version |
| 9 | Wire `app.readThirdPartyLicenses` | M | §1 | License compliance. `scripts/build-third-party-licenses.mjs` adapted to walk `Cargo.lock` too; renderer reads via Rust command or bundled asset |
| 10 | Wire `db.onSwitched` event | S | §1 | Renderer subscribers exist; polyfill must emit |
| 11 | Wire `undo.onChanged` / `undo.onPerformed` events | S | §1 | Toolbar enabled-state + toast on undo |
| 12 | Wire `onboarding.getSeen` / `onboarding.markSeen` | S | §1 | Polyfill via db_settings (the `reset` polyfill already does this) |
| 13 | Add `import.holgerSelectMedia` polyfill | S | §1 | Even if Holger run is deferred, the picker step shouldn't crash |
| 14 | Wire `website.buildPreviewHtml` (preview thumbnail baker) | M | §1 | Needs Rust thumbnail command. Critical for Website export preview iframe |
| 15 | Confirm `db.getRecent` (recent files list) shape | S | §1 | Polyfill via Tauri-side store (`tauri-plugin-store`) or db_settings |
| 16 | Confirm `print.exportPdf` regression is acceptable, or wire Rust PDF | M-L | §1 | Acceptable if documented; ideal fix uses `printpdf` Rust crate or chromium-pdf sidecar |
| 17 | MCP sidecar packaging | M | §5 | `@yao-pkg/pkg` builds Node binaries; bundle via `tauri.conf.json` `bundle.externalBin`; `mcp.rs` spawns sidecar |
| 18 | Code signing: macOS + Windows + Linux | M | §5 | Reuse existing certs; `tauri-action` integration |
| 19 | Auto-update plugin + manifest | M | §5 | `tauri-plugin-updater`, GitHub Releases-hosted manifest, in-app updater UI |
| 20 | Native menu bar (File / Edit / View / Window / Help) + Cmd+N second window | M | §5 | `tauri::menu::MenuBuilder` + `WebviewWindowBuilder` |
| 21 | Cross-platform smoke (macOS + Windows + Linux) | M | §5 | 10-flow walk; capture metrics |
| 22 | Test migration plan executes | M | §2 | Per `2026-05-10-tauri-test-migration.md`. Particularly Bucket D `tauri-channel-coverage.test.ts` |
| 23 | Beta tester rollout (`0.250.0-tauri.0` pre-release) | S to ship; variable to address feedback | §5 | Bengt + Ben |
| 24 | Cut mainline `0.250.0` (package.json scripts + CHANGELOG + tag) | S | §5 | After all blockers cleared |

**Estimated total: 6-8 weeks** of focused work, matching the original
plan's revised estimate. The unknowns are #1 (Holger), #3 (Genney), and
the volume of beta-tester feedback.

### Post-launch follow-up (post-v0.250.0)

| # | Item | Effort | Notes |
|---|---|---|---|
| 25 | Skills audit per §3 (update + retire + new skills) | S | One concentrated session |
| 26 | Archive Electron infrastructure per §4 (delete `src/main/`, `src/preload/`, vite configs, electron deps) | S | After 2-4 weeks of stable Tauri mainline |
| 27 | Migrate vitest test backend from `node-sqlite3-wasm` to in-memory rusqlite | L | Unblocks `node-sqlite3-wasm` removal + `sqlite-finalize` skill retirement |
| 28 | Migrate Playwright e2e to Tauri binary | M | Already covered by `2026-05-10-tauri-test-migration.md` Task 1-3 — duplicate, drop if that plan ships first |
| 29 | Native PDF rendering (Rust-side) for `print.exportPdf` with research-name headers | L | Replaces the `window.print()` workaround |
| 30 | Genney Java/Docker importer (if not in #3) | L | If `.backup` path can't be read in pure Rust, ship a Java sidecar similar to MCP sidecar |
| 31 | New `tauri-bridge` + `rusqlite-patterns` + `tauri-mcp-bridge` skills | S | Per §3 |
| 32 | `app_status.dbPath` auto-follows running app's DB switch | S | Per port notes "Points to revisit #1" — currently stale until Claude restart |
| 33 | `chart_*` dev MCP tools wired via `__chartBridge` global + `/eval` | S | Per port notes "Points to revisit #2" |

---

## Tasks discovered during execution

(Empty until execution starts. Per `.claude/rules/plans.md`: if this
section grows past 5 entries the plan's scope was wrong — pause and
re-edit, don't push through.)

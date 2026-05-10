# Tauri Port — Working Notes

Running scratchpad of decisions made + things to revisit. Curated as I go so the next session (or the user, when they return) can pick up cold.

## Current state — what works end to end

- Persistent rusqlite DB at `~/Library/Application Support/com.slaktforskning.tauri-spike/family.db` (DELETE journaling, no -wal/-shm sidecars). Verified by user: persons + citations write + survive restart.
- **72 gazetteers loaded** in the renderer via `import.meta.glob('./data/*.json', { eager: true })` baked into the bundle by Vite (in `src/renderer/empty-gazetteers.ts`, which is the alias the tauri-renderer config points at when `bundled.ts` is imported). Country chips on /places, place picker suggestions, gazetteer-resolved coords all functional.
- Vue renderer mounts via Tauri webview with **all 22 sidebar routes loading**. CRUD goes through `db-shim → invoke('db_run|db_get|db_all|db_batch') → rusqlite`.
- File dialogs wired for **db.openExisting / db.createNew / db.switchTo / db.getCurrent**. UI's Settings → Database tab + Cmd+O work.
- Media attach: file picker + `<dbname>-media/` copy via Rust `media_pick_and_copy`; renderer-side override calls `media.createMedia` + `media.addMediaLink` from `src/api/`.
- `media.readAsDataUrl` works via Rust `media_read_as_data_url` (file → base64 data URL with mime sniff from extension).
- Dev MCP UI server on **port 19241** (axum + tokio in Rust). Endpoints: `/`, `/status`, `/db_path`, `/screenshot`, `/navigate`, `/reload`, `/click`, `/fill`, `/dom`, `/query_styles`. Mirrors the Electron build's `src/main/ui-server.ts` exactly so `slaktforskning-dev` MCP works unchanged.
- `/dom` supports `mode={outerHTML,innerHTML,textContent,attributes}` + `all=true` + `limit`, matching the Electron version's full surface.
- Screenshot uses `xcap` crate (ScreenCaptureKit on macOS). One-time Screen Recording grant for the bundled .app sticks across rebuilds.
- `scripts/mcp-tauri.mjs` is a launcher that asks the running app for its current DB path on startup (via `/db_path`) and points the MCP at it. Falls back to the Tauri spike's default if app isn't running.
- Live-reload dev loop via `npm --prefix tauri-spike run tauri dev` — Vite HMR for renderer, ~3 s incremental Cargo for Rust changes. Massive speedup over the previous `pkill+build+open` cycle.

## Active blockers / in-progress

- *(none right now)*

## Polyfills shipped this session

The Tauri-side `src/renderer/tauri-window-api.ts` now overrides every Electron main-only IPC channel that the renderer actually calls:

- `db.{getCurrent, getRecent, openExisting, createNew, switchTo}` — Tauri dialog + rusqlite reopen
- `media.{attach, readAsDataUrl, getFilePath}` — Rust file picker + bytes → DB insert via `media.createMedia`
- `checks.{runAll, forPerson, forPlace, forMedia, runForEvent, cancel}` — calls `api/checks` directly (cancellation is a no-op for now; re-runs are fast on in-process rusqlite)
- `undo.{undo, redo}` — calls `undoManager` + fires `data:changed` (state/beginGroup/endGroup come from the registry)
- `gedcom.selectFile` — file picker
- `gedcom.export` — pending, see deferred list
- `import.{genneyCheckDocker, genneySelectDerby, genneySelectArchive, genneySelectMedia, holgerSelectFile, rootsmagicSelectFile, grampsSelectFile}` — file/folder pickers
- `archive.{export, import}` — file pickers (the actual zip build/extract is deferred)
- `csv.export` — file picker (the actual CSV build is deferred)
- `export.openFolder` — `shell_reveal` to OS file manager

Generic Rust commands wired for these: `dialog_pick({ kind, title, extensions, defaultName })`, `fs_read_text`, `fs_write_text`, `fs_read_bytes_base64`, `shell_reveal`, `media_pick_and_copy`, `media_read_as_data_url`, `default_db_path`, `db_current_path`, `db_pick_existing`, `db_pick_new`.

UI-server endpoints added beyond the Electron parity set: `/eval` (run an arbitrary script + return its value), `/console` (drain captured console buffer). The renderer's `main.ts` wraps `console.{log, warn, error, info}` + `window.error` + `unhandledrejection` into a 500-entry ring buffer that `__taurisConsole.drain()` returns.

## Points to revisit (deferred but real)

### MCP / dev tooling

1. **`app_status.dbPath` is stale until Claude restart.** It comes from the prod MCP server's local `getDbPath()` (set on MCP startup from `SLAKTFORSKNING_DB`). After a Claude Code restart with the new launcher (`scripts/mcp-tauri.mjs`), it'll auto-align. But if the user switches DB in the running app (Settings → Database → Open existing), the MCP doesn't follow until the next restart. **Fix:** either (a) make `slaktforskning-dev` poll `/db_path` and call `switch_database` when it changes, or (b) replace `app_status` with one that proxies the live `/status` endpoint instead of using the MCP's own state.

2. **`chart_*` dev MCP tools not wired.** They use `win.webContents.send('chart:focusPerson', replyChannel, body)` + `ipcMain.once(replyChannel, …)` in Electron, which has no Tauri equivalent yet. Need a renderer-side `__chartBridge` that the UI server can `eval` against (similar to the eval/response pattern already in place). Defer until first time we need to debug a chart layout.

3. **`/export_pdf` not wired.** Electron uses `win.webContents.printToPDF`. Tauri has no built-in PDF export. Options: (a) `printpdf` Rust crate against an HTML→DOM serialization, (b) launch a headless Chrome via `chromium-pdf`, (c) defer to user-driven `window.print()` + Save as PDF in the print dialog. Probably (c) is the right call — it's what Tauri apps generally do.

### App functionality

4. **Import/export RUN handlers (gedcom:import, import:genneyRun, import:holgerRun, import:rootsmagicRun, import:grampsRun, archive:import, archive:export, csv:export, gedcom:export, website:exportRun).** All currently in the channel registry but their handlers `import * as fs from 'node:fs'` then read the chosen path synchronously — fails because the Tauri renderer polyfilled `node:fs`. Two fixes per importer: (a) pull `readFileSync(path)` calls behind a `readFileText(path)` shim that delegates to `invoke('fs_read_text')` in Tauri / sync `fs` in Electron; (b) replace `fs.cpSync` for media folders with a Rust `media_bulk_copy` command. The picker side (which `selectFile()` channel returns the path) is already wired.

5. *(gazetteer loading: SHIPPED this session via import.meta.glob — see "Polyfills shipped this session")*

6. **Leaflet `_initContainer` unhandledrejection** fires on /places mount. Map still renders + pin still shows; cosmetic. Likely a watch firing twice on Tauri's webview slower paint. Defer to dom-first-debugging when someone notices.

7. **`Cmd+N` second window** — `WebviewWindowBuilder` exists but no menu accelerator wired. Multi-window data:changed sync (Tauri equivalent of Electron `BrowserWindow.send`) needs renderer-side `@tauri-apps/api/event` subscription on each window.

8. **Native menu bar** — `tauri::menu::Menu`. Not wired. Default menu bar from Tauri is generic.

9. **Print / PDF export** — Tauri 2 has no `webContents.printToPDF` equivalent. Options: (a) `window.print()` + native print dialog Save-as-PDF, (b) embed a Chromium-headless-PDF binary as sidecar. Defer (a) is fine for now.

10. **`fileURLToPath` on `tauri://` URLs throws.** `bundled.ts` does this at module init in Node mode; vite-tauri-renderer aliases it out. Other files that do similar dance (`empty-genney.ts` aliased for the same reason): keep the pattern documented so the next module-init fs/url access doesn't quietly start crashing.

6. **`Cmd+N` for second window** — Tauri has `WebviewWindowBuilder`; need to register an accelerator + handler. The first-window already has `__TAURI_INTERNALS__` detection wiring window.api on mount; the second window will too.

7. **Native menu bar** — Tauri 2 has `tauri::menu::Menu` with localized labels. Need to wire File / Edit / View / Window menus matching Electron's set, plus the i18n keys.

8. **Multi-window data sync** — when one window mutates, the other window's `useEntityData` / `usePagedList` need to re-fetch. Electron does this via `BrowserWindow.send('data:changed')` from main → all windows. Tauri equivalent: `app.emit('data:changed', payload)` on every mutating channel; renderer listens via `@tauri-apps/api/event`.

9. **Auto-update + signing.** Tauri has `tauri-plugin-updater` + signing config in `tauri.conf.json`. Defer until we cut the first 0.250.0 release.

10. **MCP sidecar packaging.** Currently spawns `npx tsx src/mcp/server.ts` via shell (works in dev because Node + tsx are available). For a packaged distribution, need to bundle a Node binary + the MCP source as a Tauri sidecar (`bundle.externalBin`). The existing `tauri-spike/src-tauri/src/mcp.rs` proves the spawn pattern.

### Build / quality

11. **Vite config has node-polyfill stubs** for `fs/promises`, `worker_threads`, `child_process` (in `src/renderer/empty-fs-promises.ts` + `src/renderer/empty-stub.ts`). These throw if reached at runtime — meaning code paths that legitimately want fs (genney importer, media_consolidate) need their fs work moved to Rust commands. Audit: grep `from 'node:fs'` and `from 'fs/promises'` across `src/api/` + `src/import/` and trace which paths the Tauri build actually exercises.

12. **`fileURLToPath` polyfill?** Several gazetteer files in `src/api/place-gazetteers/` use `fileURLToPath(import.meta.url)` to find their gz sidecars. Need to verify this works in the Vite-bundled renderer (probably does since `node:url` polyfilled).

13. **Vitest + Playwright suites still target the Electron build.** Migration is Phase 6 of the plan. Until then, `npm test` and `npm run test:e2e` still drive the old build paths.

14. **`tauri-spike/` directory layout.** Plan called for collapsing this into a top-level `src-tauri/` once the spike graduates. Keep deferring until the spike is functionally complete; renaming on every rebuild is churn.

## Quick reference

- Live-reload dev loop: `cd tauri-spike && npm run tauri dev` (logs to /tmp/tauri-dev.log if backgrounded).
- Build a release `.app`: `npm --prefix tauri-spike run tauri build -- --bundles app`.
- Renderer build only: `npx vite build --config vite.tauri-renderer.config.ts`.
- DB lives at `~/Library/Application Support/com.slaktforskning.tauri-spike/family.db`.
- MCP launcher: `node scripts/mcp-tauri.mjs prod|dev` (registered in `.mcp.json`).

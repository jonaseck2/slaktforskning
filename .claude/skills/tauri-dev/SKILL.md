---
name: tauri-dev
description: Launch, debug, and verify the Tauri app during development. Use when testing UI changes, debugging the renderer or Rust host, verifying a build, or asking how to inspect the running app. Covers `npm start`, the bundle build, the dev MCP UI bridge port, and where logs land.
---

# Tauri Dev Skill

## ⚠️ Implementing Tauri features

This skill covers **running** the Tauri app. For **wiring** anything new through Tauri's bridge — plugins, Rust commands, capabilities — see `/tauri-bridge`, which opens with a hard rule: Tauri 2 is post-cutoff for most models, so **WebFetch `https://v2.tauri.app/plugin/<name>/` before implementing** rather than guessing from training data. Reach for the plugin's `@tauri-apps/plugin-<name>` JS wrapper before raw `invoke('plugin:foo|bar')` — the wrapper is where progress channels, stateful objects, and typed responses live. An unused `@tauri-apps/plugin-*` dep in `package.json` is a smell.

## Launching the app

### Dev mode (with HMR)

```bash
npm start
```

This starts:
1. Vite dev server for the renderer on the default port (binds to whatever `vite.tauri-renderer.config.ts` chose; HMR is automatic).
2. `cargo build` for the Rust host. First build takes 3–5 minutes; **incremental builds on Rust-side edits take ~3 seconds**.
3. The Tauri webview window with DevTools auto-open in dev profile.

If you backgrounded the dev loop, logs land in `/tmp/tauri-dev.log` (per the launcher convention used in this repo). Tail to follow Rust + Vite output simultaneously:

```bash
npm start > /tmp/tauri-dev.log 2>&1 &
tail -f /tmp/tauri-dev.log
```

### Release / packaged build

```bash
# Raw binary only (fastest — used for e2e and quick verification)
npm run build:bin

# Full bundle for the current platform (.app + .dmg on macOS, NSIS .exe on Windows, .AppImage on Linux)
npm run build
```

The output goes to `src-tauri/target/release/bundle/`. To test what the user sees, copy the bundled `.app` to `/Applications` (or run it in place from `target/`) — the dev binary uses different bundle identifiers and storage paths from the release binary, so testing the bundle directly is the only way to verify production paths.

### Renderer build only (no Rust)

When you want to confirm the bundled JS looks right without sitting through a Cargo rebuild:

```bash
npx vite build --config vite.tauri-renderer.config.ts
```

Output lands in `dist-tauri/`.

## Live database path

The running app's current rusqlite-open DB path is exposed by the dev MCP HTTP bridge:

```bash
curl http://127.0.0.1:19241/db_path
# → {"path":"/Users/.../io.github.jonaseck2.slaktforskning/family.db"}
```

Useful when:
- The MCP server's `app_status.dbPath` is stale (it's set at MCP startup; if the user switched DB after that, this curl returns the live truth).
- You want to inspect the live DB with the `sqlite3` CLI without touching the running app.

The default DB lives at `~/Library/Application Support/io.github.jonaseck2.slaktforskning/family.db` on macOS. (Earlier dev builds used `com.slaktforskning.app/` — manually `mv` that folder to the new path if you have data there.)

## The dev MCP UI bridge

Port **19241** (configurable via `SLAKTFORSKNING_UI_PORT`) hosts a small HTTP control plane (`src-tauri/src/ui_server.rs`, axum + tokio) used by the `slaktforskning-dev` MCP tools. This is **unchanged** by the 2026-05-14 kkrpc + Bun sidecar migration — kkrpc only replaces the *production* MCP sidecar spawn pattern (`bun server.bundle.mjs`). The dev MCP bridge stays as-is. Endpoints:

| Path | Method | Purpose |
|---|---|---|
| `/` | GET | Health check (returns `{"ok":true}`). |
| `/db_path` | GET | Current rusqlite-open DB path (used by `scripts/mcp-tauri.mjs` on MCP startup). |
| `/eval` | POST | Run a JS expression in the renderer, return its value. The dev MCP tools build their behaviour on top of this. |
| `/screenshot` | POST | Native window capture via the `xcap` crate (ScreenCaptureKit on macOS — requires a one-time Screen Recording grant). |

This is the irreducible bridge — every other dev MCP tool (`ui_click`, `ui_navigate`, `ui_get_dom`, `chart_*`) is built in JS and shipped via the script-injection endpoint. See `/slaktforskning-mcp-dev` for the bridge architecture and the recipe for adding new dev tools.

## DevTools

DevTools auto-open in dev mode. Vue component errors and `console.error` from the renderer show up in the DevTools console — same as in any Chromium-family webview. The Tauri renderer also wraps `console.{log,warn,error,info}` + `window.error` + `unhandledrejection` into a 500-entry ring buffer (`__taurisConsole`); the dev MCP's `ui_console` tool drains it via the script-injection endpoint.

## UI verification workflow

Before committing UI changes, verify they work in the running app:

1. Ask the user to launch the app: `npm start`.
2. Use the native `mcp__slaktforskning-dev__ui_*` tools for navigation, screenshots, IPC.
3. For deep DOM/SVG introspection (`getBoundingClientRect()`, `elementFromPoint()`, computed path geometry), use `ui_eval` with a script — the renderer evaluates it and returns the result. The Chrome DevTools MCP plugin no longer applies in the Tauri build (it spawned its own browser; not connected to the Tauri webview).
4. Ask the user for visual confirmation if tools are unavailable.

**Never `pkill -f Tauri` or `pkill -f slaktforskning`** — this kills the user's running instance. Kill only the specific PID you started.

**Mutations to `window.api.*` or other module-scope state inside `ui_eval` leak across `location.reload()`.** Vite keeps the ES-module cache through soft reloads, so a `delete window.api.app.foo` or a stubbed `window.api.x.y = …` you set to walk a code path stays gone (or stays stubbed) on the next page render — even though the source on disk is untouched. Symptom: polyfill keys missing after reload, or stubs persisting between probes. To restart the renderer cleanly, do a fresh URL navigation that re-imports `main.ts` from scratch:

```js
window.location.href = '/?bust=' + Date.now() + '#/';
```

`location.reload()` is not enough. This matters anytime you're verifying a change to the `tauri-window-api.ts` polyfill or any composable that holds module-scope state.

## Architecture reference

```
npm start
  └─ tauri-cli
       ├─ Vite dev server (renderer) → file:// inside webview, HMR over WS
       ├─ cargo build → src-tauri/target/debug/slaktforskning
       └─ Tauri host process
            ├─ axum dev MCP bridge on :19241 (src-tauri/src/ui_server.rs)
            ├─ rusqlite global Connection (src-tauri/src/db.rs)
            ├─ Generic Rust commands (src-tauri/src/lib.rs)
            │    db_open / db_close / db_run / db_get / db_all / db_batch
            │    dialog_pick / fs_read_text / fs_write_text / fs_read_bytes_base64
            │    shell_reveal / media_pick_and_copy / media_read_as_data_url
            │    default_db_path / db_current_path / db_pick_existing / db_pick_new
            └─ WebviewWindow → Vue 3 app
                 ├─ tauri-window-api.ts mounts window.api.* via registry auto-walk
                 ├─ db-shim.ts proxies node-sqlite3-wasm-shaped calls into invoke('db_*')
                 └─ Vue + Pinia + Vue Router as in any web app
```

**IPC call path:** `window.api.persons.list()` → `tauri-window-api.ts` registry walk → channel handler in `src/api/persons.ts` → `db-shim` `prepare/all/get/run` → `invoke('db_all', { sql, params })` → Rust `db_all` → rusqlite → result back through the same chain.

## Common issues

**Cargo rebuild on every dev start:** if `cargo build` is recompiling the world every time you `npm start`, your `target/` cache was nuked or the dependency graph changed. Normal incremental rebuilds touch only your edited files (~3 seconds). If the first build takes longer than 5 minutes, you're on a fresh checkout — that's expected, the dependency tree is large.

**Webview blank on launch:** check `/tmp/tauri-dev.log` for Vite errors first (the renderer bundle didn't build), then for Rust panics (the host crashed before opening the window).

**`fileURLToPath` throws in the renderer:** `tauri://` URLs aren't `file://`; modules that call `fileURLToPath(import.meta.url)` at module-init time need to be aliased out via `vite.tauri-renderer.config.ts` (see `src/renderer/empty-genney.ts` for the pattern).

**Leaflet `_initContainer` rejection on /places mount:** known cosmetic issue — the map still renders. Likely a watch firing twice on the slower WebKitGTK paint. Defer until investigated.

**Screen Recording prompt on first `/screenshot` call:** macOS asks once per signed bundle. After granting, the permission survives rebuilds because the bundle identifier is stable.

## Config files

| File | Purpose |
|---|---|
| `src-tauri/tauri.conf.json` | Tauri config — bundle identifier, window size, allowlist, security CSP. |
| `src-tauri/Cargo.toml` | Rust dependencies — rusqlite, axum, tokio, xcap, etc. |
| `src-tauri/src/lib.rs` | Tauri command registration (the `invoke_handler!` block). |
| `src-tauri/src/db.rs` | rusqlite global connection + the 5 SQL primitives. |
| `src-tauri/src/ui_server.rs` | Dev MCP HTTP bridge. |
| `vite.tauri-renderer.config.ts` | Renderer build for the Tauri webview — aliases out `node:fs`, `worker_threads`, etc. |

## Adding new IPC bindings

There is no channel registry (the Electron-era `src/shared/channels/` + `defineChannel()` pattern was deleted in the Specta migration). `mountWindowApi()` in `src/renderer/tauri-window-api.ts` binds every `window.api.<domain>.<method>` explicitly: mutations wrap their `src/api/*` handler in `mutating()` (fires `data:changed` after resolve), reads wrap in `readOnly()`. Rust-backed commands come from the Specta-generated `src/renderer/bindings.ts`. See `/add-feature` IPC Layer and `/tauri-bridge` for when a binding needs a Rust command.

Coverage tests catch any miss:
- `tests/unit/tauri-window-api.test.ts` — bindings exist on `window.api` and dispatch to the right Rust commands
- `tests/unit/static-api-coverage.test.ts` — every renderer-callable surface has a stub in the static SPA api

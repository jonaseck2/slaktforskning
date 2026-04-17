---
name: electron-dev
description: Launch, debug, and verify the Electron app during development. Use when testing UI changes, debugging IPC issues, or verifying the app works.
---

# Electron Dev Skill

## Launching the App

### Dev mode (with HMR)
```bash
npm start
# or equivalently:
npx electron-forge start
```

This starts:
1. Vite dev server for renderer on port 5173
2. Vite builds for main process and preload
3. Electron app window with DevTools auto-open

### Packaged build (test what users get)
```bash
npm run package    # Build .app / .exe (no installer)
npm run make       # Build distributable installer
```

## Quick Launch & Verify

To verify the app launches and IPC works (non-interactive):
```bash
timeout 15 npx electron-forge start 2>&1 || true
```
Look for:
- `Launched Electron` — app window opened
- `[IPC] persons:list → OK` — preload + IPC working
- No `ENOENT` or `Cannot find module` errors

## Debugging

### IPC debug logging
All IPC handlers in `src/main/ipc.ts` use `wrapHandler()` which logs:
- `[IPC] channel [args]` — request received
- `[IPC] channel → OK` — success
- `[IPC] channel → ERROR` + stack — failure

These print to the main process stdout (terminal where `npm start` runs).

### DevTools
DevTools auto-open in dev mode (`src/main/index.ts` calls `win.webContents.openDevTools()`).
Vue component errors and `console.error` from renderer show up in the DevTools console.

### UI Interaction Tools

Two MCP tool sets are available for interacting with the running app. **Prefer native tools, fall back to Chrome DevTools.**

#### Native MCP tools (`mcp__slaktforskning__ui_*`) — preferred

These run inside the Electron main process with direct access to the app's state, database, and IPC.

| Tool | Use for |
|------|---------|
| `ui_navigate(path)` | Vue Router navigation (handles hash-based routes correctly) |
| `ui_screenshot` | Capture full Electron window |
| `ui_get_dom` | Get DOM as the app sees it |
| `ui_click(selector)` | Click via CSS selector |
| `ui_execute_js(code)` | Run JS with access to `window.api` (can call IPC directly) |

**When to use:** Navigation, screenshots, reading app state, triggering IPC calls, checking data.

#### Chrome DevTools MCP (`chrome-devtools-mcp`) — complementary

**Setup:** The user launches the app with CDP enabled via `scripts/dev-debug.sh`:
```bash
./scripts/dev-debug.sh              # CDP port 9222, UI server port 19241
./scripts/dev-debug.sh 9223 19242   # Custom ports for parallel instances
```
This sets `SLAKTFORSKNING_CDP_PORT` which the main process reads at startup to call `app.commandLine.appendSwitch('remote-debugging-port', port)` — a documented Electron API for enabling Chrome DevTools Protocol.

**Important:** The user must run this from their **own terminal** — Electron GUI apps need macOS window server access and cannot be launched from Claude Code's background shell. Use `./scripts/verify-cdp.sh` or `curl -s http://127.0.0.1:9222/json/version` to confirm the connection before using CDP tools.

**Parallel subagent support:** Each instance uses a different CDP port + UI server port pair.

Connects via the browser debug protocol. Use for things the native tools can't do well.

| Tool | Best for |
|------|----------|
| `take_snapshot` | A11y tree with uid's (richer than raw DOM) |
| `fill(uid, value)` | Fill inputs — properly triggers Vue v-model reactivity |
| `click(uid)` | Click by a11y uid (more reliable than CSS selectors for dynamic content) |
| `fill_form(elements)` | Fill multiple form fields at once |
| `list_console_messages` | Read console errors without switching windows |
| `performance_start_trace` / `stop` / `analyze_insight` | CPU profiling without code instrumentation |
| `list_pages` / `select_page` | Switch between Electron windows |
| `press_key(uid, key)` | Simulate keyboard input |

**When to use:** Filling form inputs (native `ui_execute_js` doesn't trigger Vue reactivity reliably), a11y auditing, performance tracing, reading console errors.

**Workflow: take snapshot → interact → screenshot**
```
1. take_snapshot          → get a11y tree with uid's
2. fill(uid, value)       → fill an input
3. click(uid)             → click a button
4. ui_screenshot          → visual verification (native, captures full window)
```

**Tips:**
- Always `take_snapshot` before `click`/`fill` to get fresh uid's
- Use `list_pages` + `select_page` if the snapshot shows the wrong page (e.g. DevTools instead of app)
- Mix native and Chrome DevTools tools freely — use `ui_navigate` for routing, `fill` for inputs, `ui_screenshot` for verification

### Post-Implementation Verification with chrome-devtools-mcp

After implementing a feature, use `chrome-devtools-mcp` to verify correctness before committing:

**Check for console errors:**
```
list_console_messages()   → look for errors or warnings from your new code
```

**Accessibility audit:**
```
take_snapshot()           → inspect the a11y tree for your new elements
                           → check ARIA roles, labels, focus order
```

**Performance check (if the feature does heavy work):**
```
performance_start_trace() → trigger the expensive operation
performance_stop_trace()  → stop recording
performance_analyze_insight() → identify hot functions and call stacks
```

This catches issues that unit tests miss: unhandled promise rejections, missing ARIA labels, and CPU spikes from N+1 queries in the renderer.

### UI Verification Workflow

**Before committing UI changes, verify they work in the running app:**

1. **Ask the user** to launch the app with CDP: `./scripts/dev-debug.sh`
2. **Verify CDP is active:** `./scripts/verify-cdp.sh` (or `curl -s http://127.0.0.1:9222/json/version`)
3. **Use Chrome DevTools MCP** to interact with the app:
   ```
   list_pages()              → find the app page
   select_page(pageId)       → select it
   take_snapshot()            → get the accessibility tree
   navigate_page(url)         → navigate within the app
   take_screenshot()          → capture the current state
   click(uid)                → click elements
   fill(uid, value)          → fill form inputs
   ```
4. **Verify the change visually and functionally** before committing

**Important macOS limitation:** Electron GUI apps cannot be launched from Claude Code's background shell — they need window server access. Always ask the user to run `./scripts/dev-debug.sh` from their own terminal. Use `./scripts/verify-cdp.sh` to confirm the connection works before attempting Chrome DevTools MCP commands.

**Parallel instances:** Each subagent can have its own instance with unique ports:
```
Terminal 1: ./scripts/dev-debug.sh 9222 19241
Terminal 2: ./scripts/dev-debug.sh 9223 19242
```

**Never `pkill -f Electron`** — this kills ALL Electron apps including the user's main instance. Instead, kill only the specific PID you started.

### Common issues

**Wrong Electron binary (macOS binary in Linux container):**
- Symptom: `Syntax error: "(" unexpected` or `not found` when running `npm start`
- Cause: `node_modules/electron/dist/` contains macOS binaries from the host mount
- Fix: `ensure-native-binaries` (baked into the container image)
- The devcontainer `postCreateCommand` runs this automatically on container creation

**Port 5173 already in use:**
```bash
pkill -f "electron-forge" && pkill -f "Electron" && pkill -f "Släktforskning"
```

**Blank page in packaged app:**
- Renderer build output must land in `<project>/.vite/renderer/main_window/`
- Check `vite.renderer.config.ts` has `outDir: resolve('.vite/renderer/main_window')`

**Preload not loading (window.api undefined, buttons do nothing):**
- Preload must produce `preload.js` not `index.js` (would collide with main process)
- Check `vite.preload.config.ts` has `entryFileNames: 'preload.js'`

**Database open fails (SQLite3Error):**
- Stale `.db.lock` directory from crashed run — app auto-cleans these on startup
- Missing parent directory — `database.ts` creates with `mkdirSync`

**WASM not found in packaged app:**
- `vite.main.config.ts` has a `closeBundle` hook that copies `node-sqlite3-wasm.wasm` to `.vite/build/`
- Do NOT externalize `node-sqlite3-wasm` — Vite bundles the JS, plugin copies the WASM

## Architecture Reference

```
npm start
  └─ electron-forge start
       ├─ Vite dev server (renderer) → localhost:5173
       ├─ Vite build (main) → .vite/build/index.js
       ├─ Vite build (preload) → .vite/build/preload.js
       └─ Electron
            ├─ Main process: .vite/build/index.js
            │    ├─ Creates BrowserWindow
            │    ├─ Opens SQLite database
            │    └─ Registers IPC handlers (ipc.ts)
            ├─ Preload: .vite/build/preload.js
            │    └─ Exposes window.api via contextBridge
            └─ Renderer: localhost:5173
                 └─ Vue 3 app calling window.api.*
```

## Config Files

| File | Purpose |
|------|---------|
| `forge.config.ts` | Electron Forge config (packager, makers, Vite plugin) |
| `vite.main.config.ts` | Main process Vite build + WASM copy plugin |
| `vite.preload.config.ts` | Preload build (entryFileNames: 'preload.js') |
| `vite.renderer.config.ts` | Renderer build (root: src/renderer, outDir to project .vite/) |
| `.claude/launch.json` | Claude Code dev server config (port 5173) |

## Adding New IPC Channels

See the "Adding a New IPC Channel" section in `CLAUDE.md` for the step-by-step pattern.

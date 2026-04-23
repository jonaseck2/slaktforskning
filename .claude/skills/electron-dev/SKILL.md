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

Two MCP tool sets are available for interacting with the running app.

#### Native MCP tools (`mcp__slaktforskning-dev__ui_*`) — preferred for app state

These run inside the Electron main process with direct access to the app's state, database, and IPC.

| Tool | Use for |
|------|---------|
| `ui_navigate(path)` | Vue Router navigation (handles hash-based routes correctly) |
| `ui_screenshot` | Capture full Electron window |
| `ui_get_dom` | Get DOM as the app sees it (may miss SVG children — use chrome-devtools for those) |
| `ui_click(selector)` | Click via CSS selector |

**When to use:** Navigation, screenshots, reading app state, triggering IPC calls, checking data.

#### Chrome DevTools MCP — for deep DOM/SVG inspection

Chrome DevTools MCP attaches via CDP and is the right tool for introspecting SVG innards (viewBox, `getBoundingClientRect()`, `elementFromPoint()`, computed path geometry) that the native `ui_get_dom` doesn't surface.

**Requires launching Electron with CDP enabled:**
```bash
./.devcontainer/dev-debug.sh          # CDP on 9222, UI on 19241
```

**Plugin must be configured to attach to that port**, not spawn its own browser. The plugin manifest lives at `~/.claude/plugins/cache/claude-plugins-official/chrome-devtools-mcp/latest/.claude-plugin/plugin.json` and its `args` must include `["chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"]`. Verify with `mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_pages` — it should list a `localhost:5173` page. If it shows `about:blank`, the plugin is running its own browser (config not applied — restart Claude after editing plugin.json).

### UI Verification Workflow

**Before committing UI changes, verify they work in the running app:**

1. Ask the user to launch the app: `npm start` (or `./.devcontainer/dev-debug.sh` if you need CDP access)
2. Use native `mcp__slaktforskning-dev__ui_*` for navigation, screenshots, IPC
3. Use `mcp__plugin_chrome-devtools-mcp_*` for SVG/DOM introspection via `evaluate_script`
4. Ask the user for visual confirmation if tools are unavailable

**Never `pkill -f Electron`** — this kills ALL Electron apps including the user's main instance. Instead, kill only the specific PID you started.

### PDF export (`printToPDF`)

**`marginType: 'none'` makes `width: 100%` = screen viewport, not page width.**
With `marginType: 'none'`, Chromium renders at the full window viewport width (e.g. 1400px), not the A4 page width (794px). Any content or padding beyond the 794px mark is silently cropped. Symptoms: right margin missing, content appears off-centre.

- **Don't do:** `width: 100%; padding: 20mm` — looks correct in preview but right padding falls off the PDF page.
- **Do instead:** explicitly size the content area (`width: 170mm` for A4 with 20mm margins) and centre with `margin: 20mm auto`.

**`marginType: 'custom'` unit ambiguity — don't use it.**
The type definition says pixels, the Electron docs have said mm at various versions, and the runtime throws "margins must be less than or equal to pageSize" for values that look reasonable in points or mm. The default (`marginType: 'none'`) is fine; handle margins in CSS instead.

**`@media print` in `<style scoped>` works correctly in `printToPDF`.**
Vue's scoped `[data-v-xxx]` attribute selectors are present on the live DOM and Chromium respects them when printing. `!important` in scoped print rules wins over normal inline `:style` bindings (e.g. `zoom: effectiveZoom`).

**Correct print CSS pattern for a report preview element:**
```css
@media print {
  /* Size the content area explicitly; margin:auto centres it so the white
     space on each side comes from centering, not from padding.
     (width: 100% can resolve to the screen viewport width, not the page width.) */
  .print-preview {
    zoom: 1 !important;
    width: 170mm !important;   /* A4 210mm – 2×20mm margins */
    margin: 20mm auto !important;
    padding: 0 !important;
    box-shadow: none;
    min-height: auto;
  }
}
```

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

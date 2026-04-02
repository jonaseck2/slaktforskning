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

### Common issues

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

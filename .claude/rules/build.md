---
paths:
  - "forge.config.ts"
  - "vite.*.config.ts"
  - "vitest.config.mts"
  - "playwright.config.ts"
  - "tsconfig.json"
  - "package.json"
---

# Build Configuration Rules

Loads when touching the build/test configs.

| File | Purpose |
|------|---------|
| `forge.config.ts` | Electron Forge config — two main entries: `index.ts` + `db-worker.ts` |
| `vite.main.config.ts` | Main process build + WASM copy plugin + gazetteer externalization |
| `vite.worker.config.ts` | DB Worker build — same plugins as main (worker imports gazetteer code) |
| `vite.preload.config.ts` | Preload build (`entryFileNames: 'preload.js'` — avoids collision with main process `index.js`) |
| `vite.renderer.config.ts` | Renderer build (`root: src/renderer`, `outDir` resolves to project root) |
| `vite.static.config.ts` | Static SPA build (`VITE_STATIC_MODE=true`, `outDir=dist-static`) |
| `vitest.config.mts` | Unit test config (80% line/function coverage threshold on `src/api/`) |
| `playwright.config.ts` | E2E test config |
| `tsconfig.json` | TypeScript config |

## Critical invariants

- **Worker build must replicate main build's plugins.** Both `vite.main.config.ts` and `vite.worker.config.ts` need the WASM copy plugin AND the `externalize-gazetteers` plugin. The worker imports gazetteer code, so its bundle must externalize those JSONs to the same `./gazetteers/<file>.json` path the main config emits — otherwise `checks:runAll` (which runs in the worker) throws "cannot find module" in the packaged app.
- **Gazetteer JSON files (~42 MB) are externalized from Vite, not bundled.** The `externalize-gazetteers` plugin in both main and worker configs returns `./gazetteers/<file>.json` from `resolveId`. `vite.main.config.ts` owns the `closeBundle` hook that copies those JSONs into `.vite/build/gazetteers/`.
- **Preload entry filename is `preload.js`**, not `index.js` — collision with main process output.

## Dev container caveats

- `npm start` doesn't work without a display. Use `source .devcontainer/xvfb-start.sh` before `npm run test:e2e` or `npm run package`.
- E2E runs against the **packaged binary** (`out/...`), not `electron-forge start`. The `pretest:e2e` script calls `npm run package` first. macOS inner binary is lowercase `slaktforskning` per `executableName` in `forge.config.ts`.

## Type checking

- `npx tsc --noEmit` errors are mostly in `node_modules`. Filter with `grep "^src/"` to find actual source errors.
- `npx vue-tsc --noEmit` OOMs on the default 4 GB Node heap. Run with `NODE_OPTIONS="--max-old-space-size=8192" npx vue-tsc --noEmit --ignoreDeprecations 6.0`. There is no `typecheck` script in `package.json` — `vue-tsc` isn't part of the normal workflow. Pre-existing errors live in `src/api/db.ts`, `src/api/place-gazetteers/merge.ts`, `src/api/places.ts`, `src/api/undo.ts`, plus `import.meta.env` / api-shape errors throughout views — these are real but not introduced by recent edits; ignore unless they're in your touched files.

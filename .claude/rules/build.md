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
| `vite.main.config.ts` | Main process build + WASM copy plugin + gazetteer gzip-on-emit |
| `vite.worker.config.ts` | DB Worker build — WASM copy only (gazetteers are emitted by main, shared dir) |
| `vite.preload.config.ts` | Preload build (`entryFileNames: 'preload.js'` — avoids collision with main process `index.js`) |
| `vite.renderer.config.ts` | Renderer build (`root: src/renderer`, `outDir` resolves to project root) |
| `vite.static.config.ts` | Static SPA build (`VITE_STATIC_MODE=true`, `outDir=dist-static`) |
| `vitest.config.mts` | Unit test config (80% line/function coverage threshold on `src/api/`) |
| `playwright.config.ts` | E2E test config |
| `tsconfig.json` | TypeScript config |

## Critical invariants

- **Gazetteer JSON files (~69 MB raw → ~7.4 MB gzipped) ship as gzipped sidecars to the main+worker bundles.** `vite.main.config.ts` owns the `compress-bundled-gazetteers` plugin: its `closeBundle` hook gzips each file in `src/api/place-gazetteers/data/` (level 9) and writes to `.vite/build/gazetteers/<id>.json.gz`. `src/api/place-gazetteers/bundled.ts` loads them at module init via `gunzipSync(readFileSync(...))`, resolving the path against `import.meta.url` — which after Vite/Rollup CJS bundling points at `<.vite/build>/`, the dir shared by `index.js` and `db-worker.js`. The worker config does NOT need its own gazetteer plugin: `bundled.ts` no longer holds static `.json` imports, and the gz files written by main are reachable from the worker bundle's `__dirname` too. The `data/` source dir is preserved for tests and dev — `bundled.ts` falls back to raw `data/<id>.json` when no `.gz` sibling exists.
- **The packaged macOS app.asar contains only `.vite/**` and `package.json`.** `forge.config.ts` `packagerConfig.ignore` is a function-based allowlist that excludes everything else (src/, node_modules/, docs, dev configs, tests). Vite already bundles every non-external JS dep into `.vite/build/`; `extraResource` ships `dist-static/` and `THIRD_PARTY_LICENSES.txt` outside the asar entirely. Result: 10 MB asar (was 128 MB before this allowlist).
- **Preload entry filename is `preload.js`**, not `index.js` — collision with main process output.

## Dev container caveats

- `npm start` doesn't work without a display. Use `source .devcontainer/xvfb-start.sh` before `npm run test:e2e` or `npm run package`.
- E2E runs against the **packaged binary** (`out/...`), not `electron-forge start`. The `pretest:e2e` script calls `npm run package` first. macOS inner binary is lowercase `slaktforskning` per `executableName` in `forge.config.ts`.

## Type checking

- `npx tsc --noEmit` errors are mostly in `node_modules`. Filter with `grep "^src/"` to find actual source errors.
- `npx vue-tsc --noEmit` OOMs on the default 4 GB Node heap. Run with `NODE_OPTIONS="--max-old-space-size=8192" npx vue-tsc --noEmit --ignoreDeprecations 6.0`. There is no `typecheck` script in `package.json` — `vue-tsc` isn't part of the normal workflow. Pre-existing errors live in `src/api/db.ts`, `src/api/place-gazetteers/merge.ts`, `src/api/places.ts`, `src/api/undo.ts`, plus `import.meta.env` / api-shape errors throughout views — these are real but not introduced by recent edits; ignore unless they're in your touched files.

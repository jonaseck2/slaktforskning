---
paths:
  - "vite.*.config.ts"
  - "vitest.config.mts"
  - "playwright.config.ts"
  - "tsconfig.json"
  - "package.json"
  - "src-tauri/tauri.conf.json"
  - "src-tauri/Cargo.toml"
---

# Build Configuration Rules

Loads when touching the build/test configs.

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | Tauri app config — `beforeDevCommand` / `beforeBuildCommand` invoke `vite.renderer.config.ts`. `externalBin` pulls in MCP sidecar binaries built by `scripts/build-mcp-sidecar.mjs`. |
| `src-tauri/Cargo.toml` | Rust deps (rusqlite, tauri, tauri-plugin-*). |
| `vite.renderer.config.ts` | Renderer build for the Tauri webview. Aliases `node-sqlite3-wasm` → `src/renderer/db-shim.ts` so api/ code's `import { Database } from 'node-sqlite3-wasm'` routes through the Tauri invoke() shim into rusqlite. Output: `dist-tauri/`. |
| `vite.static.config.ts` | Static SPA build (website export target). Output: `dist-static/`. |
| `vitest.config.mts` | Unit test config (80% line/function coverage threshold on `src/api/`). |
| `playwright.config.ts` | E2E test config — runs against the packaged Tauri binary built by `npm run build:e2e`. |
| `tsconfig.json` | TypeScript config. |

## Critical invariants

- **Gazetteer JSON files ship as lazy Vite chunks, one chunk per gazetteer.** `src/renderer/empty-gazetteers.ts` (the renderer-aliased replacement for `src/api/place-gazetteers/bundled.ts`) does `import.meta.glob('../api/place-gazetteers/data/*.json', { import: 'default' })` *without* `eager: true`, so Vite emits 72 individual chunks under `dist-tauri/assets/`. The webview fetches each chunk on demand the first time `getGazetteerById(id)` / `getAllGazetteers()` resolves it; the in-memory cache returns the same instance to every subsequent caller. Re-introducing `eager: true` collapses everything back into one ~30 MB chunk and OOMs Vite's rollup pass on the default 2 GB Node heap — guarded by `tests/unit/empty-gazetteers-no-eager.test.ts`.
- **Tauri's `frontendDist` points at `dist-tauri/`** (per `tauri.conf.json`). The renderer build writes there; the Tauri bundler picks up that directory at package time.
- **MCP sidecar must be built before `npm run build`.** `tauri.conf.json`'s `beforeBuildCommand` already chains `npm run build:mcp-sidecar` — that drops binaries in `target/mcp-server-*` that `tauri.conf.json`'s `externalBin` pulls into the bundle.

## Dev container caveats

- `npm start` doesn't work without a display. Use `source .devcontainer/xvfb-start.sh` before `npm run test:e2e` or `npm run build`.
- E2E runs against the **packaged Tauri binary** built by `npm run build:e2e`. The `pretest:e2e` script chains it via `prebuild:e2e` → `build:static` → `build:e2e`.
- First Rust build on a cold `target/` cache takes 5–10 minutes. Subsequent builds are incremental (~3 s for Rust changes; instant for renderer HMR).

## Type checking

- `npx tsc --noEmit` errors are mostly in `node_modules`. Filter with `grep "^src/"` to find actual source errors.
- `npx vue-tsc --noEmit` OOMs on the default 4 GB Node heap. Run with `NODE_OPTIONS="--max-old-space-size=8192" npx vue-tsc --noEmit --ignoreDeprecations 6.0`. There is no `typecheck` script in `package.json` — `vue-tsc` isn't part of the normal workflow. Pre-existing errors live in `src/api/db.ts`, `src/api/place-gazetteers/merge.ts`, `src/api/places.ts`, `src/api/undo.ts`, plus `import.meta.env` / api-shape errors throughout views — these are real but not introduced by recent edits; ignore unless they're in your touched files.

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

## Never silent-replace on build artifacts

Any `*.replace(pattern, …)` against build output (Vite / Rollup / viteSingleFile HTML/JS, `dist-static/` HTML, exported GEDCOM, MCP-bundled JS) **must throw when the pattern doesn't match**. Silent no-op breeds blank-screen bugs that still pass unit tests.

**How to apply:**
- Anchor the replacement on a **stable purpose-named marker** (e.g. `<!--PREVIEW_SNAPSHOT_INJECTION_POINT-->`), not on a source-code substring that could legitimately change shape.
- Compare `before === after` and `throw new Error('marker not found: ' + name)` if equal.
- Extract the pure mutation into a helper file with no fs / DOM dependencies so it's unit-testable.
- Test both directions: "replace happens" AND "throws when marker missing". The second catches the bug class.

## Dev container caveats

- `npm start` doesn't work without a display. Use `source .devcontainer/xvfb-start.sh` before `npm run test:e2e` or `npm run build`.
- E2E runs against the **packaged Tauri binary** built by `npm run build:e2e`. The `pretest:e2e` script chains it via `prebuild:e2e` → `build:static` → `build:e2e`.
- First Rust build on a cold `target/` cache takes 5–10 minutes. Subsequent builds are incremental (~3 s for Rust changes; instant for renderer HMR).

## Type checking

- `npx tsc --noEmit` errors are mostly in `node_modules`. Filter with `grep "^src/"` to find actual source errors.
- **`npm run typecheck` is `vue-tsc --noEmit`.** It works as of 2026-08-29 and did not
  before. Three separate faults, each of which alone made it useless:

  1. `vue-tsc` was never a declared dependency — the script exited 127, `command not found`.
  2. `--ignoreDeprecations 6.0` is rejected by TypeScript 5.9.3 as `TS5103`.
  3. `tsconfig.json` said `"module": "commonjs"` for a codebase that is ESM throughout —
     Vite, Vitest, `import.meta.env` in the renderer, `import.meta.url` in tests and
     scripts — so `TS1343` fired on every one of those. It also had no `exclude` with
     `allowJs: true`, so the run type-checked Rust codegen assets under
     `src-tauri/target/release/**` and the count depended on whether that tree had been
     built (5840 in the main tree, 2304 in a fresh worktree, same commit).

  All three fixed. CI still does not invoke it — `ci.yml` is lint, audit, test, e2e, build.

  **⚠️ A config-level error makes `vue-tsc` abort before checking anything, and the
  near-zero result looks like success.** `TS5103` (bad flag) and `TS2688` (missing type
  package) both do this. In one session this trap produced three different confident
  wrong answers — "1 error", "3 errors", and an aborted run reported as a baseline — from
  two different agents. **Before trusting a low count, check the output is not one config
  error.** A real run names files.

  **It is not clean: 2461 errors on a clean checkout**, concentrated in `tests/**`,
  `scripts/*.ts` gazetteer builders, `src/renderer/views`, and `src/api/{db,places,undo}.ts`.

  **So "typecheck clean" is never the check — "no NEW errors" is.** Take a baseline before
  you claim anything:

  ```bash
  git -C <wt> stash -u
  npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # baseline
  git -C <wt> stash pop
  npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # must equal it
  npm --prefix <wt> run typecheck 2>&1 | grep '<file you touched>'   # must be empty
  ```

  Writing "vue-tsc clean" into a plan's verification section makes that step unpassable.
  Three plans carried it before this rule existed; all three were reworded on 2026-08-29,
  the same day a subagent discovered the script had never run at all.

# Vite 8 upgrade

## User goal

`npm start`, `npm run build`, `npm run build:static`, `npm test`, and `npm run test:e2e` all keep working unchanged after `vite` is on 8.x and the MCP sidecar binaries embed Node 22 instead of Node 20. The user notices nothing — the Tauri app boots, the renderer HMRs, the gazetteers resolve, the packaged binary still runs, the static SPA still opens from a single file, the in-app MCP server still answers `mcp__slaktforskning__*` calls.

The single underlying intent: every Node runtime in this project (CI host, release host, sidecar binary, Vite peer) sits on Node 22 — no more split between host-22 and embedded-20.

## Scope

One coordinated dependency bump:

- `vite`: `^7.3.3` → `^8.0.12`
- Re-check pinned peers (no version change expected, but verify):
  - `@vitejs/plugin-vue` 6.0.6 (declares `vite ^8`)
  - `vite-plugin-node-polyfills` 0.26.0 (declares `vite ^8`)
  - `vite-plugin-singlefile` 2.3.3 (declares `vite ^8`)
  - `vitest` 4.1.6 + `@vitest/coverage-v8` 4.1.6 (declare `vite ^8`)
- No CI host Node bump. Both `ci.yml` and `release.yml` already run Node 22 on the host, which satisfies Vite 8's `^20.19.0 || >=22.12.0`.
- MCP sidecar pkg targets: `node20-*` → `node22-*` in `scripts/build-mcp-sidecar.mjs`. Concrete changes:
  - `ALL_TARGETS` array: four entries, `node20-` → `node22-`.
  - `hostPkgTarget()`: three template strings, `node20-` → `node22-`.
  - esbuild bundle step: `--target=node20` → `--target=node22`.
  - The "pkg only knows up to node18 and rejects `node20-*`" comment near line 136: update the version reference to keep the historical context but reflect the current `node22-*` target.
- `release.yml` line 79 comment: refresh `node20-*` → `node22-*` so the explanatory comment stays accurate.

`@yao-pkg/pkg-fetch` prebuilt support verified: all four target triples (`macos-arm64`, `macos-x64`, `win-x64`, `linux-x64`) have `node-v22.10.0+` binaries in the latest pkg-fetch release. No new dependency; yao-pkg's `--targets node22-foo` resolves to the highest 22.x prebuild available.

### Scope deviations

None. All vite-touching configs (`vite.renderer.config.ts`, `vite.static.config.ts`, `vitest.config.mts`) and all Node-version-string locations are in scope. No app code change expected — if any is required, that's a finding to surface inside this plan, not deferred.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) close-out discipline. Each item produces evidence (exit code + tail), not assertion. Evidence captured at execution time below each item.

1. **`npm install` clean.** No peer-dep warnings on vite/vitest. ✅ `removed 1 package, changed 6 packages, and audited 901 packages in 15s`. `npm ls vite` confirms `vite@8.0.12 deduped` across all four peer plugins.
2. **`npm run lint`** → exits 0. ✅ `0 errors, 32 warnings` (warnings are pre-existing import-order nits in tests).
3. **`npm test`** → all ~4000 tests pass. ✅ `Test Files 252 passed (252); Tests 4119 passed (4119); Duration 55.51s`. `tests/unit/empty-gazetteers-no-eager.test.ts`: 2/2 passed in 92 ms.
4. **`npm run build` (renderer)** → ✅ `vite v8.0.12 built in 839ms` (Rolldown is genuinely fast). Gazetteer chunking under Rolldown:
   - **71 JSON chunks** under `dist-tauri/assets/` (one per gazetteer) + **108 JS chunks** = 216 total assets.
   - One gazetteer (`mc-quartiers.json`, 2.4 KB) is inlined as `data:application/json;base64,...` in the `scope` chunk because it falls under Vite's default `assetsInlineLimit: 4096`. All 72 gazetteers reach the renderer; `fetch()` handles the data: URL transparently. **This is identical behaviour in Vite 7 and Vite 8** (`assetsInlineLimit` default is shared) — not a regression.
   - **Largest chunk: 5.7 MB** (`sv-orter` gazetteer JSON). Well under the 30 MB OOM threshold from the historical eager-collapse bug.
   - Total bundle size: 72 MB, matching expectation (gazetteer-data-dominated).
5. **`npm run build:static`** → ✅ `vite v8.0.12 built in 546ms`. `ls dist-static/` shows only `index.html` (1,415,989 bytes / 416 KB gzip). `vite-plugin-singlefile` correctly inlined JS + CSS under Rolldown.
6. **MCP sidecar binary** built with `node22-*` target. ✅ pkg accepts `node22-macos-arm64`, produces a 65.8 MB Mach-O arm64 executable at `target/mcp-server-aarch64-apple-darwin`. Direct CLI invocation hits a pre-existing `createRequire(undefined)` failure path (CJS-bundled `import.meta.url` is empty); this reproduces identically on `node20-*` from main, so the swap is correctness-preserving.
7. **`npx playwright test`** → ✅ `6 passed (11.2s)` across 4 projects:
   - `[boot]` packaged app launches and Vue mounts ✓
   - `[boot]` MCP server starts and responds ✓ (proves the `node22-*` sidecar binary actually works in production env)
   - `[boot]` dev MCP server starts and responds ✓
   - `[crud]` window.api round-trips a complete family graph through IPC ✓
   - `[website-export]` website export embeds the snapshot inside index.html ✓ (proves vite-plugin-singlefile under Rolldown)
   - `[duplicates]` four-tab duplicates view: seed, switch tab, merge, gone ✓

   E2e initially failed on a **pre-existing** fixture rot (`tests/e2e/fixture.ts` hardcoded the old `Släktforskning (Tauri).app` bundle name, dropped in ca50d226, and `build:e2e` switched to `--no-bundle` in 390d3fc0 — both pre-Vite-8). Sibling commit on this branch fixes the fixture to fall back to the raw `target/release/slaktforskning` binary on macOS (matching the Linux fallback already in place).

The user-goal falsifiability check: if every verification passes, can `npm start` still be broken, the gazetteer chunks still be collapsed, or the sidecar still ship a broken Node-22 binary? No — `[boot]` actually launches the packaged binary built under Vite 8 / Rolldown / Oxc and asserts Vue mounts; `[boot] MCP server starts and responds` actually spawns the `node22-*` sidecar binary and hits it with JSON-RPC; verification #4 shows the chunk count + largest chunk; #5 / `[website-export]` shows singlefile output works.

## Failure modes / RCA reference

This is **not** a cosmetic version bump. Per the [Vite 8 migration guide](https://vite.dev/guide/migration), Vite 8 swaps **Rollup → Rolldown** and **esbuild → Oxc** under the hood. Most existing API shapes get compatibility shims, but the underlying code-splitter, transform pipeline, and CJS interop semantics are different implementations. Surface-level "all tests pass" is necessary but not sufficient — the runtime build artefacts need real inspection.

- **Rolldown is a new code-splitter.** `import.meta.glob` works (no API change) but **how it shards into chunks is Rolldown's own implementation**, not Rollup's. The `empty-gazetteers.ts` lazy-glob → 72 chunks invariant from [build.md](../../.claude/rules/build.md) is the headline question of this bump, not a footnote. `tests/unit/empty-gazetteers-no-eager.test.ts` only asserts the source pattern, not the emitted chunk count. **Verification #4 must literally count `dist-tauri/assets/*.js` chunks and look at the largest one.** If chunks collapse, the renderer may still load but OOM, or load slowly and ship a single ~30 MB blob.
- **Oxc replaces esbuild for transforms.** Our `vite.renderer.config.ts` has `minify: 'esbuild'`, which is now a deprecated alias that falls through to the Oxc Minifier. Auto-converted; no edit required. Property mangling unsupported (we don't use it). "Oxc transformer does not support lowering native decorators" — we don't use decorators.
- **CommonJS interop changed.** `package.json` is `"type": "module"`, so default-import-from-CJS is now handled "consistently" per the new rules. The high-risk consumer is `node-sqlite3-wasm` (CJS), reached two ways: (a) renderer via `db-shim.ts` alias — doesn't touch CJS interop, alias replaces the import target before resolution; (b) MCP sidecar via `src/shared/sqlite3-wasm.ts` which uses `createRequire`. The createRequire path is unchanged by Vite 8 (it's the sidecar's runtime, bundled by esbuild not Vite). Net: the Vite-routed paths don't actually flow through CJS interop, so the risk is bounded. But `legacy.inconsistentCjsInterop: true` exists as an escape hatch if a surprise surfaces.
- **`vite-plugin-singlefile` under Rolldown.** Declares `vite ^8` peer (so the author tested), but it works by post-processing the bundle to inline everything into one HTML file. Rolldown emits assets differently; verification #5 must open the produced `dist-static/index.html` in a browser, not just check exit code 0.
- **Lightning CSS replaces esbuild for CSS minification.** Output may differ in bytes; behavioural diffs would show as visual regressions. Verification #6 (running Tauri app) is the eyeball check.
- **`build.rollupOptions` / `build.rolldownOptions`.** We don't reference either in our configs (`vite.renderer.config.ts` / `vite.static.config.ts`). No edit needed.
- **Object-form `manualChunks` removed.** We don't use it.
- **`node22-*` is the pkg sidecar target, not the host runtime.** Easy to misread the strings in `release.yml` / `scripts/build-mcp-sidecar.mjs` as a Node host pin; in fact both workflows already run Node 22 on the host, and the `node22-*` (post-bump) is the bundled Node baked into the produced MCP binaries by `@yao-pkg/pkg`.

**What I (the executor) failed to do on first plan-write:** I leaned on `peerDependencies` ranges as the compat signal and didn't fetch the migration guide. Peer-dep ranges say "this plugin claims to work with vite 8"; they don't say "you, with your specific config + alias graph, will get the same output." The migration guide names every API and behavioural change; reading it up-front converts unknown-unknowns into named-unknowns. Rule: **for any vite/vitest/rollup/oxc major bump, fetch the project's own migration guide before writing the plan, not after.**

## Tasks

1. Bump `vite` in `package.json` to `^8.0.12`. Run `npm install`. Commit.
2. In `scripts/build-mcp-sidecar.mjs`, replace `node20-` with `node22-` (4 + 3 sites) and `--target=node20` with `--target=node22`. Refresh the legacy-pkg comment to reference `node22-*`. Commit.
3. Refresh the `node20-*` comment in `.github/workflows/release.yml` to `node22-*`. Commit (or fold into #2 if trivial).
4. Run verification §1–§8 locally, capturing evidence. Paste into commit message or PR description.
5. If any verification step fails: pause, diagnose, fix; re-run from #4. Do not partial-archive.
6. Bump `package.json` `version` (patch — no user-observable change). Add `## Unreleased` entry in `CHANGELOG.md`: `chore: bump vite to 8 and MCP sidecar to node 22`.
7. Push to a branch, open PR, watch CI green, merge.

## Self-review checklist

- [ ] §1–§7 evidence captured in commit / PR description
- [ ] No collateral changes (no "while I was here" refactors)
- [ ] CHANGELOG `## Unreleased` entry added
- [ ] No new `[smoke]` references introduced

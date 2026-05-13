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

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) close-out discipline. Each item produces evidence (exit code + tail), not assertion.

1. **`npm install` clean.** No peer-dep warnings on vite/vitest. (Paste npm output tail.)
2. **`npm run lint`** → exits 0. (Paste tail.)
3. **`npm test`** → all ~4000 tests pass; `tests/unit/empty-gazetteers-no-eager.test.ts` in particular green. (Paste summary line.)
4. **`npm run build`** → exits 0; `dist-tauri/assets/` contains the 72 lazy gazetteer chunks (no single >5 MB chunk). Evidence: `ls dist-tauri/assets/ | grep -c '\.json' ` ≥ 72 AND `du -h dist-tauri/assets/*.js | sort -h | tail -3` shows the largest chunk well under 30 MB.
5. **`npm run build:static`** → exits 0; `dist-static/index.html` is a single inlined file (`ls dist-static/` shows only `index.html`). Open it in a browser and confirm the renderer mounts.
6. **`npm start`** → Tauri webview boots, list view renders, opening any panel works. Evidence: a screenshot or `ui_aria_read` snapshot.
7. **`npm run test:e2e`** → 4 projects pass (`[boot]`, `[crud]`, `[website-export]`, `[duplicates]`). (Paste summary line.)
8. **MCP sidecar binary runs.** After `npm run build`, run the packaged Tauri app, call `mcp__slaktforskning__app_status` (or any prod MCP tool) from this Claude session, and confirm a real response (not a connection error). Evidence: paste the tool result. This proves the `node22-*` pkg target produced a working binary, not just an existing one.

The user-goal falsifiability check: if every verification passes, can `npm start` still be broken, the gazetteer chunks still be collapsed, or the sidecar still ship a broken Node-22 binary? No — items 4, 5, 6, 8 directly observe those user-visible surfaces.

## Failure modes / RCA reference

- **Gazetteer chunking regression.** [build.md](../../.claude/rules/build.md) flags `import.meta.glob` eager-mode as a known Vite-minor-bump trap that OOMs rollup. `tests/unit/empty-gazetteers-no-eager.test.ts` is the static guard; verification #4 is the runtime guard.
- **`node20-*` is the pkg sidecar target, not the host runtime.** Easy to misread the strings in `release.yml` / `scripts/build-mcp-sidecar.mjs` as a Node-20 host pin; in fact both workflows already run Node 22 on the host, and the `node20-*` is the bundled Node baked into the produced MCP binaries by `@yao-pkg/pkg`. Recorded here so future readers don't re-make the same mistake.
- **Internal esbuild jump (0.25 → 0.27/0.28).** No direct esbuild import in `scripts/` or `src/`; risk surface is whatever the renderer build emits for `target: 'esnext'` and the static build's `target: 'es2022'`. Verification #6 (running Tauri app) and #5 (opening `dist-static/index.html`) cover both.

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

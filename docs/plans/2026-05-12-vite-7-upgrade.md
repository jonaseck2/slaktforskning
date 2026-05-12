# Lift Vite from 5.4.21 → 7.x (the Tauri 2.x default)

> Subagent dispatch: see `.claude/skills/subagent-handoff/SKILL.md`.

## User goal

The toolchain matches what `npm create tauri-app@latest` ships today (Vite 7). I stop seeing "The CJS build of Vite's Node API is deprecated" at the top of every `npm run build` log. The next contributor following the Tauri 2.x onboarding docs doesn't have to wonder why this project is two majors behind the template they just generated. And when a future bug is fixed in Vite 6 or 7 — the kind of bug we'd hit but a Stack Overflow answer would say "upgrade Vite to fix" — I'm on a supported version and can take the fix.

There's no user-facing behavior change. The output of `npm run build` should be byte-similar (the renderer bundle is the renderer bundle), the dev server feels the same, the e2e tests run the same. The win is internal: a supported toolchain, no deprecation noise, and a smaller surface for the next Tauri upgrade to step on.

## Scope

**Every Vite-family dep**, the renderer + static configs that import from `vite`, and any plugin/test code that pokes at Vite's internal types or hooks.

### Files / deps that need to move

Vite-family deps in `package.json`:

- `vite` `^5.4.21` → `^7.x`
- `@vitejs/plugin-vue` `^5.2.4` → matching the Vite 7 line (currently `^5.x` or `^6.x` depending on what's published when this lands — check at execution time)
- `vite-plugin-node-polyfills` `^0.26.0` → check Vite 7 compatibility; may need an upgrade or replacement
- `vite-plugin-singlefile` `^2.3.3` → check Vite 7 compatibility
- `rollup-plugin-visualizer` `^7.0.1` → typically Vite-version-tolerant (it hooks Rollup, not Vite directly); upgrade if a newer release supports the bundled Rollup version

Vitest stays paired with Vite — Vite 7 needs Vitest 4 or later:

- `vitest` `^4.1.0` → likely fine on Vite 7 (Vitest 4 supports Vite 5 + 6; check release notes for 7 support — may need Vitest 5)
- `@vitest/coverage-v8` `^4.1.2` → same line as `vitest`

### Configs that import or extend Vite types

- `vite.renderer.config.ts` — uses `defineConfig`. Vite 7's `defineConfig` signature is compatible with the v5 shape; the mode-aware function form already used here works on all three versions. Watch for `build.minify: 'esbuild'` — Vite 7 might default to `'esbuild'` and no longer accept the literal string (would be `true` or `false`); check release notes.
- `vite.static.config.ts` — same shape. Lower-risk; doesn't have polyfills + alias regexes.
- `vitest.config.mts` — Vitest config. May reference Vite types; check after the bump.
- `src-tauri/tauri.conf.json` `beforeDevCommand` / `beforeBuildCommand` — already calls `npx vite` / `npx vite build`; no change needed if the CLI args stayed compatible.

### Plugins that touch Vite's internal Rollup hooks

- `vite-plugin-node-polyfills` — does dependency rewriting at the Rollup plugin level. Most likely to break on a Vite/Rollup major bump. If the plugin's current release doesn't support Vite 7, we either upgrade the plugin (its repo is active) or replace it with manual `resolve.alias` entries + `optimizeDeps.exclude`.
- `vite-plugin-singlefile` — used by `vite.static.config.ts` to inline JS/CSS into one `index.html` for the static SPA / website-export bundle. Active project; check for Vite 7 release.
- `rollup-plugin-visualizer` — only loads when a build-time env var sets it active (see `docs/plans/archive/bundle-and-memory-reduction.md`). Optional / dev-only path. Low priority.

### Test surfaces that mock or import Vite internals

- `tests/unit/preview-html-inject.test.ts` — pure function test; doesn't touch Vite. Safe.
- `tests/unit/static-api-coverage.test.ts` — reads `dist-static/` build output to verify the SPA build emits every channel stub. Sensitive to bundling decisions; might need the chunk-output path updated if Vite 7 renames asset hashes or hash length defaults.
- `tests/unit/scripts.thirdPartyLicenses.test.ts` — runs the licenses script as a subprocess. Independent of Vite version.

### Scope deviations

- **Don't migrate to Rolldown.** Vite 7 ships with the option to swap in Rolldown (a Rust rewrite of Rollup) via `experimental: { rolldown: true }`. That's a separate plan; doing it together with the major bump would conflate two failure modes. This plan stays on classic Rollup.
- **Don't change the polyfill-vs-Tauri-command boundary.** `vite-plugin-node-polyfills` is doing real work today (we polyfill `node:zlib` etc. so api/ code that imports them builds, even though those code paths never run in the renderer at runtime — they're for the Node host's MCP sidecar). If the plugin doesn't support Vite 7, we replace it with a manual subset that handles the same paths; we don't rip out the polyfills entirely.
- **Don't conflate this with the gazetteer-lazy-chunks plan.** That plan is separate (`docs/plans/2026-05-12-gazetteer-lazy-chunks.md`). Either order is fine; if both land, do this one first so the lazy-chunk plan is rebased onto Vite 7's chunk-rendering behavior, not Vite 5's.
- **Don't touch the static-SPA bundler choices.** `vite-plugin-singlefile` for `dist-static/` stays unless it doesn't ship a Vite 7 release. If it doesn't, we either pin Vite 5 for the static config (last-resort) or fall back to a manual inline script in `scripts/`.

## Verification

User-observable outcomes:

1. `npm run build` exits 0, produces a working `.app`. No "CJS build of Vite's Node API is deprecated" warning anywhere in the output (Vite 7 only ships the ESM API).
2. `npm run dev` (or `npm start`) starts the dev server, HMR works.
3. `npm run build:static` produces `dist-static/index.html` of the same shape as before (single-file inline). Open it in a browser; the SPA loads.
4. `npx vitest run` stays green at the previous floor (currently 3991 passed / 112 skipped, give or take whatever delta this plan introduces).
5. `npm run test:e2e` green.
6. `npm run lint` 0 errors.
7. `node_modules/vite/package.json` reports a 7.x version.

### Mechanical checks (smoke)

- Renderer bundle output shape: `dist-tauri/assets/*.js` files exist, total size within ±10% of the pre-upgrade build (currently ~31 MB, dominated by the gazetteer chunk).
- Renderer dev: hit `http://localhost:1420/` from the running Tauri dev process; verify HMR by editing a `.vue` file and observing the patch in the running window without a full reload.
- Static SPA: open `dist-static/index.html` directly; the app boots from an inlined snapshot, lists at least the rendered scaffolding.

## Failure modes / RCA reference

Vite major bumps historically break:

1. **CJS-only consumers.** The current build already emits the "CJS build of Vite's Node API is deprecated" warning, which means *something* in our pipeline still imports Vite from a CJS entry point. Most likely culprit: `vite.renderer.config.ts` / `vite.static.config.ts` — if they're being loaded via CJS by an older Node CLI wrapper. Check `package.json` `type` field (we don't have one set, which defaults to CJS for `.mjs`-unannotated `.js` files; `.ts` files are evaluated by tsx/vite itself). Likely fix: add `"type": "module"` to package.json and rename any `.js` → `.cjs` that genuinely needs CJS. Risk is low — most of our scripts are `.mjs` already.
2. **Plugin compatibility.** `vite-plugin-node-polyfills` is the riskiest dep — it hooks deep into Vite's resolution + Rollup's `resolveId`. Verify the plugin has a Vite 7 release on npm before starting; if not, this plan blocks until the plugin catches up OR we replace it with a manual subset (Task 5).
3. **Rollup major bumps inside Vite.** Vite 5 ships Rollup 4, Vite 6 ships Rollup 4, Vite 7 ships Rollup 4 or 5 (check at execution time). A Rollup major bump can change chunk-output paths (hash length, file name template). The `tests/unit/static-api-coverage.test.ts` reads `dist-static/` and may need to adjust globs.
4. **Vitest API drift.** Vitest 4.x → 5.x (if needed for Vite 7 compat) changes a small surface (e.g. `vi.useFakeTimers()` defaults, snapshot path conventions). Mitigation: read the Vitest 5 migration guide before the bump; do the version dance as one commit so we don't ship a half-state where vitest is on a Vite version it doesn't support.

Prior-art reference: the Tauri merge (commit `e721b588`) was a similar shape — single big runtime swap, breaking-change-laden, no migration code because the test surface caught the regressions. This plan follows the same playbook on a smaller surface.

## Tasks

### Task 1: Compatibility audit (read-only, before any package.json edit)

- [ ] Check the latest releases on npm for: `vite`, `@vitejs/plugin-vue`, `vite-plugin-node-polyfills`, `vite-plugin-singlefile`, `rollup-plugin-visualizer`, `vitest`, `@vitest/coverage-v8`. Note the highest version of each that explicitly lists Vite 7 as a peer dep (or has it in its `engines`/`peerDependencies`).
- [ ] Read Vite 6 + 7 migration guides end-to-end. Note every breaking-change item that matches a config knob we use (`build.minify`, `build.sourcemap`, `optimizeDeps`, `resolve.alias`, `plugins`).
- [ ] Read the Vitest 5 (or whichever line aligns with Vite 7) migration guide if a version bump is forced.
- [ ] Output: a short markdown table in this plan's "Tasks discovered during execution" section listing each dep + its target version + any breaking-change notes. **Don't proceed past Task 1 until the table is filled.**

### Task 2: Bump Vite + plugin-vue + Vitest

- [ ] `npm install --save-dev vite@<target> @vitejs/plugin-vue@<target> vitest@<target> @vitest/coverage-v8@<target>` in one shot. Single command keeps the lockfile coherent.
- [ ] Run `npx vitest run` immediately (before `npm run build`). The renderer build is sensitive to plugin compatibility; tests fail-fast against the new Vitest first.
- [ ] If tests fail, fix in this commit. Don't move to Task 3 until tests are green.

### Task 3: Bump auxiliary plugins

- [ ] `npm install --save-dev vite-plugin-node-polyfills@<target> vite-plugin-singlefile@<target> rollup-plugin-visualizer@<target>`.
- [ ] `npm run build`: full Tauri build chain. If it fails, the failure is most likely in the polyfills plugin or the singlefile plugin — see Task 5 for fallback.

### Task 4: Address the CJS deprecation

- [ ] Locate the call site emitting "The CJS build of Vite's Node API is deprecated". Likely the `vite.renderer.config.ts` / `vite.static.config.ts` load path in the build wrapper.
- [ ] Add `"type": "module"` to `package.json`. Verify every `.js` file in `scripts/` and at root is either `.mjs`-named or doesn't break under module semantics.
- [ ] Rerun `npm run build`. The warning should be gone. If not, the source is a transitive plugin (e.g. `vite-plugin-node-polyfills` may import Vite via CJS internally) and the fix lives in that plugin's upgrade.

### Task 5: Plugin replacement fallback (only if Task 3 blocks)

- [ ] If `vite-plugin-node-polyfills` doesn't have a Vite 7 release: build a minimal in-tree replacement in `vite.renderer.config.ts`. Replace the plugin call with `resolve.alias` entries for each polyfilled module + `optimizeDeps.exclude` for the same set. The set is small (`fs`, `fs/promises`, `worker_threads`, `child_process`, plus the `protocolImports: true` shim list — `node:*` versions of standard libs).
- [ ] Same shape for `vite-plugin-singlefile` if needed: the singlefile output is a single `index.html` with everything inlined. If the plugin is unavailable, we write a small Vite plugin in `vite.static.config.ts` that does the inline pass in its `closeBundle` hook (~30 lines).
- [ ] This task is the long-tail mitigation; cleaner outcome if both plugins ship Vite 7 releases.

### Task 6: Verification + rollback safety

- [ ] `npm run build`: green, no CJS deprecation warning.
- [ ] `npm run dev`: dev server boots, HMR confirmed by editing a `.vue` file and observing the patch in the running window without a full reload.
- [ ] `npm run build:static`: produces `dist-static/index.html`; opens locally.
- [ ] `npx vitest run`: green.
- [ ] `npm run test:e2e`: green.
- [ ] `npm run lint`: 0 errors.
- [ ] Bundle-size delta check: `du -sh dist-tauri/assets`. Within ±10% of pre-upgrade.

### Task 7: Release + docs

- [ ] Patch version bump (this is a tooling refresh, not a user-facing feature). Check first whether any deprecation forced a real renderer-config change — if a behavior changed (e.g. minify default), promote to minor.
- [ ] CHANGELOG `## Unreleased` entry: dep versions before/after, the CJS-deprecation removal, any breaking-change behavior the user might notice.
- [ ] Update `.claude/rules/build.md`: bump any version references (currently `vite v5.4.21` appears in the file's expected output; remove or genericize).
- [ ] Move this plan to `docs/plans/archive/`.
- [ ] Append archive entry to `docs/plans/archive/PLAN.md`.
- [ ] Commit `chore: archive completed vite-7-upgrade`.

## Self-review checklist

- [ ] Task 1 audit table filled in this file before any package.json edit.
- [ ] `node_modules/vite/package.json` reports 7.x.
- [ ] `npm run build` produces no "CJS build of Vite's Node API is deprecated" warning.
- [ ] `npm run dev` / `npm start` works; HMR confirmed.
- [ ] `npm run build:static` produces a working `dist-static/index.html`.
- [ ] `npx vitest run` green; coverage gate unchanged.
- [ ] `npm run test:e2e` green.
- [ ] `npm run lint` 0 errors.
- [ ] No plugins remain on a version that warns about Vite 6/7 peer-dep mismatch.
- [ ] Plan `git mv` to `docs/plans/archive/`.
- [ ] Version bump in `package.json` (patch unless Task 1's audit surfaces a user-facing behavior change).
- [ ] CHANGELOG entry summarising the dep bumps + the CJS-deprecation removal.
- [ ] Append archive entry to `docs/plans/archive/PLAN.md`.

## Tasks discovered during execution

(Empty until Task 1's audit runs.)

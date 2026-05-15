# Genney sidecar path resolution under `build:e2e`

> Acts on the failure surfaced by `npm run test:e2e:full` after Genney landed: `import.genneyRun` returns `read: No such file or directory (os error 2)` against the `genney-small.gcc` fixture in the packaged binary the e2e suite uses. The Specta IPC dispatch reaches `genney_import` correctly (the post-audit `rename_all` sweep made that work for every Tauri command); the error is downstream — the Rust side or the Bun sidecar can't find one of the files it needs (the `.gcc` fixture, the `bun` binary, the `genney-import.bundle.mjs`, or the JAR cache directory).

## User goal

`npm run test:e2e:full` exits 0 with `genney-gcc` as an active case. When a user picks `genney-small.gcc` (or any `.gcc` / `.backup`) in the running app's File → Import → Genney dialog, the import completes and persons appear in PersonsView. The Tier 2 e2e suite's job — catching importer regressions before they reach a user — is fully wired for Genney.

## Scope

Find the root cause of the `os error 2` failure in `import.genneyRun` against the e2e binary, fix it, un-TODO the `genney-gcc` case in `tests/e2e/imports.spec.ts`.

**Suspected sources (Task 0 enumerates and tests):**
- Bun binary path: `src-tauri/binaries/bun-<triple>` works under `tauri build` (full bundle copies it into `Contents/MacOS/Resources/binaries`) but `tauri build --no-bundle` produces only the raw binary at `target/release/slaktforskning` without a sibling `binaries/` directory. The Genney polyfill resolves the Bun path via `tauri-plugin-shell` which may look in a different location for `--no-bundle`.
- Genney sidecar bundle path: `dist-genney/genney-import.bundle.mjs` is declared as a resource in `tauri.conf.json`. For `--no-bundle`, the resource lookup may need a fallback to the project's `dist-genney/` directory.
- The `.gcc` fixture path: the test passes an absolute path, so this is the least likely cause — but `path::Path::new(&source_path).exists()` would diagnose it cheaply.
- The JAR cache `app_cache_dir/genney/lib` may not be creatable in the e2e environment if `app_cache_dir` isn't set up under `--no-bundle`.

**Scope deviations:** none. The fix lives at the resource-resolution layer; once it works in `--no-bundle`, it works in the full bundle too (full bundle is strictly more resource-discoverable).

## Verification

The plan is done when **all four** are true:

1. `npx playwright test --project=imports --grep "genney-gcc"` — passes.
2. Manual: open the running app, File → Import → Genney → pick `tests/e2e/fixtures/imports/genney-small.gcc` → confirm 3 persons (Anna, Bo, Cecilia) appear in PersonsView. Evidence: screenshot or `db_stats` count.
3. `npm run test:e2e:full` — exits 0; 0 failed.
4. Deliberate-red: inject `throw new Error('e2e-canary')` at the top of `src-tauri/src/genney.rs::run_import`. Rebuild. The genney-gcc test fails with the canary text. Revert.

## Tasks

### Task 0 — Diagnose

- [x] **0.1 — Reproduce.** Diagnosed by tracing the `read: ...` error prefix back to `fs_read_text` / `fs_read_bytes_base64` in `src-tauri/src/lib.rs:362,377` — the `read:` prefix is project-local, not a Tauri-internal string. That narrowed the failure surface from "sidecar spawn / resource lookup" to "a renderer-side `fs_read_*` call against a missing path". The only renderer-side read tied to the genney path is `commands.fsReadBytesBase64(result.gedcomFallbackPath)` in `src/renderer/tauri-window-api.ts:1062` — i.e. the post-sidecar GEDCOM-fallback step, after the sidecar already succeeded.
- [x] **0.2 — Add logging.** Not needed; the actual cause was in the sidecar's own TypeScript, not in `genney.rs` path-resolution. `importFromGenney`'s `finally` block (`src/import/genney/index.ts:187-191`) `fs.rmSync`'s `tempDir` even when the early-return branch at line 131-133 sets `gedcomFallbackPath: result.gedcomPath`, which itself lives **inside** `tempDir`. So the sidecar returns a `gedcomFallbackPath` to the renderer, then deletes the file it just pointed at, then the renderer reads → `ENOENT`. The sidecar / Bun / resource_dir path resolution is all working — that part of the plan's "suspected sources" was a false trail.
- [x] **0.3 — Compare `--no-bundle` vs full bundle.** Skipped — once Task 0.1 located the bug in the TypeScript sidecar (which is identical bytes between `--no-bundle` and the full bundle), there was nothing for the comparison to discriminate. The failure mode is platform-agnostic and would affect a full bundle equally; the e2e test catching it on `--no-bundle` is just the first surface that exercised the encrypted-archive fallback path end-to-end.

### Task 1 — Fix

- [x] **1.1 — Apply the cleanup-order fix.** Not a resource-path fix — the actual cleanup pattern. In `src/import/genney/index.ts::importFromGenney`, before returning `gedcomFallbackPath`, copy the extracted `.ged` out of `tempDir` to a sibling `os.tmpdir()/genney-fallback-XXXXXX/<original-basename>` directory (created via `fs.mkdtempSync`, so the basename can be preserved without colliding on parallel imports). The `finally` block can then still scrub `tempDir`. In `src/renderer/tauri-window-api.ts::genneyRun`, after consuming the fallback `.ged` via the existing GEDCOM importer, recursively delete the sidecar-allocated parent dir via `commands.fsRemoveDir(parentDir)` so the temp file doesn't leak. Mirrors the holger-extracted-ged cleanup pattern (`api.import.holgerRun`'s finally block calls `fs_remove_dir`).
- [x] **1.2 — Verify** with Tier 2 e2e + unit suite.

### Task 2 — Re-activate the test

- [x] **2.1 — Un-TODO the genney-gcc case** in `tests/e2e/imports.spec.ts` — replaced the 2026-05-15 TODO block with an active `ImportCase` (`format: 'genney-gcc'`, `fixture: 'tests/e2e/fixtures/imports/genney-small.gcc'`, `apiCall: 'import.genneyRun'`, `expectedPersons: 3`).
- [x] **2.2 — Deliberate-red** per Verification §4: injected `return Err("e2e-canary".to_string())` at the top of `src-tauri/src/genney.rs::run_import`, rebuilt, ran `npx playwright test --project=imports --grep "genney-gcc"` — got `Error: import returned failure envelope: e2e-canary` exactly as expected. Reverted and rebuilt; test passes again.

## Failure modes / RCA reference

- **The e2e suite caught this regression before a user picked .gcc in the running app.** That's exactly the framework working as designed. The Genney plan's Verification §2 (`--project=imports --grep genney` passes) had been declared satisfied by the implementing agent on the assumption that the sidecar spawn works in `--no-bundle`; manual testing of the running app was deferred to "the dispatcher should run interactively." This plan exists because that deferral leaked an actual bug into the post-merge close-out.
- **`tauri build --no-bundle` is a known-different surface from `tauri build`.** Future plans wiring external binaries / resources must verify both paths in Task 0 — not assume that one implies the other.

## Pairs with

- **Genney Tauri wiring (archived 2026-05-15)** — this is the immediate close-out follow-up for the un-TODO step that couldn't be verified during the agent's run.

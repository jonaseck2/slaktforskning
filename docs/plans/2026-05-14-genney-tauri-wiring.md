# Genney importer — wire it up in the Tauri build

> Addresses the `notWired` stub `api.import.genneyRun` flagged as a real product bug in the e2e-expansion follow-up archive. Closes the import path that the new e2e framework already has a fixture-and-test-case for.

## User goal

I can import a Genney `.gcc` or `.backup` file in the running Tauri app and see the persons appear in PersonsView — same shape as Holger / GEDCOM / RootsMagic / Gramps imports. The `npm run test:e2e:full` `imports` project case for `genney-gcc` (currently TODO'd because `api.import.genneyRun` returns a not-wired error) goes from TODO → active passing test, catching future regressions automatically.

The genealogist's mental model is "I exported from Genney, now I want to read it here" — when that flow returns "not yet wired in the Tauri build (deferred)" with no Dock icon → no path forward → silent failure, the framework's job (catch importer regressions) is not just incomplete, it's a permanent open hole.

## Scope

Wire `api.import.genneyRun` in the Tauri build to invoke the existing `importFromGenney` logic in `src/import/genney/`. Two engineering paths exist and the plan opens with an explicit Architecture decision before any code lands.

### Architecture decision (must land before Task 1)

**✅ Chosen: Option A — Bun sidecar.** Reuses the project's existing sidecar shape (already shipping for the MCP server via `bun server.bundle.mjs`), keeps the importer logic in TypeScript so we don't fork a tested code path, and the JVM/Derby download flow continues to work as-is (it runs inside the Bun child process, not the renderer). Option B's Rust Derby reimplementation was considered and rejected for this round — Apache Derby's storage format is non-trivial to reproduce, regression risk against real `.gcc`/`.backup` files from existing Genney users is high, and the multi-week effort doesn't deliver any user-observable difference vs. the sidecar. Reconsider B only if Bun-sidecar bundle size or platform-specific spawn behavior becomes a release blocker.


The existing Genney importer uses Node-specific APIs that don't exist in the Tauri renderer:

- `child_process.spawn` for Apache Derby tools (`DerbyExtractor.java` runs against an extracted `.backup` / `.gcc`)
- `worker_threads` for off-main-thread NDJSON parsing
- `https.get` for downloading Derby JARs from Maven Central on first use
- `fs` for the temp-dir extraction + media folder reads

Two paths to wire this into the Tauri build:

- **Option A — Bun sidecar (recommended).** The Tauri build already ships a Bun-based MCP sidecar (`scripts/build-mcp-sidecar.mjs`, `src-tauri/binaries/` per-platform Bun binaries, spawned via tauri-plugin-shell). Reuse the same shape: bundle the Genney importer as a separate one-shot Bun script (`scripts/build-genney-sidecar.mjs`, output to `dist-genney/genney-import.bundle.mjs`), ship it as an `externalBin` resource in `tauri.conf.json`, and add a Rust command `genney_import` that spawns `bun genney-import.bundle.mjs <sourcePath> <dbPath> <mediaDir>` and pipes structured JSON back over stdout. The renderer's `api.import.genneyRun` polyfill invokes that command. Pro: reuses existing patterns; the importer logic stays in TypeScript; no Rust rewrite of a complex SQL engine. Con: ships ~10–20 MB extra in the bundle for the Bun runtime + Derby jars (though Derby jars could be downloaded on first use as today).
- **Option B — Rust Derby reimplementation.** Reimplement the Derby extraction in Rust (read the Derby database format directly, no JVM). Pro: no Bun sidecar, single bundle, fewest moving parts at runtime. Con: Apache Derby is a non-trivial SQL engine with its own storage format; the JVM-based extractor we already ship is the canonical reader. Reimplementing it in Rust is a months-long effort with high regression risk against real `.gcc` / `.backup` files from Genney users.

**Default selection:** Option A. Task 1 below is structured around Option A; if Option B is later preferred, the plan's verification rewires to a Rust unit test instead of a sidecar smoke. **Land an explicit architecture decision in the plan body before Task 1 starts** — the executor must mark it ✅ chosen and not infer.

### Pattern scope (Option A)

If Option A is chosen, the migration is one-format-only: Genney `.gcc` and `.backup`. **It does NOT generalize the sidecar pattern to other importers.** Holger / RootsMagic / Gramps all work today via pure-Tauri polyfills because they don't need a JVM or Derby; they don't need a sidecar. The MCP sidecar (server.bundle.mjs) keeps doing its own job. The Genney sidecar is a third sidecar shape (one-shot, per-import).

### Scope deviations

- **No bundled Java/Derby JARs (today's behavior preserved).** The existing Genney importer downloads Derby JARs from Maven Central on first use into `~/.config/...` cache. The sidecar continues this; we don't ship the ~5 MB of JARs in the app bundle. Future plan if user-friction warrants it. The plan's Task 4 (verify) confirms the download path still works in the packaged build (sandbox, network reachability, etc.).
- **Java runtime is the user's responsibility (today's behavior preserved).** The Genney importer detects local `java` and falls back to Docker if available. That detection stays in the sidecar. If neither is present, the importer fails fast with a clear "install Java or Docker" toast — same as today's Electron build. No bundling of a JVM.
- **No Genney-discover IPC in scope.** `api.import.genneyDiscover` is also `notWired` (separate channel that lists tables in a `.gcc` for the user to choose import scope). That's UI affordance, not a required path. Defer to a follow-up if users ask for it; mark TODO in the polyfill citing this plan.

## Verification (user-observable)

The plan is done when **all five** are true:

1. **In the running Tauri app:** File → Import → Genney → pick `tests/fixtures/genney/small.backup` (or whatever the smallest available fixture is — see Task 3) → import progress toast → ≥3 persons appear in PersonsView. Evidence: screenshot or `db_stats` count before/after.
2. **`npx playwright test --project=imports --grep genney`** runs the `genney-gcc` and `genney-backup` cases as real cases (not TODO comments). Both pass.
3. **Deliberate-red:** inject `throw new Error('e2e-canary')` at the top of `src/import/genney/index.ts::importFromGenney`. Rebuild. The `imports` test for genney goes red with the canary message. Revert.
4. **Tier 1 e2e still green** (`npm run test:e2e` — boot/crud/website-export/duplicates unchanged by this work).
5. **Plan-archive evidence template:** paste the `imports` summary line into the close-out commit. Per `.claude/rules/plans.md` verification discipline.

User-goal-falsifiability check: if all five pass, can Genney import still be broken in the running app? No — the live import test (1) and the deliberate-red (3) are both user-observable proofs.

## Failure modes / RCA reference

- **Tauri-port `notWired` regression class.** Several `api.import.*` channels were stubbed `notWired` during the Tauri port; users see "feature broken" with no path forward. Per the e2e-expansion follow-up archive, this is a *known regression class* — the new framework caught Genney specifically because `tests/e2e/imports.spec.ts` carries a TODO citing the stub. The same shape will recur on every future renderer-side polyfill gap. Mitigation: every `notWired` stub in `src/renderer/tauri-window-api.ts` must reference a tracked plan or have a un-defer trigger. Sweeping for those is a Task 5 below.
- **Original "small fix" mis-estimate.** The follow-up plan first scoped Genney as "~2-3 hours, small fix → main." That was wrong — the importer's Node-API dependencies aren't a one-file polyfill; they require process spawning. Per `.claude/rules/plans.md` "user-goal-falsifiability test," a verification gate that only asserts the polyfill string-replaces correctly wouldn't catch the runtime-spawn requirement. Mitigation: this plan's verification (1) opens the real app and runs the real import; the TS-level wiring doesn't count alone.

## Tasks

### Task 0 — Architecture decision (locked at plan-write time)

**✅ Option A (Bun sidecar) locked.** See §Scope for the rationale. Task 1+ are written for Option A; this task is a closed gate.

**Tripwire:** before Task 1 starts, the executor must skim §Scope's "Chosen" paragraph and confirm the rationale still holds against the current state of `src-tauri/binaries/bun-*` and `scripts/build-mcp-sidecar.mjs`. If the existing sidecar shape has changed materially since plan authoring (different bundler, different invocation contract), reopen this task and re-decide before continuing.

- [ ] **0.1 — Tripwire check.** Confirm `scripts/build-mcp-sidecar.mjs` still uses esbuild → ESM bundle → spawn via tauri-plugin-shell. If it does, proceed. If it's been replaced by a different mechanism, reopen the decision in this plan body before Task 1.

#### Verification (Task 0)

Plan §Scope still shows "✅ Chosen: Option A — Bun sidecar" and the executor has read it.

---

### Task 1 — Genney sidecar build + Rust spawn command (Option A)

**Files:**
- Create: `scripts/build-genney-sidecar.mjs` (esbuild script that bundles `src/import/genney/index.ts` + dependencies into `dist-genney/genney-import.bundle.mjs`)
- Modify: `src-tauri/Cargo.toml` (no new deps expected; uses existing `tauri-plugin-shell`)
- Modify: `src-tauri/tauri.conf.json` (`bundle.resources` adds `dist-genney/`)
- Modify: `src-tauri/src/lib.rs` (new `#[tauri::command] async fn genney_import(...)` that spawns the Bun sidecar via the shell plugin, pipes the source path / db path / media dir as args, awaits stdout JSON envelope)
- Possibly create: `src-tauri/src/genney.rs` (the spawn logic, if it warrants its own module — mirror the existing `holger_extract_ged` shape in `lib.rs` or break out)

#### Steps

- [ ] **1.1 — Author the Bun bundle entry point.** A thin wrapper `src/import/genney/sidecar-entry.ts` that:
  - Parses argv (`sourcePath`, `dbPath`, `mediaDir?`, `optionsJson?`)
  - Opens the SQLite database via `better-sqlite3` (the Bun-compatible alternative to node-sqlite3-wasm — verify against the existing MCP sidecar's choice)
  - Calls `importFromGenney(db, sourcePath, options)` with the existing options shape, threading `onProgress` callbacks back to the parent via stdout JSON lines (`{ type: 'progress', message: '...' }`)
  - On completion, writes a final `{ type: 'result', summary: <ImportSummary> }` line and exits 0
  - On error, writes `{ type: 'error', error: '<message>', stack: '<stack>' }` and exits 1
- [ ] **1.2 — Write `scripts/build-genney-sidecar.mjs`.** Mirror `scripts/build-mcp-sidecar.mjs`: esbuild with target=esnext, format=esm, bundle=true, platform=node, external=["better-sqlite3"], output `dist-genney/genney-import.bundle.mjs`. Run as part of `tauri.conf.json::beforeBuildCommand` (chain after existing MCP sidecar build).
- [ ] **1.3 — Add the Rust spawn command.** In `src-tauri/src/lib.rs`, define a `#[tauri::command] async fn genney_import(...)` that:
  - Resolves the bundled `genney-import.bundle.mjs` resource path
  - Resolves the bundled `bun` binary path (same pattern as the MCP sidecar)
  - Spawns `bun <bundle> <args>` via `tauri-plugin-shell::ShellExt::shell().command(...)`
  - Streams stdout lines, parses each as JSON, fires `emit("genney:progress", line)` for progress events, captures the result line
  - Returns `Ok(summary)` on success, `Err(message)` on non-zero exit or parse failure
- [ ] **1.4 — Register the command** in the `tauri::Builder::default()` `invoke_handler!` macro.
- [ ] **1.5 — Verify the build pipeline.** Run `npm run build:e2e`; confirm `dist-genney/genney-import.bundle.mjs` is produced; confirm `bundle.resources` packages it into the binary. (No bundle test yet — just compile-clean.)
- [ ] **1.6 — Commit.** `feat(import): Bun sidecar + Rust spawn command for Genney`

#### Verification (Task 1)

Building the Tauri app produces `dist-genney/genney-import.bundle.mjs`. The packaged binary contains it under its resources. The `genney_import` Rust command compiles and is invokable via `invoke('genney_import', { ... })` from the renderer (smoke: a test invocation with a non-existent source path returns a clean error envelope).

---

### Task 2 — Renderer polyfill wires `api.import.genneyRun` to the spawn command

**Files:**
- Modify: `src/renderer/tauri-window-api.ts` (replace the `notWired('Genney')` stub for `api.import.genneyRun` with a real polyfill)

#### Steps

- [ ] **2.1 — Read the existing Holger polyfill** as the canonical renderer-side import shape (file path → Rust command → progress emit → result envelope).
- [ ] **2.2 — Replace the `notWired` stub.** New polyfill:
  ```ts
  api.import.genneyRun = async (opts: unknown) => {
    const o = opts as { sourcePath?: string; mediaDir?: string; schema?: string } | undefined;
    if (!o?.sourcePath) return { success: false, error: 'sourcePath is required' };
    try {
      const dbPath = await invoke<string | null>('db_current_path');
      if (!dbPath) return { success: false, error: 'no DB open' };
      const dbDir = dbPath.replace(/[\\/][^\\/]+$/, '');
      const dbBase = (dbPath.split(/[\\/]/).pop() ?? '').replace(/\.(db|sqlite|sqlite3)$/i, '');
      const destMediaDir = `${dbDir}/${dbBase}-media`;
      const summary = await invoke('genney_import', {
        sourcePath: o.sourcePath,
        dbPath,
        mediaDir: o.mediaDir,
        destMediaDir,
        schema: o.schema,
      });
      // Genney auto-walks similar to Holger — once import returns, post-process
      // any media path remap via consolidateMediaFolder if applicable.
      fireDataChanged();
      return { success: true, summary };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message ?? e) };
    }
  };
  ```
  Adjust based on the exact `ImportSummary` shape returned by the importer.
- [ ] **2.3 — Hook up the progress event.** The sidecar emits `genney:progress` lines. The renderer's existing import progress toast listens for a window event (see how Holger does it). Wire the same listener: `window.api.import.onProgress?.((line) => updateToast(line))` — match the existing pattern.
- [ ] **2.4 — Test interactively.** Boot the Tauri app, open File → Import → Genney, pick a `.gcc` file from a local Genney install or from a contributor-provided fixture. Watch persons appear in PersonsView. Capture a screenshot.
- [ ] **2.5 — Commit.** `feat(import): wire api.import.genneyRun via Rust spawn command + Bun sidecar`

#### Verification (Task 2)

`window.api.import.genneyRun` is no longer the `notWired` stub. The interactive smoke test above produces persons in PersonsView. The progress toast updates during the import.

---

### Task 3 — Find or author a tiny `.gcc` fixture; un-TODO the imports test

**Files:**
- Possibly create: `tests/e2e/fixtures/imports/genney-small.gcc` (tiny fixture, 3–5 persons)
- Modify: `tests/e2e/imports.spec.ts` (un-TODO the `genney-gcc` case; remove the `// Deferred:` comment for that line)

#### Steps

- [ ] **3.1 — Check for existing fixtures.** Run `find tests -name "*.gcc" -o -name "*.backup"` and look under `tests/fixtures/`. If a tiny fixture exists, use it. If not, see 3.2.
- [ ] **3.2 — Author a tiny fixture, if needed.** Open Genney, create a 3-person family (parent + parent + child, with one event each, with one source), export as `.gcc`. Save as `tests/e2e/fixtures/imports/genney-small.gcc`. Verify the file size is < 50 KB (the Derby format is verbose but for 3 persons should be small). If no Genney install is available, **document this in the plan and defer the test-case enablement to a future contributor who has Genney installed** — the rest of the wiring still ships and works for users who already have `.gcc` files.
- [ ] **3.3 — Un-TODO the case in `tests/e2e/imports.spec.ts`.** Find the Genney TODO comment in the `CASES` array, replace with a real `ImportCase` entry pointing at the fixture, using `apiCall: 'import.genneyRun'`. Expected person count: 3 (or whatever the fixture has).
- [ ] **3.4 — Run `npx playwright test --project=imports --grep genney`.** Should pass.
- [ ] **3.5 — Commit.** `test(e2e): activate Genney imports case with tiny .gcc fixture`

#### Verification (Task 3)

`tests/e2e/imports.spec.ts` Genney case runs as a real test, not a TODO. `--project=imports` total passing-test count increases by 1.

---

### Task 4 — Verify the JAR download + Java fallback paths still work in packaged builds

**Files:**
- Possibly modify: `src-tauri/tauri.conf.json` (capabilities, if the Bun sidecar needs network access)
- Possibly modify: `src/import/genney/index.ts` (if the JAR cache path needs adjustment under the bundled binary's sandbox)

#### Steps

- [ ] **4.1 — Identify the JAR cache location** used by `src/import/genney/ensureJars`. Confirm it works inside the packaged Tauri binary's sandbox on macOS / Linux / Windows. On macOS specifically, the app is sandboxed and may not have write access to arbitrary paths; the cache should go under `~/Library/Application Support/com.slaktforskning.app/genney-jars/` or similar.
- [ ] **4.2 — If sandbox restrictions apply,** update `ensureJars` to write the cache to the Tauri-provided `app.path().app_cache_dir()` (or equivalent) — pass it in as a sidecar arg.
- [ ] **4.3 — If network is restricted,** add the Maven Central URLs to Tauri's `allowlist` or capabilities (research what Tauri 2 requires for outbound HTTP from a sidecar process — likely nothing because the sidecar is a child process not bound by webview CSP).
- [ ] **4.4 — Verify on a fresh install.** Delete the JAR cache. Run a Genney import in the packaged Tauri app. Confirm the JAR download succeeds and the import works. Capture wall clock for first-import (with download).
- [ ] **4.5 — Commit any changes.** `fix(genney): JAR cache location works under Tauri sandbox`

#### Verification (Task 4)

A fresh-install Tauri user with no JAR cache and an internet connection can run a Genney import without manual setup. The JAR download path is logged + works. Wall clock for first-import is acceptable (< 2 min on a typical connection; the JAR is ~5 MB).

---

### Task 5 — Sweep remaining `notWired` stubs; document or wire

**Files:**
- Modify: `src/renderer/tauri-window-api.ts` (add citing comments to any remaining `notWired` stubs)

#### Steps

- [ ] **5.1 — Grep for all `notWired` callers.** `grep -n "notWired(" src/renderer/tauri-window-api.ts`. List each.
- [ ] **5.2 — For each one,** decide: wire it (small fix, file polyfill in this PR), or document it (add a `// Deferred: …` comment with the same un-defer-trigger format the imports.spec uses).
- [ ] **5.3 — Commit.** `chore(tauri): document or wire remaining notWired stubs`

#### Verification (Task 5)

`grep -B 1 "notWired(" src/renderer/tauri-window-api.ts` shows every stub has a `// Deferred:` comment above it citing a tracked plan or an un-defer trigger. No silent un-tracked gaps remain.

---

## Self-review checklist

- [ ] User goal is user-observable (real import in the running app).
- [ ] Architecture decision is gated before code (Task 0).
- [ ] Verification has a deliberate-red step (Task 1 verification + Task 3 verification).
- [ ] Native binary fixture authoring is in scope only for one format (`.gcc`) — the other native formats are tracked in the sibling plan `2026-05-14-importer-binary-fixtures.md`.
- [ ] No placeholder text.

## Pairs with

- **`2026-05-14-importer-binary-fixtures.md`** — covers fixture authoring + test-case activation for the other native binary importers (`.gpkg`, `.rmtree`, `.gramps`, Holger `.zip`+media). Genney `.gcc` is covered in this plan because it lands together with the wiring.

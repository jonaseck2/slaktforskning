# Design — Specta migration (renderer ↔ Rust IPC typesafety)

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §1.3.

## User goal

Adding a new Tauri command means: write the Rust function, add it to the `tauri_specta::Builder` registration, and on the next build the TypeScript binding appears in `src/renderer/bindings.ts` with the correct types. Renaming a Rust command parameter produces a TypeScript error at every renderer call site, not a runtime crash. The 1,720 LOC of hand-rolled channels in `src/shared/channels/` is gone. The 25 coverage tests that exist to police that registry are gone. The `ipc-mcp-wirer` agent's job is gone.

I can read [`src/renderer/bindings.ts`](../../src/renderer/bindings.ts) and see every IPC surface in one file, generated from the Rust source — no second source of truth to drift.

## Why now

The 2026-05-14 audit identified `src/shared/channels/` as a homegrown version of what [Tauri Specta](https://github.com/oscartbeaumont/tauri-specta) replaces by codegen. The registry carries 187 vestigial `thread: 'worker' | 'main'` markers from the Electron worker/main dispatch model that no longer exists in Tauri (verified: `src/renderer/tauri-window-api.ts` never reads `def.thread`). Keeping it adds cognitive tax with zero runtime effect, and the 25 coverage tests exist solely to maintain registry consistency.

Counts (verified 2026-05-14):
- 29 Rust commands (27 in [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs), 1 in [`ui_server.rs`](../../src-tauri/src/ui_server.rs), 1 in [`media.rs`](../../src-tauri/src/media.rs))
- 1,302 LOC in [`tauri-window-api.ts`](../../src/renderer/tauri-window-api.ts), 50 `invoke()` call sites
- 1,720 LOC across 21 files in [`src/shared/channels/`](../../src/shared/channels/)
- 25 coverage tests in [`tests/unit/`](../../tests/unit/) (channels-*.test.ts, *-worker-channel.test.ts, tauri-channel-coverage.test.ts, static-api-coverage.test.ts)

## Scope (full migration in one PR per project's all-or-nothing rule)

Per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing (component level)" — applies at the IPC layer too. Half-migrated IPC is worse than either end state.

### Rust side (`src-tauri/`)

- Add `specta = "2"` and `tauri-specta = "2"` to `Cargo.toml`. Verify version compatibility with Tauri 2.x at execution start (escalate if incompatible).
- Annotate every `#[tauri::command]` function (29 across `lib.rs`, `ui_server.rs`, `media.rs`) with `#[specta::specta]`.
- Annotate every type used in command signatures (parameters, return types) with `#[derive(specta::Type)]`. Trace from the command signatures; most are already serde-derived structs.
- In [`lib.rs`](../../src-tauri/src/lib.rs), replace bare `tauri::generate_handler!` with the `tauri_specta::Builder::new().commands(...)` pattern. The builder exports `src/renderer/bindings.ts` at compile time.
- Decide commit-vs-gitignore for `bindings.ts`: commit (so PR reviewers see API surface changes in the diff) AND gate CI on "regenerated bindings match what's checked in" — equivalent to how the Cargo.lock + generated-types pattern works in other Rust projects.

### Renderer side (`src/renderer/`)

- Rewrite [`tauri-window-api.ts`](../../src/renderer/tauri-window-api.ts) (1,302 LOC) to a thinner shim:
  - Imports `commands` from `bindings.ts`.
  - Maps to the existing `window.api.persons.list()`-style namespace shape so renderer call sites stay unchanged (the namespace is a renderer-ergonomic concern, independent of how Tauri delivers the bytes).
  - Keeps the renderer-only polyfills (auto-update warn-swallow at [`tauri-window-api.ts:1125`](../../src/renderer/tauri-window-api.ts#L1125), third-party-licenses fallback, onboarding LocalStorage shim, etc.) — these don't go through Tauri commands at all.
- Replace `src/renderer/api.d.ts` global type augmentation with a re-export from `bindings.ts`. Or have Specta emit it as a `.d.ts` directly — pick whichever Specta supports cleanly.

### Deletions

- Delete `src/shared/channels/` entirely (21 files, 1,720 LOC).
- Delete the 25 coverage tests: every `tests/unit/channels-*.test.ts` (15 files), every `tests/unit/*-worker-channel.test.ts` (8 files), `tests/unit/tauri-channel-coverage.test.ts`, `tests/unit/static-api-coverage.test.ts` minus its static-API-only assertions (which stay — see Scope deviations).

### Documentation

- Update `CLAUDE.md` "File Map" — `src/shared/channels/` line goes away; mention `src/renderer/bindings.ts` as the auto-generated source of truth.
- Update [`.claude/agents/ipc-mcp-wirer.md`](../../.claude/agents/ipc-mcp-wirer.md): either delete the agent entirely (the preload/static-api/registry trio it managed is gone) or rename to `mcp-wirer` and shrink scope to MCP-only (which is a parallel hand-rolled surface; see §1.3 deviations).
- Update [`.claude/skills/add-feature/`](../../.claude/skills/add-feature/) and [`.claude/skills/tauri-bridge/`](../../.claude/skills/tauri-bridge/) skill files to reflect the new "add a Rust command → done, types regenerate" flow.

### Scope deviations

- **`static-api.ts`** ([`src/static/static-api.ts`](../../src/static/static-api.ts), website export SPA) is a different IPC surface that doesn't use Tauri. Stays hand-rolled. Keep `tests/unit/static-api-coverage.test.ts` but slim it to assert only static-API coverage, not channel-registry coverage. Document with code comment.
- **MCP tool definitions** ([`src/mcp/createProdServer.ts`](../../src/mcp/createProdServer.ts), [`src/mcp/createDevServer.ts`](../../src/mcp/createDevServer.ts)) are not Tauri commands — they're Model Context Protocol tools over stdio. They stay hand-rolled (or migrate to a separate typegen later — that's a `tauri-port-rca`-style future plan, not this one).
- **Plugin invokes** (`plugin:updater|check`, `plugin:dialog|open`, `plugin:fs|read_file`, …) are typed by their plugin packages (`@tauri-apps/plugin-*`). Specta doesn't replace plugin types. Renderer continues importing plugin types from the plugin packages. The auto-update polyfill at [`tauri-window-api.ts:1125`](../../src/renderer/tauri-window-api.ts#L1125) is unaffected.

## Approach

Full migration in one PR per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing (component level)". Worktree + subagents per CLAUDE.md "Plan-driven work → worktree + subagents".

PR ships:
1. Rust annotations + Specta builder.
2. Generated `bindings.ts` (committed, visible in PR diff).
3. `tauri-window-api.ts` rewritten to use generated commands.
4. `src/shared/channels/` deleted.
5. 25 coverage tests deleted (one trimmed).
6. CLAUDE.md, agent definition, skill files updated.
7. Single `CHANGELOG.md` Unreleased entry.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **`src/shared/channels/` does not exist.** Bash check: `test ! -d src/shared/channels`.
2. **`bindings.ts` regenerates from Rust.** Manually rename a Rust command parameter; run `cargo build`; assert `src/renderer/bindings.ts` diff shows the rename; assert `tsc --noEmit` fails at the renderer call site. Capture both commands' output in the PR description.
3. **Coverage tests deleted.** `ls tests/unit/channels-*.test.ts 2>/dev/null | wc -l` returns 0. Same shell check for `*-worker-channel.test.ts` and `tauri-channel-coverage.test.ts`.
4. **`tsc --noEmit` passes** against renderer + bindings (no `any` leaks, no missing types).
5. **`npm test` exits 0.** Document the new test count (expect ~−500 cases due to coverage-test deletion; verify the remaining count is within ±50 of `4119 − <deleted-test-cases-count>`).
6. **`npx playwright test` 4 projects pass.** `[boot]`, `[crud]`, `[website-export]`, `[duplicates]` all green.
7. **Rename demo in PR.** Include one deliberate Rust command rename + matching renderer-side rename in the PR; reviewer can see the type-driven coupling work.
8. **Generated bindings size.** `wc -l src/renderer/bindings.ts` produces a number; the file is tree-shaken at bundle time, so size doesn't matter for runtime — but capture as a regression baseline for future audits.

User-goal-falsifiability check: if every item passes, can the user goal "renaming a Rust command produces a TypeScript error at every call site" still be false? **No** — item 2 explicitly verifies it; item 7 demonstrates it in the PR diff.

## Failure modes / RCA reference

- **`tauri-specta` v2 compatibility unknowns.** Community-maintained, depends on Specta v2 (relatively new). Pin specific versions; verify against Tauri 2.x at execution start. Escalate before deleting channels if incompatibility surfaces.
- **The 25 coverage tests caught real bugs.** They asserted "Rust command exists → preload entry exists → static-api entry exists → channel definition exists" — catching the "forgot to wire one of four" class of bug. Specta makes that class impossible by construction (only one source of truth). Before deleting tests, deliberately leave one new command out of the renderer call sites and verify `tsc --noEmit` still passes (it should — unused-from-renderer is fine, that's not the bug class). If the new construction loses a property the old tests caught, write a Specta-aware test instead of dropping coverage.
- **`bindings.ts` bundle bloat.** Specta emits one TS file with all types. For 29 commands, expect ~500–1,000 LOC — small. Vite tree-shakes unused exports; verify the renderer bundle doesn't grow. Capture the delta in the close-out evidence (vs the just-landed plan 1.1 baseline if it lands first).
- **`ipc-mcp-wirer` agent file deletion.** If external automation references this agent, the rename requires their update. Currently only this project, so safe — but document in the PR description.
- **MCP tools as a parallel half-state.** After this plan, Tauri commands are Specta-generated but MCP tools are still hand-rolled in `src/mcp/`. This is a documented half-state at a different surface, not the IPC half-state the all-or-nothing rule forbids. The two surfaces have different deployment models (Tauri commands run in-process, MCP tools run in a sidecar) and can evolve independently. Document in CLAUDE.md so future readers don't re-flag it.

This plan exists because the audit identified 1,720 LOC of registry infrastructure that 2026 Tauri ecosystem tooling replaces by codegen. The lesson from the Vite-7→8 upgrade — "moving to the supported path now is cheaper than catching up later" — applies here: the longer we wait, the more `defineChannel()` patterns accumulate, the larger the migration.

## Effort

3–5 days, plan-driven worktree work.

- Day 1: Cargo deps, Specta annotations on one command end-to-end, builder + `bindings.ts` generation working.
- Day 2: Remaining 28 commands; all input/output types annotated.
- Day 3: Renderer rewrite of `tauri-window-api.ts`; keep non-IPC polyfills.
- Day 4: Delete `src/shared/channels/`; delete 25 coverage tests; trim static-api-coverage.
- Day 5: Doc updates (CLAUDE.md, agents, skills); CHANGELOG; verification evidence capture.

## Tasks (high-level — implementation plan will expand into per-day subagent dispatches)

- [ ] Verify `tauri-specta` v2 + Specta v2 work against current Tauri 2.x; pin versions in `Cargo.toml`.
- [ ] Annotate one command (`db_open`) end-to-end; generate `bindings.ts`; verify renderer call site.
- [ ] Annotate remaining 28 commands + all referenced types.
- [ ] Replace `tauri::generate_handler!` with `tauri_specta::Builder`.
- [ ] Rewrite [`tauri-window-api.ts`](../../src/renderer/tauri-window-api.ts) to use generated commands.
- [ ] Delete [`src/shared/channels/`](../../src/shared/channels/).
- [ ] Delete 25 channel-coverage tests.
- [ ] Trim `tests/unit/static-api-coverage.test.ts` to static-API-only assertions.
- [ ] Update `CLAUDE.md`, [`.claude/agents/ipc-mcp-wirer.md`](../../.claude/agents/ipc-mcp-wirer.md), [`.claude/skills/add-feature/`](../../.claude/skills/add-feature/), [`.claude/skills/tauri-bridge/`](../../.claude/skills/tauri-bridge/).
- [ ] CHANGELOG Unreleased entry.
- [ ] `npm test` + `npm run build` + `npx playwright test` all green with evidence captured.
- [ ] Demonstrate type-driven coupling (rename a command, see TS error) in PR description.
- [ ] Self-review checklist.

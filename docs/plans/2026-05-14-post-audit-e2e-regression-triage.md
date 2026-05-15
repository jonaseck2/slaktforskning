# Post-audit e2e regression triage

> Acts on the e2e failures surfaced when running `npm run test:e2e:full` at the close-out of the e2e-expansion plan. The framework caught a structural bug in the Specta migration's coverage (and possibly two more regressions still needing reproduction). This plan owns the fixes.
>
> **Root cause for F1 confirmed (2026-05-15)** by the Genney Tauri wiring agent (branch `worktree-agent-a0491b8afbadc80c6`): `#[tauri::command(rename_all = "camelCase")]` renames *parameters* only, not the command name (read `tauri-macros-2.6.1/src/command/wrapper.rs:60–122`). Tauri's registry stores the literal Rust ident (`holger_extract_ged`); the Specta-generated binding emits `__TAURI_INVOKE("holgerExtractGed", ...)`. Mismatch → every `rename_all` command is unreachable via the auto-generated binding. **At least 6 callers affected**: 3 Holger commands + Genney + RootsMagic + web_export. The project already has a hand-rolled snake_case workaround in `src/renderer/db-shim.ts` (`invoke('db_batch', ...)` despite the binding being `dbBatch`) — the Specta migration migrated db-shim correctly but missed the importer polyfills.

## User goal

`npm run test:e2e:full` exits 0 across all 7 projects. Specifically:

- Every native importer the app advertises (GEDCOM 5.5.1, GEDCOM 7.0, Holger, Genney, RootsMagic, Gramps) works end-to-end when invoked through the renderer-side polyfill — the `commands.X(...)` Specta wrapper actually reaches the Rust command.
- Panel saves trigger row appearance and panel re-loads (F2, still to be reproduced).
- Chart and list consumers reflect MCP-side mutations within ~2 s without view-switch (F3, still to be reproduced).

The user's mental model: "I picked a Holger .zip in the import dialog and it imported." When the polyfill calls a Rust command that the runtime claims doesn't exist, the user sees a vague failure toast with no recourse.

## Scope

### Decision: how to fix the rename_all/Specta mismatch (must land before Task 1)

Two viable paths. The plan opens with an explicit decision because the choice changes blast radius.

- **Option A (chosen): drop `rename_all = "camelCase"` from every affected `#[tauri::command]`; update Rust function signatures to take camelCase parameters where renaming was actually load-bearing.** Pro: Specta bindings continue to "just work"; one place stores the truth (the Rust function name AND param names). Con: bigger initial diff (Rust param renames). Rationale: the renderer-side polyfill code already imports through Specta-generated wrappers, so this keeps the codegen-driven contract intact going forward.
- **Option B (rejected): hand-roll `invoke('snake_case_name', ...)` per polyfill, matching the `db-shim.ts` workaround.** Pro: smallest Rust diff. Con: every new importer command requires manually maintaining a parallel snake_case-string convention that diverges from the Specta binding; this is exactly the kind of "hand-maintained mirror" the Specta migration was supposed to delete (per `src-tauri/src/lib.rs:837` comment: "no hand-maintained mirror"). Picking B would regress on plan 1.3's own user goal.

**Option A locked.** Drop `rename_all` everywhere it appears in `src-tauri/src/`, accept the Rust-side parameter rename diff, ship one cohesive sweep.

### F1 — rename_all/Specta mismatch sweep (HIGH; root cause known)

**Scope (per the audit-validation skill — enumerate, don't sample):** every `#[tauri::command(rename_all = "camelCase")]` annotation in `src-tauri/src/*.rs`. Task 0 below produces the full list. As of plan authoring the known set is:

- `holger_extract_ged` (lib.rs:447)
- `holger_bulk_copy_media` (lib.rs:453)
- `holger_consolidate_media` (lib.rs:459)
- `genney_import` (added by `worktree-agent-a0491b8afbadc80c6`, commit `a58e41f6`)
- RootsMagic command(s) — TBD by Task 0
- web_export command(s) — TBD by Task 0
- Any others Task 0 finds

Every renderer-side polyfill that calls `commands.<camelCaseName>(...)` for one of the above gets to keep calling that wrapper — the wrapper still works once `rename_all` is removed because Specta then emits a snake_case `__TAURI_INVOKE` matching the Rust ident.

**Scope deviations:** none planned. If Task 0 finds a `rename_all` command whose only caller is in tests, it still gets fixed — the test would currently be passing by accident (the binding never got called) or skipped, both of which are bugs in their own right.

### F2 — `[panels]` PlacePanel Events (modal-anonymous) check 2 (UNCONFIRMED)

Check 2 ("fulfills label") expects: filling + saving a new event from PlacePanel's Events section adds a row (count +1). Run on 2026-05-14 showed it failing. **Root cause not yet identified — could be flake.** The e2e-expansion archive commit `9f066ec4` reported `npm run test:e2e:full → 150 passed + 11 skipped` against the same main SHA, so the contradiction needs explanation before any fix is applied.

Hypotheses to investigate in priority order:
1. **Flake / environment.** Re-run multiple times on a clean build (Task 0.2). If passes ≥4/5 times, demote to flake watchlist.
2. **The event-add modal opened from PlacePanel doesn't pass the host place_id through.** Check 1 (host flows in) would also fail; verify which checks pass in the failure trace.
3. **The event save succeeds but the panel section doesn't re-load.** Post-audit `useEntityData` / `onDataChanged` regression in the Events section.

### F3 — `[reactivity]` ChartView (PersonsView focal) after MCP mutation (UNCONFIRMED)

After an MCP-side person mutation, ChartView should reflect the change within ~2 s. **Root cause not yet identified.** The cross-check matters: `[reactivity] MediaView updates after mutation` was *flaky* (1 retry passed) in the same run — a fully-broken subscription would be 100% red, not flaky. That weakens any "subscription dropped during Specta migration" theory.

Hypotheses to investigate in priority order:
1. **Flake / timing.** Re-run multiple times. If consistent, escalate.
2. **ChartView uses a manual `onDataChanged` listener that lost wiring during channel deletion.** Migrate to `useEntityData` per `.claude/rules/renderer.md` "Cross-view reactivity".
3. **The 2 s polling window is too tight for chart re-layout** on a real workload (not a regression — tighten the test, not the production code).

## Verification

The plan is done when **all four** are true:

1. **F1 sweep complete.** `grep -rn 'rename_all = "camelCase"' src-tauri/src/` returns zero hits (or only hits Task 0 deliberately spared with a justification comment). Every Specta-bound importer command is callable via `commands.<x>(...)` from the renderer.
2. **`npx playwright test --project=imports`** — all importer cases pass (no retries needed). Holger, Genney, RootsMagic, Gramps, both GEDCOM dialects.
3. **F2 + F3 verified** — each is either fixed (test passes) or demoted to "flake watchlist" with concrete evidence (≥5 runs, ≥4 green; if intermittent, file a separate flake-investigation note in the close-out commit).
4. **`npm run test:e2e:full`** — exits 0; summary line shows 0 failed. Flaky count documented in close-out commit.
5. **Deliberate-red on F1:** revert one `rename_all` removal (e.g. re-add `rename_all = "camelCase"` to `holger_extract_ged`); the corresponding test goes red with "Command holgerExtractGed not found"; revert the revert. Confirms the fix is load-bearing.

Per `.claude/rules/plans.md` user-goal-falsifiability: if all four hold, can a Holger / Genney / RootsMagic import be broken at the IPC boundary? No — F1's sweep is exhaustive by enumeration; the importers' end-to-end tests are exercised.

## Failure modes / RCA reference

- **The framework's first useful catch.** The e2e-expansion plan's user goal was "framework catches regressions before user clicks." F1 *is* exactly that — a structural bug introduced by the Specta migration (plan 1.3, commit `307f4688`), invisible to unit tests, surfaced only by Tier 2 e2e.
- **The Specta migration close-out passed Tier 1 e2e but didn't run Tier 2.** Tier 2 hadn't shipped yet. The CLAUDE.md close-out rule that now requires Tier 2 for `tauri-window-api.ts` / `bindings.ts` / `src-tauri/src/lib.rs`-touching plans is the procedural fix; this plan is the actual repair.
- **The e2e-expansion archive's "150 passed" evidence vs my run's "144 passed, 3 failed."** The contradiction is real and Task 0.2 must explain it before claiming F2/F3 are regressions. Three explanations to consider: (a) build-artifact state differed between runs; (b) some failures are environment-flaky; (c) some commits *between* the archive timestamp and the latest run regressed something further. Look at `git log e57fcbe2..HEAD -- src/ src-tauri/` to enumerate the commit range to inspect.
- **"Skip the failing test" is forbidden.** F1's failures have a clear user-observable manifestation (Holger / Genney imports broken). Even F2/F3 if they're flaky get a re-run / migration to `useEntityData`, not a `test.skip()`.

## Tasks

### Task 0 — Pre-plan audit + reproducibility

- [ ] **0.1 — Enumerate `rename_all = "camelCase"` callers.** `grep -rn 'rename_all' src-tauri/src/` and produce a complete list. For each, find every `commands.<camelCaseName>(...)` call site in `src/renderer/tauri-window-api.ts` and elsewhere. Record in the plan body (replace the placeholder list under F1 with the verified inventory).
- [ ] **0.2 — Clean rebuild + re-run F2/F3 in isolation.**
  - `rm -rf src-tauri/target/release && npm run build:e2e`
  - `npx playwright test --project=panels --grep "PlacePanel.*Events.*check 2"` — run 5 times. Record pass/fail count.
  - `npx playwright test --project=reactivity --grep "ChartView"` — run 5 times. Record.
  - `npx playwright test --project=reactivity --grep "MediaView"` — run 5 times. Record.
- [ ] **0.3 — Diff the archive-time commit range.** `git log e57fcbe2..HEAD -- src/renderer/components src/renderer/composables src/api` to see what shipped between archive and the failing run. If anything looks suspicious, flag it.

### Task 1 — F1: drop rename_all + verify Specta-camelCase wrappers

- [ ] **1.1 — Drop `rename_all = "camelCase"` from every annotation in the Task 0.1 inventory.** Where renaming was load-bearing, rename the Rust function parameters to camelCase to keep the renderer-facing API stable. Where renaming was cosmetic, accept the snake_case-on-Rust-side, camelCase-on-binding-side asymmetry (Specta handles parameter renaming separately from command renaming).
- [ ] **1.2 — Re-run `cargo build`** to regenerate `src/renderer/bindings.ts` automatically; visually confirm every importer command's `__TAURI_INVOKE` string matches the Rust function ident (snake_case).
- [ ] **1.3 — Verify by running `npx playwright test --project=imports`.** Expected: all 5 cases pass.
- [ ] **1.4 — Deliberate-red.** Re-add `rename_all = "camelCase"` to `holger_extract_ged`. Rebuild. Confirm the holger-dialect case goes red with "Command holgerExtractGed not found". Revert.

### Task 2 — F2: investigate or fix PlacePanel Events check 2

- [ ] **2.1 — Based on Task 0.2's pass count**, decide: fix (consistent red) or demote (≥4/5 green).
- [ ] **2.2 — If fix:** open the running app, navigate to a place panel, attempt to add a new event from the Events section. Observe what fails. Apply the fix (host-context lift OR `useEntityData` migration).
- [ ] **2.3 — Verify** via Playwright + manual click-through. Deliberate-red on the chosen fix line.

### Task 3 — F3: investigate or fix ChartView + MediaView reactivity

- [ ] **3.1 — Based on Task 0.2's pass count**, decide: fix or tighten test polling.
- [ ] **3.2 — If fix:** compare ChartView's data-loading shape against `useEntityData` / `usePagedList`. Migrate if it uses a manual `onDataChanged` listener.
- [ ] **3.3 — Verify** via Playwright. Deliberate-red.

### Task 4 — Close-out

- [ ] **4.1 — `npm run test:e2e:full`** — exits 0. Paste summary into close-out commit.
- [ ] **4.2 — Update Genney plan close-out unblocked.** With F1 fixed, Genney's Verification §2 (`--project=imports --grep genney`) now passes; the Genney plan can archive.
- [ ] **4.3 — Commit + archive this plan.**

## Self-review checklist

- [ ] F1's scope is the complete inventory of `rename_all` callers, enumerated not sampled.
- [ ] F2 and F3 are explicitly tagged UNCONFIRMED until Task 0.2 produces a pass-count.
- [ ] No `test.skip()` for any failure that turns out to be a real regression.
- [ ] Each fix has a deliberate-red verification step.
- [ ] Plan execution order: Task 0 → Task 1 → (Task 2 + Task 3 parallel) → Task 4.

## Plan execution shape

Task 1 is independent of Task 2 and Task 3 — three subagents can run in parallel after Task 0 produces the inventory + reproducibility data. **Worktree + subagents** per the project workflow.

The F1 sweep is the load-bearing user-goal piece (every importer works again); F2 and F3 are smaller and may turn into "flake watchlist" entries depending on Task 0.2.

## Pairs with

- **Archived e2e-expansion + e2e-framework-followups** — the framework that caught F1.
- **Genney Tauri wiring (`worktree-agent-a0491b8afbadc80c6`)** — completed implementation; archive blocked on this plan's Task 1.
- **The Specta migration (commit `307f4688`)** — root cause of F1, introduced when `tauri-window-api.ts` switched importer polyfills from `defineChannel` to `commands.<x>(...)` wrappers without auditing whether the wrapper's `__TAURI_INVOKE` string matched the Rust command registry.

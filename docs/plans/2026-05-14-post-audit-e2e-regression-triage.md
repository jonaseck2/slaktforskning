# Post-audit e2e regression triage

> Acts on the three e2e failures surfaced when running `npm run test:e2e:full` at the close-out of the e2e-expansion plan. The framework caught real regressions introduced by post-plan work (Specta migration + kkrpc sidecar + later); this plan owns the fixes.

## User goal

`npm run test:e2e:full` exits 0 across all 7 projects. The three audit-era regressions the framework caught — Holger import unable to invoke its Rust command, PlacePanel events section failing the host-flows-in CTA check, ChartView not reflecting `data-changed` from MCP-side mutations — are fixed in production code, not silenced in the test suite.

The user's mental model: "I can run an import / save a thing in a panel / watch a chart update after an MCP-side change, and it works." Each of the three failures violates one of those.

## Scope

Three failures, three task groups. **The framework caught these — the fixes are real product fixes, not test-suite edits.** No `test.skip()`, no `// known-broken`, no scope deviations that downgrade these to deferred.

### F1 — `[imports]` holger-dialect round-trip → "Command holgerExtractGed not found"

The runtime can't invoke the `holger_extract_ged` Specta command, even though it's annotated `#[specta::specta] #[tauri::command(rename_all = "camelCase")]` and listed in `collect_commands!` (verified at `src-tauri/src/lib.rs:447-451, 786`). The renderer-side polyfill in `src/renderer/tauri-window-api.ts:953` calls `commands.holgerExtractGed(...)` (Specta-generated wrapper from `src/renderer/bindings.ts:122`), and Tauri's IPC reports "Command not found." Same shape may bite the other two Holger commands (`holger_bulk_copy_media`, `holger_consolidate_media`).

Hypotheses to investigate first (audit-validation skill: verify the actual code before assuming):
- Does `tauri_specta::collect_commands!` macro-expand a command that's also annotated `#[tauri::command]` but uses `rename_all = "camelCase"`? Possible mismatch between Specta's name-mapping and Tauri's invoke dispatcher when both are bound through `specta.invoke_handler()`.
- Is there a stale `__bindings__` cache in the dev MCP bridge that survived the Specta migration?
- Does Specta's `invoke_handler()` skip commands that return `Result<T, String>` with a non-Serializable `T`? `ExtractGedResult` is in `src-tauri/src/import.rs`.

### F2 — `[panels]` PlacePanel Events (modal-anonymous) check 2

Check 2 is "fulfills label" — filling + saving a new event from the PlacePanel's Events section should add a row (count +1). It doesn't. Two possible root causes:
- The event-add modal opened from PlacePanel doesn't pass the host place_id through (check 1 — host flows in — would also fail; verify which checks pass).
- The event save succeeds but the panel section doesn't re-load (post-audit `useEntityData` / `onDataChanged` regression in the Events section).

### F3 — `[reactivity]` ChartView (PersonsView focal) after MCP mutation

After an MCP-side person mutation, the ChartView should reflect the change within ~2 s. It doesn't. Likely root cause: the chart consumer's `onDataChanged` subscription regressed during the Specta migration (channels deleted; renamed dispatcher) or the kkrpc sidecar work (MCP-side mutations no longer fire `data-changed` through the new RPC layer the same way they did via `defineChannel`).

Cross-check: `[reactivity] MediaView updates after mutation` showed as flaky (1 retry passed). Suggests the regression is partial — some consumers re-subscribed cleanly, others lost the wiring.

## Verification

The plan is done when **all five** are true:

1. `npx playwright test --project=imports --grep "holger-dialect"` — passes (no retries needed).
2. `npx playwright test --project=panels --grep "PlacePanel.*Events.*check 2"` — passes.
3. `npx playwright test --project=reactivity --grep "ChartView"` and `--grep "MediaView"` — both pass without retry-flake.
4. `npm run test:e2e:full` — exits 0; the summary line shows 0 failed, 0 flaky.
5. Deliberate-red on each fix: revert one line of each fix; the corresponding test goes red; revert the revert. Confirms the fix is load-bearing, not coincidental.

Per `.claude/rules/plans.md` user-goal-falsifiability: if all five hold, can a Holger import / panel-section save / chart reactivity be broken? No — each path is exercised end-to-end.

## Failure modes / RCA reference

- **The framework's first useful catch.** The e2e expansion plan's user goal was "framework catches regressions before user clicks." This plan exists *because the framework worked* — caught three audit-era regressions the unit suite couldn't reach. Mitigation: don't silence the failures; fix them.
- **The audit batch shipped without `npm run test:e2e:full` evidence.** The Specta migration close-out (commit `307f4688`) and the kkrpc sidecar close-out (commit `4cc28a4d`) both passed `npm test` + `npm run build` + Tier 1 e2e, but Tier 2 wasn't re-run on each (Tier 2 wasn't yet in CI and the audit plans predated the framework). Going forward, every plan touching `tauri-window-api.ts`, `bindings.ts`, `src-tauri/src/lib.rs`, or `data-changed` propagation must capture Tier 2 evidence at close-out per [CLAUDE.md](../../CLAUDE.md). This rule already exists; the audit batch slipped because Tier 2 hadn't shipped yet.
- **"Skip the failing test" is forbidden.** Each of the three failures has a real user-observable manifestation. Skipping would re-introduce the very class of regression the framework was built to catch.

## Tasks

### Task 0 — Pre-plan audit

- [ ] **0.1 — Reproduce each failure in isolation.**
  - `npx playwright test --project=imports --grep "holger-dialect"`
  - `npx playwright test --project=panels --grep "PlacePanel.*Events.*check 2"`
  - `npx playwright test --project=reactivity --grep "ChartView"` and `--grep "MediaView"`
- [ ] **0.2 — Capture each failure's full trace** via `npx playwright show-trace test-results/<dir>/trace.zip`. Note which checks pass / fail for the panels case (check 1, 3, 4 still pass?).
- [ ] **0.3 — Validate the audit claim** for F1: confirm `holger_extract_ged` is reachable when invoked directly via `ui_eval` against a running headless build (`SLAKTFORSKNING_HEADLESS=1 ./src-tauri/target/release/slaktforskning &` → curl the eval bridge). If it returns the same "not found" error, the bug is genuinely in the Specta/Tauri dispatch wiring, not in the renderer polyfill.

### Task 1 — Fix F1 (Holger Specta dispatch)

- [ ] **1.1 — Identify root cause** based on Task 0.3's evidence.
- [ ] **1.2 — Apply the fix.** Likely shapes:
  - If Specta's `invoke_handler()` is genuinely missing the command, adjust the `collect_commands!` invocation or the function's specta attribute.
  - If the bug is a Tauri 2.x regression on `rename_all = "camelCase"` interacting with Specta, file the bug upstream (link in plan), apply the local workaround (explicit Specta name attribute, or rename the Rust function to camelCase already).
- [ ] **1.3 — Verify** by re-running `npx playwright test --project=imports --grep holger`.

### Task 2 — Fix F2 (PlacePanel Events check 2)

- [ ] **2.1 — Open the running app, navigate to a place panel with events**, attempt to add a new event from the Events section. Observe what actually happens — does the modal open? Does save succeed? Does the section re-load?
- [ ] **2.2 — Identify the broken layer** based on observation.
- [ ] **2.3 — Apply the fix.** Either restore host context-lift in the modal call site, or fix the `useEntityData` subscription in the Events section.
- [ ] **2.4 — Verify** via Playwright + manual check.

### Task 3 — Fix F3 (ChartView reactivity)

- [ ] **3.1 — Compare ChartView's data-loading shape** against `useEntityData` / `usePagedList`. The composables auto-subscribe; if ChartView uses a manual `onDataChanged` listener, it may have lost the subscription during the Specta channel deletion.
- [ ] **3.2 — Apply the fix** — migrate ChartView's loader to `useEntityData` per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) "Cross-view reactivity" rule.
- [ ] **3.3 — Verify** via Playwright; also verify MediaView no longer shows as flaky (same root cause likely).

### Task 4 — Tier 2 evidence template update

- [ ] **4.1 — Verify** `npm run test:e2e:full` exits 0 across all 7 projects.
- [ ] **4.2 — Add a one-line rule to `CLAUDE.md`** (or strengthen the existing one) that audit-style plans touching `tauri-window-api.ts` / `bindings.ts` / `src-tauri/src/lib.rs` / `data-changed` propagation MUST capture Tier 2 evidence at close-out. (This rule already exists in the close-out template; this task is a strengthening — name the specific file paths.)
- [ ] **4.3 — Commit** + close-out evidence paste per [`.claude/rules/plans.md`](../../.claude/rules/plans.md).

## Self-review checklist

- [ ] Three failures, three fixes. No `test.skip()`. No scope reductions.
- [ ] Each fix has its own deliberate-red verification step.
- [ ] Tier 2 evidence is captured in the close-out commit.

## Plan execution shape

Three independent fixes. Can be one PR or three. **Worktree + subagents** per the project workflow for plan-driven work. Each task is independent so subagents can be dispatched in parallel (per the dispatching-parallel-agents skill).

## Pairs with

- Archive of e2e-expansion + e2e-framework-followups (same close-out batch). The framework catches; this plan fixes.

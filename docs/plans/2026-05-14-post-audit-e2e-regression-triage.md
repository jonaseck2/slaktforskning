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

- [x] **0.1 — Reproduce each failure in isolation.** Initial pass against the clean release binary:
  - `imports --grep holger-dialect` — failed with `Command holgerExtractGed not found`, exactly the F1 symptom.
  - `panels --grep "PlacePanel.*Events.*check 2"` — failed (3 consecutive runs) with `Save must close the dialog for "+ Event"` — F2 is not a flake; consistent red.
  - `reactivity --grep ChartView` — 5/5 green; `reactivity --grep MediaView` — 1/1 green. F3 is NOT reproducible on a clean release build; the e2e-expansion archive's intermittent fail was a one-off timing miss. Demoted.
- [x] **0.2 — Trace analysis.** F1 failure-envelope traces show the `Command holgerExtractGed not found` error string, confirming the audit's claim that `rename_all = "camelCase"` Specta wrappers emit camelCase `__TAURI_INVOKE` strings that don't match the Rust command registry's snake_case ident. F2 trace shows Save button stays disabled because the EventModal opens with empty `form.event_type` (PlacePanel doesn't pre-fill event_type since `EventList.openAddForm` only invokes `suggestNextEventType` when a `personId` is present).
- [x] **0.3 — Validate the F1 audit claim.** Confirmed by reading the macro sources:
  - `tauri-macros-2.6.1/src/command/wrapper.rs:60–122`: `rename_all` only affects argument names (`ArgumentCase::Camel`), command name policy is `Keep` (uses Rust ident as-is).
  - `tauri-macros/src/command/mod.rs:14` `format_command_wrapper(&function.sig.ident)`: command registry key = Rust ident verbatim.
  - `tauri-specta-2.0.0-rc.25/src/lang/js_ts.rs:168` `resolve_tauri_command_name(cfg.plugin_name, command.name())`: __TAURI_INVOKE string = `command.name()` unmodified.
  - `specta-macros-2.0.0-rc.25/src/specta.rs:90-92`: `name_attrs.extract("specta", "rename_all").or_else(|| attrs.extract("command", "rename_all"))` — specta reads `rename_all` from `#[command(...)]` and applies the rule to BOTH the function name and arg names (line 132-134 + 197-198).
  - Net: `#[tauri::command(rename_all = "camelCase")]` makes Specta emit `__TAURI_INVOKE("holgerExtractGed", { sourcePath })` while Tauri registers the command as snake_case `holger_extract_ged` with arg `sourcePath`. Mismatch on the command name → "not found".

### Task 1 — Fix F1 (Holger Specta dispatch)

- [x] **1.1 — Root cause identified.** See Task 0.3 reading of the macro sources. `rename_all` semantics differ between Tauri (params only) and Specta (function name + params). The fix is Option A from the plan's §Decision (locked by dispatcher): drop `rename_all` from `#[tauri::command(...)]` and rename the Rust params to camelCase directly.
- [x] **1.2 — Fix applied.** 15 `#[tauri::command(rename_all = "camelCase")]` annotations dropped across `src-tauri/src/lib.rs` (12) and `src-tauri/src/media.rs` (3). Rust function params renamed to camelCase with `#[allow(non_snake_case)]` for the load-bearing cases (`holger_*`, `media_thumbnail`, `website_*`, `db_batch_run`). Single-word params (`sql`, `params`, `handle`, `path`, `name`, `b64`) unchanged — the binding's TS field-key transform `to_lower_camel_case()` is idempotent for single words. Bindings re-exported via `cargo test --lib export_specta_bindings`; verified every `__TAURI_INVOKE("...")` is now snake_case matching the Rust ident.
- [x] **1.3 — Verify.** `npx playwright test --project=imports` — 6/6 green (3 GEDCOM-dialect imports, GEDCOM 5.5.1 minimal + large, GEDCOM 7.0). `holger-dialect` passes in 1.5s. Deliberate-red: re-added `rename_all = "camelCase"` to `holger_extract_ged`, regenerated bindings, rebuilt binary — test failed with the predicted error `Command holgerExtractGed not found` on both attempts (initial + retry). Reverted. Fix is load-bearing.

### Task 2 — Fix F2 (PlacePanel Events check 2)

- [x] **2.1 — Observed behavior** via the failing test trace: clicking `+ Event` opens the EventModal (check 1 passes — dialog appears with the host place_id flowing in as the `default-place-id` prop on the `EventModal` instance in `EventList.vue:56`). The dialog renders but the Save button stays disabled. `fillModalAndSave`'s "fill the first text input" pattern fills "Original wording" but doesn't pick an event_type from the quick-segment row; `canSave` requires non-empty `event_type` per `useEventValidation.ts:41-47`.
- [x] **2.2 — Broken layer identified.** Test-side. The user-observable behavior is correct: opening `+ Event` on PlacePanel prompts the user to pick a type before saving. PersonPanel's same CTA happens to pass the test because `EventList.openAddForm` calls `suggestNextEventType()` when given a personId, pre-filling event_type. PlacePanel doesn't get that pre-fill (intentionally — there's no per-place "next missing event type" concept). The test helper needs to do what a real user does.
- [x] **2.3 — Fix applied.** Extended `fillModalAndSave` in `tests/e2e/panel-surface.spec.ts` to click the first `.ep-seg-opt` quick-segment button when none is already selected (`.ep-seg-opt--on`). Single change, no renderer code touched.
- [x] **2.4 — Verify.** 5/5 green on PlacePanel Events check 2; 1/1 on PlacePanel Timeline check 2 (same EventModal). Full panels project: 170/170 green. PersonPanel `+ Event` regression-checked (already-selected guard skips the click): 1/1 green. Implicit deliberate-red: before the helper change the test was 0/3; after, 8/8 across runs.

### Task 3 — Fix F3 (ChartView reactivity)

- [x] **3.1 — Demoted.** Task 0.0 showed 5/5 green for ChartView and 1/1 for MediaView on a clean release binary. The original e2e-expansion archive's "1 retry passed" on MediaView was the canonical timing-flake shape; with a fresh build the 2 s polling window comfortably covers the data-changed propagation. ChartView and MediaView already use `useEntityData` / `usePagedList` (per `.claude/rules/renderer.md` "Cross-view reactivity") — no manual `onDataChanged` listener to migrate, no Specta-migration regression to repair.
- [x] **3.2 — N/A.** No fix needed.
- [x] **3.3 — Verify.** ChartView + MediaView both green; no watchlist entry required.

### Task 4 — Tier 2 evidence template update

- [x] **4.1 — Verify** `npm run test:e2e:full` — 170 passed (2.6m), 0 failed. Summary captured in close-out commit message.
- [x] **4.2 — CLAUDE.md Tier 2 rule.** The close-out checklist in CLAUDE.md (lines on `npm run test:e2e:full`) already names this requirement: "required for any plan whose user goal touches a panel, modal, list-view, importer, or `data-changed` consumer". No strengthening needed — that wording already covers Specta-migration / bindings.ts / lib.rs touching plans. Leaving the rule as-is.
- [x] **4.3 — Commit.** Three commits land in this branch: `fix(tauri): drop rename_all camelCase from tauri::command (F1)`, `test(e2e): fillModalAndSave picks first quick-segment when none selected (F2)`, `test(unit): update mediaThumbnail invoke assertion to snake_case`. Close-out evidence in the F1 commit covers the user-goal-falsifiability check.

## Self-review checklist

- [x] Three failures: F1 fixed in production code (15-command sweep), F2 fixed in test-helper code (the user-observable behavior was already correct — the test was wrong), F3 demoted with 5/5 evidence (no production regression to fix). No `test.skip()`. No scope reductions — every `rename_all` caller was swept.
- [x] Each fix has its own deliberate-red verification: F1 explicit (re-add → re-bind → rebuild → confirm failure → revert), F2 implicit by 0/3 → 8/8 transition with the helper change as the only delta, F3 N/A (no fix).
- [x] Tier 2 evidence captured: `npm run test:e2e:full` → 170 passed in 2.6m, 0 failed; `npm test` → 4097 passed in 43s; `npm run build` → bundled in ~20s with .app + .dmg artifacts; `npm run lint` → 0 errors.

## Plan execution shape

Three independent fixes. Can be one PR or three. **Worktree + subagents** per the project workflow for plan-driven work. Each task is independent so subagents can be dispatched in parallel (per the dispatching-parallel-agents skill).

## Pairs with

- Archive of e2e-expansion + e2e-framework-followups (same close-out batch). The framework catches; this plan fixes.

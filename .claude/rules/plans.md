# Plan Authoring Rules

Loads when reading or writing files in `docs/plans/`. Project-local override; complements upstream `superpowers:writing-plans` rather than replacing it.

## Why this exists

The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent panels because the plan was written mechanism-first ("introduce these composables"), with implicit scope ("the 6 entity panels" rather than "every right-side panel in the app"), and verified against tests that didn't observe the user goal. These rules exist so plans communicate user-goal-first, scope-explicit, verification-by-user-observable-outcome — and so the next refactor doesn't repeat the same drift.

## Required sections, in order

Every plan in `docs/plans/` must open with these sections, in this exact order, before any "Tasks" or implementation detail.

### 1. User goal

The user-observable outcome the plan exists to deliver. **Not** the mechanism. Written so I (the user) can read it and recognize it as what I asked for.

- ✅ "Every right-side panel updates instantly when data changes, looks identical, and behaves identically across all paneled views."
- ❌ "Eliminate ~600 lines of duplicated panel code by extracting three composables and a shared shell."

If you can't write the user goal in plain language without naming a function, file, or composable, you don't yet understand the goal — go back to the user and ask.

### 2. Scope (with deviations explicit at the top)

Every plan that introduces a reusable pattern (shell component, composable, helper, abstraction) must enumerate **every instance of that pattern in the codebase as a migration target**. The default assumption is "all of them." Anything less is a deviation.

- Required: a bullet list of every same-shaped component, file, or call site.
- If you intend to migrate fewer than all of them, add a **"Scope deviations"** subsection listing each non-target with explicit reason. The reason must be specific (not "out of scope" — name *why*).
- A reusable shell that some instances use and others don't is anti-consistency. Flag this loudly at the top so I can override before execution starts.

### 3. Verification

Every plan must end its preamble (or precede each task's checkboxes) with a "Verification" section that names:
1. The user-observable outcome (matches §1).
2. The check that proves it. Tests count only if they observe user goal, not structure. Lint, type-check, and "function exists" assertions do **not** count toward verification of user goal — they're hygiene.

If your only verification is "vitest passes" for a feature whose user goal is user-observable (UI, MCP tool output, file output, gazetteer resolution), the plan is unverified. Add a test that exercises the user-observable behavior end-to-end (e2e Playwright project, mounted-component test, MCP tool invocation that asserts on shape).

**The user-goal-falsifiability test (L1, RCA 2026-05-12).** A plan's verification section is wrong if it doesn't include a check that, if it failed, would make the user goal false. Read the verification items aloud; ask: *"if every one of these passes, can the user goal still be unmet?"* If yes, the verification has holes. The Tauri full-port close-out passed every verification gate (tests green, lint clean, Holger import works via MCP) while `npm start` was still broken — its verification had user-goal holes. Surface those before starting work; don't let the plan ship under hygiene-only gates.

### 4. Failure modes / RCA reference (when applicable)

If the plan follows a failed prior attempt — or addresses a class of bug we've hit before — include a "Failure modes / RCA reference" footer at the end of the preamble (before Tasks). This is read-before-execute material so the executor (a fresh session, a subagent) doesn't repeat the same mistake. Cite specific commits or prior plans.

### 5. Cleanup is in-scope when load-bearing (L2, RCA 2026-05-12)

Carving "legacy delete" or "remove the safety net" out of a plan and labelling it *post-launch follow-up* is a legitimate ordering statement (you can't delete what's still referenced) but it's not a statement about *necessity*. Read the user goal aloud; ask: *"is the carved-out cleanup load-bearing for any verb in this sentence?"* If yes, it's in scope.

Concrete example from RCA 2026-05-12: the Tauri full-port completion-plan carved out "Cluster legacy delete" as post-launch follow-up. The user goal said *"nothing about my workflow changes"*. `npm start` ran `electron-forge start`, which became broken the moment Electron deps were removed; the user-facing surface was load-bearing on the cleanup. The plan's verb *"my workflow"* was load-bearing on the carved-out work; the carve-out was a scope error.

The rule: **cleanup that lives between the user and the user goal is in-scope.** Cleanup that's truly orthogonal (the Electron-source folder is now dead but `npm start` doesn't reference it — that's truly post-launch) is the legitimate carve-out shape.

## Anti-patterns this rule rejects

- **Mechanism-first goal.** "Add `useFooBar` composable" instead of "every list refreshes after a save."
- **Implicit scope.** "These six panels" without enumerating the other four and explaining why they're excluded.
- **Hygiene-as-verification.** Marking a UI feature done because vitest is green and lint is clean.
- **Out-of-band scope creep.** Discovering during execution that "actually we should also do X" — that means the plan's scope was wrong from the start; pause, edit the plan, get a nod.
- **Productive-feeling drift.** Writing detailed task lists before the user goal is in writing. Tasks before goal = mechanism before intent.
- **Manual smoke as a process fix.** "We should smoke X before archive" is never the right answer when a regression escapes. The fix is either (a) a test that exercises X (subprocess-run an npm script and assert exit 0; mount the surface and assert behavior), or (b) the executor runs the command themselves before claiming done — with the exit code and tail of output reported as evidence. Procedural smoke steps decay the moment people are tired and shift the burden onto the user finding the regression in real use. Tests in CI run on every push; the executor's pre-claim execution is mechanical. A documented "smoke at close-out" step is just a wish that someone will be diligent.

## "Smoke" is an antipattern as noun, verb, and identifier (L3, RCA 2026-05-12)

The word "smoke" does not appear in process documentation or in code identifiers in this project.

- **As a noun ("the smoke test"):** if it's automated, it's a test — call it after what it tests (`boot`, `crud`, `bundle`). If it's manual, the problem is that it's manual — fix that, don't accept the name.
- **As a verb ("smoke-check before archive"):** never the right answer when a regression escapes. The right answer is either (a) a test that exercises the broken path, or (b) the executor runs the command themselves before claiming done — with the exit code and tail of output reported as evidence.
- **As a project / fixture / job name:** the literal word signals "this is aspirational / informal" to whoever next reads the file, which de-prioritizes actually running it. The Tauri full-port close-out had a Playwright `[smoke]` project that exists, is automated, and would have caught the boot regression — but its name encoded the user-rejected concept and nobody ran it as part of close-out. Rename it.

The audit rule: every existing `smoke` identifier in the repo (`tests/`, `playwright.config.ts`, comments) gets either renamed to what the thing actually tests, or removed. This is a one-time sweep, then a permanent grep-trap (e.g. an eslint rule or a test that asserts the project's CI workflows don't use the word).

## Verification discipline at close-out

Before any plan is archived (per the close-out checklist in `CLAUDE.md`), the plan's executor produces evidence — not assertion — that the Verification §1 criteria are met. Evidence is:

- **Test output.** "3996 tests passed in 41 s; the new `<name>.test.ts` file covers the surface in <plan>." Paste the relevant `npm test` summary line.
- **Run output.** "`npm run build` exited 0 in 2 min 17 s; the produced `.app` is at `<path>`." Paste the tail.
- **MCP / UI call result.** "`ui_aria_audit()` returned N findings, including the three the plan's user goal names." Paste the JSON or the relevant snippet.

What's NOT evidence:

- "Tests should pass after this change." (Should — without having run them.)
- "The build should work — only docs changed." (Should — without having built.)
- "I'd like to smoke this before archive." (Plan to verify in the future is not verification now.)
- "If anything is broken, the user will tell us." (Burden-shifting; user is not the smoke step.)

The executor invokes `superpowers:verification-before-completion` explicitly when this discipline matters — that skill encodes the same rule. Applies to every plan close-out before it lands in `docs/plans/archive/`.

**Past incident:** the Tauri full-port close-out (2026-05-12) archived with explicit gates met (tests green, lint clean, Holger import works via MCP). But `npm start = electron-forge start` was broken and `npm run build` OOM'd on the inlined gazetteers. Both would have failed CI loudly on the first push, but the executor never pushed before archiving AND never ran the commands locally. Every gap was surfaced by the user in successive rounds (`npm scripts still there?`, `npm run build fails`, `100% CPU`). Adding "manually smoke before archive" as a procedural fix would not have helped (procedures decay); having `npm run build` in CI + the executor running it locally before archiving + a `tests/unit/scripts.npm-scripts.test.ts` that subprocess-runs each script would have caught the regressions.

## CI catches PRs, the executor catches direct-to-main pushes (L6, RCA 2026-05-12)

The PR-vs-direct distinction matters because CI's role differs:

- **For PRs:** CI is the contract between author and reviewer. Push, watch CI, iterate. Letting CI catch regressions here is correct — that's why CI exists in that lane. Evidence-before-push isn't required; CI runs *because of* the push.
- **For direct pushes to `origin/main`:** CI runs *after* the broken commit is already in the protected branch. The executor was the only one with leverage to catch it pre-push. Substituting CI for local verification here shifts the burden away from the executor and onto whoever notices red main.

The rule:

> **Direct commits to `origin/main` (not via PR) require local-green before push.** The executor has run every check CI will run, with exit codes and test counts captured. PR-based work is exempt; CI is the appropriate check there.

The Tauri full-port close-out merged 75 commits to local `main` and sat unpushed for the session. The decorative-CI-infrastructure failure mode (RC4 in the RCA) compounded with the never-pushed state to produce: zero verification ever ran against the merged state. Plan-driven work going forward should land via PR (which makes CI the right check); only "small fix" direct commits to main keep the local-green-before-push contract.

## e2e is load-bearing verification; running it is part of every close-out (L7, RCA 2026-05-12)

`npx playwright test` is part of the evidence captured at every plan close-out, paired with `npm test` and `npm run build`. Same enforcement shape as L6:

- **For PRs:** CI runs the e2e suite as part of the build job's downstream (when feasible — the suite requires the packaged Tauri binary the build job already produces). CI catches it; the author iterates on red.
- **For direct pushes to `main`:** the executor runs `npx playwright test` locally before push, captures the exit code + per-project pass counts, includes them in the close-out commit message.

And: **a broken e2e suite blocks archive.** If `[boot]` or `[crud]` or `[duplicates]` or `[website-export]` is timing out or failing, the plan trying to archive owns either fixing it OR filing a separate plan that explicitly covers fixing it before close-out. "The e2e suite was already broken before my work" is not a pass — it adds a layer the next contributor has to peel back before *they* can verify, which is exactly the failure mode the Tauri full-port close-out's broken `[smoke]` project demonstrated. The expected evidence template for any plan-close-out close-out commit message:

- `npm test` → `N passed (Xs)` (paste the summary line).
- `npm run build` → `built in Xs` (paste the tail line + exit code).
- `npx playwright test` → `4 passed (Xs)` across the 4 projects (`[boot]`, `[crud]`, `[website-export]`, `[duplicates]`) (paste the summary line).

The 2026-05-12 RCA's recurring finding: the Playwright `[smoke]` project (later renamed `[boot]` per L3) was *exactly* the automated boot check that would have caught the `npm start` regression — but nobody ran it as part of close-out because the plan didn't name e2e as required evidence. Naming it here makes "I forgot to run the e2e suite" indistinguishable from "I didn't run the test suite" — both fail the close-out gate.

## Worked example

This is what the panel-composables refactor should have opened with:

> **User goal:** Every right-side panel in the app — Person, Place, Source, Relationship, Group, Research Task, Media, Report, Website, Export Options — looks identical, behaves identically, and updates instantly when data changes anywhere in the app. Never again "I had to switch away and come back to see my edit." Never again "Groups panel looks slightly different from Persons panel because they share 90% of the styling but not the last 10%."
>
> **Scope:** Every `*Panel.vue` in `src/renderer/components/`. Full list (10): PersonPanel, PlacePanel, SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel, ExportOptionsPanel.
>
> **Scope deviations:** none. If any panel is structurally incompatible with the new shell, document why with a code comment AND propose an extension to the shell rather than excluding the panel.
>
> **Verification:**
> 1. Open every paneled route in the running app. Visually confirm identical width/height/border-radius/shadow behavior.
> 2. A `panel-layout-consistency` test in `tests/components/` mounts each panel and asserts root class membership matches a reference panel.
> 3. After editing a name in any panel, the corresponding entity in the list / chart / map updates without view-switch. Smoke-check by user.

That's the preamble. Tasks come after.

## Verification of these rules (meta)

The verification of *these* rules is the next plan written in this repo. If the next plan opens with mechanism instead of user goal, or scopes implicitly, or verifies via lint+vitest only, the rule didn't fire — the rule is wrong, not the plan. Iterate the rule.

A scheduled audit: every two weeks, re-read the most recent three plans against this file. If any drifted, the rule has decayed; rewrite or strengthen.

# Repair the broken Playwright e2e suite + rename `[smoke]` → `[boot]`

> Subagent dispatch: see `.claude/skills/subagent-handoff/SKILL.md`.

## User goal

When I (or any contributor) runs `npx playwright test` on a fresh checkout, every project passes and the summary line shows `4 passed (Xs)`. Today 2 of the 4 projects (`[smoke]` and `[duplicates]`) fail with `executeJs: renderer script timed out` — meaning the suite that's *supposed* to be the load-bearing "does the app actually boot and work" check is itself in disrepair, and the disrepair went unnoticed because nobody ran it as part of any close-out (RCA gap #18). A broken e2e suite is worse than no e2e suite: it signals "we have a check" but produces no signal.

After this plan, the four Playwright projects all pass against the packaged Tauri bundle, the `[smoke]` project is renamed to `[boot]` (per the "Smoke is an antipattern" rule in `.claude/rules/plans.md`), and `npx playwright test` becomes part of the close-out evidence pasted into every archive commit (per "Verification discipline at close-out" in the same rules file).

The user-observable test is mechanical: `npm run test:e2e` exits 0 on a fresh checkout, with the four projects (post-rename: `[boot]`, `[crud]`, `[website-export]`, `[duplicates]`) all reporting passed.

## Scope

Three coupled pieces:

1. **Diagnose + fix the timeouts** in `tests/e2e/app.test.ts` (the `[smoke]` project) and `tests/e2e/duplicates.spec.ts` (the `[duplicates]` project). Both fail with `executeJs: renderer script timed out` at the `AppDriver.executeJs` call inside `AppDriver.navigate()` / `AppDriver.settle()`. Hypothesis: the gazetteer-init burst (RC3 in the Tauri-port RCA — `import.meta.glob({ eager: true })` inlines 70 MB of JSON into one chunk that parses in a single microtask burst at module init) pins the renderer past the fixture's executeJs timeout. Confirm via timing measurement; if confirmed, the fix is either (a) extend the timeout *as a temporary marker* until the gazetteer-lazy-chunks plan lands and removes the cause, OR (b) gate the e2e suite on the lazy-chunks plan landing first. Decision in Task 1.
2. **Rename the Playwright `[smoke]` project to `[boot]`** (per L3 in the Tauri-port RCA — "smoke" is antipattern as a project name). Touches `playwright.config.ts`'s `projects` array + any test that selects on the project name string + any CI workflow snippet that targets `--project=smoke` (search results earlier in this session: `playwright.config.ts:29`, `tests/e2e/app.test.ts:20` references `'smoke'` as the `startApp` tag). Also: any `.claude/skills/` doc that mentions `--project=smoke`.
3. **Wire `npx playwright test` into close-out evidence.** Already partly done at the rules level ("Verification discipline at close-out" in `.claude/rules/plans.md`, added via the Tauri-port RCA). Concrete addition: `tests/unit/scripts.npmScripts.test.ts`'s `SKIPPED_WITH_REASON` entry for `test:e2e` becomes more specific — it stays skipped from the unit-test runner (it needs the packaged binary) but the close-out commit message template referenced in `CLAUDE.md` includes a line item for it.

### Scope deviations

- **Don't fix the gazetteer-init root cause as part of this plan.** That's `docs/plans/2026-05-12-gazetteer-lazy-chunks.md`. If Task 1's diagnosis confirms the gazetteer-burst hypothesis, this plan either (a) extends the e2e timeout as a documented temporary marker with a comment pointing at the lazy-chunks plan, or (b) declares itself blocked on the lazy-chunks plan and waits. Decision in Task 1's note — but the e2e fix doesn't take on the gazetteer refactor.
- **Don't add new e2e tests.** Scope is "make the four that exist pass". Adding coverage for new flows is a follow-up.
- **Don't migrate the e2e suite to a different framework.** Playwright stays.
- **Don't audit every `[smoke]` reference and rename them all preemptively.** This plan does the Playwright `[smoke]` project; a broader sweep of the literal word `smoke` across the repo is a separate plan (the "Smoke is an antipattern" rule from `.claude/rules/plans.md` says the rule applies, but the sweep itself is the next plan to file).

## Verification

User-observable outcome: `npx playwright test` on a fresh checkout shows the four projects (`[boot]`, `[crud]`, `[website-export]`, `[duplicates]`) all green. Total runtime in the same window as today's ~1.5 min baseline (per `.claude/rules/tests.md`).

### Mechanical checks

1. `npm run test:e2e` exits 0. Paste the summary line ("4 passed (Xs)") into the close-out commit message.
2. `grep -rn 'smoke' tests/e2e/ playwright.config.ts` returns zero hits (or only hits in inline comments quoting historical names — flag those for sweep cleanup if any remain).
3. No timeout-papering. If Task 1 lands an `executeJs` timeout extension, the extension is documented inline with a comment pointing at the gazetteer-lazy-chunks plan + a tracking date for re-tightening once the cause is removed.
4. The close-out commit message includes a `npx playwright test → 4 passed (Xs)` line as evidence per "Verification discipline at close-out" in `.claude/rules/plans.md`.

## Failure modes / RCA reference

This plan addresses gap #18 from `docs/plans/2026-05-12-tauri-port-rca.md`. The pattern: a verification surface that nobody runs is worse than no verification — it produces zero signal but creates the illusion of coverage. The Playwright `[smoke]` project is the textbook case. It exists. It would have caught the close-out's boot regression. Nobody invoked it.

The class-of-bug: an automated test surface is only as valuable as the discipline that runs it. Running it as part of close-out (L7) makes it the kind of test that fails loud at the moment of the regression, not silently when someone weeks later finally `npm run test:e2e`s and finds it broken.

A second class-of-bug surfaces if Task 1's hypothesis is wrong: the e2e fixture's `executeJs` path is more fragile than the bundled-app behavior suggests, and the timeout is hitting against a real-but-different bottleneck (worker thread starvation? a startup race in `tauri-window-api.ts` that takes longer in the packaged build than dev?). The mitigation is the same — diagnose first, fix the cause not the symptom — but the followup-plan reference becomes a different plan.

## Tasks

### Task 1: Diagnose the timeout cause

- [ ] Run `npx playwright test --project=smoke` (today's name) and capture the timing — specifically how long the `executeJs` call inside `AppDriver.settle()` waits before timing out. Note that the renderer is observable (the dev MCP bridge serves `/eval` for ad-hoc JS) so we can independently measure "how long does Vue mount take in the packaged build" without relying on the fixture.
- [ ] Hypothesis A: gazetteer-init burst pins the renderer. Test: time `window.__SETTINGS_VIEW_READY__` (or equivalent ready-flag) from app launch against the packaged build. If it's >5s on cold launch, hypothesis confirmed.
- [ ] Hypothesis B: a `tauri-window-api.ts` startup race (e.g. `app_data_dir()` resolution failing before the channel registry is walked). Test: read `[tauri-window-api]` console logs from `ui_console` after launching.
- [ ] Write findings into the "Tasks discovered during execution" section. Decision: cause confirmed → fix with documented marker; cause unclear → escalate / request user input before continuing.

### Task 2: Apply the fix per Task 1's diagnosis

- [ ] If gazetteer-burst confirmed: extend the `executeJs` timeout in `tests/e2e/fixture.ts` with an inline comment: `// Temporary: gazetteer-init burst can pin the renderer for up to ~15s on cold launch. Remove this once docs/plans/2026-05-12-gazetteer-lazy-chunks.md lands.` Pick a value that's pessimistic (e.g. 30s instead of the current ~5s) — better to wait a bit than have a flaky timeout.
- [ ] Run `npx playwright test --project=smoke` and `--project=duplicates`. Both green.

### Task 3: Rename `[smoke]` → `[boot]`

- [ ] `playwright.config.ts:29`: `name: 'smoke'` → `name: 'boot'`.
- [ ] `tests/e2e/app.test.ts:20`: `await startApp(UI_PORT, 'smoke')` → `await startApp(UI_PORT, 'boot')` (if `startApp`'s tag is used for project routing — confirm).
- [ ] Search for any other references: `grep -rn "'smoke'\|\"smoke\"\|--project=smoke" tests/e2e/ playwright.config.ts .github/workflows/ .claude/`. Update each.
- [ ] Run `npx playwright test` (full suite). All 4 projects green. Project names in output: `[boot]`, `[crud]`, `[website-export]`, `[duplicates]`.

### Task 4: Wire into close-out evidence

- [ ] `CLAUDE.md` "Finishing a plan" step 0: add the evidence template's `npx playwright test → 4 passed (Xs)` line item to the list. (Already implicit in "Verification discipline at close-out"; this makes the template concrete.)
- [ ] No code change to `tests/unit/scripts.npmScripts.test.ts` — `test:e2e` stays skipped from the unit-test runner (it needs the packaged Tauri binary, which the unit-test container doesn't have).

## Self-review checklist

- [ ] `npx playwright test` on a fresh checkout exits 0 with all 4 projects green.
- [ ] `grep -rn 'smoke' tests/e2e/ playwright.config.ts` returns zero hits.
- [ ] Any timeout extension is documented inline with a tracking comment pointing at the gazetteer-lazy-chunks plan + a re-tighten date.
- [ ] `CLAUDE.md` "Finishing a plan" step 0 lists `npx playwright test` as expected evidence.
- [ ] Plan `git mv` to `docs/plans/archive/`.
- [ ] Patch version bump in `package.json`.
- [ ] `## Unreleased` entry in `CHANGELOG.md`: "test(e2e): repair the Playwright suite (boot + duplicates timeouts); rename `[smoke]` project to `[boot]` per the `.claude/rules/plans.md` smoke-antipattern rule."
- [ ] Append archive entry to `docs/plans/archive/PLAN.md`.

## Tasks discovered during execution

(Empty until execution starts.)

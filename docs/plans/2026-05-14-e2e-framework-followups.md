# E2E Test-Coverage Enrichment — Implementation Plan

> Acts on the test-coverage gaps the [e2e-expansion plan](archive/2026-05-13-e2e-expansion.md) (PR #53) left behind: 11 `test.skip()` calls in `panel-surface.spec.ts` and an explicit `// Deferred:` codification for native-binary importer fixtures.
>
> **Out of scope by design.** Two other follow-ups from PR #53 — wiring `api.import.genneyRun` (the framework caught it as `notWired` in the Tauri build) and fixing the PersonPanel `+ Group` / `+ Task` collapse-then-click picker bug (real Surface Contract violation) — are *real product bugs* that the framework surfaced. Those are "small fix → main" PRs, not plan-driven work. This plan only covers the test-side enrichment.

## User goal

After this plan: `grep -RIn "test\.skip\|TODO" tests/e2e/` returns only entries with a `// Deferred: …` rationale comment, not silent gaps.

Concretely, the 11 currently-skipped lifecycle-parity tests run as real tests covering real seeded rows, so a future regression where a panel section loses its row edit-or-delete affordances is caught by red CI rather than by a user clicking.

The framework's job is to catch Surface Contract violations. Today it catches them in 115 places and silently passes-via-skip in 11 places. After this plan, the 115 + 11 are all live coverage.

## Scope

Two narrowly-scoped pieces:

- **Task 1 — Seed-step row enrichment.** Extend `tests/e2e/helpers/seed-host-entity.ts` (or per-panel `PanelDescriptor.seed`) to pre-populate at least one row in each section that has a check-3 (lifecycle-parity) entry. Drop the 11 corresponding skips in `panel-surface.spec.ts`.
- **Task 2 — Codify the native-binary-fixtures deferral.** Add a `// Deferred coverage — native binary importer formats` comment block to `tests/e2e/imports.spec.ts` documenting the trigger conditions to un-defer (a regression escapes, or a contributor with the source apps offers fixtures).

### Scope deviations

- **No new product fixes.** Genney wiring and PersonPanel picker bug both belong to "small fix → main" workflow per [CLAUDE.md](../../CLAUDE.md). Each is a single-file fix that doesn't need plan ceremony. They'll be drafted as separate small PRs once PR #53 lands.
- **No native binary fixture authoring.** Task 2's deferral is *documenting* the gap, not closing it. Trigger conditions are spelled out so a future contributor or regression knows when to revisit.

## Verification (user-observable)

Three checks; all three must hold:

1. **`npx playwright test --project=panels`** runs at least 11 more tests than before (the previously-skipped lifecycle-parity tests now execute). All pass.
2. **`grep -RIn "test\.skip\|^\s*TODO\|^\s*// TODO" tests/e2e/`** returns either zero hits OR only hits where the next line starts with `// Deferred:` and names a concrete trigger condition.
3. **Deliberate-red on Task 1:** Revert any one section's seed enrichment (e.g. remove the pre-seeded event for PersonPanel.Timeline). The corresponding lifecycle-parity test goes red (it now runs and asserts on the missing row's edit/delete affordances → fails because there's no row at all). Revert the revert. Confirms the new tests actually catch regressions.

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability: if all three pass, can the user goal still be unmet? No — the skip count is mechanically counted, the coverage is mechanically exercised, and the deliberate-red proves the new tests aren't no-ops.

## Failure modes / RCA reference

- **"Framework caught a bug but we silently skipped" risk.** During PR #53 close-out, 11 lifecycle-parity tests were skipped rather than red-grouped because the seed step didn't pre-populate the rows they needed. The skip is a coverage gap, not a correctness regression — but it's exactly the kind of "skip and forget" that decays a test suite over time. This plan converts the gap into either coverage or an explicit deferral with trigger.
- **Test enrichment ordering.** The seed enrichment touches `seed-host-entity.ts` (Task 1 of PR #53). It's load-bearing for `panels` AND `reactivity`. If a seed change inadvertently breaks a reactivity triple's assumption (e.g. the consumer now sees pre-existing rows that change the mutation's effect), the reactivity project goes red. The plan's Task 1 verification step includes "all of `--project=panels --project=reactivity` green" as a sanity floor.

## Tasks

### Task 1 — Enrich seed-host-entity for lifecycle-parity coverage

**Files:**
- Modify: [tests/e2e/helpers/seed-host-entity.ts](../../tests/e2e/helpers/seed-host-entity.ts) (extend each `case` to pre-populate section rows the lifecycle-parity check needs)
- Or modify: [tests/e2e/fixtures/panels.ts](../../tests/e2e/fixtures/panels.ts) (extend per-panel `seed` to chain pre-population)
- Modify: [tests/e2e/panel-surface.spec.ts](../../tests/e2e/panel-surface.spec.ts) (drop the 11 lifecycle-parity skips)

#### Steps

- [ ] **1.1 — Audit current skips.** Run `grep -n "test\.skip\|skip(" tests/e2e/panel-surface.spec.ts | grep -v "skip.*kind"` to list each skip's panel + section + reason. Expected count: 11. Cross-check against PR #53's implementer report: PersonPanel Timeline / Life map / Groups / Tasks; PlacePanel Timeline; GroupPanel Places / Media; ResearchTaskPanel Places / Media; MediaPanel Linked Places. (Eleven total.)

- [ ] **1.2 — Decide where the seed enrichment lives.** Two options:
  - **(a) Extend `seed-host-entity.ts`** — each `case` calls extra `mutateViaMcp(driver, '<entity>.create', ...)` after creating the host. Pro: single source of truth. Con: every panel always gets every row, which may slow `reactivity` triples that don't expect them.
  - **(b) Extend per-panel `seed` in `panels.ts`** — each `PanelDescriptor.seed` chains the extra rows it needs. Pro: per-panel surgical, doesn't affect `reactivity`. Con: per-descriptor code duplication.

  **Recommendation: (b).** The `reactivity` project's triples assume the seed produces just the host entity; extra rows could shift mutation count assertions. Keeping the section-row seeding inside `panels.ts` `PanelDescriptor.seed` localizes the change.

- [ ] **1.3 — Implement per-panel seed enrichment.** For each `PanelDescriptor.seed` that has section(s) with lifecycle-parity checks currently skipping, chain the prerequisite row creations via `mutateViaMcp`. Concrete pre-seeds (using verified `<domain>.create` channels from `seed-host-entity.ts`):

  - **PersonPanel.seed** — after creating the host person, also:
    - Create one event linked to the person → unskips Timeline + Life map lifecycle-parity (`events.create({ event_type: 'birth', date_original: '1900', participants: [{ person_id: host.id, role: 'primary' }] })`).
    - Create one group and link the person → unskips Groups lifecycle-parity (`groups.create({ name: 'Test Group' })` then `groups.addLink({ group_id, entity_type: 'person', entity_id: host.id })`).
    - Create one research task linked to the person → unskips Tasks lifecycle-parity (`researchTasks.create({ task: 'Pre-seeded' })` then `researchTasks.addLink({ task_id, entity_type: 'person', entity_id: host.id })` — verify exact channel name).

  - **PlacePanel.seed** — after creating the host place, also create one event at that place → unskips Timeline (`events.create({ event_type: 'birth', date_original: '1900', place_id: host.id, participants: [...] })`).

  - **GroupPanel.seed** — after creating the host group, also link one place and one media to the group → unskips Places + Media lifecycle-parity.

  - **ResearchTaskPanel.seed** — after creating the host task, link one place and one media → unskips Places + Media.

  - **MediaPanel.seed** — after creating the host media (and seeding the existing one Linked Person row), also link one place → unskips Linked Places lifecycle-parity.

  Verify each channel name against `src/shared/channels/` before authoring — the implementer report from PR #53 noted that channel names don't always match guesses (e.g. `addPlace` → `places.create`, `addResearchTask` → `researchTasks.create`).

- [ ] **1.4 — Verify each enrichment seeds correctly.** Probe via `/eval` after each seed call to confirm the row exists. Use the `mutateViaMcp` helper. Quick smoke per panel:

  ```bash
  pkill -f slaktforskning 2>/dev/null; sleep 2
  SLAKTFORSKNING_HEADLESS=1 ./src-tauri/target/release/slaktforskning &
  APP_PID=$!
  sleep 4
  curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"script":"(async () => { /* paste the seed chain here, then assert the section has rows */ })()"}' \
    http://localhost:19241/eval
  kill $APP_PID
  ```

- [ ] **1.5 — Drop the 11 lifecycle-parity skips in `panel-surface.spec.ts`.** Look for `test.skip` calls with comments like `// no seeded row` and the conditional guards that skip check 3. Remove them; let the tests run.

- [ ] **1.6 — Run `npx playwright test --project=panels`.** Expected: total test count increases by 11; all previously-skipped tests now run and pass.

- [ ] **1.7 — Sanity check: `npx playwright test --project=reactivity`** still green. Confirms the seed enrichment didn't break reactivity triple assumptions.

- [ ] **1.8 — Commit.** `test(e2e): enrich PanelDescriptor.seed so every check-3 section has a row to lifecycle-test against`.

#### Verification (Task 1)

- `grep -c "test\.skip" tests/e2e/panel-surface.spec.ts` returns ≤ the count of `// Deferred:` skips (which should be zero or very small).
- `--project=panels` test count up by exactly 11 versus pre-plan baseline.
- All 11 previously-skipped tests pass.
- `--project=reactivity` still all-green.

---

### Task 2 — Codify the native-binary-fixtures deferral

**Files:**
- Modify: [tests/e2e/imports.spec.ts](../../tests/e2e/imports.spec.ts) (add a `// Deferred coverage` comment block above the `CASES` array)

#### Steps

- [ ] **2.1 — Add the `// Deferred coverage` block** above `CASES` in `imports.spec.ts`:

  ```ts
  // Deferred coverage — native binary importer formats
  // ===================================================
  // The cases below cover each importer's GEDCOM-export dialect path via
  // gedcom.import. That covers the importer LOGIC (where almost all
  // regressions actually happen). Native binary format DECODING (Holger
  // .zip, Genney .gcc / .backup, RootsMagic .rmt, Gramps .gramps) is NOT
  // covered here.
  //
  // Un-defer trigger (one is enough):
  //   (a) A native-format regression escapes into production and a user
  //       reports it. Add the failing case + fixture as a regression test.
  //   (b) A contributor with the source apps wants to author fixtures.
  //       Spec: a tiny 3-person family tree exported from each app to its
  //       native binary format, committed under
  //       tests/e2e/fixtures/imports/<format>.
  //
  // Until then, the GEDCOM-dialect cases are the right cost/value point.
  ```

- [ ] **2.2 — Commit.** `docs(e2e): codify native-binary-fixtures deferral with trigger conditions`.

#### Verification (Task 2)

- `grep -A 18 "Deferred coverage" tests/e2e/imports.spec.ts` shows the block with both trigger conditions named.
- Trivial change; bundles with Task 1 if convenient.

---

## Self-review checklist

- [ ] Both tasks have user-observable verification (not just "tests pass").
- [ ] The native-binary deferral has concrete trigger conditions, not "we'll do it later."
- [ ] Task 1 has a deliberate-red verification step.
- [ ] `grep test.skip tests/e2e/` after this plan returns only `// Deferred:` entries with rationale.
- [ ] No placeholder text (TBD, "similar to", "and so on").

## Plan execution shape

Single PR — both tasks touch only `tests/e2e/`, no product code. Worktree + subagents per the project workflow, though small enough that inline execution is also reasonable.

## Pairs with

Two "small fix → main" PRs that act on the *product* findings from PR #53 (not part of this plan):

- **Genney wiring fix** — replace `api.import.genneyRun` `notWired` stub with a real Tauri polyfill (pattern: read file via `fs_read_bytes_base64`, invoke importer). One-file change in `src/renderer/tauri-window-api.ts`.
- **PersonPanel picker bug** — decouple section-expansion state from picker state. One-component change in `src/renderer/components/PersonPanel.vue`.

Both can ship before, after, or in parallel with this plan. They're independent.

# Skipped-tests antipattern: convert the 112 registry-excluded skips to passing assertions

> Subagent dispatch: see `.claude/skills/subagent-handoff/SKILL.md`.

## User goal

When I read `npm test`'s summary line, the **skipped** count is a number I can trust. If it says zero, no tests are disabled. If it says some non-zero number, I know which tests are broken and need attention. Today the suite reports *"3996 passed | 112 skipped"* and **all 112 of those skipped tests are perfectly fine** — they're a generator emitting one entry per `(table, column, gedcom-version)` triple where the column is documented in `src/api/gedcom_fidelity_registry.ts` as `excluded` (audit timestamps, UUIDs, derived `normalized_name`, etc.). The skip-with-reason convention was a clever way to surface "this column is documented as not round-tripping, and here's why" — but it produces 112 noise lines in every test summary, which masks the one signal that summary is supposed to carry: **is anyone hiding a broken test with `it.skip()` to make CI green?** When the floor is 112, no one notices when it becomes 113.

After this plan, `npm test` reports 0 skipped tests (or only the small handful that are *legitimately* skipped because they're broken and tracked elsewhere). The fidelity coverage of `excluded` columns is preserved — each cell still produces a passing test with the registry's reason in the test name, asserted via `expect(...)` instead of `it.skip(reason)`. Adding a broken test now stands out as a single `↓` in an otherwise-empty skipped count.

## Scope

**One test file, one generator helper, one assertion change.** Audited 2026-05-12:

- `tests/unit/gedcom-fidelity-per-field.test.ts` — the generator. Lines 46–48 are the cause:
  ```ts
  if (status.kind === 'excluded') {
    it.skip(`${version}: excluded — ${status.reason}`, () => { /* documented */ });
    continue;
  }
  ```
  This is the only place `it.skip` appears statically in the entire test tree (`grep -rn 'it\.skip' tests/` returns 1 match, this file).
- `src/api/gedcom_fidelity_registry.ts` — source of truth for `(table, column) → FidelityStatus`. Read-only by the test; no schema change here.
- `tests/helpers/gedcom_fidelity.ts` — the test helpers. May expose a `walkRegistry()` or similar that's also used by the per-version round-trip test. Read at execution time to confirm the conversion doesn't break siblings.

### Scope deviations

- **Don't change the registry shape or any column's status.** Every column already has the right status (`lossless` | `lossless-via:<mech>` | `lossy:<reason>` | `excluded:<reason>`). The conversion only changes *how the test reports* on `excluded` entries; it doesn't reclassify anything.
- **Don't introduce a custom vitest reporter for "registry-excluded" entries.** That'd preserve the per-cell granularity but adds a config surface (a custom reporter file) for a problem solvable with a one-line assertion change. The simpler fix is to make the excluded entries *pass* (asserting the registry has the expected exclusion reason) instead of *skip*.
- **Don't audit every other test file for `it.skip` / `test.skip` patterns.** The audit already ran (`grep -rn 'it\.skip\|test\.skip' tests/`); only this one file has any. If a sibling appears later, the new test from Task 4 (a registry assertion on the suite's skipped count) catches it.

## Verification

User-observable outcome: `npm test` summary reports **0 skipped tests** when run on a fresh checkout. If any non-zero skipped count appears in the future, it's because a test is legitimately disabled and needs investigation — not generator noise.

### Mechanical checks

1. `npx vitest run 2>&1 | tail -5` shows `0 skipped` (or only the count corresponding to genuinely-disabled tests, which today is zero).
2. `npx vitest run tests/unit/gedcom-fidelity-per-field.test.ts 2>&1 | tail -5` shows ~112 additional passing tests (the converted excluded entries) and zero skipped.
3. The fidelity coverage is unchanged: every `(table, column, gedcom-version)` cell that was reported as skipped before is now reported as passing, with the registry's reason still in the test name.
4. The schema-introspection guard (already in `tests/unit/gedcom-fidelity-schema-coverage.test.ts` or wherever it lives — confirm at execution time) still fails CI if a column is added to the schema without a registry entry. That's a separate test, untouched by this plan.

### What's NOT verification

- "We just delete the skipped entries" — that's the wrong fix; it removes the documented per-cell coverage of excluded columns. The point is to *convert* the skip to an assertion, not delete it.
- "We hide it from the reporter via `--silent` or `--reporter=dot`" — that's papering over the symptom; the noise is still in CI output, just less visible.

## Failure modes / RCA reference

This plan addresses gap #17 from the Tauri full-port RCA (`docs/plans/2026-05-12-tauri-port-rca.md`). The pattern: a non-zero floor in the "skipped" count means any future *real* skip is invisible. The Tauri close-out shipped with 112 skipped; if someone had added an `it.skip()` on a broken test during the port, it would have shown as 113 — indistinguishable from the noise unless someone diffed test names.

This is a smell at the test-reporting layer, not at the test-content layer. The content (per-cell coverage of every excluded column with the registry's reason inline) is the right design. The skin (rendering excluded entries as "skipped") is the wrong reporter category.

## Tasks

### Task 1: Convert the registry-excluded entries from `it.skip` to `it` with assertion

- [ ] Open `tests/unit/gedcom-fidelity-per-field.test.ts:46-48`.
- [ ] Replace the `it.skip(...)` block with `it(...)` that asserts the registry entry is what the generator thinks it is, and that the reason string is non-empty:
  ```ts
  if (status.kind === 'excluded') {
    it(`${version}: excluded — ${status.reason}`, () => {
      // Documented as not round-trippable; the registry entry is the
      // contract. Adding a positive assertion converts a skip-with-reason
      // line into a passing-with-reason line — same coverage, no noise in
      // the suite summary. See docs/plans/archive/2026-05-12-skipped-tests-cleanup.md.
      expect(status.kind).toBe('excluded');
      expect(status.reason.length).toBeGreaterThan(0);
    });
    continue;
  }
  ```
- [ ] Run `npx vitest run tests/unit/gedcom-fidelity-per-field.test.ts` and confirm the test file is fully green (no skipped lines).

### Task 2: Confirm no other skip-with-reason patterns lurk in the suite

- [ ] `grep -rn 'it\.skip\|test\.skip\|describe\.skip\|it\.todo\|\.skip()' tests/ --include='*.ts'`. Today this returns 1 match (the one being fixed in Task 1).
- [ ] After Task 1's edit, the grep should return 0 matches.

### Task 3: Run the full suite, capture evidence

- [ ] `npx vitest run 2>&1 | tail -5`. Paste the summary line into the close-out commit message.
- [ ] Expected: ~4108 tests, ~4108 passed, **0 skipped**, 0 failed.
- [ ] If the count changes from the pre-plan floor (3996 passed + 112 skipped = 4108 total → 4108 passed + 0 skipped = 4108 total), record the delta in the commit message.

### Task 4: Standing guard against the antipattern returning

- [ ] Add a test `tests/unit/no-skipped-tests.test.ts` that asserts the suite's static `it.skip` / `test.skip` / `describe.skip` / `.skip()` count is zero. Implementation: read the package-lock-or-vitest-snapshot of the most recent run, OR scan `tests/**/*.ts` for the literal patterns at parse time.
- [ ] If a future contributor adds a real `it.skip()` (a broken test temporarily disabled), this test fails loud and the contributor has to either fix the underlying test, document it inline with a tracking-issue link, OR add an explicit allow-list entry pointing at the tracking issue.

## Self-review checklist

- [ ] `tests/unit/gedcom-fidelity-per-field.test.ts` has no `it.skip` calls.
- [ ] `npx vitest run` reports `0 skipped` in the summary line.
- [ ] `npx vitest run tests/unit/gedcom-fidelity-per-field.test.ts` runs ~112 additional passing tests (the converted excluded entries) compared to today.
- [ ] Per-cell granularity preserved: each converted test has the registry's reason in its name.
- [ ] `tests/unit/no-skipped-tests.test.ts` exists and passes; running `it.skip` somewhere else fails it.
- [ ] Plan `git mv` to `docs/plans/archive/`.
- [ ] Patch version bump in `package.json`.
- [ ] `## Unreleased` entry in `CHANGELOG.md`: "test(reporting): convert 112 registry-excluded skips to passing assertions; suite summary's `skipped` count is now a meaningful signal."
- [ ] Append archive entry to `docs/plans/archive/PLAN.md`.

## Tasks discovered during execution

(Empty until execution starts.)

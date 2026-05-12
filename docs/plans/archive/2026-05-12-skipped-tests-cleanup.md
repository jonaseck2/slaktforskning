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

- [x] Open `tests/unit/gedcom-fidelity-per-field.test.ts:46-48`.
- [x] Replace the `it.skip(...)` block with `it(...)` that asserts the registry entry is what the generator thinks it is, and that the reason string is non-empty:
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
- [x] Run `npx vitest run tests/unit/gedcom-fidelity-per-field.test.ts` and confirm the test file is fully green (no skipped lines). Result: `Test Files 2 passed (2) | Tests 287 passed (287)` (run with the no-skipped-tests guard alongside).

### Task 2: Confirm no other skip-with-reason patterns lurk in the suite

- [x] `grep -rn 'it\.skip\|test\.skip\|describe\.skip\|it\.todo\|\.skip()' tests/ --include='*.ts'`. Today this returns 1 match (the one being fixed in Task 1).
- [x] After Task 1's edit, the grep returns only: (a) the new no-skipped-tests guard's own source/labels (allow-listed by file), and (b) two pre-existing `describe.skipIf(...)` calls in `gramps-transform.test.ts` and `rootsmagic-real-sample.test.ts` — these are conditional skips for fixture files that may not be present, NOT the antipattern. The plan's grep alternates `describe\.skip` which substring-matches `describe.skipIf` — design-intentional `.skipIf` / `.runIf` are explicitly allowed by the new standing-guard test (which uses `\bdescribe\.skip\(` etc. to exclude them).

### Task 3: Run the full suite, capture evidence

- [x] `npx vitest run 2>&1 | tail -5`. Result: `Test Files 248 passed (248) | Tests 4109 passed (4109) | Duration 51.73s`. **0 skipped.**
- [x] Expected: ~4108 tests, ~4108 passed, **0 skipped**, 0 failed. Actual: 4109 passed (one extra: the new no-skipped-tests guard test). 0 skipped, 0 failed.
- [x] Delta from pre-plan floor (3996 passed + 112 skipped = 4108 total → 4109 passed + 0 skipped = 4109 total): +1 net (the new guard).

### Task 4: Standing guard against the antipattern returning

- [x] Added `tests/unit/no-skipped-tests.test.ts` — scans `tests/**/*.ts` for `it.skip(` / `test.skip(` / `describe.skip(` / `it.todo(` / `test.todo(` (with `\b` boundaries so `.skipIf(` / `.runIf(` are NOT matched — those are legitimate predicate-based conditional skips for fixture presence). Self-references in the guard's source/labels are allow-listed by file. Test passes today (0 offenders).
- [x] If a future contributor adds a real `it.skip()`, the test fails with the file:line of every offender plus a hint pointing at this archive entry.

## Self-review checklist

- [x] `tests/unit/gedcom-fidelity-per-field.test.ts` has no `it.skip` calls.
- [x] `npx vitest run` reports `0 skipped` in the summary line. (Result: `Tests 4109 passed (4109)`.)
- [x] `npx vitest run tests/unit/gedcom-fidelity-per-field.test.ts` runs the converted excluded entries as passes alongside the per-field round-trip tests.
- [x] Per-cell granularity preserved: each converted test name still contains the registry's reason (the generator's `${version}: excluded — ${status.reason}` template is unchanged).
- [x] `tests/unit/no-skipped-tests.test.ts` exists and passes.
- [x] Plan `git mv` to `docs/plans/archive/`.
- [x] Patch version bump in `package.json` (0.253.1 → 0.253.2).
- [x] `## Unreleased` entry in `CHANGELOG.md`.
- [x] Append archive entry to `docs/plans/archive/PLAN.md`.

## Tasks discovered during execution

(Empty until execution starts.)

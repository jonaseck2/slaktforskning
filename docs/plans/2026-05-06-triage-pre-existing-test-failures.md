# Triage: Pre-existing test failures on `main` (13 tests)

**Date:** 2026-05-06
**Status:** Triage — not yet investigated; this plan exists to enumerate the failures so they can be tackled one by one rather than ignored
**Source:** Discovered during the 2026-05-05 beta-tester batch session; confirmed pre-existing (unchanged when changes were stashed)

## User goal

`npm test` exits clean. A green test suite is the baseline contract that lets the team move fast without false-flagging recent commits as breaking. Today the suite shows 13 failures across 5 unrelated test files; new contributors and CI signals can't tell which are "expected" and which are "your fault".

## Why this exists

This is a triage plan, not an implementation plan. Implementation comes later in per-failure plans. The job here is to enumerate the failures, briefly investigate each, and decide:
- **Fix here** — small, single-area, low risk.
- **Plan separately** — touches a feature area; needs a real plan with user goal + scope.
- **Delete the test** — it tested a behavior that's no longer the policy; document why.

## Scope

5 test files, 13 failing tests:

| Test file | Failures | Surface |
|---|---|---|
| `tests/unit/gazetteer-merge.test.ts` | 1 | gazetteer merge logic — `warn` no longer fires on >0.01° lat/lon divergence |
| `tests/unit/gedcom.test.ts` | 2 | GEDCOM media import — inline OBJE on INDI + top-level OBJE both fail to link to person |
| `tests/unit/media_consolidate.test.ts` | 1 | name-conflict suffix during media consolidation |
| `tests/components/PersonsView.test.ts` | 3 | `load()` tree-subject fallback when no `default_person_id` and no route id |
| `tests/components/usePersonProfilePic.test.ts` | 5 | composable tests — all assert URLs, all get `null` |

### Scope deviations

None at the triage level. Every failure listed; plan per failure follows after this is committed.

## Per-failure investigation plan

For each failure, run a 15-minute investigation:

1. `git log --oneline -- <test-file>` — last touch.
2. `git log --oneline -S "<assertion-string>"` — when the asserted behavior was last present.
3. Read the failing assertion. Decide: bug in test, bug in code, or stale test.

Capture the decision in this plan's "Findings" section. Then file per-failure follow-up plans.

### Tracked failures + first-pass guesses (to be confirmed during investigation)

#### F1 — gazetteer-merge: warn-on-divergence

```
expected "warn" to be called at least once
tests/unit/gazetteer-merge.test.ts:81
```

The test expects a `console.warn` when two merge inputs disagree on lat/lon by >0.01°. The merge logic may have stopped warning. **First-pass guess:** intentional silencing during a recent gazetteer-build refactor, possibly because the warning was too noisy on real data and the test wasn't updated.

#### F2 — gedcom media import (2 tests)

```
imports inline OBJE on INDI and links to person — expected 1, got 0
imports top-level OBJE referenced from INDI — expected 1, got 0
```

After import, the count of media linked to the test person is 0 instead of 1. **First-pass guess:** something in the GEDCOM importer's OBJE-handling stopped wiring `media_links` rows. Could be from the `media:` recent refactors. High-impact if confirmed — users with photos in their GEDCOM lose them.

**Action if confirmed:** plan a fix immediately. This is a Prime Directive concern (round-trip fidelity).

#### F3 — media_consolidate: name conflict suffix

```
handles name conflicts by appending a numeric suffix
```

Media consolidation should rename `photo.jpg` → `photo-1.jpg` when there's a conflict. The test assertion isn't shown in the snapshot, but likely the conflict path doesn't append the suffix. **First-pass guess:** the consolidator's collision handler shifted; the test wasn't updated.

#### F4 — PersonsView tree-subject fallback (3 tests)

```
expected "vi.fn()" to be called at least once
```

These tests assert that when there's no `default_person_id` AND no `:personId` in the route, PersonsView falls back to `persons.list()` to pick a default. The mock spy isn't called. **First-pass guess:** the fallback was replaced with `persons.listPage()` (per the renderer rules' "never use un-paged list()" guidance), and the test still asserts the old call.

If confirmed: update the test to assert `persons.listPage()`.

#### F5 — usePersonProfilePic (5 tests)

```
expected null to be 'data:cropped-face'
expected null to be 'data:image/jpeg;base64,FAKE'
...
```

All 5 tests get `null` where they expected a data URL. **First-pass guess:** the composable's loader contract changed (probably integrated with the per-row IPC fan-out batching documented in `.claude/rules/renderer.md`), and the test mocks don't match the new contract.

## Tasks

- [ ] **Investigate each failure** per the 15-minute checklist above. Update this plan's per-failure section with the actual finding (bug in test, bug in code, or stale test).
- [ ] **For "bug in code" failures**: file a per-failure implementation plan. Bump and ship.
- [ ] **For "stale test" failures**: update or delete the test in a single small commit per file.
- [ ] **For "intentional silencing" failures (F1)**: confirm with user whether the warn should fire; either re-enable or delete the test.
- [ ] **Re-run `npm test`** after all failures are addressed. Confirm clean run.
- [ ] **Patch bump** per the largest landed change + CHANGELOG line per real fix.

## Verification (user-observable)

`npm test` exits with `Tests N passed (N) | 0 failed`. CI is green. New PRs surface only their own regressions, not historical noise.

## Failure modes / RCA reference

- **Don't blanket-skip.** It's tempting to mark each failing test as `.skip()` and move on. That hides regressions in the surfaces the tests covered. Each failure gets a real decision.
- **F2 is a Prime Directive concern.** GEDCOM media imports failing means user data loss on import. If confirmed as a real regression, this jumps the queue.
- **Test infrastructure drift.** The 5 `usePersonProfilePic` failures all share the same shape — composable returns `null`. Likely one root cause, not five. Investigate together.

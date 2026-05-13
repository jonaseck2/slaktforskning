# Design — `duplicates.ts` split

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §3.1.

## User goal

Improving the person dedup scorer doesn't require touching place dedup. Adding a new entity type for dedup (e.g., relationships, repositories) is "create one file, register in the index" — not "find your way through a 1,649-line file."

I can `grep -l 'normalizeName' src/api/duplicates/` and see exactly which entity's normalizer that is, instead of scrolling to line 153 of a god-file.

## Why now

The 2026-05-14 audit's complexity-hotspot survey ranked `duplicates.ts` as the #1 highest-payback Tier 3 target: clearest entity boundaries, smallest scope, contained risk. The split is purely mechanical — four sections that already correspond to four test files. Past abstraction temptation (factory pattern, strategy hierarchy) is documented and rejected.

Verified structure (2026-05-14):
- Lines 8–410: persons — `DuplicateCandidate`, `normalizeName`, `calculateSimilarity`, `findDuplicates`, `findDuplicatesPage`, `countDuplicates`, `ignoreDuplicate`, `mergePersons`, `collectDuplicateCandidates`.
- Lines 413–867: places — `DuplicatePlaceCandidate`, `levenshtein`, `placeNormalize`, `findDuplicatePlaces`, `countDuplicatePlaces`, `ignoreDuplicatePlace`, `mergePlaces`, `deleteIgnoredDuplicatesForPlace`.
- Lines 869–1219: sources — `DuplicateSourceCandidate`, `sourceNormalize`, `findDuplicateSources`, `countDuplicateSources`, `ignoreDuplicateSource`, `mergeSources`, `deleteIgnoredDuplicatesForSource`.
- Lines 1221–1648: media — `DuplicateMediaCandidate`, `mediaNormalize`, `resolveFileRef`, `findDuplicateMedia`, `countDuplicateMedia`, `ignoreDuplicateMedia`, `mergeMedia`, `deleteIgnoredDuplicatesForMedia`.

Tests already split into four files: `tests/unit/duplicates.test.ts` (persons), `duplicates-places.test.ts`, `duplicates-sources.test.ts`, `duplicates-media.test.ts`. The implementation just hasn't caught up.

## Scope

Decompose [`src/api/duplicates.ts`](../../src/api/duplicates.ts) into:

```
src/api/duplicates/
  ├── index.ts        # Re-exports public API; preserves existing import paths
  ├── shared.ts       # levenshtein, any genuinely-shared types
  ├── persons.ts      # Lines 8–410
  ├── places.ts       # Lines 413–867
  ├── sources.ts      # Lines 869–1219
  └── media.ts        # Lines 1221–1648
```

### Public API preservation

[`src/api/duplicates/index.ts`](../../src/api/duplicates/index.ts) re-exports every currently-exported symbol so existing imports (`import { findDuplicates, mergePersons } from '../api/duplicates'`) keep working. No call-site churn outside of `duplicates.ts` itself.

### Test file mapping

Each `duplicates-<entity>.test.ts` updates its import line from `'../../src/api/duplicates'` to `'../../src/api/duplicates/<entity>'`. Tighter binding between test and implementation, and the test file's failure messages will reference the right file.

### Scope deviations

- **`levenshtein` placement.** Currently lives in the places section. Moves to `shared.ts` only if execution audit shows places + sources + media all use it. If only places uses it, stays in `places.ts` — no preemptive sharing per CLAUDE.md "Don't add… abstractions beyond what the task requires."
- **`resolveFileRef`** (line 1377) is media-specific. Stays in `media.ts`; not promoted to `shared.ts`.
- **No interface unification.** `DuplicateCandidate`, `DuplicatePlaceCandidate`, `DuplicateSourceCandidate`, `DuplicateMediaCandidate` stay as four separate interfaces. Forcing a shared base interface would be premature abstraction.
- **No factory pattern.** The audit's "DeduplicatorFactory" suggestion is rejected. Four sibling files + shared.ts utilities is enough; abstraction overhead would obscure the very thing the split is making clear (each entity's logic lives in its own file).

## Approach

Single PR. Move file regions to new files, write the index re-export, update test imports, run tests. Per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing" — all four entities migrate together.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **`src/api/duplicates.ts` does not exist as a file.** `test ! -f src/api/duplicates.ts` passes.
2. **`src/api/duplicates/` directory contains the six files** named above.
3. **Public API preserved.** `tsc --noEmit` passes against all current call sites with no changes — verified by grepping every consumer (`grep -rln 'from.*api/duplicates' src tests`) and re-running type-check.
4. **Tests bind tighter.** Each `duplicates-<entity>.test.ts` imports from `src/api/duplicates/<entity>` (not the index re-export). Verifies real file boundaries.
5. **`npm test` exits 0** with same test count as before (no tests deleted or added).
6. **Per-file LOC under 600.** `wc -l src/api/duplicates/*.ts` shows no file over 600 lines.
7. **No performance regression.** Capture post-refactor dedup workload trace; compare wall-clock and flamegraph against `docs/baseline-perf/2026-05-14/dedup-rust.svg` from plan 1.2. Expected: no change.

Falsifiability check: if every item passes, can a developer still find that touching person dedup requires reading place dedup code? **No** — items 2, 3, 4 enforce real boundaries; item 6 caps file size; items 1+3 prevent the "fake split with index.ts still containing 1,649 LOC" failure mode.

### Dependencies

- Plan 1.2 (perf baseline) must land first. Verification #7 references `docs/baseline-perf/2026-05-14/dedup-rust.svg`.

## Failure modes / RCA reference

This is a low-risk mechanical refactor. The historical pattern it *doesn't* repeat: a "factory pattern" or "strategy class hierarchy" that adds indirection without solving the file-size problem. Past plans in this codebase have shipped over-abstracted refactors that produced cleaner UML but the same monolithic files plus a new layer of indirection. Resist while in here.

The other historical pattern to avoid: half-migration. If only persons and places get split and the plan stalls, the codebase lives in a worse state than starting (duplicates.ts has unfilled holes that point to half-existent split files). The "all four in one PR" rule prevents that.

## Effort

1 day including verification capture.

## Tasks (high-level — implementation plan will expand)

- [ ] Verify plan 1.2 has landed; `docs/baseline-perf/2026-05-14/summary.md` exists with dedup row.
- [ ] Audit `levenshtein` usage; decide `shared.ts` placement (or keep in `places.ts`).
- [ ] Create `src/api/duplicates/` directory.
- [ ] Move person dedup section → `persons.ts`.
- [ ] Move place dedup section → `places.ts`.
- [ ] Move source dedup section → `sources.ts`.
- [ ] Move media dedup section → `media.ts`.
- [ ] Write `shared.ts` if needed.
- [ ] Write `index.ts` re-exporting public API.
- [ ] Delete `src/api/duplicates.ts`.
- [ ] Update each test file's import.
- [ ] Run `tsc --noEmit`, `npm test`.
- [ ] Capture post-refactor dedup workload trace; compare to baseline; record in close-out.
- [ ] Self-review checklist.

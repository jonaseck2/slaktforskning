# Design — `hourglass.ts` internal refactor (Phase 2 of 3.2)

Roadmap origin: plan 3.2 (chart-layout property tests) shipped a property-assertion library but discovered the audit's "1,663 LOC of golden snapshots" premise was wrong (zero snapshots existed). The plan's stated motivation — "the test refactor unlocks the file refactor" — therefore needs revisiting. The `hourglass.ts` 1,052-LOC restructure is NOT cascade-blocked by snapshots; it was never blocked at all. **This Phase 2 plan exists as an option, not a commitment.** Execute only if a real chart feature is blocked by hourglass.ts's current shape.

## Current state — verified 2026-06-07 (DO NOT execute)

Authored 2026-05-14; ~3.5 weeks elapsed. Re-audited against live code:

- **`hourglass.ts` is still 1,052 LOC**, no `hourglass/` subdirectory — the file is in the exact shape this design describes, so the blueprint below remains accurate and executable.
- **The trigger named in this plan fired — and disproved the premise.** A new `timeline` chart (`src/renderer/utils/chart-layout/timeline.ts`) shipped (commits `9a31e81d`, `5b158510`). "Timeline-on-the-wall" is the literal example this plan listed under "Execute IF a specific chart-feature request is on the table." It landed importing only `./types` and `./utils` — **zero absorption of `hourglass.ts`**. Adding a new chart type did not require splitting the monolith.
- **Multiple hourglass *features* shipped since 2026-05-14** (foster edges, multi-partner connector routing, shared-children hanging, outline-placeholder removal) — all edited `hourglass.ts` directly; none found its shape blocking.
- **The 130-test gate is intact**: `npx vitest run tests/unit/chartLayout.test.ts` → 130 passed; `tests/unit/chart-layout/properties.ts` (with `assertNoOverlaps` / `assertGenerationAlignment` / `assertCoupleSpacing` / …) and `regression-fixtures.ts` are present.

**Verdict: skip.** The premise ("this file's size is blocking new charts") has now been tested by reality and held false. This remains a parked "fuse" blueprint, not pending work. Deletion clause (bottom of file) matures ~2026-11-14 if no genuine shape-blocked trigger appears before then.

### Structural finding: hourglass is the *union* of pedigree + descendant, not a different algorithm

Re-reading all three layout files confirms hourglass is not "so different" — it is structurally a superset:

- All three follow the same 6-phase pipeline (build `TreePerson` → measure → collapse-prune → geometric placement → unplaced-outline post-pass → SVG-dims + placeholder extraction).
- **Phase 4 is the only real divergence**, and it is additive: pedigree places ancestors rightward only; descendant places descendants downward only; hourglass runs *both* directions from a focal row plus a spouse/focal-row join layer (`placeSpouses`, `marriageJog`, `realSpouseCXAt`, `siblingCXOf`) and a four-direction outline pass (`placeOutlineGroup`). That join is why it is ~3× the LOC — two jobs at once, not bloat.
- **The genuinely-shared duplication cuts across all three files, not within hourglass:** `findPersonInTree` is byte-identical in `pedigree.ts`, `descendant.ts`, and `hourglass.ts`; the placeholder-extraction role-parse tail is copy-pasted near-identically across them; `measureAll` / `recordAndPrune` are parallel.

Consequence: an *hourglass-only internal split* (this plan's scope) would carve up logic only hourglass uses, while the duplication that actually costs maintenance is cross-chart. If a refactor ever becomes worth it, the higher-value target is extracting the shared cross-chart helpers (`findPersonInTree`, the extraction tail, the build/measure/prune pre-passes) into `chart-layout/`-level modules — which this plan explicitly fenced off as a separate analysis. That fence still holds; the observation is now concrete rather than speculative.

## User goal

Adding a new chart type (e.g., timeline-on-the-wall, generation-stacked-bar) doesn't require absorbing the entire `hourglass.ts` to find the parts that should be shared. Inside `hourglass.ts` itself: a bug in tree-shape derivation lives in `tree-shape.ts`, a bug in collision avoidance lives in `geometric-layout.ts`, a bug in placeholder-extraction lives in `placeholder-extraction.ts`. The 1,052-LOC monolith is no longer the unit of read-and-understand.

## Why this is OPTIONAL

The audit's "this file is too big" premise has been the project's most-frequent mistake-vector in the 2026-05-14 batch. Three of eleven audit-driven plans had wrong premises; "X is N LOC and needs splitting" is not, by itself, evidence the file is causing harm. Without a concrete feature request that the file's shape is blocking, splitting it is busywork.

**Execute this plan IF:**
- A specific chart-feature request is on the table (timeline chart, fan-only mode, hourglass with horizontal axis, etc.).
- Or: a bug-fix attempt revealed that the tree-shape / layout / placeholder concerns are entangled in a way that made the fix risky.

**Skip this plan IF:**
- The file is "just big." It works, has tests, and `git blame` is meaningful.
- The motivation is "the audit said so." The audit said so; the audit was sometimes wrong.

## Pre-plan audit (per `audit-validation` skill)

Before committing to execute, verify the file is still in the shape the 3.2 design described:

```bash
# Confirm current LOC + structure of hourglass.ts:
wc -l src/renderer/utils/chart-layout/hourglass.ts
grep -nE '^export (function|interface|type|const)' src/renderer/utils/chart-layout/hourglass.ts

# What other chart files exist? (3.2 archive noted 11 files already in chart-layout/)
ls src/renderer/utils/chart-layout/

# Is property-assertion library in place? (3.2 close-out artifact)
ls tests/unit/chart-layout/properties.ts tests/unit/chart-layout/regression-fixtures.ts

# Test count we're protecting:
npx vitest run tests/unit/chartLayout.test.ts 2>&1 | grep 'Tests'
```

If `hourglass.ts` has shrunk significantly since 3.2 (e.g., chart features moved logic elsewhere), the split targets below may already be partially achieved — update the plan inline.

## Scope (if executed)

Decompose `src/renderer/utils/chart-layout/hourglass.ts` into:

```
src/renderer/utils/chart-layout/hourglass/
  ├── index.ts                  # Re-exports computeHourglassLayout (the public surface)
  ├── tree-shape.ts             # buildHourglassTree, ancestor/descendant traversal helpers,
  │                             # generation-depth computation
  ├── geometric-layout.ts       # Box placement math, collision-avoidance pass, column packing
  ├── placeholder-extraction.ts # Post-layout pass: identify placeholder boxes, route them
  │                             # to placeholders[]/placeholderLines[]
  ├── footprint.ts              # computeFootprint, ancestorFootprint, descendant footprint
  │                             # (used by the geometric-layout pass)
  └── outline-injection.ts      # injectOutlines (already exists at chart-layout/hourglass-tree.ts;
                                # consider moving into the new subdirectory)
```

`computeHourglassLayout` becomes a thin orchestrator: `treeShape → footprint → geometricLayout → placeholderExtraction`. Each sub-module is testable with the existing `tests/unit/chart-layout/properties.ts` assertions; the file split shouldn't require new tests, just retargeting imports.

### Scope deviations

- **The other two charts (`pedigree.ts`, `descendant.ts`)** stay as-is unless THEY have a feature request blocked by their shape. The hourglass-shape doesn't generalize until at least one other chart actually shares a piece.
- **The `tree-shape.ts` extraction** is the highest-value piece — and the 2026-06-07 re-audit confirms it: pedigree and descendant don't just "likely" share derivation, they carry a **byte-identical `findPersonInTree`** and a copy-pasted placeholder-extraction tail plus parallel `measureAll`/`recordAndPrune`. The real shared surface is cross-chart, not hourglass-internal. But that's a *separate* analysis pass; don't bundle it into a within-hourglass split.
- **No new tests added in the split.** The 130-test property suite from 3.2 covers the integration; the split is purely organizational.

## Approach

Mechanical split per plans 3.1, 3.3, 3.4's pattern. Same anti-abstraction discipline (no factories, no class hierarchies).

Worktree + subagent if pursued. Test count is the gate: 130/130 must pass at every commit.

## Verification

Per `.claude/rules/plans.md`:

1. `src/renderer/utils/chart-layout/hourglass.ts` either deleted (replaced by `hourglass/index.ts`) or shrunk to ≤ 100 LOC orchestrator.
2. `src/renderer/utils/chart-layout/hourglass/` directory contains the 5-6 sub-files listed in Scope.
3. No file in `hourglass/` exceeds 400 LOC (`wc -l hourglass/*.ts`).
4. `npx vitest run tests/unit/chartLayout.test.ts` — 130/130 pass.
5. `npx tsc --noEmit` clean.
6. In-app spot-test: open a hourglass chart for a person with ≥3 generations of ancestors AND descendants; verify visual parity with pre-refactor (screenshot diff is reasonable but not required — property assertions cover correctness).
7. The PR description explicitly names the chart-feature request that motivated this refactor (or close the plan without merging if motivation evaporated mid-execution).

## Failure modes / RCA reference

- **"Audit said file is big" is not motivation.** Three of eleven audit-followup plans in 2026-05-14 had wrong premises. Don't write THIS plan into existence without a concrete feature trigger.
- **Tree-shape sharing temptation.** Resist extracting `tree-shape.ts` into a chart-layout-wide shared helper during the split. That's a future analysis; this split is hourglass-only.
- **Property-assertion test fragility.** The 130 tests use `assertGenerationAlignment` etc. on `LineLayout` / `BoxLayout` — if the split changes the layout output's *shape* (vs just internal organization), tests fail by design. Don't loosen the assertions to make the split pass; fix the split to preserve output shape.

## Effort (if executed)

2-3 days. Mechanical moves + property-suite verification at each step.

## Tasks (when execution is triggered)

- [ ] Task 0: Pre-plan audit. Confirm motivation is concrete (cite the feature request); re-verify file shape.
- [ ] Task 1: Create `src/renderer/utils/chart-layout/hourglass/` directory.
- [ ] Task 2: Move tree-shape derivation → `tree-shape.ts`. 130/130 still passes.
- [ ] Task 3: Move geometric layout → `geometric-layout.ts`. 130/130 still passes.
- [ ] Task 4: Move placeholder extraction → `placeholder-extraction.ts`. 130/130 still passes.
- [ ] Task 5: Move footprint helpers → `footprint.ts`. 130/130 still passes.
- [ ] Task 6: Consider moving outline-injection (existing `hourglass-tree.ts`) into the directory.
- [ ] Task 7: Write `hourglass/index.ts` orchestrator; delete or shrink monolith.
- [ ] Task 8: Per-file LOC verification; in-app spot-test.
- [ ] Task 9: CHANGELOG + close-out citing the feature trigger.

---

## NOTE: When this plan should be deleted instead

If, six months from now, no chart feature has been blocked by hourglass.ts's current shape, this plan should be deleted from `docs/plans/` — not merged, not archived as "done." Deleted as "the premise didn't hold; we never executed because no concrete feature request landed." Mark in `docs/plans/archive/PLAN.md` that this design was authored, deferred, and pruned.

This is a "fuse"-style plan: it sits in the codebase as a ready blueprint for when a real trigger fires, and gets removed if the trigger never comes.

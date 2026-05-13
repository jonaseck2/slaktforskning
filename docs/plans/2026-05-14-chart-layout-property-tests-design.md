# Design — chart-layout property-based test migration

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §3.2.

## User goal

Changing the chart-layout algorithm doesn't require updating 50+ golden snapshots. Tests assert what *matters* — no box overlaps, parents above/beside children, ancestors in their proper generation — not exact pixel coordinates. A future chart feature (a new chart type, a tweak to spacing) requires writing one new property assertion, not regenerating snapshots.

I can read [`tests/unit/chartLayout.test.ts`](../../tests/unit/chartLayout.test.ts) (or its successors) and tell what each assertion is *for*, not just "the layout produced this exact JSON last time we looked."

## Why now

The 2026-05-14 audit ranked chart-layout as the #2 Tier 3 target. Investigation revealed the actual bottleneck isn't the 1,052-LOC `hourglass.ts` — it's the 1,663-LOC golden-snapshot test. Snapshot fragility blocks every chart change: refactoring `hourglass.ts` first without addressing the test cascades into 50+ snapshot updates per refactor commit.

**The test refactor unlocks the file refactor.** This plan is Phase 1 only. Phase 2 (refactoring `hourglass.ts` internally) is a separate follow-up plan, written *after* the test investment pays.

## Scope (Phase 1: test-side refactor only)

### Catalogue current snapshots

Read every `expect(layout).toMatchSnapshot()` (and equivalent) in [`tests/unit/chartLayout.test.ts`](../../tests/unit/chartLayout.test.ts). Group by what each protects:
- Position correctness
- Generation alignment
- Collision avoidance
- Outline placement
- Couple spacing
- Connector / line routing

### Define property assertions

For each protected behavior, write a property assertion (universal invariant, not coordinate-specific):

| Property | Assertion |
|----------|-----------|
| No overlaps | For every pair of boxes in a layout, bounding rectangles don't intersect. |
| Parent direction | Pedigree: parents have higher x than children. Hourglass: ancestors have lower y than descendants. Descendant: parents have lower y than children. |
| Generation alignment | Same-generation boxes share a coordinate axis (column or row) within ±tolerance. |
| Outline adjacency | Every outline placeholder is adjacent to its anchor person (within one box-width + gap). |
| Couple spacing | A person's spouse box is within `H_COUPLE_GAP` of them; no other box between them. |
| Connectivity | Every non-root box is connected via a line to at least one other box. |
| Stable extent | Layout's total width/height for a fixed input is within ±5% across runs (catches non-determinism without pinning exact pixels). |

### Build the assertion library

New file [`tests/unit/chart-layout/properties.ts`](../../tests/unit/chart-layout/properties.ts) exporting at least these 7 functions:
- `assertNoOverlaps(layout)`
- `assertParentDirection(layout, chartType)`
- `assertGenerationAlignment(layout, chartType, tolerance?)`
- `assertOutlineAdjacency(layout, anchorId)`
- `assertCoupleSpacing(layout, personId, spouseId)`
- `assertConnectivity(layout)`
- `assertStableExtent(layout, expected, tolerancePct?)`

Each assertion fails-fast with a named failure message: "Box X at (100, 200) overlaps Box Y at (110, 205)" — so a regression names the exact problem, not "the snapshot changed."

### Rewrite the test file

[`tests/unit/chartLayout.test.ts`](../../tests/unit/chartLayout.test.ts) (1,663 LOC) becomes either one shrunk file (< 800 LOC) or splits by chart type into:
- `tests/unit/chart-layout/pedigree.test.ts`
- `tests/unit/chart-layout/hourglass.test.ts`
- `tests/unit/chart-layout/descendant.test.ts`

Each calls property assertions on shared fixtures.

### Keep 3–5 narrow goldens as documented examples

For specific known-good shapes that exercise tricky edge cases (e.g., "selected person with 4 spouses across 3 generations"), keep one snapshot. Each has a leading code comment explaining *why* it's kept — the specific edge case it documents. These are examples, not the test of record.

### Scope deviations

- **Phase 2 (refactoring `hourglass.ts`)** is out of scope. Written as a follow-up after this plan lands and the test investment pays. Stub written at close-out.
- **`chartData.ts`** is not touched (photo caching + tree-shape derivation, mostly separate from layout math).
- **Connectors / placeholder extraction** logic lives in separate files (`connectors.ts`, `hourglass-tree.ts`) — already separated. No restructure needed for them.
- **Three chart types — same property contract.** Pedigree, Hourglass, Descendants. Property assertions are parameterized by chart type (some directions flip per chart). Apply the full property suite to all three.

## Approach

**Test-first refactor in a single PR.** Per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing" — every snapshot that becomes a property assertion does so in this PR. No half-state.

Order of execution:
1. Write property assertions alongside existing goldens (both run side-by-side).
2. Verify property assertions catch every regression a golden would catch — deliberately tweak `hourglass.ts` in non-trivial ways and confirm property assertions fail loudly. Use the existing goldens as cross-check.
3. Delete the goldens.
4. Keep 3–5 narrow goldens as documented examples.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **Snapshot file count drops.** `find tests/__snapshots__ -name 'chartLayout*' | wc -l` is ≤ 5 (down from current count — measure pre-refactor for the close-out diff).
2. **Property assertions exist.** [`tests/unit/chart-layout/properties.ts`](../../tests/unit/chart-layout/properties.ts) exports the 7 assertion functions named in Scope.
3. **Property assertions catch known regressions.** A `chart-layout-regression.fixture.ts` (or inline test) deliberately breaks the layout in three ways (overlap injected, parent direction reversed, generation alignment broken) and asserts the property check fails with a useful message for each.
4. **`npm test` exits 0** with the new structure.
5. **Test file size drops.** `wc -l tests/unit/chartLayout.test.ts` < 800 OR the file split into per-chart-type sub-files, each < 500.
6. **Chart-rendering perf unchanged.** Capture chart-render workload trace; compare to `docs/baseline-perf/2026-05-14/` chart baseline. Expected: zero change (test refactor, no production code touched).
7. **Documented examples retained.** Each of the 3–5 kept goldens has a leading code comment naming the edge case it documents.

Falsifiability: if every item passes, can a future chart-layout commit still produce a 50-snapshot-update PR? **No** — items 1, 2, 5 limit snapshot count and structure; item 3 proves the property assertions actually fire on regressions.

### Dependencies

- Plan 1.2 (perf baseline) must land first. Verification #6 references chart-render baseline. If 1.2 didn't include a chart-render workload, capture one in 1.2 first.

## Failure modes / RCA reference

- **Property assertions miss a class of bug.** If goldens were catching something the properties don't articulate, coverage drops. **Mitigation:** order-of-work step 2 above (run both side-by-side, then deliberately break things) is the discovery mechanism. If a property can't catch a deliberately-introduced regression that the snapshot did, either (a) add the property, (b) keep that golden as documented example, or (c) document why the regression isn't actually a bug.
- **Property assertions are too loose.** "No overlaps" is necessary but not sufficient — putting every box at origin (0,0) overlaps everything. Bounding-box stability check + parent-direction check + generation-alignment check together cover this. Verify on small fixtures during step 2.
- **Test-output diff fatigue.** If property assertions print verbose messages on every regression, developers tune them out. Assertions fail fast (first overlap, not all of them) and name boxes specifically.

This plan exists because the golden-snapshot pattern doesn't scale past ~3 chart-feature changes per quarter; the audit observed the codebase has 1,663 LOC of test against a 1,052-LOC layout file because every coordinate tweak landed as a snapshot update. Property-based tests scale because new chart features add 0–1 new properties, not 50 snapshot lines.

## Effort

3 days.
- Day 1: catalogue + property assertion library (`properties.ts`).
- Day 2: rewrite chartLayout.test.ts; verify-by-deliberate-breakage.
- Day 3: cleanup, retained-examples documentation, perf-baseline cross-check, Phase 2 stub.

## Tasks (high-level)

- [ ] Verify plan 1.2 has landed; chart-render baseline exists.
- [ ] Catalogue every snapshot in `tests/unit/chartLayout.test.ts` by category.
- [ ] Write `tests/unit/chart-layout/properties.ts` with the 7 named assertion functions.
- [ ] Run assertions side-by-side with existing goldens; verify equivalence on fixtures.
- [ ] Deliberately introduce 3 layout bugs; verify property assertions catch them with named failure messages.
- [ ] Rewrite (or split) `chartLayout.test.ts` to use property assertions.
- [ ] Delete supplanted snapshot files; keep 3–5 documented edge-case examples.
- [ ] Run `npm test`; verify zero regression.
- [ ] Capture post-refactor chart-render trace; compare to baseline.
- [ ] Write follow-up Phase 2 stub at `docs/plans/2026-05-14-hourglass-layout-refactor-design.md`.
- [ ] Self-review checklist.

# Implementation: Hourglass — distinct visual styles for foster vs adoptive edges

**Date:** 2026-05-06 (revised 2026-05-06 after live MCP repro)
**Branch strategy:** worktree (touches connector emit + render path; new dash-table; legend i18n)
**Source:** Beta tester report 79 (v0.215.2)
**Predecessor (now archived):** [2026-05-06-hourglass-foster-edge-and-couple-edge.md](archive/2026-05-06-hourglass-foster-edge-and-couple-edge.md). The original sequence-dependency on per-edge subtype routing is no longer required — see "Revision history" below.

## User goal

Today the hourglass renders foster `parent_child` edges with a dashed pattern (per the foster-terminology plan that shipped earlier). Adoptive `parent_child` edges use the same dashed pattern. The genealogist can't tell at a glance whether a "non-bio" edge is foster or adoptive — both look identical. They want **two visually distinct styles** for the two subtypes.

The user proposes: one is dashed, one is dotted; or one keeps dashes, the other gets a different stroke color; or some other deliberate difference.

## Revision history (2026-05-06)

The original plan was authored as a follow-up to `hourglass-foster-edge-and-couple-edge`, which was itself archived as superseded after a live MCP-driven reproduction confirmed neither of its target symptoms reproduces on current main (the 2026-05-05 dedup fix appears to have closed both edge-rendering symptoms incidentally). This means **per-edge subtype routing was never introduced** — the chart still merges all parent_child edges from coupled parents into a single curved path emanating from the couple-line midpoint.

The live repro for THIS plan confirmed the user-visible problem persists: with one parent recorded as `foster` and the other as `adopted`, the chart renders ONE merged dashed path with `stroke-dasharray="8 4"` (the foster pattern). Adopted is invisible / undistinguished from foster.

This revision rewrites Scope to handle the merged-edge case, which the original plan didn't anticipate.

## Scope

Three render-path changes in the hourglass-chart pipeline:

1. **Per-subtype dash mapping** — new function `dashForSubtype(subtype: ParentSubtype): string` in `src/renderer/utils/chart-layout/connectors.ts` (or wherever the foster dash pattern is currently picked). Returns a `stroke-dasharray` string per subtype — see "Stroke patterns" below.
2. **Mixed-subtype edge handling** — when a child has multiple parents who share a couple connector AND the parent_child subtypes differ across the parents (e.g. one foster + one adopted), the chart currently renders ONE merged path styled by whichever subtype the emitter happens to pick. The fix: for the mixed case, **split the merged path into two separate edges** (one from each parent's bottom-center down to the child's top-center), each carrying its own dash pattern. Same-subtype cases keep the existing merged-curved-path render (cheaper, visually consistent). The split is per-edge per-(parent,child) pair.
3. **Legend** — `chart.legend.adoptiveRelationship` + `chart.tooltip.adoptiveRelationship` i18n keys. Add a swatch in the existing chart legend group below the foster-relationship entry.

### Scope deviations

- **`step` and `unknown` parent_child subtypes**: deferred. Today the chart treats them as part of the "non-biological" bucket (dashed). Keep that until the user asks for a distinct style. Document in `dashForSubtype` with a code comment.
- **Pedigree, Descendant, Fan charts**: out of scope. Different layout / connector logic. The Descendants chart's foster handling was observed in the live repro to use a SOLID line — that's a separate bug worth filing, but not in scope here. (Memory: file `2026-05-?-descendant-chart-foster-edge.md` after this lands.)
- **Mixed-subtype layout side-effect**: when we split the merged path into two separate edges, the visible chart density increases slightly. The user goal trumps the cosmetic concern; document the rationale in code.
- **Per-edge subtype routing** (the original plan's prerequisite): no longer needed as a separate refactor. The chart's existing connector emit already passes `parentSubtype` per edge to the renderer; the merge-into-one-path step happens at draw time, which is what we're modifying.

## Locked decisions

| Subtype | Pattern |
|---|---|
| `biological` | solid (`stroke-dasharray: none` — unchanged) |
| `foster` | long dashes (`stroke-dasharray="8 4"` — unchanged) |
| `adopted` | dotted (`stroke-dasharray="2 3"`) |
| `step` | mid dashes (`stroke-dasharray="4 4"`) — deferred (see Scope deviations) |
| `unknown` | solid for now (assume bio), with a code comment marking as ambiguous |

The numerical values are deliberately distinct from the existing `stroke-dasharray="4 3"` outline-placeholder convention (placeholder edges stay distinct from real-data edges).

**Color stays uniform.** Per the original plan: color encoding for relationship type would conflict with the existing `colorMode` setting (themed / sex-colored). Keep all non-bio edges at the same stroke color (`chartTokens.line`) and rely on dash pattern alone.

## Failure modes / RCA reference

- **Per-edge styling regression risk.** Splitting the merged foster path into per-edge paths means more `<path>` elements in the SVG when subtypes differ. The Vue `v-key` on the wrapping `<g>` must change from per-pair to per-edge (e.g. `\`${parentId}-${childId}-${subtype}\``) to avoid render bugs. Test: a parent with 4+ children of different subtypes.
- **Don't conflict with placeholder dashes.** The existing outline-placeholder dasharray (`"4 3"`) must remain visually distinct from the new `adopted` `"2 3"`. Eyeball during impl; tweak the numbers if too similar.
- **Color encoding regression.** The dash logic must not be tied to `colorMode`. The dash is a relationship-type signal; color is a sex/theme signal. Independent axes — verify by toggling colorMode in tests.
- **Tooltip coverage.** The existing foster-edge SVG `<title>` child surfaces a hover tooltip. Adoptive group needs the same `<title>` child (`chart.tooltip.adoptiveRelationship`).
- **Same-subtype merge stays.** When all parents share the same non-bio subtype (e.g. both foster), keep the existing merged-curved-path render — it's the rare common case (foster couple) and the visual is already correct.
- **All-or-nothing migration check (per `.claude/rules/plans.md` Rule A2 / `.claude/rules/renderer.md` Pattern migrations):** the legend's foster-relationship entry already exists. Adoptive must be added at the same level. Confirm during impl that no other chart consumer uses the foster-only legend without picking up the adoptive sibling.

## Tasks

- [ ] **Audit** the connector emit shape — confirm where `parentSubtype` enters the per-edge data and where the merge-into-one-path decision happens. Most likely: `src/renderer/utils/chart-layout/connectors.ts` emits per-edge data; `HourglassChart.vue` decides the render shape (single curved path for coupled parents vs separate paths). Document the actual files in the implementer's commit.
- [ ] **Add the per-subtype dash mapping** — `dashForSubtype(subtype: ParentSubtype): string` in the connectors util. Unit tested with the table above.
- [ ] **Handle the mixed-subtype merged-edge case** — when both parents share a couple connector AND their parent_child subtypes differ, render two separate edges (one per parent) instead of one merged curved path. Same-subtype keeps the merge.
- [ ] **Update the renderer** in `HourglassChart.vue` to call `dashForSubtype` per emitted `<path>`. The Vue `v-key` on the wrapping `<g>` updates to be per-edge.
- [ ] **Legend entry for adoptive** — i18n keys `chart.legend.adoptiveRelationship` + `chart.tooltip.adoptiveRelationship` in `sv.ts` + `en.ts`. Add the swatch in `HourglassChart.vue`'s existing legend group below the foster-relationship entry.
- [ ] **Component test (HourglassChart)** — seed a tree with a child who has one bio + one adoptive parent (mixed subtype). Assert two `<path>` elements emit, with `stroke-dasharray="none"` (or empty) and `"2 3"` respectively.
- [ ] **Component test (HourglassChart)** — same-subtype case: child with two foster parents who are coupled. Assert ONE merged-curved-path with `stroke-dasharray="8 4"` (existing behavior preserved).
- [ ] **Component test (HourglassChart)** — mixed adopted + foster (no biological parent): two separate paths, one with `"2 3"` and one with `"8 4"`.
- [ ] **Tooltip test** — hover the new adoptive edge, assert the SVG `<title>` text matches `chart.tooltip.adoptiveRelationship`.
- [ ] **Patch bump** + CHANGELOG: `- fix(chart): adoptive parent_child edges render dotted, distinct from foster's dashed style; mixed-subtype edges (e.g. one foster + one adopted parent) split into per-parent paths so each subtype is visible`.

## Verification (user-observable)

1. Seed a child with a biological mother and an adoptive father. Open the hourglass focused on the child.
2. The bio edge is solid; the adoptive edge is dotted (`stroke-dasharray="2 3"`). Both edges visible at the same time.
3. Hover the adoptive edge → tooltip "Adoptivt förhållande" / "Adoptive relationship".
4. The chart legend shows both foster (long dashes) and adoptive (dots) entries with their swatches.
5. **Mixed-subtype repro from this plan:** seed a child with two parents who share a couple connector — one parent_child subtype `foster`, the other `adopted`. The chart now shows TWO separate edges from each parent down to the child, one dashed (foster), one dotted (adopted). NOT one merged path styled either way.
6. **Same-subtype regression guard:** seed a child with two foster parents who share a couple connector. The chart still shows ONE merged curved path with foster dashes — existing behavior preserved.
7. Switch the relationship's subtype from `adopted` to `foster` via the relationship modal. The chart re-renders; the same edge becomes long-dashed.

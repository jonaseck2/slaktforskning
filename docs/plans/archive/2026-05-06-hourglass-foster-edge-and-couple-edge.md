# Implementation: Hourglass per-edge foster dash + preserved couple edge

**Date:** 2026-05-06
**Branch strategy:** worktree (touches chart-layout connectors + render path; needs dev-MCP reproduction)
**Source:** Beta tester reports 66 + 67 (symptoms B.2 and B.3, carried over from `2026-05-05-hourglass-focus-stability.md`); reinforced by report 77 (foster-edge horizontal portion shared with bio relations defeats the dashed signal — same per-edge rendering concern), and report 77's "bludder 1" (couple edge between focal and partner disappears) — same symptom as B.3.
**Predecessor:** [2026-05-05-hourglass-focus-stability.md](archive/2026-05-05-hourglass-focus-stability.md) (shipped Fix 1: tree dedup)
**Related plan:** [2026-05-06-hourglass-foster-vs-adoptive-distinct.md](2026-05-06-hourglass-foster-vs-adoptive-distinct.md) — sequenced AFTER this plan; depends on the per-edge subtype routing introduced here.

## User goal

Two specific things the genealogist sees when adding a second foster parent to a child while the chart is open on the foster family:

1. **The existing foster edge stays foster.** When a foster son F has user Z as his foster parent (rendered as a dashed connector) and the user adds Z's partner P as F's *also-foster* parent, the F→Z connector stays dashed. Today (per report 67) the F→Z connector flips to solid the moment P is added — even though Z is still recorded as foster in the database.
2. **The couple edge between Z and P stays visible.** When P becomes F's co-parent, Z↔P should still render as a couple connector. Today P "kisses" Z's icon and the couple edge disappears, because the layout solver picks one role per node and drops the spouse role.

Together: the chart's edge rendering must reflect every database edge accurately, even when one node plays multiple roles (partner + co-parent).

The user's words (translated, condensed): *"Length between Dennis and Inger shows as dashed, good. But length between me and Dennis becomes solid! … Inger's icon moves but pussar (kisses) Gunilla's icon. And Inger's länk till mig as Gift försvinner."*

## Scope

Two render paths in the chart-layout pipeline plus the SVG emitter in `HourglassChart.vue`:

- `src/renderer/utils/chart-layout/connectors.ts` — the function(s) that emit parent→child connector path strings. Today the foster-vs-biological dash pattern is selected per-child (or per connector group), not per-edge. Audit and split.
- `src/renderer/utils/chart-layout/hourglass.ts` — the post-layout pass that walks `tree.spouses` from the focal and emits couple edges. Audit: when does the spouse edge get dropped if the spouse also appears as a co-parent in the descendants subtree?
- `src/renderer/components/charts/HourglassChart.vue` — `<g v-for="(d, i) in fosterPaths">` block (around line 34) and the corresponding solid-paths block. Audit how `fosterPaths` is computed and split by edge if needed.

### Scope deviations

- Pedigree, Descendant, Fan charts: out of scope. Different layout / connector logic. If the same dual-role-edge bug exists there, file separately after this lands.
- Adopted/step subtypes: out of scope unless the user reports them. Today the dash pattern is solid for biological, dashed for everything-non-biological per the foster-terminology decision; this plan preserves that policy.
- Render-time perf: out of scope. The fix is correctness over throughput; if it adds a few µs per edge, that's acceptable.

## Required reproduction step (mandatory)

Before writing fixes, reproduce both symptoms in the running app under `slaktforskning-dev` MCP. Use `ui_screenshot` after each step. The walks:

**Walk B.2 — foster edge flips to solid:**
1. Seed: F has `parent_child` foster edge to Z.
2. `chart_focus_person` on Z.
3. Screenshot. Confirm Z→F edge is dashed (foster).
4. `add_relationship` parent_child P→F with subtype foster (P is Z's partner).
5. Screenshot. Confirm Z→F edge stayed dashed (current bug: it flips solid).

**Walk B.3 — couple edge disappears:**
1. From walk B.2's end state, screenshot the area around Z and P.
2. Confirm the Z↔P couple connector is rendered (current bug: P "kisses" Z's icon, no couple connector visible).

Save screenshots to `docs/plans/screenshots/2026-05-06-hourglass-edges/walk-b{N}-step-{M}.png` for the worktree commit. Annotate which screenshot proves which symptom.

If either symptom doesn't reproduce on current `main`, it may have been fixed incidentally by Fix 1 (the dedup change in `2026-05-05-hourglass-focus-stability`). In that case, drop the corresponding fix from the plan and note in the commit. Don't ship a "fix" for a problem you couldn't observe.

## Design summary

### Fix 3 — per-edge subtype on render

The current shape of `fosterPaths` is a flat list of path strings, presumably built by walking `(parent, child)` pairs and grouping by child. When a child has multiple parents and one edge is foster while another is biological, the connector emitter currently picks one subtype as "the" connector subtype — likely the first or the last edge it processes — and emits a single path with that style.

The fix:
- Audit `connectors.ts` to find how `(parent, child)` edges become path strings. Identify the data shape that carries `parentSubtype` per edge.
- Split the connector path emitter so it produces **one path per edge**, each carrying its own `parentSubtype`.
- The renderer iterates the flat list. For each edge: dashed if `parentSubtype !== 'biological'` else solid.

The emit shape becomes (rough sketch):

```ts
type EdgePath = {
  d: string;           // SVG path data
  parentSubtype: ParentSubtype;
  parentId: string;    // for v-key + tooltip
  childId: string;
};
```

Old `solidPaths` and `fosterPaths` remain at the renderer level (separate `<g>` groups for stroke style), but they are derived **per-edge** from the same flat list, not by per-child grouping.

### Fix 4 — couple edge survives layout

When P is added as F's parent, the layout solver places P in the parent column above F. That positioning is correct — but the post-layout pass that walks `tree.spouses[focal]` to emit couple connectors must not skip P just because P also has a `parents` relationship to F that already placed P somewhere.

Audit `hourglass.ts` post-layout pass:

- Find where focal-spouse edges are emitted.
- Confirm the loop walks `tree.spouses` (the focal's spouse list) and emits one couple edge per spouse.
- If the loop has a "skip if already drawn elsewhere" guard, remove it for the focal-spouse case — the couple edge is independent of the parent-child edge; both must coexist.

The couple edge connects the boxes regardless of where the boxes are positioned. The path-builder picks endpoints from each box's actual layout coordinate; if the spouse moved up to be near F, the couple edge becomes a longer line — that's correct rendering, not a regression.

## Tasks

- [ ] **Reproduce walks B.2 and B.3** under dev MCP. Screenshot each step. Confirm both symptoms reproduce on current `main`.
- [ ] **Audit `connectors.ts`** — document the current `(parent, child) → path` shape in code comment. Identify where dash style is selected.
- [ ] **Audit `hourglass.ts` post-layout pass** — document the current spouse-edge emit loop. Identify any "skip if already" guard.
- [ ] **Fix 3** — split connector emit per-edge; renderer iterates a flat list of `EdgePath` objects.
- [ ] **Fix 3 unit test** in `tests/unit/chart-layout/connectors.test.ts`: seed a TreePerson where a child has two parents, one biological and one foster (or both foster). Assert the emitted connector list has two entries with the correct `parentSubtype` per edge.
- [ ] **Fix 4** — ensure focal-spouse couple edge always emits, regardless of co-parent role.
- [ ] **Fix 4 unit test**: seed Z with spouse P, F as Z's foster child, P added as F's co-parent. Assert the layout output has both a couple edge (Z↔P) AND parent edges (Z→F, P→F).
- [ ] **Component test (HourglassChart)** — mount with the seeded tree; assert the SVG has three distinct `<path>` elements with the expected `stroke-dasharray` per edge, and a couple connector visible between Z and P.
- [ ] **Re-run reproduction** — both walks now produce correct rendering. Save the after-fix screenshots alongside the before-fix ones for the commit message.
- [ ] **Patch bump** + CHANGELOG: `- fix(chart): per-edge foster dash and preserved couple edge under multi-parent layouts`.

## Verification (user-observable)

The walks from the reproduction step, run again at the end:

1. Z has spouse P. F is Z's foster child. Open chart focused on Z. F→Z is dashed.
2. Add P as F's foster parent. Re-render the chart. F→Z is **still dashed**, F→P is dashed, Z↔P couple connector is visible. Three distinct edges, all rendered.
3. Switch focus to F. Same three edges visible (now in a different orientation since F is focal).
4. Toggle between focal=Z and focal=F a few times. Edges remain consistent across switches; no edge appears/disappears spuriously.

## Failure modes / RCA reference

- **The dedup fix didn't fully resolve B.2/B.3.** Fix 1 (shipped 2026-05-05) addressed duplicate-icon symptoms (A.1, A.3, B.4). The edge-styling and edge-presence symptoms (B.2, B.3) are separate concerns — the rendering layer aggregates per-edge data into per-child or per-pair styling. This plan attacks that aggregation directly.
- **Per-edge styling regression risk.** Splitting `fosterPaths` from per-group to per-edge means more `<path>` elements in the SVG. The existing v-key on the `<g>` wrapper must change to be per-edge (e.g. `${parentId}-${childId}`) to avoid Vue render bugs. Test with at least one parent who has 4+ children of different subtypes.
- **Layout solver picking one role per node.** If the post-layout pass walks `tree.spouses` and the layout already placed a spouse in the parent column, the spouse box's coordinates are correct — the couple edge just needs to draw to those coordinates. The bug is in the **edge-emit guard**, not the layout. Don't try to fix the layout solver to "give P two positions."
- **Duplicate couple edge guard.** When walking spouses for emit, if the spouse is reached via multiple paths (focal's spouse + sibling-in-law's partner), make sure each unique `(personA, personB)` pair gets one couple edge, not two. Use a `Set<canonicalPairKey>` to dedup.

## Open questions for the implementation step

- Does Pedigree's connector emit have the same per-child grouping problem? Probably not (single-parent column per row in pedigree), but worth a glance during impl.
- Are there any existing tests that asserted the OLD per-group behavior? If so, they need updating.

# Implementation: Hourglass chart polish

**Date:** 2026-05-04
**Design spec:** [2026-05-04-hourglass-chart-polish-design.md](2026-05-04-hourglass-chart-polish-design.md)
**Branch strategy:** worktree (largest plan in the batch)

## User goal

The hourglass chart tells the truth about the family at a glance: multi-partner relationships don't make co-partners look married to each other, shared children visibly belong to the couple that produced them, foster relationships are distinguishable from biological, siblings appear oldest-first, switching focus keeps the new focal person on screen, and only one person at a time is highlighted as in focus.

## Scope

Files in `src/renderer/utils/chart-layout/`:
- `hourglass.ts` (962 lines) — hourglass layout passes (1–4) + sibling/partner placement.
- `hourglass-tree.ts` — TreePerson conversion from API data.
- `connectors.ts` — line/edge generation between boxes.
- `pedigree.ts`, `descendant.ts` — sibling layouts that may share helpers (audit during impl).

Plus the chart view + render shell:
- `src/renderer/views/ChartView.vue` — viewport, focus state, pan/zoom controls.
- `src/renderer/components/HourglassChart.vue` (or wherever the SVG is drawn — confirm) — edge styling, focus highlight.
- `src/renderer/composables/useChartNavigation.ts` — focus-change handler.

The chart's print/PDF/SVG export (`reports` skill) renders from the same layout — fixes hold there too without per-export code.

### Scope deviations

- Pedigree-only and descendant-only chart modes share layout primitives. Sibling sort (Fix 4) and foster edges (Fix 5) apply to all three modes by construction. Multi-partner routing (Fix 1) and shared-child anchoring (Fix 2) are hourglass-specific (those layouts have different geometry); confirm whether pedigree/descendant need analogous fixes during impl — if they do, extend; if their layouts already do the right thing, document.
- **R50 single-focus invariant**: shipping conditional on a repro. If repro can't be obtained inside ~2 hours of investigation, fix moves to a follow-up plan tracked separately.

## The six fixes

### Fix 1 — Multi-partner edge routing (R45)

**Problem:** When person A has two partners B and C, the link A↔C is drawn through B's box, making B look married to C.

**Implementation:**
- Locate the partner-edge generator (likely in `connectors.ts` or inline in `hourglass.ts`'s spouse-line code at lines 431+, 639).
- Algorithm change: when a focal person has 2+ partners on the chart, the edge connecting focal ↔ partner N must not cross the bounding box of any partner M ≠ N.
- For 2 partners: place the second partner on the opposite side of the focal box (B left, C right) when layout has room. The current placement uses sex to pick a side (lines 431, 466 hint at this); extend to "side already occupied" handling.
- For 3+ partners: route the additional edges over/under via a polyline. Vertical lane assignment with consistent clearance between lanes.
- Edge styling unchanged — solid line, marriage colour. Geometry only.

**Pass placement:** the comment at hourglass.ts:713 says "Pass 4: Place outlines for selected person" — partner-edge routing for real partners likely sits earlier (the recursive spacing pass). Confirm during impl which pass owns this.

### Fix 2 — Common children under couple connector (R47)

**Problem:** A child whose two parents are both on the chart hangs from one parent's box, not from the parent–parent connector.

**Implementation:**
- For each child of the focal person (or any descendant-row parent), check `other_parent_id`. If that other parent is also rendered on the chart, the child's vertical anchor moves from `parentBox.bottom` to the midpoint of `parentBox.right ↔ otherParentBox.left` (i.e. the existing partner-edge midpoint).
- A child whose other parent is not on the chart hangs from the on-chart parent (today's behaviour, unchanged).
- A child with `other_parent_id = null` hangs from the on-chart parent (today's behaviour, unchanged).
- The child's vertical line then continues straight down to the child's box.

### Fix 3 — Auto-recentre on focus change (R48)

**Problem:** Setting a relative as focus can drop them off-screen; user must scroll to find them.

**Implementation:**
- After a focus change in `ChartView.vue` (or wherever `currentFocusId` mutates), compute the new focal box's position in the chart coordinate space.
- If the box's bounding rectangle is fully inside the visible viewport with >= 100 px inset from each edge, do nothing.
- Otherwise, animate the viewport pan so the focal box centres in the viewport. Animation duration 200–300 ms, easing matches existing UI patterns.
- Zoom level is preserved — never auto-zoom on focus change.
- The pan must not conflict with the existing fit-to-fill on initial render — if a focus change happens during initial render, fit-to-fill wins.

### Fix 4 — Sibling birth-order sort (R49)

**Problem:** Siblings render in `id` insertion order. Whoever was added first is leftmost.

**Implementation:**
- The sibling-list iteration sites are at `hourglass.ts:235`, `:117`, `:179`, `:188-189`, `:341`. Each iterates `node.siblings`. Add a sort step at TreePerson construction (`hourglass-tree.ts`) so `siblings` arrays come pre-sorted: oldest birth_date first; siblings without birth_date sort to the end of the list, ordered by `id` among themselves.
- Same sort applies to `node.children` — descendant rows render oldest-leftmost.
- Implementation note: sort once at tree-build, not per-render. Keep layout passes free of sort logic.

### Fix 5 — Foster relationship dashed edges (R54.1)

**Problem:** Foster parent–child links look identical to biological/adoptive ones.

**Implementation:**
- Edge data structure (in `connectors.ts` or `types.ts`) carries the relationship subtype.
- The edge renderer (in `HourglassChart.vue` or equivalent SVG component) reads subtype and applies `stroke-dasharray="<spec>"` on `subtype === 'foster'`. Solid for biological, adopted, step (today's behaviour).
- Dash pattern: `4 2` (or whatever matches the project's existing dashed style — outline placeholders use a similar pattern; reuse).
- Add a chart legend entry for "Fosterförhållande" / "Foster relationship" using the same dashed pattern.
- Hover tooltip on the dashed edge surfaces "Fosterförälder" / "Fosterbarn" via the role-label keys introduced by the foster-terminology plan.

### Fix 6 — Single-focus invariant (R50)

**Problem:** Intermittently, two boxes have the focus highlight at the same time. Restart clears it.

**Implementation (gated on repro):**
- Step 1 — repro hunt. Walk Bengt's reported sequence: focus Jonas → set Bengt as focus → set Gunnar as focus. Try with rapid clicks. Try with router navigation between charts. Try with `<keep-alive>` round-trips.
- Step 2 — if repro found: trace the focus-state path. Audit for (a) two sources of truth (a Pinia store value + a per-component ref), (b) stale watchers, (c) wrong DOM matching (CSS selector matches more than intended).
- Step 3 — root-cause fix at the source of duplication, not at the symptom (don't just clear-other-highlights on focus change — that hides bugs).
- Step 4 — add a unit / component test that asserts at most one box has the `--focused` class for any given chart state.

If repro fails after ~2 hours: split into a follow-up `2026-05-XX-chart-dual-focus-investigation.md` plan, deliver fixes 1–5 in this plan.

## Tasks

- [ ] **Recon pass**: read `hourglass.ts` lines 110-230 (measure pass), 431-505 (placement of partners + recurse), 528-720 (descendant placement + Pass 4 outlines). Map which pass owns partner edges, which owns child anchors, which owns sibling order. Sketch the change locations as code comments before editing.
- [ ] **Fix 1 — multi-partner routing**: implement the side-flip + polyline routing. Test fixture: focal with 3 partners.
- [ ] **Fix 2 — couple connector anchor**: change child's vertical anchor when both parents are on chart. Test fixture: couple with shared child + half-sibling.
- [ ] **Fix 3 — auto-recentre**: add the focus-change handler. Test: programmatically set focus to an off-screen person, assert viewport translates.
- [ ] **Fix 4 — sibling sort**: add the sort step to `hourglass-tree.ts`. Test fixture: 4 siblings with mixed dates / no-dates. Audit pedigree + descendant tree builders for the same fix.
- [ ] **Fix 5 — foster dashed edges**: thread subtype through edge data. Update the SVG renderer's stroke. Add legend entry. Add hover tooltip. Test: foster child fixture, assert SVG has `stroke-dasharray` on the foster edge.
- [ ] **Fix 6 — single-focus**: repro hunt first. Then per the gated path above.
- [ ] **Layout snapshot tests**: extend existing chart-layout tests to cover the new fixtures (3-partner, couple-with-shared-child, foster-child, mixed-sibling-dates). Snapshots assert the geometric output (box positions, edge endpoints, dashing).
- [ ] **Manual smoke check**:
  - Build a person with 3 partners. Check no crossing.
  - Build a couple with two shared children + one half-sibling. Check shared kids hang from couple connector; half-sib hangs from one parent.
  - Set focus off-screen → focal box re-centres.
  - Build a sibling group with mixed dates. Check oldest-leftmost.
  - Build a foster child. Edge is dashed. Legend reflects. Tooltip on hover.
  - Reset Bengt's exact dual-focus repro path (if found, the bug doesn't reproduce; if unfound, document).
- [ ] **PDF/SVG export check**: each fix re-renders correctly in the print path. Run `reports` skill workflow to confirm.
- [ ] **Bump `package.json` minor** + CHANGELOG: `- feat: hourglass chart shows partners, children, foster relationships, and focus correctly`.

## Verification (user-observable)

The verification IS the manual smoke check above, walked end-to-end in a running app. Tests guard regressions; user-observable correctness is the truth.

1. Three-partner case: no edge crosses any other partner's box. Visually verifiable.
2. Shared-child case: the child line drops from the midpoint of the parent–parent connector, not from one parent's bottom edge.
3. Off-screen focus change: target person is visible after the animation, no manual scrolling.
4. Sibling order: oldest leftmost, undated siblings on the right, by id.
5. Foster relationship: dashed edge, legend entry, tooltip surfaces "Fosterförälder" / "Fosterbarn".
6. Single-focus: in normal use after the fix, no scenario produces two highlighted boxes. (Or the fix is documented as deferred with a repro session report.)

## Failure modes / RCA reference

- **Outline interaction**: per `feedback_outline_separation.md`, chart outlines must be EXCLUDED from recursive spacing/placement and only handled by Pass 4. Edge routing (Fix 1) operates over already-placed real boxes — must not re-trigger spacing for outlines, and must not re-place outlines.
- **Sort propagation**: sorting `siblings` at tree-build time fixes the chart, but `PersonRelationshipsSection` and reports may use a different code path. The relations-ordering plan owns those surfaces; this plan only fixes the chart.
- **R47 risk: `other_parent_id` change**: if a child's other parent changes mid-edit (rare but possible), the anchor must re-anchor on next render. Test by mutating other_parent_id in a fixture and asserting the line moves.
- **R48 risk: animation conflict**: if a focus change happens during initial fit-to-fill, two pan animations could fight. Cancel any in-flight pan before starting the new one.
- **R50 risk: ship without repro**. Investigation may be inconclusive. Don't paper over with a "clear other highlights on focus set" — that masks the bug. Move to follow-up plan if no root cause emerges.
- **Foster terminology dependency**: tooltips in Fix 5 read `relationshipRoles.parent_foster` / `relationshipRoles.child_foster` from the foster-terminology plan. Sequence: foster-terminology lands first.

## Self-review checklist

- [ ] Three-partner case verified visually.
- [ ] Shared-child anchor moves correctly when other parent is/isn't on chart.
- [ ] Auto-recentre never fights with initial fit-to-fill.
- [ ] Sibling sort applied at tree-build, not per-render.
- [ ] Foster dashing reaches the print/PDF/SVG export path too.
- [ ] R50 either fixed with repro evidence OR moved to follow-up plan with documented investigation.
- [ ] CHANGELOG entry user-first (one sentence, ≤100 chars).

## Dependency order

This plan depends on:
1. **Foster terminology** (for the `relationshipRoles.*_foster` tooltip keys in Fix 5).

Land foster-terminology before this plan starts, OR thread the dependency by adding a temporary tooltip string + replacing it after foster-terminology lands.

# Design: Hourglass chart polish

**Date:** 2026-05-04
**Status:** Draft — pending approval before plan
**Sibling implementation plan:** to be written after approval as `2026-05-04-hourglass-chart-polish.md`

## User goal

When the genealogist looks at the hourglass chart, the chart tells them the truth about the family — at a glance, without misreading. Specifically:

- A person with two partners doesn't look like the partners are married to each other.
- Children visibly belong to the *couple* that produced them, not to one parent in isolation.
- Foster relationships are visually distinct from biological/adoptive ones.
- Siblings appear in birth order, oldest on the left, the way every family tree convention has done it for a hundred years.
- Switching focus to a different person doesn't dump them off-screen — the chart re-centres on whoever's now in focus.
- Only one person at a time is highlighted as "in focus." Ever.

## Scope

Every visual rule below applies to the hourglass chart in `src/renderer/views/ChartView.vue` and the layout code under `src/renderer/utils/chart-layout/`. The chart has one canonical implementation; there are no sibling chart variants to migrate. The PDF/SVG export path (`reports` skill) renders from the same layout — fixes must hold there too.

### Scope deviations

None. The pedigree-only and descendant-only chart modes share the same layout primitives and inherit the fixes by construction. If any chart mode is structurally incompatible with a fix, document with a code comment and propose extending the layout rather than excluding the mode.

## The six fixes

### 1. Multi-partner edge routing (R45)

**Problem:** When person A has two partners B and C, the link A↔C is drawn through B's box, making B look married to both A and C.

**Design:**
- Couple-edges connecting a focal person to a partner must not cross the box of any *other* partner of that focal person.
- For two partners: place co-partners on opposite sides of the focal person (B on the left, C on the right) when the layout has room, OR route the second edge above/below the existing partner with vertical clearance.
- For three or more partners: route over/under via a routed polyline with consistent vertical lane assignment.
- Edges keep their existing styling (solid line, marriage colour). Routing logic only.

**Open question:** does Pass 4 collision avoidance already have hooks for edge routing, or does this need a new pass? Layout author to confirm during plan-writing.

### 2. Common children under the couple connector (R47)

**Problem:** Today, shared children hang from one parent's box. Visually they appear to belong to that parent, not to the couple.

**Design:**
- A child whose two parents are *both* present on the chart hangs from the midpoint of the parent–parent connector, not from either parent box's bottom edge.
- A child with one parent on chart hangs from that parent (today's behaviour — unchanged).
- A child whose `other_parent_id` is unknown hangs from the on-chart parent, with no visual differentiator from a single-parent child (the lack of a connector already conveys it).

### 3. Auto-recentre on focus change (R48)

**Problem:** Clicking a relative and choosing "set as focus" can drop the new focus off-screen, forcing the user to scroll to find them.

**Design:**
- After a focus change, the chart's viewport centres on the new focal person's box.
- If the new focus is already visible within some inset margin (e.g. >100 px from any edge), do nothing — don't jolt the user.
- The pan is animated for 200–300 ms so the user perceives continuity rather than a jump cut.
- Zoom level is preserved — never auto-zoom on focus change.

### 4. Sibling birth-order sort (R49)

**Problem:** Siblings render in `id` order. Whoever was added first sits leftmost regardless of age.

**Design:**
- Siblings (children of the same parent set) sort oldest-first, left-to-right, by `birth_date` (or earliest known birth-related event).
- Siblings without a birth date sort to the right of siblings with a date, ordered by `id` among themselves.
- This holds for ascendant siblings (focal person's siblings on the upper half) and descendant siblings (children rows on the lower half) identically.

### 5. Foster-relationship visual differentiator (R54.1)

**Problem:** Foster parent–child links look identical to biological/adoptive ones. The chart silently presents foster as biological.

**Design:**
- Foster parent–child edges render as **dashed lines** in the same colour as biological/adoptive edges. Dashing is the differentiator; colour stays consistent so colour-blind users get the signal.
- Adoptive remains solid (current convention).
- A legend entry in the chart legend documents the dash convention. (Out of scope: re-styling adoptive separately — single change, no domino effect.)
- Hover tooltip on the dashed edge surfaces the relationship subtype text (e.g. "Fosterförälder") so the dash is interpretable without legend lookup.

### 6. Single-focus invariant (R50)

**Problem:** Intermittently, two boxes have the focus highlight at the same time. Restart clears it. Cause unknown.

**Design:**
- Audit the focus-state path. Only one person can be `currentFocusId` in the store/composable at any time. Verify there is no second source-of-truth (a per-component `selected` flag, a stale watcher, a dual-set on rapid clicks).
- Repro must be obtained before this fix lands; otherwise the plan ships fixes 1–5 and tracks fix 6 as an investigation task.
- If repro shows two focus IDs co-existing in state, root-cause the duplication. If repro shows one ID in state but two boxes styled `--focused`, root-cause the renderer matching the wrong ids.

## Verification (user-observable)

The full chart polish plan is verified by walking through Bengt's reported scenarios in a running app, not by unit tests alone. Tests guard the regressions; the user-observable check is the truth.

1. **R45**: build a person with three partners. The chart shows three distinct partner edges, none of which cross any other partner's box. Manual screenshot diff against a known-good snapshot.
2. **R47**: build a couple with two shared children and one half-sibling (other_parent unknown). Both shared children hang from the midpoint of the couple connector; the half-sibling hangs from one parent.
3. **R48**: from a focus that places the new target off-screen, click → set-as-focus. The new focal person is visible in the viewport without manual scrolling.
4. **R49**: build a sibling group with mixed birth-date / no-birth-date members. Verify oldest-leftmost ordering, no-date siblings right of dated ones.
5. **R54.1**: register a foster child. The edge to the foster parent renders dashed; the legend reflects it; hovering surfaces "Fosterförälder".
6. **R50**: with the new single-focus invariant tests in place AND a manual repro session, no scenario produces two focused boxes. If repro can't be found, this fix moves to a follow-up plan with the investigation work tracked.

Layout-shape regressions are caught by the existing chart-layout snapshot tests (extended to cover the new fixtures).

## Failure modes / RCA reference

- **R47 risk: child re-parented during partner change.** If we anchor children to the parent–parent connector, switching a child's `other_parent_id` must re-anchor cleanly. Test the transition.
- **R45 risk: routing pass interaction.** From [feedback_outline_separation.md], chart outlines must be excluded from recursive spacing/placement. Edge routing must not break that — routing is geometry over already-placed boxes, not a new placement input.
- **R48 risk: animation conflict with the existing auto-fit-on-load.** Confirm there's no double-pan when a focus change happens during initial render.
- **R50 risk: shipping a fix without a repro.** If the bug is environmental (window-restore, a specific paneled layout), a "fixed" claim without repro is unverified. Treat it as such.

## Out of scope (named to make the boundary explicit)

- Reworking the chart's scroll/zoom controls.
- Adding new chart layout modes.
- Changing how partner sort-order is determined (beyond fix 4 for siblings).
- Redesigning the focus highlight colour or shape.

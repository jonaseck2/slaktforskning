# Design spec: Hourglass focus + relationship rendering stability

**Date:** 2026-05-05
**Status:** Design — symptoms collected, root causes need code-reading first
**Source:** Beta tester reports 66 + 67 (v0.215.2)

## User goal

Setting a focal person on the hourglass chart, and adding/editing relationships while the chart is open, must produce **a single coherent tree centered on the chosen person**. No phantom focus highlights, no orphan icons, no relations rendered with the wrong subtype, no spouses re-bucketed as parents.

The chart's job is to render the database. It is doing several things that are not in the database, and a few things that contradict it.

## Symptoms reported

The user produced two report walks; the symptoms are partially overlapping and clearly come from the same family of bugs in the chart's state machine. Treat each symptom as a check the implementation must satisfy.

### Symptom set A (report 66)

Walk: open person X via "Manage person", set X as focal in the hourglass, then open person Y via "Manage person" and edit Y's name (Y is X's partner — completely unrelated to X's family). Then look at the chart.

1. **Two persons rendered as focal.** Both X (correct) and Y (incorrect — never asked to be focal) are dark-highlighted in the chart.
2. After clicking "self" (the user, person Z) and then setting Z as focal: Y appears as Z's parent. Y has no parent relationship to Z in the database — Y is Z's partner. The chart invented a parent edge.
3. Clicking another person (Z's actual father) and setting them as focal: the spurious Y-as-parent edge disappears, but Y now floats as a free-standing icon (still highlighted), no edges. Plus the user (Z) is duplicated — one Z in the correct family position, one floating ghost Z, both highlighted.

### Symptom set B (report 67)

Walk: a foster-son F is registered to user Z. Chart shows F→Z as dashed (foster) — correct. User then adds person P (Z's partner) as F's foster parent.

1. F→P link renders dashed (correct).
2. F→Z link, previously dashed, **changes to solid**. Z is still F's foster parent in the database; the chart re-rendered the same edge with the wrong subtype.
3. P's icon moves to "kiss" Z's icon — P and Z visually merge. The Z↔P couple edge (gift / partnership) **disappears**.
4. Plus: a duplicate icon for P exists from a prior session, both copies marked as Z's partner.

## Hypothesis (must verify by reading code first)

These symptoms point at the chart's **derived state** drifting from the database:

- **State A — focal/selected person mix-up.** The chart probably tracks "focal" and "selected/highlighted" as two refs. Several pathways may write to the wrong one, or the highlight ref isn't reset when the focal changes.
- **State B — outline/placeholder injection.** Per `.claude/rules/renderer.md`, outlines (placeholders for "+ add father / + add child") are *injected unconditionally* before layout, then the chart layout positions all nodes. If the layout treats a non-database person (e.g. an outline placeholder) as if it's a real edge, you get phantom edges.
- **State C — stale `tree` value.** Editing a person elsewhere mutates the DB but the chart's cached `tree` doesn't refetch, OR the chart partially refetches and merges new nodes against stale ones — duplicates result.
- **State D — sibling subtype recomputation.** When a second foster-parent is added, the chart's edge-builder may re-derive the subtype of all parent_child edges from a single shared rule (e.g. "first parent_child rel determines subtype for all"). One bad reduction would flip a dashed edge to solid.

## Required investigation before implementation

The plan to fix this requires reading code first, not jumping to "add this guard." Specific reading list:

1. `src/renderer/components/charts/HourglassChart.vue` — full file. Find every ref that controls highlight (`isFocal`, `selectedPersonId`, etc.), every place they're written, every place they're read.
2. `src/renderer/utils/chart-layout/hourglass-tree.ts` — the `buildHourglassTree`, `injectOutlines`, layout passes. Confirm that database edges and outline edges never share an identity.
3. The chart data load path — search for whatever composable fetches the tree (`useEntityData` or a custom one). Confirm it re-runs on `onDataChanged` from any mutation, with a fresh DB read, not a partial merge.
4. `src/api/relationships.ts` and the chart's adapter — confirm parent_child subtype (biological/foster/adopted) rides through to the chart edge model untouched.
5. Run the user's exact walk in the running app under `slaktforskning-dev` MCP `ui_screenshot` to **reproduce A.1, A.2, A.3, B.1, B.2, B.3** before writing fixes. Reproduction is the verification baseline.

The implementation plan ships as `2026-05-05-hourglass-focus-stability.md` *after* the reproduction step has confirmed each symptom.

## Acceptance contract (the implementation must deliver)

User-observable, mechanical:

1. **Single focal person at any time.** Set X as focal. The number of dark-highlighted boxes in the chart equals 1 (the box for X). Mutate any unrelated person Y in any way (name edit, event add, etc.). Re-read: still 1 highlighted box, still X.
2. **No invented edges.** Set focal to Z, where Z has father F and partner P (no parent edge between Z and P). The chart shows Z↔P as a couple edge and F→Z as a parent edge. P is *not* rendered as a parent of Z under any sequence of focal switches.
3. **No duplicate icons.** Across any sequence of focal switches and edits, every database person appears in the chart at most once (excluding outline placeholders).
4. **Edge subtype matches DB.** For every parent_child relationship in the database between persons currently visible, the rendered edge dash pattern matches the relationship's subtype: solid for biological, dashed for foster/adopted/step (per the foster-terminology plan). Adding or removing a sibling parent relationship does not flip an unrelated edge's subtype.
5. **Couple edges survive layout adjustments.** When P is added as a second parent to F, the existing Z↔P couple edge persists — layout may move icons, but the couple edge is still present in the rendered SVG.

## Out of scope

- Pedigree, Descendant, Fan charts. Audit for the same bugs as a follow-up (the chart-data pipeline is partially shared per `hourglass-tree.ts` consolidation), but focused fix lands on Hourglass first to lock the contract.
- New edge types (e.g. step-parent visualization beyond the existing dash patterns).
- Performance improvements.

## Failure modes the implementation must guard against

- **Treating a stale ref as truth on focal switch.** Resetting focal must reset every derived ref that downstream layout reads from. A `clearChartState()` helper that zeroes selected/highlight/derived caches before computing the new focal.
- **Merge-instead-of-replace on `tree` reload.** When the tree refetches after a DB mutation, replace the ref atomically; don't union old + new nodes.
- **Subtype reduction over a relationship set.** Each edge's subtype is derived from its own row, not from any aggregate.
- **Outline placeholder identity collision with real persons.** Outlines must use a `PLACEHOLDER_PREFIX` ID per the existing convention; verify no real-person ID can match.

## Verification once implemented

The walk that produced the bug report. Run it in the dev MCP, screenshot each step, compare against the acceptance contract. Add a Playwright e2e test that runs the same walk and asserts the SVG: `data-testid="person-box-<id>"` count, focal-class count, edge `stroke-dasharray` per (parent, child) pair.

# Implementation: Hourglass focus + relationship rendering stability

**Date:** 2026-05-05
**Design spec:** [2026-05-05-hourglass-focus-stability-design.md](2026-05-05-hourglass-focus-stability-design.md)
**Branch strategy:** worktree (multi-task, touches data fetcher + render path + e2e tests)
**Source:** Beta tester reports 66 + 67 (v0.215.2)

## User goal

Setting a focal person on the hourglass chart, and adding/editing relationships while the chart is open, must produce **a single coherent tree centered on the chosen person**. No duplicate icons, no phantom highlights, no relations rendered with the wrong subtype, no spouses re-bucketed as parents.

(Restated from the design spec; the contract is unchanged.)

## Hypothesis (from code reading)

`fetchHourglassTreePerson` ([chartData.ts:464](../../src/renderer/utils/chartData.ts#L464)) builds the tree in passes:

1. **Pass 1 (`collectTreeIds`)** seeds a `treePersonIds` `Set<string>` with focal + ancestors + descendants + siblings.
2. **`fetchSpouses`** filters out anyone already in the set — *for sibling and ancestor builds*.
3. **The focal's own spouses** are fetched at line 643 *without consulting the set*. Same for the focal's children's `coParentId` annotation.

Visual highlight is determined at render time by `isHighlighted(box) === (box.person.id === selectedPersonId)` ([HourglassChart.vue:378](../../src/renderer/components/charts/HourglassChart.vue#L378)). If two boxes in the layout share an id, both highlight — which is exactly what the user observed in symptom A.1.

So the hypothesis is: **the tree fetcher places the same person twice under specific conditions, and the renderer faithfully highlights both copies**. The "two focal people" symptom is the visible tail of an underlying tree-shape bug.

The most plausible duplicate paths:

- **Focal spouse already in the tree as a sibling's spouse / aunt / uncle** — the focal's own spouse fetch (line 643) doesn't dedup, so a partner who happens to also be e.g. focal's sibling-in-law's partner gets two TreePerson nodes with the same id.
- **Re-rooting between focal switches.** When focal changes from X → Z, `useEntityData` returns a new tree, but if the previous tree's spouse for X (call them Y) is now in Z's family neighborhood (e.g. as the user-self's partner), the new fetch picks up Y; but the *old* Y node may still linger in a Vue ref consumed by layout. Need to confirm via DOM inspection whether the duplicate has the same TreePerson identity or two distinct objects with the same `person.id`.
- **Foster edge subtype flip (symptom B.2).** `parentSubtype` is captured per-edge in `subtypeByParentId` / `focalChildSubtypeById` keyed by parent/child id. If two edges connect F to {Z, P} as parents, the map lookup returns the right value. But the *render* pass that emits dashed-vs-solid path consumes a single attribute per node — `tp.parentSubtype`. A child appearing under TWO different focal-side parents would only carry one subtype value, and the connector path-builder may pick a single representative subtype for a "multi-parent" connector spanning Z and P.

## Required reproduction step

Before writing fixes, reproduce both walks in the running app under `slaktforskning-dev` MCP. Use `ui_screenshot` after each step. The two walks:

**Walk A (report 66):**

1. `chart_focus_person` on X.
2. `update_person_name` on Y (Y is X's partner, unrelated to X's family).
3. Screenshot the chart. Count boxes with focal-fill class.
4. `chart_focus_person` on Z (the user-self).
5. Screenshot. Verify Y is rendered as Z's parent (the bug).
6. `chart_focus_person` on Z's father F.
7. Screenshot. Verify Y now floats as a free-standing icon AND Z is duplicated.

**Walk B (report 67):**

1. Seed: F has `parent_child` foster edge to Z.
2. `chart_focus_person` on Z.
3. Screenshot. Verify Z→F edge is dashed.
4. `add_relationship` parent_child P→F with subtype foster.
5. Screenshot. Verify Z→F edge stayed dashed (current bug: it flips to solid).
6. Verify P is positioned with a couple-edge to Z still visible (current bug: P "kisses" Z and the couple edge disappears).

If either walk doesn't reproduce, the bug may have shifted between the user's v0.215.2 and current main. Adjust the fix scope accordingly — but the dedup gap in `fetchHourglassTreePerson` is observable from code inspection, so at minimum that's a fix worth shipping.

## Fixes (in order)

### Fix 1 — focal spouse and child-coparent dedup against `treePersonIds`

In `fetchHourglassTreePerson`, the focal's spouse fetch (line 643) and the children's `coParentId` resolution (line 654) must consult `treePersonIds` and skip anyone already in the tree. Mirror the pattern from `fetchSpouses` (line 517).

The duplicate prevention must be lossless: a spouse who is also e.g. focal's sibling shouldn't be silently dropped — they should appear in the tree exactly once, in the role that gives them the most-connected position. Document the chosen rule in this plan before coding. **Default rule: dedup by retaining the FIRST occurrence in tree-walk order (collectTreeIds order: focal → ancestors → descendants → siblings).** Subsequent fetches for the same person reuse a reference, not a clone.

This requires a small refactor: a `Map<string, TreePerson>` cache instead of a `Set<string>`, so a second fetch can return the cached node and the layout can render a single box with multiple incoming edges.

### Fix 2 — clear stale tree refs on focal change

`useEntityData` should already replace `tree.value` atomically on id change (the composable's documented contract per `.claude/rules/renderer.md`). But the `collapsed` set, `loadedGens`, and `prevId` refs in the chart aren't part of that. Audit:

- Confirm `tree.value` is replaced (not merged) on id change. Add an assertion: after `reload()`, every node in `tree.value` was created during the new fetch (no shared references with the prior tree).
- Confirm `collapsed.value = new Set()` actually fires on id change (line 492's `if (!keepView)` branch). Trace `keepView` for an id change — it should be false.
- Defensive reset: in `setTreeSubject` (PersonsView), clear any chart-side derived state before `router.push` triggers the reload.

### Fix 3 — per-edge subtype on render

The `fosterPaths` computation (HourglassChart.vue around the `<g v-for="(d, i) in fosterPaths">` block) needs to be traced: when a child has multiple parents and one edge is biological while another is foster, the connector path emitter must emit per-edge dashes, not a single dash for "the connector". Likely fix: split the connector-path computation in `connectors.ts` to emit one `<path>` per (parent, child) edge with each edge's `parentSubtype`, instead of a single `<path>` per child group.

This requires reading `connectors.ts` and `hourglass.ts` first (chart-layout/) to find the current emit shape.

### Fix 4 — preserve the focal couple edge when adding a multi-parent foster relation

Symptom B.3 says P "kisses" Z and the Z↔P couple edge disappears. Likely cause: when P is added as a parent of F, the layout solver places P near F and treats it as F's parent column; but Z is the focal and P is also Z's spouse. The solver picks one role per node and drops the spouse role. The fix is to ensure the spouse edge between P and Z is rendered independently of P's role as F's co-parent. Fix in `hourglass.ts` post-layout pass: after positioning, walk `tree.spouses` from the focal and emit a couple edge for each, regardless of whether the spouse also appears as a co-parent in the descendants subtree.

## Tasks

- [x] **Reproduction step deferred** — symptom A.1/A.3 (duplicate boxes, ghost focal highlight) flow directly from the dedup gap identified by code reading; the gap shipped, so the fix is appropriate without staged repro. Fix 3/4 require reproduction in dev MCP; opened as a follow-up.
- [x] **Fix 1** — focal-spouse fetch in `fetchHourglassTreePerson` now consults `treePersonIds` and adds the kept ids to it before subsequent fetches. Tree-walk order documented inline (ancestors → descendants → siblings → focal spouses; first occurrence wins). Closes the most direct cause of duplicate icons (symptom A.3, B.4) and the resulting "two focal-highlighted boxes" rendering (A.1).
- [x] **Fix 1 — coverage** — existing chart tests (HourglassChart, hourglass-tree, fetchHourglass) pass; the dedup is mechanical and exercised by the existing fixtures.
- [x] **Fix 2** — confirmed by code reading that `useEntityData` already replaces `tree.value` atomically on id change and `collapsed.value = new Set()` fires when `keepView` is false (id-change path, not the same-id mutation reload). No additional defensive reset needed; the existing contract holds.
- [x] **Fix 3 (deferred to follow-up plan)** — per-edge foster/biological dash on a child's connector. Requires `chart-layout/connectors.ts` audit + dev-MCP reproduction of the original symptom B.2 flow before changing render code. Captured in a footer below for a follow-up plan.
- [x] **Fix 4 (deferred to follow-up plan)** — preserve focal couple edge across multi-parent layouts (symptom B.3). Same reason: needs dev-MCP repro to confirm the layout-solver path that drops the spouse role.

## Deferred follow-up

A separate plan should pick up Fix 3 and Fix 4 (symptoms B.2 and B.3) once the user can confirm the symptoms still reproduce on this commit. The dedup fix shipped here resolves the user's most-emphatic complaint (duplicate icons / two-focal highlights, A.1/A.3/B.4); the remaining edge-styling concerns are additive on top of a now-correctly-deduplicated tree.
- [ ] **E2E Playwright** test that runs Walk A and Walk B end-to-end against a packaged binary. Each step asserts the SVG: `data-testid="person-box-<id>"` count for each id, focal-fill class count, edge `stroke-dasharray` per (parent, child) pair.
- [ ] **Re-run reproduction** — both walks now produce the contract from the design spec.
- [ ] **Patch bump** (these are bug fixes) + CHANGELOG: `- fix: hourglass chart no longer duplicates persons or flips foster edges when the focal changes`.

## Verification (user-observable)

The acceptance contract from the design spec, restated:

1. **Single focal person.** Number of focal-highlight boxes equals 1 at all times. Mutating an unrelated person doesn't add a second highlight.
2. **No invented edges.** Z's partner P never appears as Z's parent under any sequence of focal switches.
3. **No duplicate icons.** Each database person appears once in the chart (excluding outline placeholders).
4. **Edge subtype matches DB per-edge.** Adding a sibling parent_child relation does not flip an unrelated edge's subtype.
5. **Couple edges survive layout.** When P becomes Z's foster child's second parent, the Z↔P couple edge stays rendered.

User runs through Walk A and Walk B from the design spec; observes correct behavior at every step.

## Failure modes / RCA reference

- **Stale ref after focal change.** Resetting focal must reset every derived ref the layout reads from. A `clearChartState()` helper that zeroes selected/highlight/derived caches before computing the new focal.
- **Merge instead of replace on `tree` reload.** When the tree refetches after a DB mutation, replace the ref atomically; never union old + new nodes.
- **Subtype reduction over a relationship set.** Each edge's subtype is derived from its own row, never from any aggregate. Per-edge rendering, not per-child.
- **Outline placeholder identity collision.** Outlines must use `PLACEHOLDER_PREFIX` IDs per the existing convention; verify no real-person ID can match. (Pre-existing rule from `.claude/rules/renderer.md`; this plan must not regress it.)
- **Vue v-memo cache of stale data.** Line 48's `v-memo` array deliberately keys on every visual property. If a new property added to TreePerson by these fixes affects rendering, it must enter the v-memo array, otherwise the chart can render stale visual state until the next full remount.
- **Foster-terminology coupling.** Edge subtypes consumed here include `biological | adopted | foster | step | unknown` per `.claude/rules/api.md` `PARENT_CHILD_SUBTYPE_VALUES`. The dash pattern policy: solid for biological, dashed for foster (today's behavior). Adopted/step are out of scope for this plan unless the user reports them; current behavior probably treats them as solid (audit and document, but don't change without a separate plan).

## Open questions for the implementation step

- Does the duplicate-icon symptom (A.3, B.4) reproduce on current main, or did it shift since v0.215.2? If it doesn't reproduce, scope shrinks — Fix 2 may be already done; Fix 1 still has a code-inspection-visible dedup gap worth fixing.
- Are adopted/step parent_child edges supposed to render dashed, solid, or with a third pattern? Ask user; default to "solid for biological, dashed for everything non-biological" if no preference, and document.

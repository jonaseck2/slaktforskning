# Design — Chart consistency: shared shell + behavior parity

Supersedes the parked `2026-05-14-hourglass-layout-refactor-design.md` "fuse". That plan aimed at the wrong target — it treated `hourglass.ts`'s 1,052 LOC *size* as the problem. The real problem is **drift**: the same behaviors are implemented 2–3 times across Pedigree, Hourglass, and Descendant, so any future edit risks one chart diverging from the others where a user expects them to match. Size is a symptom (hourglass does two jobs — ancestors *and* descendants); duplication is the disease.

## User goal

The three family-tree charts — **Pedigree, Hourglass, Descendant** — look identical and behave identically wherever they share a concept (box rendering, person selection, pan/zoom, the "+" add-relative flow, outline placeholders, double-click-to-refocus, keyboard navigation and ARIA), and the code producing those shared behaviors lives in **one** place so it cannot drift between charts. Where the charts legitimately differ — which direction they grow, and therefore their collapse semantics — that difference is intentional and isolated, not accidental copy-paste.

Stated as a falsifiable outcome: *select the same person in any of the three charts and the box looks the same, the viewport pans the same way, double-click re-roots the same way, and a keyboard/screen-reader user navigates the same way. Change a box color token or name-wrap once and all three charts change together.*

## Scope

Every chart that renders a `TreePerson` box-and-elbow layout migrates together (pattern migration is all-or-nothing per `.claude/rules/renderer.md`):

- **Components (3):** `src/renderer/components/charts/PedigreeChart.vue`, `HourglassChart.vue`, `DescendantChart.vue`.
- **Layout functions (3):** `src/renderer/utils/chart-layout/pedigree.ts`, `hourglass.ts`, `descendant.ts` — shared helpers lifted *out*; the algorithms themselves are **not** split into sub-files.
- **Shared infra:** `src/renderer/utils/chart-layout/hourglass-tree.ts`, `types.ts`; new shared composable(s) + a shared canvas component.

### Scope deviations (verified 2026-06-07)

- **`FanChart.vue` / `FanChartSvg.vue` (radial) and `TimelineChart.vue` (time-axis)** — *not* migrated to the shared box-render canvas. Reason: they are not box-and-elbow `TreePerson` charts. They render radial segments / a time axis, never consume `ChartLayout`, and never call the box-render helpers or `curvedElbow`. They **already share `useChartZoom`** (the pan/zoom composable) and keep it — that's the correct shared seam for them. `FanChartSvg.vue` has its own segment-based `wrappedNameLines` (radial), which stays separate by design.
- **The three layout *algorithms* stay as three separate files** — Pedigree grows ancestors rightward only, Descendant grows descendants downward only, Hourglass grows both from a focal row plus a spouse/focal join. These are genuinely different shapes; unifying the algorithms is explicitly *out* (the ambition level chosen for this plan). Only cross-cutting helpers (`findPerson`, placeholder extraction) leave these files.
- **Collapse-key *semantics* stay per-chart** (`:right` for pedigree, `:down` for descendant, 4-way + multi-parent groups for hourglass). These differ *because the chart shapes differ* — that is intentional, not drift. Only the collapse-button *rendering* and click-dispatch move to the shared canvas.

## Background — verified divergence findings (2026-06-07)

Audited against live code (three layout fns + three components + shared infra), with each claim grep-verified:

**User-visible divergences today (the parity goal closes these):**
| Behavior | Pedigree | Hourglass | Descendant |
|---|---|---|---|
| Double-click box → re-root tree (`focus-person`) | ✗ | ✅ | ✗ |
| Auto-pan selected box into view | none | ✅ (reference) | centers focal on load only |
| `role="tree"`/`treeitem` + aria-labels | ✅ (reference) | weak/none | weak/none |
| Arrow-key tree navigation + box keyboard focus | ✅ (`PedigreeChart.vue:290-299`) | ✗ | ✗ |

**Legitimate differences (NOT drift — must not be "fixed"):** collapse semantics, layout direction, data-fetch shape.

**Duplication that causes future drift (the mechanism removes these):**
1. `findPersonInTree` — copy-pasted in all 3 layout files, **and a shared `findPerson` already exists unused** at `hourglass-tree.ts:163`.
2. Placeholder role-parse extraction tail — near-identical copy in `pedigree.ts:283-307`, `hourglass.ts:~1034`, `descendant.ts:299-318`.
3. **~13–17 person-box render helpers** copy-pasted across the 3 `.vue` files (`boxFill`, `boxStroke`, `nameColor`, `dateColor`, `portraitBg`, `portraitTextColor`, `initials`, `wrappedName`, `birthText`, `deathText`, the Y-offset fns, `placeholderLabel`, `startAddFromPlaceholder`, `onRelativeSaved`). **This is where a user notices drift first** (change a token in one, the others stay stale).
4. The SVG template shell (defs/shadow → solid paths → box loop → collapse-button loop → dashed paths → placeholder loop) — near-identical 3×.

**Proof-of-concept that shared-seam works:** pan/zoom is already shared via `useChartZoom` and is the one behavior that never drifts. The plan generalizes that pattern to rendering + interaction.

**Corrected over-claim:** an earlier audit flagged `DescendantChart.vue:154` (`isExpanded ? '▼' : '▼'`) as a user-visible collapse-glyph bug. It is **not** user-visible — Pedigree/Hourglass key the glyph off *direction* not *state*, so their `down` button also always renders ▼; collapse state is shown via fill/stroke colour, which Descendant does too. It is a dead-code smell (clean up opportunistically when the canvas absorbs collapse-button rendering), not a divergence.

## Mechanism — what gets extracted

1. **`findPerson`** — delete the 3 local `findPersonInTree` copies; import the existing shared `findPerson` (`hourglass-tree.ts:163`). It already traverses siblings (a superset); pedigree/descendant `TreePerson`s carry no siblings, so adopting it is behavior-preserving for them.
2. **`extractPlaceholders(boxes, paths)`** — one shared function in `chart-layout/` replacing the 3 copy-pasted role-parse tails. Pure function over `BoxLayout[]` → `{ boxes, placeholders }`; unit-tested directly.
3. **`useChartBox` composable** — the ~15 box-render helpers defined once, consumed by all three components. Takes the colour composable + measure helpers; returns the per-box render functions.
4. **`<ChartCanvas>` component** — owns the SVG shell: `<defs>`/shadow, solid-path loop, box `<g>` loop (via `useChartBox`), collapse-button loop, dashed-path loop, placeholder loop, and the pan/zoom container (delegating to `useChartZoom`). Props: the chart's `ChartLayout`, selected/focal ids, colour theme. Emits: `navigate`, `focus-person`, `person-context-menu`, `collapse-toggle`, `add-from-placeholder`, `box-keydown`. Each chart component shrinks to: data fetch + gen-depth control + layout-fn call + `<ChartCanvas>` wiring. Render parity becomes structural — there is one box renderer, so three charts cannot render a box differently.

## Behavior parity — leveled *up* to the most complete chart

All of these land inside `<ChartCanvas>` / shared composables so they cannot re-diverge:

- **Double-click → re-root**: add to Pedigree + Descendant (Hourglass = reference). For Pedigree this re-roots to the clicked ancestor; for Descendant to the clicked descendant — both coherent.
- **Auto-pan selected box into view**: unify across all three (Hourglass's `scrollSelectedBoxIntoView` = reference).
- **`role="tree"`/`treeitem` + aria-labels + box keyboard focus + arrow-key tree navigation**: bring Hourglass + Descendant up to Pedigree's level (Pedigree = reference; `onBoxKeydown` generation/sibling traversal generalizes to "toward-focal / away-from-focal / prev-sibling / next-sibling", which maps onto all three orientations).

## Stays per-chart (intentional, isolated)

The layout algorithm; collapse-key semantics; data fetch (`fetchPedigreeTree` / `fetchHourglassTreePerson` / `fetchDescendantTree`) and generation-depth control. These are passed *into* the shared canvas as data/handlers, not reimplemented inside it.

## Verification (user-observable, not hygiene)

1. **New `tests/components/chart-parity.test.ts`** — mount all three charts with the *same* seeded `TreePerson` (3+ generations, a spouse, a placeholder) and assert:
   - identical box DOM for the same person across all three (same fill/stroke/name/date output);
   - `role="tree"` on the SVG and `role="treeitem"` on boxes in all three;
   - double-click a box emits `focus-person` in all three;
   - the "+" affordance emits `person-context-menu` in all three;
   - ArrowRight/Left/Up/Down move box focus in all three.
2. **Existing 130 `chartLayout.test.ts` property tests stay green** — proves the layout math is unchanged; the helper extraction is behavior-preserving. Red here means the extraction changed layout *shape* → fix the extraction, never loosen the assertion.
3. **Dev-MCP confirm** (Tier 1, not optional): seed a multi-gen family, open each chart, select a person → same pan behavior; double-click → re-root in each; tab to a box + arrow-navigate in each. Capture screenshots.
4. **Grep gates:** zero `function findPersonInTree` in `chart-layout/`; each box-render helper name defined exactly once across the three components.

**User-goal-falsifiability check:** if 1–4 all pass, can the charts still feel inconsistent to a user? The remaining axis is the layout *shape* itself (ancestors vs descendants vs both) — which is intentional and out of scope. So the verification covers the goal.

## Failure modes / RCA reference

- **Extraction silently changes layout output.** Guard: the 130 property tests. They assert on `BoxLayout`/`Line` geometry; any coordinate drift fails them. Discipline: red property test ⇒ the extraction is wrong, not the test.
- **`<ChartCanvas>` absorbs collapse-button rendering but loses a chart's specific button placement.** Hourglass has the richest button set (4-way + multi-parent groups); the canvas must render whatever `ChartLayout.collapseButtons` contains without assuming pedigree's single-`right`-button shape. The canvas renders the data; the layout fn owns *which* buttons exist.
- **Arrow-key generalization mis-maps on a chart orientation.** Pedigree's nav is generation/sibling in a left→right tree. Generalize to focal-relative directions, then verify per chart in the dev-MCP pass — don't assume the literal key→axis mapping transfers.
- **Re-root parity introduces a focal-reset loop.** Hourglass's `focus-person` re-root already exists and is debounced via `keepViewOnNextLoad`; reuse that path for Pedigree/Descendant rather than inventing a new one (regression-triage default: restore-by-reuse, not reinvent).

## Effort estimate

~3–4 days. The risky part is the box-render extraction (must preserve pixel output) and the canvas component; the helper dedup (`findPerson`, `extractPlaceholders`) is mechanical and low-risk. Worktree + subagent-driven per project workflow.

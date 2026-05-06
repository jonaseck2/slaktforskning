# Implementation: Hourglass — distinct visual styles for foster vs adoptive edges

**Date:** 2026-05-06
**Branch strategy:** main (small per-edge style change)
**Source:** Beta tester report 79 (v0.215.2)
**Predecessor:** [2026-05-05-hourglass-focus-stability.md](archive/2026-05-05-hourglass-focus-stability.md) (Fix 1 shipped: tree dedup)
**Related:** [2026-05-06-hourglass-foster-edge-and-couple-edge.md](2026-05-06-hourglass-foster-edge-and-couple-edge.md) (Fix 3 + Fix 4 — per-edge dash + couple-edge survival)

## User goal

Today the hourglass renders foster parent_child edges with a dashed pattern (per the foster-terminology plan that shipped earlier). Adoptive parent_child edges use the same dashed pattern. The genealogist can't tell at a glance whether a "non-bio" edge is foster or adoptive — both look identical. They want **two visually distinct styles** for the two subtypes.

The user proposes: one is dashed, one is dotted; or one keeps dashes, the other gets a different stroke color; or some other deliberate difference.

## Scope

Connector rendering for the three chart types that share the layout pipeline:

- `src/renderer/utils/chart-layout/connectors.ts` (or equivalent) — pick per-subtype stroke style, not just per-"is biological" boolean.
- `src/renderer/components/charts/HourglassChart.vue` — the `<g v-for="(d, i) in fosterPaths">` block currently uses `stroke-dasharray="8 4"` for everything non-biological. Split into separate path groups by subtype, each with its own stroke pattern.
- Same per `PedigreeChart.vue` and `DescendantChart.vue` if those carry the same render shape.
- `chart.legend.*` i18n keys — the legend currently shows "Foster relationship". Add an entry for "Adoptive relationship" with a matching swatch.

### Scope deviations

- **`step` and `unknown` parent_child subtypes**: out of scope for the user-visible distinction unless the user asks. Keep them rendering with the existing dashed pattern (or mark them as "other non-bio") and document in code comment for future work. Don't ship four mutually-distinct styles when the user only asked for two.
- **Per-edge subtype routing through the connector emitter**: depends on the [`hourglass-foster-edge-and-couple-edge`](2026-05-06-hourglass-foster-edge-and-couple-edge.md) plan landing first. That plan splits `fosterPaths` from per-child to per-edge. **Sequence: that plan first, this plan after.** If executed in the other order, this plan would only be able to color the per-child group, not per-edge — defeating the user goal whenever a child has both bio and adoptive parents (the rare-but-real case).

## Design summary

### Stroke patterns

| Subtype | Pattern |
|---|---|
| `biological` | solid (stroke-dasharray: none) — unchanged |
| `foster` | long dashes (`stroke-dasharray="8 4"`) — unchanged |
| `adopted` | dotted (`stroke-dasharray="2 3"`) |
| `step` | mid dashes (`stroke-dasharray="4 4"`) — defer until user asks |
| `unknown` | solid for now (assume bio), with a code comment marking as ambiguous |

The numerical values match the existing `stroke-dasharray="4 3"` convention for outline placeholders (placeholder edges stay distinct from real-data edges).

### Legend

In `HourglassChart.vue` (and pedigree/descendant equivalents), add a legend entry:

```vue
<g class="chart-legend">
  <line ... stroke-dasharray="8 4" /> {{ $t('chart.legend.fosterRelationship') }}
  <line ... stroke-dasharray="2 3" /> {{ $t('chart.legend.adoptiveRelationship') }}
</g>
```

Audit existing legend rendering during impl — the foster legend shipped already; add the adoptive sibling entry next to it.

### Color (decision: don't add color)

Color encoding for relationship type would conflict with the existing `colorMode` setting (themed / sex-colored). Keep all non-bio edges at the same stroke color (`chartTokens.line`) and rely on the dash pattern alone for the distinction.

## Tasks

- [ ] **Sequence check** — confirm [`hourglass-foster-edge-and-couple-edge`](2026-05-06-hourglass-foster-edge-and-couple-edge.md) has shipped (per-edge subtype routing). If not, that plan blocks this one.
- [ ] **Audit** the connector-emit shape post-Fix-3. The emitted `EdgePath` carries `parentSubtype`; the renderer picks dash style per subtype.
- [ ] **Add the per-subtype dash mapping** — function `dashForSubtype(subtype: ParentSubtype): string`. Document the table above in the function header.
- [ ] **Update the renderer** in HourglassChart.vue (and Pedigree / Descendant) to call `dashForSubtype` when emitting each `<path>`.
- [ ] **Legend entry** for adoptive — i18n key `chart.legend.adoptiveRelationship` and `chart.tooltip.adoptiveRelationship` in both locales.
- [ ] **Component test** (HourglassChart) — seed a tree with a child who has one bio + one adoptive parent. Assert two `<path>` elements emit, with `stroke-dasharray="none"` (or empty) and `"2 3"` respectively.
- [ ] **Patch bump** + CHANGELOG: `- fix(chart): adoptive parent_child edges render dotted, distinct from foster's dashed style`.

## Verification (user-observable)

1. Seed a child with a biological mother and an adoptive father. Open the hourglass focused on the child.
2. The bio edge is solid; the adoptive edge is dotted. Both edges visible at the same time.
3. Hover the adoptive edge → tooltip "Adoptivt förhållande" / "Adoptive relationship".
4. The chart legend (where present) shows both pattern + label entries.
5. Switch the relationship's subtype from `adopted` to `foster` via the relationship modal. The chart re-renders; the same edge becomes long-dashed.

## Failure modes / RCA reference

- **All-or-nothing migration:** if Pedigree / Descendant chart types also render foster edges today, they need the same per-subtype style. Half-migration is anti-consistency per CLAUDE.md.
- **Don't conflict with placeholder dashes:** the existing outline-placeholder dasharray (`"4 3"`) must remain visually distinct from the real-data adoptive dasharray (`"2 3"`). Eyeball during impl; tweak the numbers if too similar.
- **Color encoding regression:** don't accidentally tie the dash logic to `colorMode`. The dash is a relationship-type signal; color is a sex/theme signal. Independent axes.
- **Tooltip coverage:** the existing foster-edge SVG `<title>` child surfaces a hover tooltip. The adoptive group needs the same `<title>` child for accessibility.

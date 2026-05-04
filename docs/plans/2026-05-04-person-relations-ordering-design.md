# Design: Deterministic ordering for the Relationer section

**Date:** 2026-05-04
**Status:** Draft — pending approval before plan
**Sibling implementation plan:** to be written after approval as `2026-05-04-person-relations-ordering.md`

## User goal

When the genealogist scrolls to "Relationer" on a Person panel, the same person always shows the same order, and the order matches how a genealogist mentally lists a life: parents first, partners next, children grouped under whichever partner they belong to, everyone else last.

The current order is partly random and partly insertion-order. This makes scanning a person's family hard, and makes two visits to the same person feel like two different people.

## Scope

The Relationer section as it renders in `src/renderer/components/PersonPanel.vue` (and any sub-component it delegates to — `RelationsSection.vue` or similar; confirm in plan-writing). One render path; no sibling implementations.

This covers every relation rendered in that section: biological parents, adoptive parents, foster parents, partners, children (biological + adoptive + foster), and any "other" relation type — godparents, group memberships rendered as relations, custom relation subtypes.

### Scope deviations

- **Reports / exports**: the print/PDF/SVG `reports` skill renders persons with relations too. If the report renderer follows its own ordering, decide during plan-writing whether to align it now or in a follow-up. Default: align now (one canonical sort function in `src/api/` that both surfaces import).

## The order

Top to bottom:

1. **Biological father** (single row, or absent)
2. **Biological mother** (single row, or absent)
3. **Adoptive father**
4. **Adoptive mother**
5. **Foster father**
6. **Foster mother**
7. **Partners**, in chronological order by partnership start date.
   - Partnerships with no start date sort to the bottom of the partner block, by `id` among themselves.
   - Each partner row is followed inline by the children attributable to that partnership (see step 8). The partner header + its children render as a visual group.
8. **Children, grouped under their other parent.**
   - For each partner from step 7, list the children whose other-parent is that partner, sorted by birth date oldest-first. Children without birth date sort to the right/bottom of dated siblings, by `id`.
   - For children whose other parent is absent from the database (or NULL), render under a generic group header: *"Annan/okänd förälder"* (NOT "Fader okänd" — that has a specific genealogical meaning and is not what we mean here).
9. **Other relations** — godparents, group memberships, custom relation types — in this sub-order:
   - Family-flavoured relations (godparent / fadder, etc.) first.
   - Social/non-kin relations (colleagues, classmates, neighbours) after.
   - Within each sub-bucket, alphabetical by relation type label, then by related person's display name.

Empty buckets are omitted entirely (no "Adoptive father: none" placeholder).

## Design notes

- The sort logic lives in `src/api/` as a pure function `sortPersonRelations(relations, partnerships, children)` taking already-loaded data and returning the ordered render list. PersonPanel and the report renderer both call it. **No per-render DB calls** for sort decisions.
- The function is a pure, deterministic sort — same input, same output. Tested with a fixture-rich unit test.
- Drag-to-reorder is **not** introduced. The order is computed; it cannot be overridden per-person. (If a user later asks for manual ordering, that's a separate plan with explicit authored-state storage.)

## Verification (user-observable)

1. **Walk through a complex sample person** — Bengt's test DB or a fixture that has: bio parents, adoptive parents, three partners (two with start dates, one without), children with three different other-parents (one absent), two godparents, and a group membership. Open the Person panel, scroll to Relationer. The order matches the spec exactly. Repeat after closing and reopening — order is identical.
2. **Cross-surface consistency**: open the same person in the printed report. The order matches what the panel showed.
3. **Unit test on `sortPersonRelations`** with a fixture covering: missing dates, all-missing-dates partner block, multiple children under the same partner, children with no other parent, the full "other relations" bucket.

## Failure modes / RCA reference

- **Risk: ordering applied at render time, not at fetch time.** If the panel sorts and the report fetches independently, drift is inevitable. Hence the single pure-function approach.
- **Risk: locale-specific label sort.** Alphabetical sub-sorts must use locale-aware compare (`Intl.Collator(currentLocale)`), not raw string compare. Swedish letters (å, ä, ö) need correct collation order.
- **Risk: "Fader okänd" trap.** The bucket label for unknown-other-parent must NOT be "Fader okänd" — that term has specific historical meaning ("father unknown" on a baptism record). Use neutral phrasing.

## Out of scope

- Drag-to-reorder.
- Showing relation strength / confidence indicators.
- Collapsing the Relationer section (already exists or doesn't — not part of this plan).
- Changing what data the section *includes* (only changing how it's *ordered*).

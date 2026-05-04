# Design: Foster terminology — labels and display strings

**Date:** 2026-05-04
**Status:** Draft — pending approval before plan
**Sibling implementation plan:** to be written after approval as `2026-05-04-foster-terminology.md`

## User goal

When the genealogist sees the word for a foster relationship anywhere in the app — a dropdown choice, a relation row label, a chart legend — it reads as natural Swedish, never as a half-translation that says "Foster" alone (which means *fetus* in Swedish, not *foster child*) or composes word-stems with a space ("Förälder Foster") that no Swede would ever say or write.

## Scope

Every place in the renderer (and any export / report path) where the *foster* relationship subtype is rendered as a user-visible string. Confirmed instances so far:

- Child subtype dropdown in PersonModal (currently shows "Foster") — should read "Fosterbarn".
- Person panel Relationer rows — currently render "Förälder Foster" / "Barn Foster" — should read "Fosterförälder" / "Fosterbarn".
- i18n source files: `src/renderer/i18n/sv.ts` (line 503: `foster: 'Foster'`), and the English equivalent for symmetry.

Full enumeration is part of plan-writing. Search for `foster` (case-insensitive) across `src/renderer/i18n/` and any place that composes a label from a relationship subtype — wherever the codebase says `t('relationship.parent') + ' ' + t('relationship.foster')`, that's a composition bug to root out.

### Scope deviations

- **GEDCOM export labels**: GEDCOM uses canonical English-language tag values (`PEDI FOSTER` etc.). Those are spec-mandated and not user-facing in the same way; they stay as the GEDCOM spec dictates. Only **user-facing display strings** are in scope.
- **Database column values**: the `relationship_subtype` enum / string in the schema (e.g. `'foster'`) stays as-is. This plan does not touch storage — only display.

## The strings

### Swedish

| Where | Today | Fix |
|---|---|---|
| Child subtype dropdown | "Foster" | "Fosterbarn" |
| Relation row, parent direction | "Förälder Foster" | "Fosterförälder" |
| Relation row, child direction | "Barn Foster" | "Fosterbarn" |
| Chart legend (when fix R54.1 lands) | n/a today | "Fosterförhållande" |
| Hover tooltip on dashed foster edge | n/a today | "Fosterförälder" / "Fosterbarn" |

### English

| Where | Today | Fix |
|---|---|---|
| Child subtype dropdown | "Foster" | "Foster child" |
| Relation row, parent direction | "Parent Foster" or similar composed | "Foster parent" |
| Relation row, child direction | "Child Foster" or similar composed | "Foster child" |
| Chart legend | n/a today | "Foster relationship" |

(English may already be correct in places — confirm during plan-writing. Don't ship redundant edits.)

## Design notes

- The fix is two-layer:
  1. **i18n string changes**: rename the keys' values, OR (preferred) introduce dedicated keys for the *role* labels (`foster_parent`, `foster_child`, `adoptive_parent`, etc.) so renderers don't have to compose substrings to express a role.
  2. **Kill the composition bug at the source.** Wherever the renderer writes `${t('rel.parent')} ${t('rel.foster')}`, replace with a single `t('rel.foster_parent')` lookup. Composition produces "Förälder Foster" and "Parent Foster" — both are wrong. The fix is structural, not just a translation patch.
- Pick the structural approach. It also catches the `adoptive` case (the same composition bug likely produces "Förälder Adopterad" today; fix it preventively).

## Verification (user-observable)

1. **Walk every UI surface** that touches foster relationships: NewPersonModal child subtype dropdown, PersonPanel Relationer section (foster parent + foster child rows), the chart legend (after R54.1 lands), hover tooltips on foster chart edges. Every label reads natural Swedish. No occurrence of the bare word "Foster" or composed "Förälder Foster" / "Barn Foster" remains.
2. **Mirror check in English**: same surfaces, English locale, read as natural English.
3. **Adoptive sweep**: same surfaces with an adoptive relationship — labels read "Adoptivförälder" / "Adoptivbarn", "Adoptive parent" / "Adopted child" or similar — never composed. (This may already be correct; verify and only edit if not.)
4. **i18n key sweep test**: a unit test asserts that no template in the renderer composes a relation role from a separator + role-modifier pair (`rel.parent` + space + `rel.foster`). Composition is a code smell here.

## Failure modes / RCA reference

- **The composition trap.** `${role} ${modifier}` works in English (kind of) and breaks in Swedish (where compound words are written without spaces) and German (similar). Resolve by always using complete role keys; never compose at render time.
- **i18n key drift**: changing a string value silently leaves any existing translation files (third-party, contributor-submitted) referencing the old value. Since this project ships Swedish + English from one codebase and translations live in source, this risk is low. Worth flagging anyway.

## Out of scope

- Renaming the underlying DB enum values (`'foster'`) or relationship subtype identifiers.
- Adding new foster sub-categories (e.g. distinguishing temporary vs permanent foster placement).
- GEDCOM tag mapping.
- The chart edge styling itself (lives in the [hourglass chart polish plan](2026-05-04-hourglass-chart-polish-design.md), Fix 5).

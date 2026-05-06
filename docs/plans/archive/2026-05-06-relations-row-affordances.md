# Implementation: Relations row — clearer abbreviation, tooltips, trash icon

**Date:** 2026-05-06
**Branch strategy:** main (small UI tweaks)
**Source:** Beta tester report 74 + addendum (v0.215.2)

## User goal

In PersonPanel → Relationer, each relation row has a tight column of inline affordances: a small role abbreviation, a person initials chip, a name, and a remove icon. Today the row is too cryptic:

1. The role abbreviation **"Fö"** is ambiguous — the user reads it as "Född" (born), not "Förälder" (parent). Should be at least "Föräld" (or similar — three or four letters that won't confuse).
2. There are no tooltips on the affordances. Hovering "Fö" should say *"Edit relationship"*; hovering the initials chip / name should say *"Manage <full name>"*; hovering the remove icon should say *"Remove relationship"* (already works per the user — keep).
3. The remove glyph (described as a "proofreader's deletion mark") should be replaced with the **trash icon** (per the user's addendum: "Det ska ju givetvis ersättas med papperskorgen!!").

## Scope

Single component: the row template inside `PersonRelationshipsSection.vue` (or wherever the relation rows are rendered — confirm during audit; could be a `RelationshipsList.vue` primitive). The plan also touches:

- i18n keys for the role abbreviations + tooltips, in both locales.
- Icon set: replace the deletion-mark glyph with the project's `IconTrash`.

### Scope deviations

- **Layout / column count**: not changing. The row stays compact; we're just relabeling/retooltipping/reicon-ing.
- **Other panels with similar inline rows** (Source citations, Group members, …): out of scope unless they share the same primitive component (`RelationshipsList.vue`). If they do, the changes apply uniformly via that primitive.

## Design summary

### Role abbreviation

`Fö` → `Föräld` (or `Förä`). Six characters fits column width by design. Audit existing column width before locking the choice. EN equivalent: `Parent` (full word fits in EN; no abbreviation needed).

i18n keys (in `relationshipRoles` namespace, both locales):

- `parentAbbrev`: "Föräld" / "Parent"
- (similarly for siblings, partners, godparents, foster — audit current set during impl; only abbreviate where the full word doesn't fit the column)

### Tooltips

Add `title` + `aria-label` (matching the chart-controls-tooltips pattern shipped 2026-05-05). Native `title` is sufficient.

Tooltip i18n keys (in `relationshipRow` namespace):

- `editRelationship`: "Redigera relationen" / "Edit relationship"
- `manageOther`: "Hantera {name}" / "Manage {name}" (interpolated)
- `removeRelationship`: "Ta bort relationen" / "Remove relationship" (likely exists already; reuse)

### Icon swap

Replace the proofreader-mark glyph with `IconTrash` from the existing icon set (e.g. `src/renderer/components/icons/IconTrash.vue` if it exists; or whatever the project uses for `btn-delete`). Confirm during impl.

The trash icon must:
- Match the visual size of the surrounding row chips.
- Not gain a colored background (red on hover is OK; red as default is too aggressive on a list view).
- Keep the existing confirm-before-delete dialog flow.

## Tasks

- [x] **Audit** the relation-row template — find the file (`PersonRelationshipsSection.vue` or `RelationshipsList.vue`).
- [x] **Audit** the role abbreviations currently in i18n. List each existing abbrev + its expansion.
- [x] **Replace `Fö`** with `Föräld` (and other ambiguous two-letter abbreviations as found). EN side gets full words where they fit.
- [x] **Add tooltips** — `title` + `aria-label` on every clickable child of the relation row: role-edit, name/initials (manage other person), remove.
- [x] **Swap the remove glyph** for the project's standard trash icon. Confirm hover state, accessibility label, and confirm dialog still wire correctly.
- [x] **Component test** — assert each row child has a non-empty `title`. Assert the remove element matches the trash-icon component (e.g. by selector on the icon's data-testid).
- [ ] **Patch bump** + CHANGELOG: `- fix: relation row uses clearer role abbreviations, hover tooltips, and a trash icon for remove`. (Deferred to merge per project workflow.)

### Audit notes

- **Component:** `src/renderer/components/RelationshipsList.vue` is the single primitive (used by `PersonRelationshipsSection.vue`).
- **"Fö" root cause:** the panel-section table rule `.panel-section .data-table td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0 }` was truncating the role label (e.g. `Förälder` → `Fö`). The local `.type-cell` override only set `max-width: none` but the same selector specificity meant it didn't reliably win against the panel rule depending on rendering order. Bumped specificity (`.data-table td.type-cell` in scoped block) and added `overflow: visible; text-overflow: clip` so the full role label always renders.
- **i18n abbreviations audit:** the `relationshipRoles` and `relTypes` namespaces already use full Swedish words (`Förälder`, `Adoptivförälder`, `Fosterförälder`, `Styvförälder`, `Barn`, `Adoptivbarn`, `Fosterbarn`, `Styvbarn`, `Par`, `Syskon`, `Fadder`, `Gudbarn`, `Övrigt`). No abbreviation was ever authored — `Fö` was purely the result of the CSS truncation. Fix: stop truncating, no i18n change needed for the role labels themselves. New `relationshipRow` namespace added for tooltip strings only.
- **Tooltip wiring:** `title` + `aria-label` on the role badge ("Edit relationship" — the row click target), the avatar + person link ("Manage {name}"), and the trash button ("Remove relationship"). All keys interpolate via `vue-i18n`.
- **Trash icon:** swapped `IconUnlink` → `IconTrash` (existing `src/renderer/components/ui/IconTrash.vue`, no new SVG). Confirm-before-delete flow untouched (`@delete` → `askRemove` → `ConfirmModal`).

## Verification (user-observable)

1. Open a person with a parent relationship. The row reads "Föräld" instead of "Fö".
2. Hover the role-edit affordance → tooltip "Redigera relationen". Click → relationship edit modal opens.
3. Hover the initials chip → tooltip "Hantera <name>". Click → navigate to that person's panel.
4. Hover the remove icon → tooltip "Ta bort relationen". Visual is a clean trash icon, not a proofreader mark.
5. Switch to English locale — labels and tooltips are in English.

## Failure modes / RCA reference

- **Tooltip without aria-label**: a tooltip-only label is invisible to screen readers. Both attributes mandatory (the project's a11y rule, confirmed by the chart-controls-tooltips plan shipped earlier this week).
- **Don't shrink the column to fit the longer abbreviation**: if `Föräld` doesn't fit the existing column, the column needs a few more pixels of width — don't truncate the text with ellipsis (defeats the readability fix).
- **Icon component drift**: use the project's existing trash icon (search for `IconTrash` / `btn-delete`). Don't inline an SVG.
- **Confirm-dialog regression**: the trash icon's click handler must still trigger the existing confirm flow — don't accidentally rewire to direct delete.

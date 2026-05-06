# Implementation: Name modal — add citation field; clarify "Giltigt till"

**Date:** 2026-05-06
**Branch strategy:** main (modal additions + i18n)
**Source:** Beta tester report 75 (v0.215.2)

## User goal

Editing an existing name record (type `name_change`):

1. **The user wants to attach a source citation** to the name change. Today the name modal has no Hänvisning/citation field; every other primary entity (events, persons themselves, places) has one. Names — especially name changes — are exactly the kind of authored fact that benefits from a source.
2. **The "Giltigt till" field under "Mer" is confusing for a name change.** A name change date marks when the new name took effect; it doesn't make sense to also give it an end date — the name doesn't expire, the *next* name change ends it. The user asks for either a clarification or removal of the field for `name_change` rows.

(The tall-modal-no-Save-button concern is folded into the [`modal-scrollable-content` plan](2026-05-06-modal-scrollable-content.md). This plan covers only the field shape.)

## Scope

- `src/renderer/components/modals/PersonNameModal.vue` — add citation field; conditionally hide/clarify "Giltigt till" for `name_change` rows.
- `src/api/citations.ts` — confirm `addCitation` already supports `person_id` link OR a `name_id` link. If `name_id` isn't currently a citation target, this becomes a slightly larger plan (registry entry needed).
- i18n keys.

### Scope deviations

- **Adding citation to OTHER name types** (`birth`, `married`, `alias`, `aka`): in scope. The citation field is universally useful on names; design it once in the modal, applies to every name type.
- **A new `name_change` event type** that ties name + date + source together as a first-class event: out of scope. The user is asking for a small fix on the existing modal, not a redesign.

## Locked decisions

**Option B (locked).** Citation linkage adds `person_name_id` to the `citations` schema, with a migration + registry entry. Folding citations onto the person (Option A) would diffuse the meaning — the user-visible feature is "attach a source to *this name change record*", not "this source is about this person".

## Investigation needed

Before writing code, audit:

1. **`name_qualifier` and `date_to` semantics on `person_names`** — confirm the schema-level interpretation of `date_to`. If it's intended to bound a name's validity period (e.g. for an alias used 1990–2000), then `name_change` legitimately doesn't use it. Document the decision in code comments.

## Design summary

### Citation field

In PersonNameModal's "Mer" / advanced section, add a citation block matching the EventModal's existing citation UX:

- "Lägg till hänvisning" button → opens a CitationPicker (existing component if available; or a simple SourcePicker + page/transcription fields inline).
- Saved citations render as removable chips above the button.

If Option B is chosen above: schema migration adds `citations.person_name_id`; this name's citations are loaded via `getCitationsForPersonName(db, nameId)`.

### "Giltigt till" clarification

For `name_change` rows specifically, hide the `date_to` field entirely (with a comment explaining why). For other name types where `date_to` is meaningful (`alias` used during a specific period, `married` ended by divorce/death):

- Keep the field but rename the i18n label per name type:
  - `birth`: hide (a birth name doesn't end; replaced by `married` or `name_change`)
  - `married`: "Giltigt till" / "Valid until" — used when the marriage name was discarded
  - `alias` / `aka`: "Användes till" / "Used until"
  - `name_change`: hide entirely

### Don't drop authored data

Per CLAUDE.md "Authored values are not discarded by side effect": if the user previously filled `date_to` on a `name_change` row and it's now hidden, **the value persists in the DB**. The modal hides the input but the save handler must NOT null the field on save. Test this explicitly.

## Tasks

- [x] **Schema migration**: add `citations.person_name_id` (nullable FK to `person_names.id`); registry entry for round-trip; new `getCitationsForPersonName` API; IPC + preload coverage.
- [x] **Audit `PersonNameModal.vue`** — current field layout; locate "Mer" section; locate `date_to` (Giltigt till) input.
- [x] **Add citation block** in "Mer" section. Reuse CitationPicker / chip-list pattern from EventModal.
- [x] **Conditional `date_to`** — hide for `name_change` and `birth`; relabel per-type for others (`married` → "Valid to" / "Giltigt till"; `alias` / `aka` → "Used until" / "Användes till").
- [x] **Save handler audit** — hidden `date_to` field doesn't get nulled out; the form value is hydrated from the row and emitted unconditionally on save. Covered by `Prime Directive: hidden field does not null authored data` test.
- [x] **i18n keys** in both locales for the per-type "valid until" labels (`names.dateToUsed`).
- [x] **Component test** — `tests/components/PersonNameModal.test.ts` — covers `name_change`, `birth`, `married`, `alias`, `aka` visibility + label, plus the legacy-`date_to` Prime-Directive guard, plus citation section rendering + chip load.
- [x] **Test** — `tests/unit/sources.test.ts` — `getCitationsForPersonName` returns name-attached citations; `person_name_id` cascade-deletes citations when the parent name is removed.
- [x] **Minor bump** + CHANGELOG: `- feat: name records can carry a source citation; 'Valid until' field hidden where it doesn't apply` — handled at merge time per project workflow.

## Verification (user-observable)

1. Open a person; edit a `name_change` record. The "Mer" section has a "Hänvisning" button; clicking it opens the citation picker. Save with a citation. Re-open — the citation chip is visible.
2. The same `name_change` modal does NOT show "Giltigt till".
3. Edit a `married` name. "Giltigt till" IS shown (with that label or its EN equivalent).
4. Edit an `alias` name. The field is shown with label "Användes till".
5. Pre-existing `name_change` rows that had `date_to` filled (legacy) keep the value — re-saving the row doesn't null it out.

## Failure modes / RCA reference

- **Authored-data discard:** the most likely defect when hiding a field is the save handler nulling it. Test must seed a `name_change` row with `date_to = '2020-01-01'`, open the modal, save without other changes, query — `date_to` is still `'2020-01-01'`. (CLAUDE.md "Authored values are not discarded by side effect" rule.)
- **Schema migration gap:** every new column needs a registry entry per CLAUDE.md "Round-Trip Fidelity". Adding `citations.person_name_id` without registering it breaks CI.

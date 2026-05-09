# Plan: PersonNameModal — prefill given name, required-field signals, never-deceptive Save button

**Date:** 2026-05-09
**Status:** planned
**Source:** Beta tester report 92 (May 7 batch)
**Effort:** S

## User goal

When the user opens the "+ Namn" dialog on a person to record a name change, the dialog behaves like a thoughtful assistant rather than a riddle:

1. The previous given name is offered as a starting point — the same way the previous surname already is. The user can replace it; they don't have to retype it from scratch when they're recording a small change like "lade till mellannamn".
2. Fields that must be filled are visibly marked. The marker is unmistakable — a red asterisk plus a "Obligatoriskt" helper line — so a low-vision user can see it without having to lean in.
3. The Save button is never a lie. If the form is invalid, Save is rendered in the disabled style (greyed out, `aria-disabled="true"`). If the user clicks it anyway, the dialog gives them an immediate, specific reason — a flag at the offending field, not a silent rejection.

The user goal is, in plain words: "I never have to guess why Save isn't working, and I never start a name event from a blank field when the previous name is right there."

## Scope

- `src/renderer/components/modals/PersonNameModal.vue` — the dialog
- `src/api/persons.ts` `addPersonName` / `updatePersonName` validation rules — only if they need to grow
- The picker pattern documented in [archive/2026-05-04-new-person-dialog-hardening.md](archive/2026-05-04-new-person-dialog-hardening.md) — this plan extends the same shape to the name modal

**Scope deviations:**
- Other modals (`PersonModal`, `EventModal`, `PlaceModal`, `SourceModal`, …) are *already* covered by the new-person-dialog-hardening plan or its follow-ons; this plan does not re-touch them.
- The CitationModal pattern lands in a follow-up if the same gaps exist there — out of scope here.

## Behaviour spec

### Prefill

When `mode = 'standalone'` and `editingName` is null (i.e., adding a new name to an existing person), the modal opens with:

- `surname` ← most recent `person_names.surname` for the person, ordered by `(date_to DESC NULLS FIRST, date_from DESC NULLS FIRST, sort_order DESC)` (today's behaviour)
- `given_name` ← most recent `person_names.given_name` by the same ordering — **NEW**
- `name_type` ← default `birth` if the person has no other names; otherwise `married` (heuristic — the most common reason to add a second name) — keep current default if simpler
- `sort_order` ← 1 + max existing — today's behaviour
- All other fields (qualifier, prefix, suffix, etc.) ← empty

When `editingName` is set (editing an existing row), nothing changes.

### Required-field signals

`given_name` and `surname` together are **conditionally required**: at least one of the two must be non-empty (today's `addPersonName` validation rule — preserve it; do not require both, because mononyms exist and report 92's footnote confirmed creating "förnamn only" and "efternamn only" rows works and should keep working).

For each input that participates in validation:

- The label gets a red `*` suffix when *that field is required given the current form state*.
- A small `Obligatoriskt` helper line under the field appears when the field is empty and the form is invalid because of it.
- ARIA: `aria-required="true"` on the input; `aria-describedby` linked to the helper id.

The "given_name OR surname" rule is rendered as: when both are empty, both show the asterisk; once either has content, neither does (because the form is now valid for that constraint).

### Save button state

- `disabled` HTML attribute `true` when the form is invalid.
- Visually: `opacity: 0.5; cursor: not-allowed;` (existing `--btn-disabled` token if it exists; add one to `tokens.css` if not).
- `aria-disabled="true"` mirrors the disabled state for screen-reader narration.
- Tooltip on the disabled button (`title=`): "Fyll i förnamn eller efternamn" / "Enter given name or surname" — first failing reason.
- Click on a disabled button does **not** silently fail — instead, the modal flashes the offending field with a red border (1.5s) and focuses it. Helper text becomes the toast equivalent: "Fyll i förnamn eller efternamn".

### Validation timing

Validate on every input change (reactive `computed` in `<script setup>`); no `submit` button click required to surface the asterisks. The user's keystroke immediately updates the visible required state.

## Tasks

### Phase 1 — Prefill

- [ ] In `PersonNameModal.vue` setup: when `props.editingName == null`, fetch `person_names` for `props.personId`, pick the most-recent row, prefill `given_name` and `surname`. Use the same selector currently used for surname prefill (don't duplicate the SQL — refactor if needed).
- [ ] Unit test in `tests/unit/personNameModal.test.ts`: with a person who has 2 prior names, the modal mounts with the latest `given_name` and `surname` already populated.

### Phase 2 — Required-field markers

- [ ] Extract a tiny `<RequiredAsterisk />` primitive in `src/renderer/components/ui/` (single span, `aria-hidden="true"`, used everywhere later) — reuse from any existing primitive if one already exists.
- [ ] Add per-field `Obligatoriskt` helper text — bind via a `helper` prop on `AppInput` if the primitive supports it; add the prop if not.
- [ ] i18n keys `common.required` ('Obligatoriskt' / 'Required') and `personName.givenOrSurnameRequired`.

### Phase 3 — Save button hardening

- [ ] Compute `validation: { ok: boolean; firstFailReason?: string }` from form state.
- [ ] Bind Save button `:disabled="!validation.ok"`, `:aria-disabled="!validation.ok"`, `:title="validation.firstFailReason ?? ''"`.
- [ ] If a click reaches a disabled save (rare but possible via screen reader / keyboard), implement the field-flash + focus + toast on `@click`.

### Phase 4 — Test-coverage parity with new-person-dialog hardening

- [ ] Mirror every behavioural test in `tests/unit/personModal.test.ts` (or wherever the new-person modal tests live) to the name modal: empty form → save disabled, fill given_name → save enabled, fill surname → save enabled, both empty → flash on click.

## Verification

User goal: "I never have to guess why Save isn't working, and I never start a name event from a blank field when the previous name is right there."

1. **Smoke test (mandatory).** On a person with at least one prior name: click `+ Namn`. Both name fields are prefilled. Clear them both. Save is greyed; an asterisk appears on each. Type a single character in `given_name`. Save becomes enabled. Both asterisks vanish.
2. **Component test** asserts the prefill behaviour against a fixture DB.
3. **Component test** asserts disabled-save → flash-and-focus when clicked anyway.
4. **A11y check:** screen-reader mode reads "Save, disabled, Fyll i förnamn eller efternamn" when focusing the Save button on an invalid form.

## Failure modes / RCA reference

This plan is the name-event sibling of [archive/2026-05-04-new-person-dialog-hardening.md](archive/2026-05-04-new-person-dialog-hardening.md), which fixed the same class of issue on the new-person dialog. The pattern is intentional and shared. If a future plan finds the same gap on a third modal (citation modal, event modal), follow this same shape — don't reinvent.

The Prime Directive ("authored values are not discarded by side effect") applies here: the prefill is a *suggestion* the user can override, never a value the modal saves on its own. Confirm by reading: pressing `Cancel` writes nothing; pressing `Save` writes exactly what's in the form fields, including their potentially-edited prefill. No "if user didn't change the prefilled value, skip the write" optimisation.

## Notes

- The "iWi" mono-toggle from report 90 is a separate plan ([2026-05-09-notes-monospace-toggle-label.md](2026-05-09-notes-monospace-toggle-label.md)).
- Beta tester historical context: low vision; therefore visual signals must be paired with text and icon size considerations from `a11y` rules.

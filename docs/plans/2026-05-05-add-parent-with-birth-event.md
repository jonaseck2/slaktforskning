# Implementation: Inline birth event when adding a new parent

**Date:** 2026-05-05
**Branch strategy:** main (modal change)
**Source:** Beta tester report 68 (v0.215.2)

## User goal

When adding a new parent to a person via "Hantera person → Lägg till förälder → Ny person", capture the new parent's birth date (and ideally birth place) **in the same modal step**, without having to save, navigate to the new parent, and add a birth event manually. Birth is the single most-likely-known fact about a newly added person; making it a separate step doubles the click-cost for the most common path.

The user's words (translated): *"Wish: from this view, before I press Save, I should be able to also register a birth event for the new person. Or perhaps after pressing Save, ask if I want to register a birth event."*

## Scope

**Primary surface:** the "new person" modal opened from PersonRelationshipsSection's "Lägg till förälder → Ny person" flow. This is `src/renderer/components/modals/PersonModal.vue` opened in some "new" mode with a `relatedTo` prop set.

**The same need applies to all "new person" entry points:**
- Add father / mother / parent
- Add partner
- Add child
- Add sibling
- Add foster / adoptive parent
- Add godparent
- Add via the standalone "+ Person" button from PersonsView

If the birth fields are added to PersonModal in "create" mode, every entry point benefits — that's the right factoring.

### Scope deviations

- **Editing an existing person:** out of scope. Existing PersonModal in edit mode already has access to the Events section via the panel; adding a birth field there would be redundant.
- **Death event:** out of scope. The user named birth specifically as the "self-evident" event when registering a new person. Death is less universally known at registration time.
- **Other event types:** out of scope. One inline event field; not a general event editor inside the create modal.

## Design summary

### Two options for the UX

**Option A — fields inline in the create modal.** Below sex / name / surname, add an optional "Födelse" group with three fields: date, place (place picker), source citation. All optional — empty means "no birth event recorded". On save, if any of the three is non-empty, create a birth event with the focal person as `primary` participant in the same transaction.

**Option B — post-save prompt.** After save, ask "Vill du registrera födelsehändelse för denna person?" with Yes/No. Yes opens the EventModal pre-filled with the new person as primary participant.

**Recommended: Option A.** No extra click; matches the user's "before I press Save" preference; fields are optional so users who don't have the date can skip.

### Field shape

```vue
<details class="ep-collapsible">
  <summary>{{ $t('persons.birthInline') }}</summary>
  <div class="ep-fields">
    <div class="ep-field">
      <span class="ep-field-label">{{ $t('events.dateLabel') }}</span>
      <input class="ep-input" v-model="form.birth.date" placeholder="YYYY-MM-DD" />
    </div>
    <div class="ep-field">
      <span class="ep-field-label">{{ $t('events.placeLabel') }}</span>
      <PlacePicker v-model="form.birth.placeId" />
    </div>
  </div>
</details>
```

Collapsed by default? Likely **expanded** by default — the whole point is reducing clicks. Test with the user.

`PlacePicker` per existing conventions (renderer rules: never wrap pickers in `.full-width`; use the existing modal-picker shape). Place picker handles its own modal nesting per `BaseSubPanel` `mode="subpanel"` rule.

### Save path

In the modal's save handler:

```ts
const personId = await window.api.persons.create(form.person);

if (form.birth.date || form.birth.placeId) {
  await window.api.events.create({
    event_type: 'birth',
    date_original: form.birth.date,         // user's verbatim wording — let the parser run
    date_value: parseDate(form.birth.date), // best-effort ISO; null if unparseable
    place_id: form.birth.placeId,
    participants: [{ person_id: personId, role: 'primary' }],
  });
}
```

Both writes happen via separate IPC calls today. The birth event creation must NOT silently fail — wrap in try/catch with toast on each, per renderer error-handling rule.

### i18n keys (both locales)

```ts
persons.birthInline: 'Födelse (valfritt)' / 'Birth (optional)'
events.dateLabel: 'Datum' / 'Date'
events.placeLabel: 'Plats' / 'Place'
```

(Reuse existing keys if they already exist; audit during impl.)

## Tasks

- [ ] **Audit `PersonModal.vue`** — find the "create" mode branch and the existing form shape. Confirm the modal already has a `mode === 'create'` distinction, or add one.
- [ ] **Add inline birth fields** to the create-mode form, expanded by default.
- [ ] **Save handler** creates person, then conditionally creates the birth event using the fields. Both wrapped in try/catch.
- [ ] **i18n keys** in both locales.
- [ ] **Component test:** mount PersonModal in create mode, fill name + birth date + place, save, assert two IPC calls fire (create person, create event), assert the event has correct participants array and place_id.
- [ ] **E2E smoke (optional):** new person from PersonRelationshipsSection → "+ Förälder → Ny person" flow → fill birth → save → verify birth event appears on the new person's panel.
- [ ] **Patch bump** (call it a UX improvement; technically additive feature so could be minor — pick minor for visibility). CHANGELOG: `- feat: register birth date and place inline when adding a new person`.

## Verification (user-observable)

1. Open person Z → Relationer → "+ Förälder → Ny person".
2. The new-person modal is open. Below name/surname/sex, a "Födelse (valfritt)" section is visible and expanded with date + place fields.
3. Fill name + birth date `1923-08-12` + birth place picker selection.
4. Save.
5. The new person is created and linked as Z's parent. Open the new person's PersonPanel → Events. A birth event with date 1923-08-12 and the chosen place is present.
6. Repeat for "+ Partner → Ny person", "+ Barn → Ny person", "+ Syskon → Ny person", "+ Fadder → Ny person". Same inline-birth field behavior on every "new person" path.
7. Skip the birth fields entirely → save → person created with no birth event (no toast, no error).

## Failure modes / RCA reference

- **Two IPCs, partial failure.** If `persons.create` succeeds but `events.create` fails, the user has a person without their authored birth event. Surface the error explicitly via a toast: "Personen sparades men födelsehändelsen kunde inte sparas — försök igen från Händelser." Don't silently swallow.
- **Date parsing inferred and persisted.** Per Prime Directive, only the user's verbatim authoring goes into `date_original`. The parser's best-guess ISO goes into `date_value` (matches the existing pattern). Do not change `date_original` to anything other than what the user typed.
- **Place picker writing inferred coordinates.** Per project rules, place coordinates are render-time gazetteer-resolved. The picker should write only `place_id` to the event; never persist resolved lat/lng.
- **Form discards authored data on save.** Per CLAUDE.md "Authored values are not discarded by side effect": if the user fills all three fields and the save succeeds, all three end up in the DB. No "if A then null B" patterns in the save handler.

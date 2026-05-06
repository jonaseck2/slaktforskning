# Implementation: Guard against accidental sex change; first-class gender-transition event

**Date:** 2026-05-06
**Design spec:** [2026-05-06-sex-change-guard-design.md](2026-05-06-sex-change-guard-design.md)
**Branch strategy:** worktree (touches schema, event types, modal flow, role resolver, MCP boundary)
**Source:** Beta tester report 80 (v0.215.2)

## User goal

Two distinct things the genealogist needs:

1. **Don't let a sex flip on an existing person silently break their family graph.** Changing M → F on a person with children today flips them from "father" to "mother" everywhere — sometimes correct (typo correction), sometimes catastrophic (a child suddenly has two biological mothers). The save path needs a confirmation step that distinguishes these two cases.
2. **Record an actual gender transition as a life event** — with a date, optional place, and source citation — so the family graph can stay correct: a parent's biological-parent role for any given child is computed against the parent's sex *at the child's birth*, not their current sex.

Net result: someone who transitioned in 2020 stays the biological *father* of children born before 2020 and the biological *mother* of children born after, while their `persons.sex` row reflects their current identity. No DB rewrites; everything derived at render.

## Locked decisions

From the design spec:

- **D1.** Case 1 (no relationships) — zero friction. The save proceeds silently. No confirmation modal.
- **D2.** Modal text — final wording approved as the design-spec sketch (with localization review possible at impl time). SV title: *"Du ändrar kön på en person med befintliga relationer"*. Buttons: *"Korrigering"*, *"Könsbyte"*, *"Avbryt"*.
- **D3.** Per-relationship review for the suggested explanatory note. Provide "Acceptera alla" / "Hoppa över alla" shortcuts.
- **D4.** Render-time role resolver consults `gender_transition` events. Pre-transition children → role label resolves against the parent's pre-transition sex; post-transition → current sex.
- **D5.** Same render-time resolution for couple relationships when one partner transitioned. Per-relationship optional note follows the same shortcut shape as parent_child.

## Scope

Five layers:

1. **Schema** — new event-type value `gender_transition` in `EVENT_TYPE_VALUES` (per `src/renderer/constants/eventTypes.ts`). No new column; the event slots into the existing `events` table.
2. **API** — `updatePerson(db, id, { sex })` gains a guard wrapper or precondition flag. Direct calls to `updatePerson` keep working, but the *workflow*-level entry point (`updatePersonWithSexGuard` or similar) checks for relationships and refuses to proceed unless the caller has acknowledged the change kind.
3. **PersonModal / PersonPanel UI** — the edit flow surfaces the confirmation modal when relevant. The "Könsbyte" path opens a chained EventModal in `mode="subpanel"` pre-filled with `event_type='gender_transition'` and a linked person.
4. **Role-label resolver** — renderer-side helper that takes `(parentId, childBirthDate)` and returns the parent's sex *as of* `childBirthDate`. Reads gender_transition events ordered by date. Used by every renderer that displays "Pappa" / "Mamma" labels (PersonRelationshipsSection, reports, charts).
5. **MCP boundary** — `update_person` MCP tool gains the same guard. New optional params: `confirmCorrection: true` OR `confirmGenderTransition: { event: { date, ... } }`. Without one or the other, the tool errors when changing sex on a person with relationships.

### Scope deviations

- **Schema column `gender` distinct from `sex`**: rejected. We use `persons.sex` for the family-graph anchor + a `gender_transition` event for the life event. Adding a `gender` column would complicate the model without solving anything the event approach doesn't.
- **Auto-rewriting parent_child relationship rows on sex change**: forbidden. Per Prime Directive, role labels are derived. Don't touch authored data.
- **Backfilling gender_transition events** for existing data: out of scope. The user adds them when relevant going forward.

## Design summary

### `gender_transition` event type

Added to `EVENT_TYPE_VALUES` and `PERSON_EVENT_TYPE_VALUES` (since it's a person-only fact, not relationship-coupled). i18n keys `eventTypes.gender_transition` in both locales.

The event carries the same fields any event does: date_type, date_value, date_original, place_id, notes, citations. **Critically: no `from_sex` / `to_sex` fields on the event itself.** The "transition direction" is implicit — at the event's date, the person's `persons.sex` is their post-transition sex; before the date, their sex is whatever it was previously. (The render-time resolver walks events in chronological order to compute "sex as of date X".)

GEDCOM round-trip: `gender_transition` is an unrepresentable life event in v5.5.1; map to a custom `_GENDER_TRANSITION` tag or a generic `EVEN` with TYPE. Register in `gedcom_fidelity_registry.ts` with the appropriate lossy/lossless declaration per version.

### The confirmation modal

Triggered when:
- The PersonModal save handler detects `oldSex !== newSex` AND
- The person has any active relationships (parent_child OR couple).

Modal shape (BaseSubPanel with three actions):

```
Title: Du ändrar kön på en person med befintliga relationer
Body: En korrigering av tidigare felregistrering ändrar bara könet.
      Ett verkligt könsbyte kan påverka hur barn och partners visas
      i släktträdet — välj nedan.

[ Korrigering ]   [ Könsbyte ]   [ Avbryt ]
```

- **Korrigering** → `updatePerson` proceeds with `confirmCorrection: true`. No event created. Family graph re-renders against the new sex (which is the user's intent — fixing a typo).
- **Könsbyte** → opens EventModal as `mode="subpanel"` with `event_type='gender_transition'` and `participants: [{ person_id, role: 'primary' }]` pre-filled. After event save, the sex flip proceeds AND the user is offered the per-relationship review screen (next section).
- **Avbryt** → close modal, revert sex dropdown to the old value.

### Per-relationship review screen

After the gender_transition event is created, surface a modal listing every active parent_child + couple relationship for this person. Each row offers:

- The auto-suggested note text (interpolated with names + transition date).
- An editable textarea pre-filled with the suggestion.
- A "Lägg till" / "Hoppa över" choice per row.
- "Acceptera alla med förslagen text" / "Hoppa över alla" shortcuts at the top.

Each accepted note appends to the relationship's `notes` field (or the parent_child's notes — confirm during impl which field is the right home).

### Render-time role resolver

New function in a renderer util (probably `src/renderer/utils/relationshipLabels.ts` — confirm; the foster-terminology plan added similar helpers there):

```ts
/** Returns the parent's sex as of the given date — consulting any
 *  gender_transition events on the parent. Used by role-label
 *  resolution for parent_child relationships so a child born before
 *  a parent's transition keeps the pre-transition role label. */
export function resolveParentSexAt(
  parentEvents: Pick<GenealogyEvent, 'event_type' | 'date_value'>[],
  parentCurrentSex: 'M' | 'F' | 'U',
  asOfIso: string | null
): 'M' | 'F' | 'U' {
  if (!asOfIso) return parentCurrentSex;
  const transitions = parentEvents
    .filter(e => e.event_type === 'gender_transition' && e.date_value)
    .sort((a, b) => a.date_value!.localeCompare(b.date_value!));
  if (transitions.length === 0) return parentCurrentSex;
  // If asOf < earliest transition date, return the OPPOSITE of current
  // (the simplest model: one current sex, one prior sex implied by the
  // transition event). For multiple transitions, the resolver walks
  // backward through the chain.
  // …documented logic; tests cover both single-transition and edge cases.
}
```

Used everywhere a Pappa/Mamma label is computed. Reports + charts + PersonRelationshipsSection all read it. Render-time → no DB change.

### MCP boundary

`update_person` accepts new optional params:

- `confirmCorrection: boolean` — set to `true` to acknowledge a typo-correction sex change on a person with relationships.
- `confirmGenderTransition: { date: string; date_type?: string; date_original?: string; place_id?: string | null; notes?: string }` — set with event details to acknowledge a real transition; the tool creates the event AND flips the sex in one transaction.

Without either, the tool errors with: *"Person {id} has {N} active relationships; sex change requires `confirmCorrection: true` (typo) or `confirmGenderTransition: { date, ... }` (life event)."* Mirror the UI's branch.

## Tasks

- [ ] **Schema** — add `gender_transition` to `EVENT_TYPE_VALUES` and `PERSON_EVENT_TYPE_VALUES`. No DB migration (no schema columns added).
- [ ] **i18n** — `eventTypes.gender_transition` in both locales; modal text keys for the confirmation flow; per-relationship-review keys; suggested-note text keys with interpolation slots.
- [ ] **GEDCOM round-trip** — exporter mapping for `gender_transition`; importer accepts the reverse; `gedcom_fidelity_registry.ts` entry. Round-trip test asserts the event survives v7 (lossless) and is documented for v551 (likely `lossy:5.5.1-spec-limit`).
- [ ] **API guard** — `updatePerson` gains a `{ confirmCorrection?: boolean; confirmGenderTransition?: GenderTransitionEvent }` param. When the change targets `sex` AND the person has relationships AND neither flag is set → throw a typed error. Otherwise proceed (and create the event when `confirmGenderTransition` is set, in the same transaction).
- [ ] **API workflow** — `updatePersonWithGenderTransitionWorkflow(db, id, { sex, eventDetails, perRelationshipNotes })` — single transaction. Sex update + event creation + per-relationship note appends.
- [ ] **PersonModal save handler** — detect `oldSex !== newSex && hasActiveRelationships`. If true → open confirmation modal as `mode="subpanel"`. Wire the three button outcomes.
- [ ] **GenderTransitionConfirmModal.vue** — new component. Three buttons.
- [ ] **PerRelationshipReviewModal.vue** — new component. Lists relationships; pre-fills suggested notes; accept/skip per row + shortcuts.
- [ ] **Render-time resolver** — `resolveParentSexAt` in `src/renderer/utils/relationshipLabels.ts`. Plus a `getCoupleLabelAt(personA, personB, asOfDate)` for couple-row labels.
- [ ] **Wire the resolver** in PersonRelationshipsSection (parent and child labels), reports that display Pappa/Mamma (audit list — at least ALifeReport, LifeOnOnePageReport), and chart edge labels where applicable.
- [ ] **MCP `update_person`** — accept the new params; map to the workflow; error message clear when neither is set.
- [ ] **Unit tests** — `resolveParentSexAt` covers: no transitions → current sex; one transition with asOf before → opposite of current; one transition with asOf after → current; null asOf → current.
- [ ] **Unit tests** — `updatePerson` guard: changing sex on a person with relationships throws without flags; with `confirmCorrection: true` proceeds; with `confirmGenderTransition` creates event + flips sex in one transaction.
- [ ] **Component test** — PersonModal save with sex change: confirmation modal appears when relationships exist; doesn't appear when none.
- [ ] **Component test** — child rendered with parent who transitioned: the child's role label for the parent matches the child's birth date, not the current sex.
- [ ] **Manual smoke (deferred to user)** — full flow: change sex on self → confirmation appears → pick "Könsbyte" → fill date → review per-relationship notes → save. Verify children labels per their birth date.
- [ ] **Minor bump** + CHANGELOG: `- feat: changing sex on a person with relationships now surfaces a confirmation; gender transitions can be recorded as a life event so role labels stay accurate per child's birth date`.

## Verification (user-observable)

1. **Case 1 (typo correction, no relationships):** edit a person with no spouses or children; flip sex M → F; save. No modal, no friction. Verify in DB: `persons.sex` flipped, no gender_transition event.
2. **Case 2 (correction on a person with relationships):** edit a person with children; flip sex; save. Confirmation modal appears with three options. Pick "Korrigering". The save proceeds; no event is created; the children's role labels for this parent flip (because there's no transition event to anchor pre-vs-post).
3. **Case 3 (real transition):** edit a person born 1980 with a child born 2010 and another born 2025; flip sex; pick "Könsbyte"; enter transition date 2020; per-relationship review opens. Accept the suggested note for the 2010 child; skip for the 2025 child. Save.
   - Open the 2010 child's PersonPanel: parent's role label is the *pre-transition* sex (e.g. "Pappa").
   - Open the 2025 child's PersonPanel: parent's role label is the *post-transition* sex (e.g. "Mamma").
   - Open the 2010 child's parent_child relationship: the suggested note is on the row.
   - Open the parent: the gender_transition event is in their Events list with date 2020.
4. **Case 4 (MCP):** `update_person` with `sex` changed and the person has relationships, no flags → error. With `confirmCorrection: true` → proceeds, no event. With `confirmGenderTransition: { date: '2020-01-01' }` → both happen in one transaction.
5. **Case 5 (export round-trip):** the gender_transition event survives GEDCOM v7 export + re-import.

## Failure modes / RCA reference

- **Don't auto-rewrite parent_child rows.** Per Prime Directive, the role label is derived. Any code that touches `relationships.notes` automatically without user consent is a regression — the per-relationship review is the user's consent step.
- **Don't conflate sex (biological-as-recorded) with gender identity.** The schema models the family graph; the event models the life fact. Don't merge.
- **MCP boundary parity.** Agents calling `update_person` must hit the same gate. A frontend-only guard that the MCP layer skips is a Prime Directive risk (agents can mis-author the family graph quietly).
- **Render-time perf.** The resolver adds a per-render filter over the parent's events. Events are small per person (typically <50 rows); cost is negligible. If a chart re-renders 10k boxes and each computes the resolver, memoize per personId.
- **Multiple transitions.** If a person has more than one gender_transition event in their lifetime, the resolver walks the chain. Test fixture covers two transitions.
- **Authored-value protection.** When the user picks "Avbryt" on the confirmation modal, the sex dropdown reverts but no field elsewhere on the modal should reset (other edits the user made before clicking save must persist). Test explicitly.
- **Localization-cultural sensitivity.** The suggested note text leans on Swedish genealogy convention. Run the EN translation past someone who knows English-language genealogy practice before shipping.

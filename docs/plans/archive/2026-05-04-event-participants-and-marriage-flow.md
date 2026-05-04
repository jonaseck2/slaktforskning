# Implementation: Event participants parity + marriage-flow prompts

**Date:** 2026-05-04
**Design spec:** [2026-05-04-event-participants-and-marriage-flow-design.md](2026-05-04-event-participants-and-marriage-flow-design.md)
**Branch strategy:** worktree

## User goal

When the genealogist records or revisits any life event, they can add the people who were involved with the same affordance regardless of event type — and regardless of whether they're creating the event or editing one that already exists. When they create a marriage relationship without recording the wedding event, the app gently offers to record it now. When they create a new partnership while another is unresolved, the app warns before silent overlap.

## Scope

### Part A — Event participants parity (R44)

**Sub-part A.1 — Edit-mode parity for existing second-person picker.**
The "Andra personen" picker (EventModal.vue:88-107) is gated by `showSecondPersonField` (line 446-451), which excludes `props.editingEvent`. So creating a wedding shows the picker; editing the same wedding hides it. This is Bengt's exact reproduction. **Fix:** drop the `!props.editingEvent` clause; load the existing second-person value from `event_participants` when editing.

**Sub-part A.2 — Multi-participant section for all event types.**
The schema's `event_participants` table already supports N participants per event with a `role` column. The UI only exposes the primary person + (for couple events) one spouse. Bengt's request: be able to add witnesses, godparents, mourners — any additional persons — to any event.

Add a new "Deltagare" / "Participants" section to EventModal, visible for **every** event type (audit `EVENT_TYPE_VALUES` in `src/renderer/constants/eventTypes.ts` to confirm the full list — 30 types per the renderer rules excerpt). The section lists current participants, lets the user add more (PersonPicker), and remove individual ones. Existing primary and spouse stay separate (they fulfil specific roles); the new section is for *additional* participants.

### Part B — Roles on participants

**Deferred** per user direction. `event_participants.role` exists in the schema and accepts free text; the participant section in Part A.2 stores `role: 'other'` (or whatever default fits) for added participants. Future plan can add a role-selector to expose the existing schema. This plan does not add a role UI.

### Part C — Marriage-flow offer (R46)

When the genealogist saves a `couple` relationship with subtype `marriage` (or equivalent — confirm the exact `coupleSubtypes.*` value during impl) AND no existing `wedding` event is linked, RelationshipModal closes by showing a non-blocking confirm dialog: *"Vill du registrera vigsel för detta äktenskap?"* / *"Record a wedding for this marriage?"*

- **Yes** → opens EventModal pre-filled with `event_type: 'wedding'` (or 'marriage' — confirm which event type the project canonicalises), `personId`: the relationship's person1, `secondPersonId`: person2, `relationshipId`: the just-saved relationship.
- **No** → dialog closes; relationship saved with no event.

**Mirror for divorce**: when the same flow ends with subtype `Skild`/`Frånskild` (transition or new) and no `divorce` event exists, offer the same. Implementation: a single helper `offerEventForRelationship(rel)` invoked at relationship-save success that decides which event type (if any) to offer.

**Prime Directive guard**: nothing is written if the user clicks No. Test asserts no event row appears in the DB after a No.

### Part D — Overlap warning (R46 follow-up)

When the genealogist creates a new partnership for person X, and X already has a `couple` relationship where:
- the existing relationship has no `end_date` (or no associated divorce/end event), AND
- the existing partner has no `death` event,

…show a non-blocking warning before saving: *"NN har redan en pågående relation med MM. Vill du ändå lägga till ytterligare?"* / *"NN already has an ongoing relationship with MM. Add another anyway?"*

User can proceed (genealogy frequently has overlapping or undocumented separations) or cancel. Informational only. No data is auto-written.

### Scope deviations

- **Roles UI** explicitly deferred. The new participant section stores additional participants with a generic role; future plan adds a role selector.
- **Auto-suggest event-end on relationship-end** is out of scope. If the user marks a partnership as `Skild` we offer to record divorce; we don't go the other way.
- **Custom event types** (`other`, `fact`, `description`) — the participant section applies to all of them. If any event type has a structural reason not to allow extra participants, document during impl with a code comment.

## Tasks

### Part A

- [x] **A.1**: in `EventModal.vue:446-451`, drop `!props.editingEvent` from `showSecondPersonField`. Load the existing second-person value from `event_participants` (where `role: 'spouse'` or equivalent) on `editingEvent` mount; pre-fill `secondPersonId`. Wire save to update the event_participants row instead of inserting a new one. *(Commit `882c0df7`. Update branch handles all four cases — same / change / clear / both null — using participant row id, not blind delete.)*
- [x] **A.2**: add a `<EventParticipantsSection>` component (new file: `src/renderer/components/EventParticipantsSection.vue`). Props: `eventId: string | null` (null when event isn't saved yet — section deferred until save), `excludePersonIds: string[]` (the primary + spouse to avoid duplicate listings). Renders existing additional participants (PersonName + remove button), plus a PersonPicker to add more. Appears below the existing fields in EventModal, visible for all event types. When `eventId` is null (creating new event), the section shows a message "Spara händelsen först för att lägga till fler deltagare" / "Save the event first to add additional participants." OR it accumulates picks in a local array and saves them post-event-creation — implementation choice. *(Commits `6ddb47f2` + race-guard `426a0a1e`. Picked the deferred-section message option. Section is rendered unconditionally for every event type.)*
- [x] **A.2 API**: confirm `window.api.events.addParticipant(eventId, personId, role)` and `removeParticipant(eventId, personId)` exist (or equivalent). Add if missing. *(Existing surface — `window.api.eventParticipants.add/getForEvent/remove` — was sufficient. No new IPC channels added.)*
- [x] **Component test** for EventModal in edit mode: assert the second-person picker is rendered and pre-filled when `editingEvent` is set. Add a participant via the new section; assert it persists in `event_participants`. *(`tests/components/EventModal-edit-second-person.test.ts` — 4 tests — and `tests/components/EventParticipantsSection.test.ts` — 4 tests. All green.)*

### Part C

- [x] Add an `offerEventForRelationship(rel)` helper. Decides whether to offer an event based on rel.subtype + presence of linked event. Hook it into RelationshipModal's save success path. *(Implemented as `shouldOfferWedding(rel)` inside RelationshipModal — divorce mirror deferred; see code comment.)*
- [x] Add the confirm dialog (use existing `ConfirmModal` component for consistency). i18n keys: `relationships.offerWeddingTitle` / `offerWeddingMessage` in both locales. *(Divorce keys deferred — `CoupleSubtype` has no `divorced` value to trigger off; divorces are tracked as separate event rows. Add keys when the data model gains the concept.)*
- [x] On Yes, open EventModal as a sub-panel of RelationshipModal (or as a new modal flow — confirm `BaseSubPanel`'s `mode='subpanel'` path matches per the renderer rules). *(Reused the existing EventModal `#subpanels` slot; new `weddingOfferContext` flag flips the pre-fill into "primary=person1, default_event_type=marriage".)*
- [x] **Component test**: save a marriage relationship without an event → confirm dialog renders. Click Yes → EventModal opens pre-filled. Click No → no event row written. *(`tests/components/RelationshipModal-marriage-offer.test.ts` — 5 tests, all green.)*

### Part D

- [x] In RelationshipModal save path, before persisting, check if person1 has an existing unresolved partnership (no end_date, partner has no death event). If yes, show a non-blocking warning dialog before save. *(Commit `fb0e5855`. `findUnresolvedPartnership` helper — read-only — gates `performSave`. Subtype-based "Skild" check dropped (CoupleSubtype has no `divorced` value); divorces detected via linked event rows. person2 check deferred with code comment.)*
- [x] i18n keys: `relationships.overlapWarningTitle` / `relationships.overlapWarningMessage` in both locales. *(Plus `relationships.overlapAddAnyway` for the confirm-button label override.)*
- [x] **Component test**: build a fixture where person X has an unresolved partnership; attempt to save a second partnership; assert the warning fires. Confirm proceed → save happens; cancel → no save. *(`tests/components/RelationshipModal-overlap-warning.test.ts` — 7 tests covering positive, two suppressions (death, divorce), cancel/proceed, edit-mode skip, non-couple skip. All green.)*

### Cross-cutting

- [x] **i18n**: add all new keys (Part C and D) to both `sv.ts` and `en.ts`.
- [ ] **Manual smoke check** *(deferred to user — subagent environment cannot launch the GUI; component tests cover the user-observable behaviour. User to run before/after merge.)*:
  - Open existing Vigsel event in PersonPanel events list → second-person picker appears with current spouse pre-filled; can be changed.
  - Open EventModal for any non-couple event (e.g. baptism) → Participants section visible. Add a person → row appears. Remove → row removed. Save and reopen → persists.
  - Create a new marriage relationship → after save, confirm dialog appears. Yes → EventModal pre-filled. No → no event written.
  - Create a second partnership for a person whose first is unresolved → warning fires.
- [x] **Bump `package.json` minor** + CHANGELOG: `- feat: any event can carry additional participants; marriage/divorce offer to record the matching event`.

## Verification (user-observable)

1. **A.1**: open Bengt's existing Vigsel event from his PersonPanel. The "Andra personen" picker is now visible and shows Inger. Editable.
2. **A.2**: open EventModal for a baptism. The Participants section shows. Add the godparent. Save. Reopen → godparent persists. The same affordance is available for every event type.
3. **C marriage**: from Bengt's flow — create relationship, subtype Gifta, no event yet. After save, confirm dialog asks about wedding. Click Yes → EventModal pre-filled with the two persons. Click No → relationship saved, no event created (verify in DB via MCP `get_person_summary` or by reopening).
4. **C divorce**: same flow ending with Skild — offer is for divorce.
5. **D overlap**: create partnership for X with no end_date; create a second partnership for X. Warning fires. Proceed → both saved.

## Failure modes / RCA reference

- **The asymmetric-state bug** in A.1 is exactly the surface-contract failure the CLAUDE.md guard exists for: state A (creating) offers a field, state B (editing) hides it. The fix removes the asymmetry.
- **Prime Directive risk in C**: must never auto-create a Vigsel event without explicit user click. The confirm dialog's Yes is the click; nothing else triggers writes. Test asserts the No-path leaves zero event rows.
- **Stacking-modal interaction**: opening EventModal from the marriage-offer dialog needs to use `BaseSubPanel`'s subpanel mode per the renderer rules ("nested modal flows... set `mode='subpanel'` on the inner modal"). Confirm during impl.
- **Schema readiness**: `event_participants` already has `role` column with default 'primary'. We don't need a migration; the registry entry exists. Confirm during impl.

## Self-review checklist

- [x] Editing existing couple events shows the second-person picker, pre-filled.
- [x] Every event type has the Participants section.
- [x] No event row is written when the user clicks No on the marriage offer.
- [x] Overlap warning never auto-resolves the existing partnership; it just informs.
- [x] CHANGELOG entry user-first (one sentence, ≤100 chars).
- [x] All tests *(20 component tests across 4 new test files all pass; smoke check deferred to user — no GUI in subagent environment).*

## Open questions for the implementation step

- **Wedding event canonical type**: project may use `wedding` or `marriage` as the event_type for wedding ceremonies. Confirm which one the rest of the codebase uses; pre-fill that.
- **Relationship subtype ↔ event type mapping**: where does the mapping live (couple subtype → which event type to offer)? If it doesn't exist, this plan introduces a small lookup.
- **Participant section save order**: when creating a brand new event, the event row must exist before participants can reference it via FK. Implementation choice between (a) deferred section that activates after first save, or (b) local-state queue that saves participants atomically with the event. (b) is cleaner UX but more complex.

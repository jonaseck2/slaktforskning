# Implementation: sex-change-guard — Phase 1 (data layer + render resolver)

**Date:** 2026-05-06
**Branch strategy:** worktree (touches schema enum, API, render-time util, GEDCOM registry)
**Source:** Beta tester report 80 (v0.215.2) — split from [2026-05-06-sex-change-guard.md](archive/2026-05-06-sex-change-guard.md) (original archived; was too large for one implementer pass)
**Predecessor:** the original `sex-change-guard` plan stalled mid-implementation when dispatched as a single piece (10-min watchdog hit with no progress).
**Sibling phases (sequenced after this lands):**
- Phase 2: UI flow (`GenderTransitionConfirmModal`, `PerRelationshipReviewModal`, PersonModal save handler, wire resolver in PersonRelationshipsSection / reports / charts)
- Phase 3: MCP `update_person` parameter additions + GEDCOM round-trip (exporter / importer / registry / per-field test)

## User goal

Two distinct things the genealogist needs:

1. **Don't let a sex flip on an existing person silently break their family graph.** Changing M → F on a person with children today flips them from "father" to "mother" everywhere — sometimes correct (typo correction), sometimes catastrophic (a child suddenly has two biological mothers). The save path needs a confirmation step that distinguishes these two cases.
2. **Record an actual gender transition as a life event** — with a date, optional place, and source citation — so the family graph can stay correct: a parent's biological-parent role for any given child is computed against the parent's sex *at the child's birth*, not their current sex.

Net result: someone who transitioned in 2020 stays the biological *father* of children born before 2020 and the biological *mother* of children born after, while their `persons.sex` row reflects their current identity. No DB rewrites; everything derived at render.

**Phase 1 alone does not deliver the user goal — it puts the data + math in place so Phase 2's modals and Phase 3's MCP parity have something to call.** That's an explicit deviation from the project's "verify by user goal" rule and is justified by the predecessor stall.

## Scope (Phase 1 only)

Three files-or-clusters touched:

1. **Event-type enum** — `src/renderer/constants/eventTypes.ts`. Add `'gender_transition'` to `EVENT_TYPE_VALUES` (after `'foster_placement'`, before `'travel'`) and to `PERSON_EVENT_TYPE_VALUES` (it's a person-only fact, not relationship-coupled). i18n keys `eventTypes.gender_transition` in both `sv.ts` and `en.ts`.
2. **API guard on `updatePerson`** — `src/api/persons.ts`. Add optional `confirmCorrection?: boolean` and `confirmGenderTransition?: { date: string; date_type?: string; date_original?: string; place_id?: string | null; notes?: string }` parameters. When the change targets `sex`:
   - If the person has zero active relationships (no rows in `relationships` where `person1_id = id OR person2_id = id`) → proceed silently.
   - Else if `confirmCorrection === true` → proceed (no event created).
   - Else if `confirmGenderTransition` is set → in a single transaction: create the `gender_transition` event AND flip `persons.sex`.
   - Else → throw a typed `SexChangeRequiresConfirmationError` carrying the relationship count and list of relationship-ids so the UI can render the confirmation modal.
3. **Render-time resolver** — `src/renderer/utils/relationshipLabels.ts`. Add `resolveParentSexAt(parentEvents, parentCurrentSex, asOfIso)`. Walks `gender_transition` events ordered chronologically. Pure function, no DB access. Returns `'M' | 'F' | 'U'`.
4. **GEDCOM fidelity registry entry** — `src/api/gedcom_fidelity_registry.ts`. The new event type doesn't add a column (events table already covers `event_type`), so the registry's `events.event_type` row already covers it via the existing enum-string mechanism. **No registry change needed**, but the per-field round-trip test currently exercises one event type per row — adding `gender_transition` to the test fixture comes in Phase 3 (along with the export/import mapping).

### Scope deviations

- **No schema column added.** The event slots into the existing `events` table. Confirmed in original plan.
- **No `from_sex` / `to_sex` fields on the event itself.** The transition direction is implicit — at the event's date, `persons.sex` is the post-transition sex; before the date, it's whatever the previous transition (or birth-default) was.
- **Phase 1 ships zero UI.** No modal, no PersonModal save-handler integration. Phase 2's job. The user can't observe Phase 1 by clicking — only by tests. Per `.claude/rules/plans.md` Rule A1, the user goal is the same across all three phases; this phase's "verification" is structural for the implementer + spec reviewer, then Phase 2's GUI verification confirms the user goal end-to-end.
- **MCP `update_person` parameter additions are NOT in Phase 1.** Even though Phase 1 changes the underlying API signature, the MCP tool wrapper stays as-is until Phase 3, which means MCP callers temporarily lose the guard. That's acceptable for the brief window between Phase 1 and Phase 3 — agents authoring data via MCP during that window may sex-flip without confirmation, exactly as today. Phase 3 closes the gap.

## Locked decisions (carried from original plan)

- **D1.** Case 1 (no relationships) — zero friction. Save proceeds silently. No confirmation modal.
- **D4.** Render-time role resolver consults `gender_transition` events. Pre-transition children → role label resolves against parent's pre-transition sex; post-transition → current sex.

## Failure modes / RCA reference

- **The original plan stalled** when dispatched as a single piece because it touched 5 layers + 2 new components + tests in all of them. The 10-minute watchdog hit before the implementer could ship a coherent commit. Phase split is the response: each phase is one implementer's tractable scope.
- **Authored-value protection.** Per CLAUDE.md, `gender_transition` is an authored event the user creates explicitly. `persons.sex` flips are also authored (via the modal in Phase 2 or a confirmed API call here). NO inference: the resolver computes labels at render only, never writes back.
- **No auto-rewriting parent_child rows.** Per Prime Directive, role labels are derived. Any code path that touches `relationships.notes` automatically without user consent is a regression — the per-relationship review modal (Phase 2) is the user's consent step. Phase 1 doesn't touch `relationships.notes` at all.
- **Multiple transitions per person.** The resolver walks the chain; if a person has two `gender_transition` events, the asOf date determines which side of which transition we're on. Test fixture covers this.

## Tasks

- [ ] **Add `gender_transition` to `EVENT_TYPE_VALUES`** in `src/renderer/constants/eventTypes.ts`. Place after `foster_placement`. Also add to `PERSON_EVENT_TYPE_VALUES` (not relationship-coupled).
- [ ] **i18n** — `eventTypes.gender_transition` in `src/renderer/i18n/sv.ts` ("Könsbyte") and `src/renderer/i18n/en.ts` ("Gender transition").
- [ ] **Type the typed error** — `class SexChangeRequiresConfirmationError extends Error` with `{ personId: string; activeRelationshipIds: string[] }` properties. Lives in `src/api/persons.ts`. Re-exported from `src/api/types.ts` for renderer consumption.
- [ ] **API guard** — extend `updatePerson(db, id, data, opts?)` signature. Implement guard logic per Scope §2. When `confirmGenderTransition` is set, the event creation + sex flip happen in a single `BEGIN IMMEDIATE` / `COMMIT` block.
- [ ] **API workflow helper** — `updatePersonWithGenderTransitionWorkflow(db, id, { sex, eventDetails })`. Single transaction. Returns `{ person, event }`.
- [ ] **Render resolver** — `resolveParentSexAt(parentEvents, parentCurrentSex, asOfIso)` in `src/renderer/utils/relationshipLabels.ts`. Pure function. Documented per the plan's signature sketch.
- [ ] **Unit test** — `tests/unit/persons.test.ts` (extend) — `updatePerson` with sex change:
  - person with zero relationships → proceeds, no event, returns updated row.
  - person with relationships, no flag → throws `SexChangeRequiresConfirmationError` with the right `activeRelationshipIds`.
  - person with relationships, `confirmCorrection: true` → proceeds, no event.
  - person with relationships, `confirmGenderTransition: { date: '2020-01-01' }` → creates `gender_transition` event AND flips sex; both visible in DB after.
  - All four cases assert the event count and `persons.sex` values directly (not return values).
- [ ] **Unit test** — `tests/unit/relationshipLabels.test.ts` (new or extend) — `resolveParentSexAt`:
  - no transitions → returns `parentCurrentSex`.
  - one transition with `asOfIso` BEFORE → returns the OPPOSITE of `parentCurrentSex`.
  - one transition with `asOfIso` AFTER → returns `parentCurrentSex`.
  - `asOfIso === null` → returns `parentCurrentSex` (current/unknown date defaults to live identity).
  - two transitions, asOf between them → walks the chain correctly (assert specific case: M→F at 2010, F→M at 2025, asOf=2015 → F; asOf=2030 → M; asOf=2005 → M).
- [ ] **Lint** — `npm run lint` clean.
- [ ] **Tests** — `npm test` runs full suite; new tests pass.

## Verification

Per `.claude/rules/plans.md` Rule A3, this phase's verification is structural (Phase 1 has no user-observable surface). The user-goal verification happens in Phase 2's GUI smoke + Phase 3's MCP / GEDCOM round-trip tests.

The structural checks for Phase 1:

1. `EVENT_TYPE_VALUES` includes `'gender_transition'`. Both i18n locales render the label.
2. `updatePerson` guard tests cover all four cases listed above (no flag, two flags, zero relationships).
3. `resolveParentSexAt` tests cover all five cases listed above.
4. No code path writes `persons.sex` outside `updatePerson` (regression guard for the Prime Directive). Grep audit: `grep -RIn "UPDATE persons SET sex" src/api/` should return only `persons.ts` (the canonical update path).

## Implementer guidance

- This phase is intentionally narrow. **Do not** start the modal work — that's Phase 2. **Do not** touch the MCP tool — that's Phase 3.
- The render resolver is a pure function — no DB access, no `window.api` calls. Take parent events as a prop / argument; let the caller fetch them.
- Tests must hit the DB directly (`createTestDb()`), not the MCP layer.
- Don't bump version or update CHANGELOG — that happens at the merge step.

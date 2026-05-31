# Plan — Modal companion composables (3.5 follow-up)

Roadmap origin: identified during plan 3.5 (modal composable extraction) close-out as the unfinished work to bring per-modal LOC closer to the original aspirational targets. Plan 3.5 shipped 14 form/validation/save composables but left ~150–400 LOC of per-modal domain orchestration (companion writes, picker logic, citation-flow for names, wedding-offer, overlap-check) in the modal files themselves. This plan extracts those into named composables that follow the project's `useEntityData` / `useEditableFields` pattern.

This is a single-file design + plan — small enough to skip the design/plan split.

## User goal

A bug in the "if you change a baptism date the companion baptism event updates too" logic lives in `useCompanionBaptism.ts`, not at lines 869–911 of `EventModal.vue`. A bug in the wedding-offer-after-birth-event flow lives in `useWeddingOffer.ts`, not at lines 850–910 of `RelationshipModal.vue`. After this plan: each of the four modals' `<script setup>` is small enough to read end-to-end in one screen.

## Why now

Plan 3.5 explicitly identified five candidate composables for the second pass: `useCompanionBaptism`, `useSpousePicker`, `useCitationsForPersonName`, `useWeddingOffer`, `useOverlapCheck`. The plan's archive entry recorded the LOC remainders that motivated the follow-up:

| Modal | Post-3.5 LOC | Plan-3.5 aspiration | Remaining LOC drop target |
|---|---|---|---|
| EventModal | 1042 | ≤ 400 | ~640 |
| PersonNameModal | 630 | ≤ 300 | ~330 |
| PersonModal | 521 | ≤ 300 | ~220 |
| RelationshipModal | 504 | ≤ 300 | ~200 |

The hard remaining ~150–400 LOC per modal is per-modal domain orchestration. Some of it is irreducible (template + specific binding glue); the named composables below absorb the parts that ARE reducible.

## Pre-plan audit (per `audit-validation` skill)

Before writing the Scope section, verify each composable name claims against the actual modal contents:

```bash
# Companion logic:
grep -n 'companion\|syncBaptism' src/renderer/components/modals/EventModal.vue
grep -n 'name-change\|nameChange' src/renderer/components/modals/EventModal.vue

# Spouse picker:
grep -n 'secondPerson\|spouseId\|partnerOptions' src/renderer/components/modals/EventModal.vue

# Person-name citations (uses citations.forPersonName, not citations.forEvent):
grep -n 'citations\.\|forPersonName' src/renderer/components/modals/PersonNameModal.vue

# Wedding offer + overlap check:
grep -n 'wedding\|overlap' src/renderer/components/modals/RelationshipModal.vue
```

The plan executor runs these greps in Task 0 and **records the actual LOC ranges + line numbers next to each composable target** before extracting. This anchors the work against the real code, not the 3.5 archive entry's paraphrase.

## Scope

Five composables, extracted in priority order (largest LOC drop first):

### B1 — `useCompanionBaptism(form, eventId, save)` — EventModal only

Source: `EventModal.vue` lines 869–911 (per 3.5 archive). Encapsulates the "when saving a birth event, offer to create/update a companion baptism event" flow. Returns `{ pendingCompanion: Ref<...>, applyCompanion(): Promise<void> }`. Test: 4 cases — birth-creates-baptism, no-companion-on-non-birth, edit-keeps-companion-in-sync, user-declines-companion.

### B2 — `useNameChangeCompanion(form, eventId)` — EventModal only

Source: `EventModal.vue` lines ~830–870 (per 3.5 archive). The "when saving a name-change event, update the person's name record" flow. Similar shape to B1.

### B3 — `useSpousePicker(eventType, primaryPersonId)` — EventModal, possibly RelationshipModal

Source: `EventModal.vue` ~408–437 + ~520–600 (per 3.5 archive — "second-person/spouse picker + partner-options loader"). Returns `{ secondPersonId, partnerOptions, loadPartners(), pickSecondPerson() }`. If RelationshipModal uses an identical picker, reuse; otherwise leave RelationshipModal's untouched and reconsider in Task 6 (helper extraction analysis).

### B4 — `useCitationsForPersonName(nameId)` — PersonNameModal only

Source: `PersonNameModal.vue` citation-flow region (~190 LOC per 3.5 archive). PersonNameModal uses a distinct IPC channel (`citations.forPersonName`, not `citations.forEvent`), so the existing `useEventCitations` doesn't fit directly. Either:
- (a) Build `useCitationsForPersonName` mirroring `useEventCitations`'s shape against the name-specific IPC.
- (b) Generalize `useEventCitations` to take an "entity kind" parameter and call the right IPC underneath.

Decision: **(a) first** — keeps `useEventCitations` simple and unchanged. If a third entity ever needs the same shape (sources? media? — verify with grep during execution), generalize then.

### B5 — `useWeddingOffer(form)` — RelationshipModal only

Source: `RelationshipModal.vue` ~50 LOC wedding-offer flow. The "if you save a marriage relationship without a wedding event, offer to create one" flow. Pure pre/post-save orchestration. Returns `{ shouldOfferWedding: ComputedRef<boolean>, applyWedding(): Promise<void> }`.

### B6 — `useOverlapCheck(form, relationshipId)` — RelationshipModal only

Source: `RelationshipModal.vue` ~60 LOC overlap-warning flow. Checks if the saved relationship's date range overlaps with another relationship for the same person; surfaces a warning. Returns `{ overlapWarning: ComputedRef<string | null> }`.

## Approach

TDD, single PR, all five composables migrate alongside their modal touchups. Per `.claude/rules/renderer.md` §"Pattern migrations are all-or-nothing" — if you start B1 you finish B1+B2+B3 (EventModal) in the same PR; same for B4 (PersonNameModal); same for B5+B6 (RelationshipModal).

If B3 turns out to be RelationshipModal-shareable, that's a bonus — coordinate the diff with B5/B6.

## Verification

Per `.claude/rules/plans.md` user-goal-falsifiability check:

1. Per-modal LOC drops below the new (realistic) targets:
   - EventModal ≤ 750 (was 1042; -290)
   - PersonNameModal ≤ 450 (was 630; -180)
   - PersonModal — no change (it has no companion / wedding / overlap flows; remains 521)
   - RelationshipModal ≤ 400 (was 504; -100)
2. Each new composable has its own test file under `tests/unit/composables/` with ≥3 test cases.
3. `npx vitest run tests/unit/composables/` passes with test count higher than before.
4. `npx tsc --noEmit` clean for `src/`.
5. In-app spot-test of the affected modals:
   - EventModal: save a birth event → companion baptism prompt appears → accept → both events persist.
   - PersonNameModal: edit a name → add a citation → save → citation persists.
   - RelationshipModal: save a marriage → wedding-offer prompt appears → accept → wedding event created. Save a second overlapping relationship for same person → overlap warning shown.
6. The 3.5 archive entry's "follow-up opportunity" section gets a closing addendum (in `docs/plans/archive/PLAN.md`'s 3.5 entry) listing the five composables that landed.

## Failure modes / RCA reference

- **B3 may not actually share between modals.** Don't force; if the picker logic differs structurally, leave RelationshipModal's separate. Per `.claude/rules/plans.md` "cousin patterns stay" rule.
- **B4 generalization temptation.** Resist generalizing `useEventCitations` until at least one more callsite exists. Premature abstraction is the failure mode 3.4 and 3.1 explicitly rejected.
- **Audit-validation reminder.** The 3.5 archive paraphrased the LOC ranges (e.g. "lines 869–911"). Task 0 verifies these against the actual current `EventModal.vue`. If the ranges drifted (because 3.5 already extracted some surrounding code), update the plan inline before starting B1.

## Effort

3 days. Per-composable: ~half day for TDD + extraction + modal touchup. EventModal (B1+B2+B3) is one day; PersonNameModal (B4) is half a day; RelationshipModal (B5+B6) is half a day; final verification + close-out is half a day.

## Tasks

- [ ] Task 0: pre-plan audit (grep + record actual LOC ranges per audit-validation skill).
- [ ] Task 1: `useCompanionBaptism` (TDD; integrate into EventModal save flow).
- [ ] Task 2: `useNameChangeCompanion` (same).
- [ ] Task 3: `useSpousePicker` (decide RelationshipModal-share or not).
- [ ] Task 4: EventModal migration commit; verify LOC + in-app spot-test.
- [ ] Task 5: `useCitationsForPersonName` (TDD; integrate into PersonNameModal).
- [ ] Task 6: PersonNameModal migration commit; verify LOC + in-app spot-test.
- [ ] Task 7: `useWeddingOffer` (TDD; integrate into RelationshipModal).
- [ ] Task 8: `useOverlapCheck` (TDD; integrate into RelationshipModal).
- [ ] Task 9: RelationshipModal migration commit; verify LOC + in-app spot-test.
- [ ] Task 10: Update `docs/plans/archive/PLAN.md` 3.5 entry with the closing addendum.
- [ ] Task 11: CHANGELOG Unreleased entry.

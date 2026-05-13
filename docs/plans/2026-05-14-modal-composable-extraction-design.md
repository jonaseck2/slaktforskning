# Design — Modal composable extraction

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §3.5.

## User goal

Each modal (EventModal, PersonNameModal, PersonModal, RelationshipModal) becomes a thin orchestrator that renders a template, mounts a few composables, and emits results. The reusable state-management, validation, and save-orchestration logic lives in composables under `src/renderer/composables/`. A bug in event-citation handling lives in `useEventCitations.ts`, not at line 437 of EventModal.vue.

After this plan: each modal is < target LOC (script-setup); the heavy logic is in 3–5 composables per modal that are unit-testable without mounting Vue.

## Why now

The 2026-05-14 audit ranked modals #5 Tier 3 assuming template-side branching. Re-measurement showed:

| Modal | Total LOC | Template | Script setup | Style |
|-------|-----------|----------|--------------|-------|
| EventModal | 1,052 | 105 | **721** | 70 |
| PersonNameModal | 701 | ? | (~500 expected) | ? |
| PersonModal | 646 | ? | (~480 expected) | ? |
| RelationshipModal | 568 | ? | (~430 expected) | ? |

The bulk is `<script setup>`, not `<template>`. Original "extract event-type-specific field components" recommendation doesn't fit; composable extraction does — it's the project's idiomatic state-management decomposition (CLAUDE.md "Person Section Component Pattern"; [`.claude/skills/frontend-design`](../../.claude/skills/frontend-design) references `useEntityData`, `usePagedList`, `useEditableFields` as canonical examples).

## Scope (all four modals, one PR per all-or-nothing rule)

For each modal, extract composables along the canonical state / validation / save axes.

### EventModal (1,052 → target ≤ 400 LOC)

- `useEventForm(eventId, defaults, mode)` — form state ref, dirty tracking, hydration from existing event, default-application.
- `useEventValidation(form)` — computed errors per field, blocking-save predicate.
- `useEventCitations(eventId)` — citation list ref, add/remove/edit, integration with CitationModal.
- `useEventParticipants(eventId, primaryPersonId)` — participant list ref, add/remove, role assignment.
- `useEventSave(form, eventId, mode, validation)` — save orchestration: insert/update, citation persistence, participant persistence, error handling, success emit.

Modal becomes: mount composables, wire `<template>` to refs/handlers, render conditional fields based on `form.event_type`.

### PersonNameModal (701 → target ≤ 300 LOC)

- `usePersonNameForm(nameId, defaults, mode)`
- `usePersonNameValidation(form)`
- `usePersonNameSave(form, nameId, mode, validation)`

(No nested entities like citations/participants — simpler than EventModal.)

### PersonModal (646 → target ≤ 300 LOC)

- `usePersonForm(personId, defaults, mode)`
- `usePersonValidation(form)`
- `usePersonSave(form, personId, mode, validation)` — including primary-name creation on insert.

### RelationshipModal (568 → target ≤ 300 LOC)

- `useRelationshipForm(relationshipId, defaults, mode)`
- `useRelationshipValidation(form)`
- `useRelationshipSave(form, relationshipId, mode, validation)`

### Shared composables — discovered, not assumed

Same discipline as 3.4. Identify post-migration; extract only patterns used by ≥2 modals with identical shape.

Expected candidates (verify during execution):
- `useFormDirtyTracking(form, original)` — deep-equal comparison; used by every form.
- `useRaceSafeSave(saveFn)` — generation-guards the save call. Project already has `useEditableFields` doing something similar; verify it fits or compose.

### Scope deviations

- **`BaseSubPanel`** stays untouched. Owns modal chrome (overlay, focus trap, header).
- **Other modals.** [`src/renderer/components/modals/`](../../src/renderer/components/modals/) contains other modals (CitationModal, MediaPickerModal, etc.). They're smaller (< 400 LOC) and not in scope. If a smaller modal could opportunistically use one of the shared composables, adopt **only if free**; don't expand scope.
- **Tests are added, not migrated.** Current coverage is via parent-section integration tests. Each new composable lands with its own unit test under `tests/unit/composables/`. Modal-component tests aren't added here (separate scope).
- **i18n keys.** Composables surface error messages via `t('errors.X')` keys. New keys land in both `src/renderer/i18n/sv.ts` and `en.ts` per CLAUDE.md i18n rule. No silent string changes.

## Approach

Single PR migrating all four modals in lockstep. Per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing" — half-migrated modals violates user mental model of "every modal works the same way."

Order:
1. Implement EventModal composables (richest case).
2. Migrate EventModal; verify behavior unchanged.
3. Apply the pattern to PersonNameModal, PersonModal, RelationshipModal.
4. Identify shared composables; extract.
5. Verify all four modals are under target LOC.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **Modal LOC under targets.** `wc -l src/renderer/components/modals/{Event,PersonName,Person,Relationship}Modal.vue` shows each modal at or below its target.
2. **Composables exist and are imported.** Each modal imports ≥3 composables from `src/renderer/composables/`. Grep verifies.
3. **Composables have unit tests.** `tests/unit/composables/useEventForm.test.ts` (and equivalents) exist for the major extractions. Save composables tested with mock `window.api`.
4. **`npm test` exits 0** with test count higher than before (new composable tests added).
5. **`tsc --noEmit` passes.** No `any` leaks introduced.
6. **All four modals open + save + cancel correctly** in the running app:
   - EventModal: open from PersonPanel → Events, fill, save, verify event appears.
   - PersonNameModal: open from PersonPanel → Names, edit, save.
   - PersonModal: add a new person from PersonsView, verify name created.
   - RelationshipModal: open from PersonPanel → Relations, edit, save.
7. **Documented shared composables.** Close-out section lists every shared composable extracted, the modals using it, AND patterns considered but rejected (with reason).

Falsifiability check: if every item passes, can EventModal.vue still be 1,052 LOC of `<script setup>`? **No** — item 1 caps it; item 2 requires composables to be imported; item 3 requires logic to live in testable composables.

### Dependencies

None. Independent of 1.2 — modal rendering isn't in baseline workloads.

## Failure modes / RCA reference

- **Composable proliferation.** Pulling too many small composables creates a maze of `useFoo`, `useBar` files for every modal. Mitigation: per-modal composables are intentionally per-modal (not generic); the "≥2 modal usage" rule for shared composables prevents speculative abstraction.
- **State synchronization bugs.** Splitting form, validation, and save into three composables means ref identity matters — passing the wrong ref version causes silent staleness. Mitigation: composables receive shared refs by reference, not by value; the contract is documented in each composable's JSDoc.
- **Test value drift.** Composable unit tests can pass while the integrated modal breaks. Mitigation: spot-test step (verification #6) catches integration regressions. Long-term this argues for focused modal-component tests (separate plan).

This plan exists because the audit identified modal size as a complexity hotspot but misread the bottleneck (template branching vs. script-setup logic). The corrected diagnosis (script-setup is 70% of EventModal) reframes the refactor as composable extraction.

## Effort

3 days, plan-driven worktree work.
- Day 1: EventModal composables + migration; in-app verify.
- Day 2: PersonName + Person + Relationship modals; their composables.
- Day 3: Shared composable identification + extraction; unit tests; close-out.

## Tasks (high-level)

- [ ] Extract `useEventForm`, `useEventValidation`, `useEventCitations`, `useEventParticipants`, `useEventSave`.
- [ ] Migrate `EventModal.vue` to use them; verify ≤ 400 LOC and in-app behavior unchanged.
- [ ] Extract `usePersonNameForm/Validation/Save`; migrate `PersonNameModal.vue`.
- [ ] Extract `usePersonForm/Validation/Save`; migrate `PersonModal.vue`.
- [ ] Extract `useRelationshipForm/Validation/Save`; migrate `RelationshipModal.vue`.
- [ ] Identify shared composables (≥2 modals); extract.
- [ ] Write unit tests for each composable.
- [ ] Add error i18n keys to `sv.ts` + `en.ts`.
- [ ] Spot-test all four modals in the running app.
- [ ] Document extracted-vs-rejected shared composables in close-out.
- [ ] Self-review checklist.

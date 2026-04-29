# Plan: Bengt feedback — reactivity audit

**Date:** 2026-04-29
**Status:** planned
**Source:** `BENGT.md`
**Effort:** M (investigation-led; bug-fix scope unclear until audit done)

## Background
Bengt reports that several panels and views don't update reactively after a mutation; he has to switch away and back to see the change. The issue is broader than the specific cases he hit. This plan starts with a deliberate audit, then fixes the patterns found.

## Tickets covered
- BENGT #29 — PersonPanel "Händelser (n)" count doesn't update after add
- BENGT #37 — Tree (mittbild) doesn't update after editing focal person's events
- BENGT #31 — Sons/Dotters födelse + spouse death on timelines (verify + extend)
- BENGT #32 — Add Family Member mini-tree visualization (lågprio, defer if scope-creep)

## Hypothesis
Most panel sections load via `onMounted` instead of `watch(() => props.id, load, { immediate: true })`. The CLAUDE.md "Person Section Component pattern" already documents the correct approach — so this is drift, not unknown territory.

The tree (PersonsView center) likely re-renders on tree-subject change but not on event/relationship mutations to the tree subject. The IPC `onDataChanged` broadcast probably fires, but consumers may not be listening, or are listening with stale closures.

## Tasks

### Phase 1 — Audit (research subtask)
- [ ] Grep all `onMounted` calls inside `*Panel.vue` and `*Section.vue` components
- [ ] For each, check whether sibling props could change while component stays mounted
- [ ] Build a list: file → broken / OK / N/A
- [ ] Audit `onDataChanged` listener registration in:
  - `PersonsView.vue` chart components (Pedigree/Hourglass/Descendant)
  - `PersonPanel.vue` event count, names count, media count, etc.
  - All other `*Panel.vue`
- [ ] Document findings in this file under "Audit Results"

### Phase 2 — Fix the pattern
- [ ] Convert each broken `onMounted` to `watch(() => props.X, load, { immediate: true })`
- [ ] Ensure section counts (the `(n)` in panel section headers) come from a reactive source, not a snapshot taken on first load
- [ ] Re-fetch tree data on `onDataChanged` if any of (persons, relationships, events, person_names) changes for the focal person or their immediate family

### Phase 3 — Tree refresh (#37)
- [ ] When event mutations land for the tree subject, refetch tree data
- [ ] Add a stable cache key so PedigreeChart/HourglassChart/DescendantChart re-renders without losing scroll/zoom unless data changes

### Phase 4 — Indirect events on timelines (#31)
- [ ] Investigate `getTimeline(personId)` and report-side timelines
- [ ] Add: spouse death events, child birth events, child death events
- [ ] Constraint: only include events that fell within the subject's lifetime — or include posthumous child birth as Bengt suggested? **Decision:** include child births posthumous-up-to-9-months (covers postpartum births), exclude later. Drop spouse death after subject's own death.

### Phase 5 (optional) — Mini family tree on Add Member (#32)
- [ ] Mock a small visualization in PersonModal when in `relatedTo` mode showing the 5 button positions around the central person
- [ ] Lågprio per Bengt — defer if Phase 1–4 already runs long

## Out of scope
- Full reactivity refactor (Pinia-driven cache, etc.) — too big for this round
- Sibling subtype (already declined)

## Verification
- Add an event → panel section count updates without view switch
- Edit the tree subject's birth → tree re-renders with new dates
- Open timeline → see spouse and child events alongside subject's own
- Add Family Member → if Phase 5 lands, see mini tree; otherwise five buttons stay as-is

## Notes
This plan deliberately starts with audit because Bengt's reports point at symptoms, not causes. Don't fix #29 in isolation — find the others first.

# Plan: Ben feedback — reactivity audit

**Date:** 2026-04-29
**Status:** planned
**Source:** `BEN.md`
**Effort:** M (investigation-led; bug-fix scope unclear until audit done)

## Background
Ben reports that several panels and views don't update reactively after a mutation; he has to switch away and back to see the change. The issue is broader than the specific cases he hit. This plan starts with a deliberate audit, then fixes the patterns found.

## Tickets covered
- BEN #29 — PersonPanel "Händelser (n)" count doesn't update after add
- BEN #37 — Tree (mittbild) doesn't update after editing focal person's events
- BEN #31 — Sons/Dotters födelse + spouse death on timelines (verify + extend)
- BEN #32 — Add Family Member mini-tree visualization (lågprio, defer if scope-creep)

## Hypothesis
Most panel sections load via `onMounted` instead of `watch(() => props.id, load, { immediate: true })`. The CLAUDE.md "Person Section Component pattern" already documents the correct approach — so this is drift, not unknown territory.

The tree (PersonsView center) likely re-renders on tree-subject change but not on event/relationship mutations to the tree subject. The IPC `onDataChanged` broadcast probably fires, but consumers may not be listening, or are listening with stale closures.

## Audit Results

**Date:** 2026-04-30
**Status:** complete

### Pattern overview — 2 out of 15 panel/section files have an issue

The hypothesis ("most panel sections use `onMounted` instead of `watch`") was mostly wrong. Only **1 data-loading `onMounted`** exists in the entire panel/section surface, and it is not a data-loading call but an `onDataChanged` registration gap. All `*Panel.vue` and self-loading `*Section.vue` components correctly use `useEntityData(idRef, loader)` (backed by `watch(idRef, reload, { immediate: true })`). The pattern drift is minimal.

The real problem is narrower and different: **count snapshots in `usePersonPanelData` are never invalidated by mutations**, and **no chart component listens to `onDataChanged`**.

---

### `onMounted` sites in `*Panel.vue` and `*Section.vue` — full table

| File:line | Classification | Reason |
|-----------|---------------|--------|
| `EventList.vue:198` | **N/A** | `onMounted(loadSmartDefaultsSetting)` — reads a global DB setting once per mount. Not per-person data. Correct. |
| `PersonPanel.vue:529` | **partial** | `onMounted(() => { onDataChanged(() => checksSectionRef?.reload()) })` — wires a mutation listener but only for quality-checks reload. Does not refresh `eventCount`, `mapPointCount`, `relationshipCount`, `identifierCount`, `mediaCount`. |
| `HourglassChart.vue:490` `PedigreeChart.vue` `DescendantChart.vue` | **structural gap** | `onMounted(() => load())` combined with `watch(() => props.personId, load)` (no `immediate`). Needed for initial load. The gap: neither hook fires when event/relationship data changes for the same focal person. |

All other panels and sections — `PlacePanel`, `SourcePanel`, `RelationshipPanel`, `GroupPanel`, `ResearchTaskPanel`, `MediaPanel`, `PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `PersonRelationshipsSection`, `PersonTimeline`, `PersonMap` — use `useEntityData` or `watch(() => props.id, load, { immediate: true })`. **No broken `onMounted` data loads**.

---

### `onDataChanged` flow

`preload/index.ts` wraps every mutating IPC call in `mutating()`. After each call returns, it iterates `dataChangedListeners` and fires every registered callback. Covers creates, updates, and deletes for all domains.

**Who listens today:**
- `PersonPanel.vue:529` — one listener in `onMounted`, only calls `checksSectionRef.value?.reload()`.

**What is not covered:**
- Count refs in `usePersonPanelData` (`eventCount`, `mapPointCount`, `relationshipCount`, `identifierCount`, `mediaCount`) — set once in `loadPerson(id)`, never refreshed on mutation.
- `PersonsView.vue` — zero `onDataChanged` listeners. Chart components never redraw on event/relationship mutation.
- `PersonTimeline.vue` and `PersonMap.vue` — reload on `personId` change only; stale after same-person event mutation.

**Listener accumulation risk:** `onDataChanged` is push-only (`dataChangedListeners.push(cb)`). If `PersonPanel` is mounted multiple times in a session, the checks listener accumulates without cleanup. Not currently causing visible bugs but will compound once more listeners are added.

---

### Root cause of #29 (Händelser count stale)

`PersonPanel` template: `:count="eventCount"` on the Händelser `SectionHeader` (line 92). `eventCount` is a `ref` in `usePersonPanelData`, set inside `loadPerson()` wave-1 as `eventCount.value = events.length`. `loadPerson()` runs only when `personId` changes.

When the user adds an event via `EventList → EventModal`:
1. `events:create` IPC fires → `mutating()` invokes `onDataChanged` callbacks
2. `EventList.onSaved()` calls its internal `reload()` → `eventsData` ref updates
3. Nothing updates `eventCount` in `usePersonPanelData`

Count stays stale until navigation away and back.

**Fix:** Extract a `reloadCounts(id)` from `loadPerson()` wave-2 (the parallel `events.forPerson`, `relationships.getForPerson`, `persons.getIdentifiers`, `media.forEntity` calls). In `usePersonPanelData`, register an `onDataChanged` listener that calls `reloadCounts(personId.value)` debounced at ~150ms.

---

### Root cause of #37 (tree doesn't refresh after event edit)

`PersonsView.vue`'s `reloadChart()` (which bumps `chartKey` and refetches focal-person data) is called from: `@relative-added`, `@person-changed`, `@reload` (chart-internal), context-menu add/delete. None of these fire when an event is edited via `EventList → EventModal`.

`EventList.onSaved()` calls `reload()` (own data) — no emit bubbles up. `PersonPanel` has no hook that calls `reloadChart()` for event mutations. `PersonsView` has no `onDataChanged` listener.

`HourglassChart` (and Pedigree/Descendant) have `:key="'hourglass-' + chartKey"` — a full remount + re-fetch when `chartKey` changes. This is the right mechanism; it just isn't triggered.

**Fix:** In `PersonsView.vue` inside `onMounted`, add:
```typescript
(window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(reloadChart);
```
One line. `reloadChart()` already does the full remount + refetch.

---

### Concrete fix list (prioritized)

**Phase 2 — priority 1 (fixes Ben's actual bugs):**

1. `usePersonPanelData.ts` + `PersonPanel.vue` — **#29:** Add `reloadCounts(id)` extracted from wave-2 of `loadPerson()`. Register a debounced `onDataChanged(() => { if (personId.value) reloadCounts(personId.value); })` listener inside the composable. Replace the existing `PersonPanel` `onMounted` listener with a call to a unified handler (counts + checks).

2. `PersonsView.vue` — **#37:** Add `onDataChanged(reloadChart)` in `onMounted`. Add `offDataChanged(reloadChart)` in `onUnmounted` once the preload supports it (see item 3).

3. `preload/index.ts` — Add `offDataChanged(cb: () => void)` that splices the listener out. Required to avoid listener accumulation across panel/view mount cycles.

**Phase 2 — priority 2:**

4. `PersonTimeline.vue` and `PersonMap.vue` — Add a debounced `onDataChanged(() => load())` listener so timeline and map update on same-person event mutation. Needs the `offDataChanged` fix first.

**Phase 3 (separate):**

5. `HourglassChart.vue`, `PedigreeChart.vue`, `DescendantChart.vue` — Add a `refetch()` method that reloads data in-place without remounting (preserves zoom/scroll). Currently `reloadChart()` in PersonsView remounts via `chartKey` increment.

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
- [x] Convert each broken `onMounted` to `watch(() => props.X, load, { immediate: true })` — audit found this was a non-issue; only fix needed was around `onDataChanged` registration
- [x] Ensure section counts (the `(n)` in panel section headers) come from a reactive source, not a snapshot taken on first load — `usePersonPanelData` now exposes `reloadCounts()` and registers a debounced `onDataChanged` listener
- [x] Re-fetch tree data on `onDataChanged` if any of (persons, relationships, events, person_names) changes for the focal person or their immediate family — `PersonsView.vue` registers `onDataChanged(reloadChart)`
- [x] Add `offDataChanged` to preload + listener cleanup in `PersonPanel`, `PersonsView`, `PersonTimeline`, `PersonMap`
- [x] **Phase 2 complete** — shipped in v0.162.7

### Phase 3 — Tree refresh (#37)
- [x] When event mutations land for the tree subject, refetch tree data — `PersonsView.refreshChart()` now calls `chartRef.refetch()` from the debounced `onDataChanged` listener (was `reloadChart()` which bumped `chartKey` and remounted)
- [x] Add a stable cache key so PedigreeChart/HourglassChart/DescendantChart re-renders without losing scroll/zoom unless data changes — each chart now exposes a `refetch()` method that reloads data in place; the `chartKey`-driven remount stays for hard reloads (focal person change). Zoom is preserved by `useChartZoom` (localStorage-backed); scroll survives because the scrollable DOM container persists; collapse state survives because `keepView` skips the reset
- [x] **Phase 3 complete** — shipped in v0.167.0

### Phase 4 — Indirect events on timelines (#31)
- [ ] Investigate `getTimeline(personId)` and report-side timelines
- [ ] Add: spouse death events, child birth events, child death events
- [ ] Constraint: only include events that fell within the subject's lifetime — or include posthumous child birth as Ben suggested? **Decision:** include child births posthumous-up-to-9-months (covers postpartum births), exclude later. Drop spouse death after subject's own death.

### Phase 5 (optional) — Mini family tree on Add Member (#32)
- [ ] Mock a small visualization in PersonModal when in `relatedTo` mode showing the 5 button positions around the central person
- [ ] Lågprio per Ben — defer if Phase 1–4 already runs long

## Out of scope
- Full reactivity refactor (Pinia-driven cache, etc.) — too big for this round
- Sibling subtype (already declined)

## Verification
- Add an event → panel section count updates without view switch
- Edit the tree subject's birth → tree re-renders with new dates
- Open timeline → see spouse and child events alongside subject's own
- Add Family Member → if Phase 5 lands, see mini tree; otherwise five buttons stay as-is

## Notes
This plan deliberately starts with audit because Ben's reports point at symptoms, not causes. Don't fix #29 in isolation — find the others first.

# Place Timeline section — Design

## User goal

When I open a place panel, I see every event that happened at this place laid out chronologically — same dots, same gaps, same dated/undated split, same approximate-date affordances as a person's life timeline — focused on what happened at this place instead of what happened to a person.

This closes the only structural mirror gap between PersonPanel and PlacePanel: today PlacePanel has a chronological **media** strip but no chronological **events** view. The Events section already shows the same rows in date order in a table; this section makes the rhythm of the place visible — clusters, gaps, eras — at a glance.

## Scope

A single new section on PlacePanel: **Timeline**, mirroring `PersonTimeline.vue`.

In scope (the full pattern instance set for this change):

- New component `src/renderer/components/PlaceTimeline.vue` — a literal mirror of `src/renderer/components/PersonTimeline.vue` with the person ↔ place axis swapped.
- Section wiring in `src/renderer/components/PlacePanel.vue`, inserted between **Events** and **Citations** (matching PersonPanel's Events → Timeline ordering).
- i18n keys in both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`:
  - `placeTimeline.empty` — empty-state message
  - `placeTimeline.undated` — separator label
  - `placeTimeline.gap` — gap-marker label (with `{years}` interpolation)
- New entry in `docs/UX_INVENTORY.md` for **PlacePanel → Timeline section**, mirroring the PersonPanel → Timeline entry, with `Verified: 2026-05-02`.
- Component test `tests/components/place-timeline.test.ts` that asserts the rendered structure (dated/undated buckets, dot per event, gap markers on >20-year jumps) — observes the user goal, not just "function exists."

### Scope deviations

- **RelationshipPanel does not get a `RelationshipTimeline` section in this scope.** RelationshipPanel is the third event-host panel and structurally could host the same section, but a relationship is not a primary research entity in this app — researchers don't open a marriage and ask "show me the chronology of this couple's events" the way they ask the same of a person or a place. The relationship is a join, not a subject. If that mental model changes, a follow-up plan can mirror this work. Until then, leaving it out is a deliberate choice, not an oversight.

## Verification

- **User-observable check (manual smoke):** open a place with a half-dozen events spanning varied dates (e.g. a parish that hosts births / marriages / deaths over a couple of centuries) and confirm:
  1. The Timeline section renders below the Events section, default-collapsed.
  2. Expanding it shows the events on a vertical rail with the same dots, date column, badges, and dashed/italic affordance for approximate dates as `PersonTimeline.vue`.
  3. Gaps of >20 years between consecutive dated events render the dashed gap segment with the `{years}` label.
  4. Undated events appear under the same separator + label pattern.
  5. Clicking a row opens `EventModal` standalone with that event prefilled — same edit path as the Events section.
  6. The `+ Event` chip in the section header invokes the same add flow as the Events section's `+ Add event` button (no second authoring path).
  7. After saving an event in `EventModal`, the Timeline reflects the change without a panel close/reopen — `useEntityData` is auto-subscribed to `onDataChanged`.

- **Automated check:** `tests/components/place-timeline.test.ts` mounts `PlaceTimeline.vue` against a fake events fixture (mix of dated, undated, approximate, >20-year gap) and asserts the rendered DOM contains:
  - One `.timeline-entry` per fixture event in chronological order.
  - A `.timeline-gap` with the expected `{years}` label between two events ≥ 20 years apart.
  - The undated bucket renders only the undated fixture events under `.timeline-undated`.
  - Per-event-type dot class matches the event type (`dot-birth`, `dot-marriage`, etc.).
  - Person-name slot is populated for events with participants (verifies the place ↔ person axis swap).

- **What is NOT verification on its own:** lint passing, type-check passing, "the function exists." Those are hygiene gates the rest of the codebase already enforces; they do not observe the user goal.

## Component shape

### Row content

```
[ date ]  ●  [ event-type badge ]  [ person name(s) ]  [ description ]  [ citation count ]
```

- **date column** — 64 px right-aligned, tabular-nums, italic for approximate types (`about` / `before` / `after` / `between` / `calculated`).
- **dot** — colored per event type (`dot-birth`, `dot-death`, `dot-baptism`, `dot-burial`, `dot-marriage`, `dot-name_change`, default), dashed border for approximate.
- **event-type badge** — `eventTypes.<type>` i18n key (existing).
- **person name(s)** — substitutes the `timeline-place` slot from `PersonTimeline.vue`. One row = one event; for events with multiple primary participants (e.g. marriage), render both joined: `Anders Eckerström & Greta Lindström`. Plain text — no inline link in this iteration. Clicking anywhere on the row opens `EventModal`.
- **description** + **citation count badge** — identical to PersonTimeline.

### Person-only concepts dropped

- **Age column** — meaningless when the host is a place.
- **Family-tier rendering** (`timeline-family-name`, `timeline-relationship`, `is-family` styling) — every event at a place is "of the place"; there is no subject/family distinction.
- **Birth-first / death-last sort priority on same-date ties** — person-specific.

### Behaviour

- **Default-collapsed section** under PlacePanel, sandwiched between Events and Citations.
- **`+ Event` chip in section header** → invokes the same add flow the Events section uses. No second authoring path.
- **Click an entry** → opens `EventModal` standalone with the event prefilled.
- **Gap indicator** on >20-year jumps between consecutive dated events (same threshold as PersonTimeline; can be revisited if real-world data shows it's noisy on long-lived places, but mirroring is the explicit choice this iteration).
- **Dated / undated split** with the same horizontal separator and uppercase label.
- **Empty state** via `SectionEmpty` with `placeTimeline.empty`.

### Data path

- Loader: `useEntityData(toRef(props, 'placeId'), id => window.api.places.getEvents(id))`.
- This is the same call the Events section already makes. The Timeline is strictly a derived chronological re-render of the same rows — no new IPC channel, no API changes, no new data shape on the worker.
- `useEntityData` auto-subscribes to `onDataChanged`, so adds / edits / deletes from the Events section (or anywhere else — modal, MCP) reflect here without a panel close/reopen.

### Data-model alignment

Places do not own events in this codebase. Events live on persons (and on relationships) and reference a place via `place_id`. The Timeline pivots the query axis without changing that — it asks "what events have `place_id = this place`?" exactly like the Events section. The data model stays GEDCOM-friendly; the Timeline is purely a presentation layer.

## Section ordering on PlacePanel

After this change:

1. Place
2. Persons
3. Events
4. **Timeline** ← new
5. Citations
6. Media
7. Media Timeline
8. Quality
9. Address
10. Hierarchy

This matches the relative position of Timeline on PersonPanel (immediately after Events).

## Failure modes / RCA reference

Not applicable — no prior failed attempt. A class of mistake to avoid (called out explicitly so the implementer doesn't drift):

- **Do not introduce a new IPC channel for "place timeline."** The Events section already loads exactly the rows we need; a parallel data path would diverge over time. Use `places.getEvents` and `useEntityData`.
- **Do not duplicate authoring affordances.** PersonTimeline routes its `+ Event` chip back to the canonical Events section flow rather than opening its own modal; PlaceTimeline must follow the same rule. A second add-path is anti-consistency.
- **Do not persist any inferred field on the place row to support this view** (e.g. don't denormalize a `last_event_year`). The Timeline computes everything at render time from the events query result. Per the Prime Directive in `CLAUDE.md`.

## Open follow-ups (NOT in this scope)

- **B-mode (place-as-biography).** The bigger conversation about single-place research — residents-over-time, household / cohabitation views, place-level research tasks, place-level sources — is deliberately deferred to a separate session per the user's choice. This Timeline section is the small consistency win that lands first; the biography reshape builds on it.
- **PlacePanel section Purpose sentences.** Several entries in `docs/UX_INVENTORY.md` for PlacePanel sections are still `_TBD — needs user-stated intent_`. Inventory hygiene; can be filled in by the user as those sections are touched.

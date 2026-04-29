# Plan: Bengt feedback — events bundle (sort order setting + date ranges)

**Date:** 2026-04-29
**Status:** planned
**Source:** `BENGT.md`
**Effort:** S–M

## Background
Three remaining event-related items that don't fit elsewhere: a default-sort-order setting (alpha vs canonical), date-range UI for events that span time, and the indirect-events question (split with reactivity plan).

## Tickets covered
- BENGT #1 / #3 (sort order setting) — Add a `default settings` toggle for event-type list ordering. Default: alphabetical
- BENGT #28(a) — Add `date_value_end` UI for events that span time: residence, education, occupation, military, travel
- BENGT #28(f) / #31 — Sons/Dotters födelse + spouse death on event timelines (cross-references with reactivity plan)

## Tasks

### Phase 1 — Sort-order setting (#1)
- [ ] Add `event_type_sort` to `db_settings` (per-database setting): `'alphabetical' | 'canonical'`, default `'alphabetical'`
- [ ] [src/renderer/views/SettingsView.vue](../../src/renderer/views/SettingsView.vue) Defaults tab — add radio toggle "Sorteringsordning för händelsetyper"
- [ ] In every component that renders an event-type select, read the setting and sort accordingly
  - `EventModal.vue` "..." dropdown
  - PersonPanel and event filters wherever event_type lists appear
- [ ] Default `'alphabetical'` matches Bengt's preference; `'canonical'` preserves the order in `EVENT_TYPE_VALUES` for users who prefer chronological/logical order

### Phase 2 — Date-range UI for span events (#28a)
- [ ] Schema already supports `date_value_end` per CLAUDE.md events table
- [ ] [src/renderer/components/modals/EventModal.vue](../../src/renderer/components/modals/EventModal.vue) — when `event_type` is in `SPAN_EVENT_TYPES = ['residence', 'education', 'occupation', 'military', 'travel']`, show a second `DateInput` for end date
- [ ] When `date_type === 'between'`, end date is required (existing logic)
- [ ] For span events with single-date input, the field is `Slutdatum (valfritt)` and stores to `date_value_end`
- [ ] Update event display in panels and reports to render `start – end` for span events with end date set

### Phase 3 — Indirect events on timelines (#28f, #31)
**Move this to the reactivity plan.** It's a timeline rendering question, not an EventModal change. See [2026-04-29-bengt-reactivity.md](2026-04-29-bengt-reactivity.md) Phase 4.

## Out of scope
- "Travel" event type doesn't yet exist in `EVENT_TYPE_VALUES`. Either add it (1-line) or use existing `other` with description. **Decision:** add `travel` to the enum since Bengt explicitly named it
- Multi-period events (e.g., multiple residences with same address). Out of scope — each is its own event row

## Verification
- Settings → Defaults — toggle alpha/canonical, see EventModal dropdown reorder
- Add a Bostad event — see start + end date inputs
- Save with both dates — event displays "1972-03 – 1985-06" in PersonPanel
- Saved event without end date — displays "1972-03" only

## Decisions taken
- Default sort: alphabetical
- Span event types: `residence, education, occupation, military, travel` — add `travel` to EVENT_TYPE_VALUES
- Don't auto-derive parent/child events; they are computed on timeline render in the reactivity plan

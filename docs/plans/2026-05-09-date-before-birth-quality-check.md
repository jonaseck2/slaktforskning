# Plan: Quality check — events dated before the person's birth

**Date:** 2026-05-09
**Status:** planned
**Source:** Beta tester report 93 #1 (May 7 batch)
**Effort:** S

## User goal

When a researcher saves an event whose date precedes the focal person's birth date — say a name event dated before the person was born — the app warns them at save time and surfaces the row in the Quality view so they can reconcile it later. The warning never blocks the save (genealogy frequently has provisional or contradictory data the user wants to keep while they research it), but it doesn't let the inconsistency disappear silently either. The user owns the data; the app keeps it visible.

This complements report 93 #2 (age column on every timeline row) — when an event is before-birth, the timeline already shows a negative age, but a *positive* quality signal at save time and a discoverable Quality row are what move the issue from "interesting visual quirk" to "thing I will fix."

## Scope

- `src/api/checks/` — quality engine modules (existing pattern)
- `src/api/events.ts` — `createEvent` / `updateEvent` to surface a warning return value
- `src/renderer/components/EventModal.vue` and `PersonNameModal.vue` (and any other modal that creates events linked to a person) — show the warning toast at save time
- `src/renderer/views/QualityView.vue` — already auto-renders any check the engine reports, so no Quality-view code change beyond adding the new check to the registry

**Scope deviations:**
- Forward symmetry: events dated *after* the person's death also deserve the same check (event after death). Bring this into scope as a sibling check — same plan, two adjacent rules. Report 93 only mentions before-birth, but the symmetric case is one extra branch and avoids a follow-up plan.
- Date-only ranges (`date_type = 'between'`) — flag if the *latest* of the two dates is still before birth. Same logic for after-death using the *earliest*.
- Approximate / about / before / after / calculated dates — flag at the same threshold as exact, treating the ISO `date_value` as the comparison point. Confidence-aware suppression is out of scope; if the user marks an event as `calculated`, the warning still fires because the *math* is suspect even if the date itself is signposted.

## Behaviour spec

### Quality check definition

New check id: `event_outside_lifespan` (covers both before-birth and after-death).

Per row produced:

- `entity_type`: `'event'`
- `entity_id`: event id
- `severity`: `'warning'` (informational; not blocking)
- `kind`: `'event_outside_lifespan'`
- `subkind`: `'before_birth'` | `'after_death'`
- `message`: localised — `'Händelse {event_type} daterad {event_date} ligger före {person_name}s födelse ({birth_date})'` / mirror in EN
- `links`: person id + event id + (relevant: birth/death event id)

The check runs whenever an event has a non-null `date_value` AND the participating person has a `birth` event with a non-null `date_value` (for before-birth) or a `death` event with a non-null `date_value` (for after-death). All participants are checked, not just the primary — so a witness recorded after their own death is also flagged.

### Save-time toast

Both `EventModal.vue` and `PersonNameModal.vue` (and any other event-creating modal) call a small `runEventQualityChecks(event, participants)` helper after a successful save. If the helper returns ≥1 warning, a non-blocking toast appears:

```
⚠ {N} kvalitetsvarning(ar). Se Kvalitet-vyn.
```

(Toast uses the `warning` semantic style from `tokens.css`. It's dismissable; it doesn't move focus.)

### Quality view

No change beyond adding the check to the registry. Each row links to the involved entities so the user can navigate to the panel and reconcile.

### What "before birth" means precisely

`date_value` (ISO or partial ISO) is compared lexicographically when both have year-month-day; otherwise compared at the available granularity. `1944-01-01` is before `1944-06-15`; `1944` (year-only) is treated as before `1944-06-15` only if there's reason to be conservative — for the *warning* we want false positives over false negatives, so `1944` < `1944-06-15` for the purpose of triggering the check. Document this in the helper's JSDoc.

`date_type = 'about'` — still compared at the value's granularity. The user can dismiss the row in Quality view with a per-row mute (a future affordance, not in this plan; if mute lands later, this check is the first consumer).

### Birth-event resolution

For a person, the "birth date" is the `date_value` of the event of `event_type = 'birth'` where the person is `event_participants.role = 'primary'`. If multiple `birth` events exist (rare but possible — typed-twice mistakes), use the earliest. If none exists, the check does not fire (we don't fabricate a birth date).

Same for death: `event_type = 'death'`, role = primary, latest if multiple.

## Tasks

### Phase 1 — Engine

- [ ] Add `src/api/checks/event_outside_lifespan.ts` following the existing check module shape (look at e.g. `src/api/checks/missing_*.ts`). Emit one row per (event, person, direction) tuple.
- [ ] Wire into the master check registry. Auto-runs on `runChecks(db)`.
- [ ] Unit tests: `tests/unit/checks-event-outside-lifespan.test.ts` covering: before-birth, after-death, no birth recorded, no death recorded, year-only vs full-date comparison, witnesses + participants.

### Phase 2 — Save-time helper

- [ ] `runEventQualityChecks(db, eventId)` helper in `src/api/checks/index.ts` — runs only the checks that apply to a single event. Returns the rows.
- [ ] Expose via IPC channel `checks:runForEvent` (extend `src/shared/channels/checks.ts`).
- [ ] Add to preload + static-api stub.

### Phase 3 — Modal hooks

- [ ] `EventModal.vue`: after a successful `events.create` / `events.update` call, invoke `window.api.checks.runForEvent(eventId)`. If non-empty, show a `warning` toast via the existing toast composable. Don't block the close.
- [ ] `PersonNameModal.vue`: same hook (a name event is an event).
- [ ] Any other modal that creates events with a date — sweep `grep -rn 'events.create\|events.update' src/renderer/`.

### Phase 4 — i18n

- [ ] `checks.eventOutsideLifespan.beforeBirth` — message format
- [ ] `checks.eventOutsideLifespan.afterDeath` — message format
- [ ] `checks.eventOutsideLifespan.toastSummary` — `'{N} kvalitetsvarning(ar)'`
- [ ] EN parity

### Phase 5 — Verify Quality-view rendering

- [ ] Mount QualityView with a fixture DB containing one before-birth and one after-death event. Both rows render with the expected message and links.

## Verification

User goal: "When I save an event before the person was born, I see a warning at save and a row in Quality."

1. **Smoke test (mandatory).** Create a person, give them a birth event in 1944. Add a name event dated 1943. Click Save. A warning toast appears. Open Quality view — a row reads "Namn 1943 ligger före personens födelse 1944". Click the row → navigates to the person panel with the Quality section expanded.
2. **Smoke test, after-death symmetry.** Same person; record death 1980. Add a `description` event dated 1985. Save. Warning fires. Quality row appears.
3. **Vitest** unit tests on the check module — 6+ scenarios.
4. **Component test** on `EventModal.vue` — saving a before-birth event triggers the toast.

## Failure modes / RCA reference

The Prime Directive: this check is *informational*, not corrective. It does not modify the saved event. It does not "fix" the date. It does not silently re-classify the event type. The user authored the date; the app's job is to make the inconsistency visible, not to second-guess the author. A future temptation might be "auto-flip date_type to `calculated` when before-birth" — that is an authored-data violation. Reject in review.

The check engine pattern already exists; the new check is additive. The risk vector is the save-time hook in modals — make sure it's added to *every* event-creating modal in the same change (component-level all-or-nothing rule). Failure mode: the warning fires from `EventModal` but not `PersonNameModal`, leaving a category of events silently unchecked.

## Notes

- Confidence-graded suppression (e.g., a `calculated` date with the user's "I know this is before birth and that's the point" override) is a future addition. Today the check is one-shot; if real annoyance surfaces, add a per-row mute via a small `quality_mutes(check_id, entity_id)` table — but only if the user asks for it.
- This plan is a sibling of the timeline kin-event labelling plan ([2026-05-09-timeline-kin-event-labelling.md](2026-05-09-timeline-kin-event-labelling.md)), which makes the same edge case visible *visually* (negative age column). Pair-shippable.

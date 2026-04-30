# Plan: Bengt feedback — names rework

**Date:** 2026-04-29
**Status:** planned
**Source:** `BENGT.md`
**Effort:** M–L (data model + UI + display logic)

## Background
Bengt has six tickets touching names. Two earlier rounds already landed (`name_change` type added, alphabetical sorting). This plan covers the rest: display logic shifts from "starred preferred name" to "newest by validity date", with manual reorder for ranking ties.

## Tickets covered
- BENGT #11 — "Namn" button stays. Newest = displayed. Add `Namnändring` (already in enum as `name_change`) with default values pre-filled from previous newest
- BENGT #16 — Newest name = displayed (auto, not user-toggleable). Birth name auto-pulls date_from from birth event. Allow up/down ranking for ties. Prevent invalid date orderings
- BENGT #17 — Rename name type "married" / "Gift man" → "Vigselnamn"
- BENGT #18 — **Skip.** Inline qualifier chars (`&%*!`) not adopted; keep structured `name_qualifier` field
- BENGT #19a — **Skip.** Stavningsvariant and Stavning vid dödsfallet — Bengt himself flagged as "krångligheter" and walked back. Stavningsvarianter belong in the `notes` field per current workflow.

## Tasks

### Phase 1 — Data model
- [x] No new name types (Stavningsvariant dropped from scope)
- [x] No schema migration needed (sort_order column already exists per CLAUDE.md person_names schema)
- [x] Confirm `preferred_name` column can be deprecated (still exists in schema for backward-compat — leave column, stop reading it)

### Phase 2 — Display logic
- [x] [src/api/persons.ts](../../src/api/persons.ts) — when `getPerson` joins to person_names, return the *displayed* name as the one with the latest non-null `date_from`, falling back to highest `sort_order`. Document the rule.
- [x] If birth event exists, the birth name's effective `date_from` is the birth event's date, regardless of stored value. Encode this in the join logic.
- [x] Update all callers that previously prioritized `preferred_name = 1` — `searchPersons`, `listPersons`, etc.

### Phase 3 — UI in `PersonNamesTable` and `PersonNameModal`
- [ ] Remove the star (preferred_name toggle) from the table
- [ ] Add ▲ / ▼ reorder buttons (matching media-reorder pattern in `PersonMediaSection`)
- [ ] Show `Datum (giltig from)` column visibly; sort the table by this column descending
- [ ] When user moves a dated row past another dated row in a way that creates a younger-before-older inversion, block with toast "Ett yngre datum kan inte placeras före ett äldre"
- [ ] Birth name row: render `date_from` as readonly, sourced from birth event (if any)

### Phase 4 — `PersonNameModal` flow
- [ ] When user adds a new name with type `name_change`, prefill given_name + surname from the current newest name
- [ ] Show a `date_from` field for `name_change` type
- [ ] Same prefill behavior for `married` (rename label to "Vigselnamn")

### Phase 5 — i18n
- [ ] `nameTypes.married` → "Vigselnamn"
- [ ] Sort modal type dropdown alphabetically by translation

## Out of scope
- Inline qualifier chars `&%*!` (#18) — explicit skip
- Smeknamn-as-tilltalsnamn-default setting (#18 sub-item) — explicit skip
- Migration of existing `preferred_name=1` rows — they remain in DB, just stop being read

## Verification
- Add a person with birth name only — display name = birth name
- Add `married` name with date_from later than birth — display switches to married
- Add `name_change` later still — display switches to that
- Reorder undated names with ▲/▼ — order persists
- Try to move a younger-dated name above an older — blocked with toast

## Decisions taken
- **No star.** The displayed name is automatic.
- **Date precedence over sort_order.** sort_order only resolves ties between undated entries.
- **Skip inline qualifiers.** Bengt asked, then walked it back ("Jag vet inte om det här är bra").

# Plan: Ben feedback — label tweaks

**Date:** 2026-04-29
**Status:** done (v0.162.6)
**Source:** `BEN.md`
**Effort:** XS (single PR, i18n-only changes)

## Background
Ben's feedback round contains a cluster of small label/i18n nits. Bundle into one tiny PR — one concern, one commit.

## Tickets covered
- BEN #6 — "Omnämning" → "Omnämnande" (or "Omnämnande i press etc")
- BEN #12/#26 — "Anteckningar" → "Bildtext" inside MediaPanel
- BEN #20 — "Källa (valfritt)" → "Källa" (drop "valfritt")
- BEN #28(c) — "..." quick-pick button → "Övriga händelser"
- BEN #28(e) — Pension → Pensionering, Medborgarskap → Nytt medborgarskap, Yrke → Yrke/Anställning
- BEN #30 (label part) — "Platser" → "Plats" on single-place event modal
- BEN #33 — "Orsak" → "Dödsorsak" (only the death-event label)

## Tasks
- [x] `src/renderer/i18n/sv.ts` — `eventTypes.mention` already reads "Omnämnande"; verified.
- [x] `src/renderer/i18n/sv.ts` — update event type labels: `retirement` → "Pensionering", `naturalization` → "Nytt medborgarskap", `occupation` → "Yrke/Anställning". (English left unchanged — already descriptive.)
- [x] `MediaPanel.vue` — section heading switched to a new `media.caption` key ("Bildtext" / "Caption").
- [x] `EventModal.vue` — `events.addSourceOptional` rewritten to "Källa" (drop "(valfritt)").
- [x] `EventModal.vue` quick-pick row — last button now reads `events.otherEvents` ("Övriga händelser" / "Other events").
- [x] `EventModal.vue` — single-place field uses `events.place` ("Plats") instead of the plural `places.title`.
- [x] `events.cause` rewritten to "Dödsorsak" (label is only rendered when event_type === 'death').

## Out of scope
- `Omnämnande i press etc` longer label (Ben's secondary suggestion) — keep concise
- Anteckningar elsewhere in the app — only rename inside MediaPanel; person/place notes stay "Anteckningar"

## Verification
- `npm run lint`
- Open MediaPanel, EventModal (death + non-death), CitationModal — visually verify each label
- Run `tests/unit` to catch any tests asserting on the old strings

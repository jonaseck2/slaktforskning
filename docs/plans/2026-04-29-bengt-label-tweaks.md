# Plan: Bengt feedback — label tweaks

**Date:** 2026-04-29
**Status:** planned
**Source:** `BENGT.md`
**Effort:** XS (single PR, i18n-only changes)

## Background
Bengt's feedback round contains a cluster of small label/i18n nits. Bundle into one tiny PR — one concern, one commit.

## Tickets covered
- BENGT #6 — "Omnämning" → "Omnämnande" (or "Omnämnande i press etc")
- BENGT #12/#26 — "Anteckningar" → "Bildtext" inside MediaPanel
- BENGT #20 — "Källa (valfritt)" → "Källa" (drop "valfritt")
- BENGT #28(c) — "..." quick-pick button → "Övriga händelser"
- BENGT #28(e) — Pension → Pensionering, Medborgarskap → Nytt medborgarskap, Yrke → Yrke/Anställning
- BENGT #30 (label part) — "Platser" → "Plats" on single-place event modal
- BENGT #33 — "Orsak" → "Dödsorsak" (only the death-event label)

## Tasks
- [ ] `src/renderer/i18n/sv.ts` — update `eventTypes.mention` to "Omnämnande"
- [ ] `src/renderer/i18n/sv.ts` + `en.ts` — update event type labels: `retirement` → "Pensionering", `naturalization` → "Nytt medborgarskap", `occupation` → "Yrke/Anställning"
- [ ] `MediaPanel.vue` — change Anteckningar section heading to use a "Bildtext" key
- [ ] `CitationModal.vue` / `EventModal.vue` — remove "(valfritt)" from Källa label
- [ ] `EventModal.vue` quick-pick row — last button label to "Övriga händelser" key
- [ ] `EventModal.vue` — Plats label singular when single place picker is shown
- [ ] `events.cause` i18n key — switch to dynamic "Dödsorsak" when event_type === 'death' (label binding already conditional on the field; just rename the key)

## Out of scope
- `Omnämnande i press etc` longer label (Bengt's secondary suggestion) — keep concise
- Anteckningar elsewhere in the app — only rename inside MediaPanel; person/place notes stay "Anteckningar"

## Verification
- `npm run lint`
- Open MediaPanel, EventModal (death + non-death), CitationModal — visually verify each label
- Run `tests/unit` to catch any tests asserting on the old strings

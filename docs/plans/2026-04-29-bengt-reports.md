# Plan: Bengt feedback — reports researcher info, page numbers, citations

**Date:** 2026-04-29
**Status:** planned
**Source:** `BENGT.md`
**Effort:** M

## Background
Three related strands in Bengt's #14b: researcher contact info on every report, page numbers in print output, and citation rendering checkboxes that "don't do much". `researcher_name` is already a `db_settings` key — extend it.

## Tickets covered
- BENGT #14b — Researcher info (name + address + phone + email) in db_settings, surfaced as report header/footer, with page numbers always
- BENGT #14b — GEDCOM SUBM contact fields populated from researcher info on export
- BENGT #14b — Investigate and fix citation rendering checkboxes in reports

## Tasks

### Phase 1 — Data model
- [ ] Extend `db_settings` keys: `researcher_address`, `researcher_phone`, `researcher_email` (alongside existing `researcher_name`)
- [ ] Optional: bundle into a single `researcher_info` JSON setting instead of four keys — preference: separate keys for simplicity and existing patterns

### Phase 2 — Settings UI
- [ ] [src/renderer/views/SettingsView.vue](../../src/renderer/views/SettingsView.vue) — add a "Forskarinformation" section near tree subject
- [ ] Fields: name, address (multi-line), phone, email
- [ ] Save via `window.api.db.setSetting`

### Phase 3 — Report header/footer
- [ ] New primitive: `src/renderer/components/reports/primitives/ReportHeaderFooter.vue`
  - Header (top of every page): system name "OurLegacy" + researcher name
  - Footer (bottom of every page): researcher email + page number ("Sida X av Y")
  - Use CSS `@page` margins + `position: running()` if Chromium supports; fallback to per-section repeating elements
- [ ] Integrate into all 7 keepsake reports + 5 framable charts (or just keepsake reports — framable prints are single-page and don't need it)
- [ ] Toggle in `ReportPanel.vue` Appearance section: "Visa sidhuvud/sidfot" (default on)
- [ ] Page numbers always on for print, optional in screen preview

### Phase 4 — GEDCOM SUBM linkage
- [ ] [src/api/gedcom-export.ts](../../src/api/) (find actual file) — when exporting, populate `SUBM` record's `NAME`, `ADDR`, `PHON`, `EMAIL` from researcher_* settings
- [ ] Existing `default_person_id` handling stays — that's the SUBJECT subject, not the SUBMITTER

### Phase 5 — Citation rendering audit
- [ ] Grep `citation` checkbox handling in `ALifeReport.vue`, `AMarriageReport.vue`, `PlaceChronicleReport.vue`, `LifeOnOnePageReport.vue`, `YourAncestorsReport.vue`
- [ ] Identify each checkbox in `useReportConfigStore`
- [ ] For each: trace what config flag is supposed to do and what the report renders
- [ ] Fix gaps — at minimum: per-event citation footnotes, citation appendix at end, sources list with full bibliographic info
- [ ] Document in this file under "Audit Results"

## Out of scope
- Cross-DB cherry-pick (#15) — declined
- Quality control persistent-ignore — separate plan if needed; current behavior already mostly covers this per CLAUDE.md

## Verification
- Open Settings, fill in researcher info — visible in next report preview
- Print/export a report — header/footer + page numbers visible
- Export GEDCOM — open in another tool, verify SUBM record has correct NAME/ADDR/EMAIL
- Toggle citation checkboxes in ReportPanel — see actual differences in rendered output
- Print an "A Life" report end-to-end — citation appendix visible if toggle on, hidden if off

## Decisions taken
- Researcher info goes in `db_settings` as four separate keys, not as one JSON blob
- Page numbers always on for print — not a user toggle
- Header/footer toggleable, default on

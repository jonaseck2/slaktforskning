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
- [x] Extend `db_settings` keys: `researcher_address`, `researcher_phone`, `researcher_email` (alongside existing `researcher_name`)
- [x] Optional: bundle into a single `researcher_info` JSON setting instead of four keys — preference: separate keys for simplicity and existing patterns

### Phase 2 — Settings UI
- [x] [src/renderer/views/SettingsView.vue](../../src/renderer/views/SettingsView.vue) — add a "Forskarinformation" section near tree subject
- [x] Fields: name, address (multi-line), phone, email
- [x] Save via `window.api.db.setSetting`

### Phase 3 — Report header/footer
- [x] New primitive: `src/renderer/components/reports/primitives/ReportHeaderFooter.vue`
  - Screen preview: in-flow header at top + footer at bottom of report content (hidden via `@media print` so PDF doesn't double-render)
  - PDF output: `displayHeaderFooter: true` with Chromium `headerTemplate`/`footerTemplate` strings injected by `print:exportPdf` (src/main/ipc/main-only.ts) — page number always printed when header/footer band is enabled
- [x] Integrate into all 7 keepsake reports (one `<ReportHeaderFooter>` per `.print-preview` wrapper in ReportsView)
- [x] Toggle in `ReportPanel.vue`: dedicated "Sidhuvud och sidfot" section above Options (default on, persisted to db_settings as `report_show_header_footer`)
- [x] Chart prints pass `showHeaderFooter: false` so framable single-page prints stay clean

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

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
- [x] [src/gedcom/exporter.ts](../../src/gedcom/exporter.ts) — populate `SUBM` record's `NAME`, `ADDR` (with CONT continuation lines), `PHON`, `EMAIL` from researcher_* settings
- [x] Disentangled SUBM (researcher) from `default_person_id` (proband). `default_person_id` is now used as the export fallback only when researcher_name is empty, preserving Holger round-trip compat. Import-side matching of SUBM NAME → person → `default_person_id` is unchanged (legacy convention from Holger files where SUBM stored the proband)
- [x] Unit tests: `tests/unit/gedcom-export-subm.test.ts` (5 cases)

### Phase 5 — Citation rendering audit
- [x] Grep `citation` checkbox handling in `ALifeReport.vue`, `AMarriageReport.vue`, `PlaceChronicleReport.vue`, `LifeOnOnePageReport.vue`, `YourAncestorsReport.vue`
- [x] Identify each checkbox in `useReportConfigStore`
- [x] For each: trace what config flag is supposed to do and what the report renders
- [x] Fix gaps — at minimum: per-event citation footnotes, citation appendix at end, sources list with full bibliographic info
- [x] Document in this file under "Audit Results"

## Audit Results

| Report | Toggle | Pre-fix behaviour | Post-fix behaviour |
|--------|--------|-------------------|--------------------|
| ALifeReport | `aLifeShowSources` | Title + author only | Title + author + publication_info + repository + URL + per-source pages list |
| AMarriageReport | `aMarriageShowSources` | Title + author only | Title + author + publication_info + repository + URL |
| PlaceChronicleReport | `placeChronicleShowSources` | Title + author only | Title + author + publication_info + repository + URL |
| YourAncestorsReport | `yourAncestorsShowSources` | Title + author only | Title + author + publication_info + repository + URL |
| LifeOnOnePageReport | (none) | No citation block — single-sheet keepsake intentionally compact | Unchanged — out of scope |

**Why Bengt felt "the toggle doesn't do much":** all four citation-bearing reports rendered the appendix as just `title · author`, throwing away `publication_info`, `repository`, `url`, and per-citation `page` from the underlying `Citation`/`Source` records. The toggle did flip a section on/off, but the section contained no research-trail detail.

**Fix:** enriched `CitationWithSource` (in `report_data.ts`) with `source_publication_info`, `source_url`, `source_repository`, and updated all four reports' appendix templates to render those plus per-citation pages where the data flows through. Each toggle now produces a visibly richer result.

**Deferred to a future plan:**
- Per-event inline footnote markers + numbered footnote block (would require a numbered citation registry shared across event/relationship/place sections).
- Citation `confidence`, `transcription`, `notes`, `date_accessed` — these are per-citation and would inflate the appendix; better surfaced via an inline-footnote view than a dedicated flag.
- LifeOnOnePageReport citation block — single-sheet keepsake, no natural place for an appendix.

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

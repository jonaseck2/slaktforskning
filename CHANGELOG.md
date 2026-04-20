# Changelog

## v0.131.0 — keepsake reports redesign

Complete redesign of the Reports view around family-facing keepsake narratives. See [plans/archive/2026-04-19-keepsake-reports-redesign.md](docs/plans/archive/2026-04-19-keepsake-reports-redesign.md) for full plan.

### New reports
- **A Life** (evolves Biography) — life map, visual timeline, family, events, notes, photos, sources appendix.
- **A Marriage** (evolves Family Narrative) — dual life map, shared timeline, couple, children grid, narrative, photos.
- **Place Chronicle** (evolves Place History) — boundary map, persons, events, description, photos, child places.
- **Your Ancestors** (evolves Ancestor Book) — fan chart cover, full-page fan, per-ancestor pages with ahnentafel, surname index.
- **Life on One Page** (new) — single framable sheet with portrait, map, key dates, photo grid, notes snippet.
- **Family in Year X** (new) — snapshot of everyone alive in a target year with family units.
- **Photo Album** (new) — chronological media gallery scoped to person / couple / place / all.

### Removed reports
- **Individual Summary** — redundant with `PersonDetailView`. Use A Life for the keepsake version.
- **Family Group Sheet** — redundant with `RelationshipDetailView`. Use A Marriage.
- **Ancestor Sheet** (tabular) — retired. A new **Pedigree Print** chart takes its place in the framable-prints group.

### Other changes
- New Settings field `researcher_name` powers report attribution ("Compiled by …").
- Reports view split into two tab groups: Keepsake reports + Framable prints.
- New design tokens: `--report-serif-stack`, `--report-prose-leading`, `--report-page-max-width`, `--report-cover-accent-height`.
- New `getAliveInYear(db, year)` API function + IPC channel + types (`AliveInYearPerson`, `AliveInYearFamily`, `AliveInYearResult`).
- New composables: `useLifeMap`, `useMediaChronological`.
- Six new print-safe shared primitives under `src/renderer/components/reports/primitives/`: `ReportCover`, `PersonMiniCard`, `TimelineBar`, `LifeMap`, `PlaceBoundaryMap`, `MediaChronological`.
- Privacy: identifiers unconditionally hidden for living persons; new per-report "Redact living persons" toggle replaces birth year with decade and hides notes/portraits of living persons.
- 14 new component smoke tests + 8 new E2E tests across the seven keepsake reports.

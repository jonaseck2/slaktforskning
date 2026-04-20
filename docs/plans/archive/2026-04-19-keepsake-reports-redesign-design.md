# Keepsake Reports Redesign

Date: 2026-04-19

## Context

Släktforskning's current Reports view offers seven reports: Ancestor Sheet, Family Group Sheet, Individual Summary, Ancestor Book, Person Biography, Place History, Family Narrative. The set evolved piecemeal and mixes two different audiences — researcher-facing data sheets and family-facing keepsakes. Meanwhile the app has accumulated rich new material (places with boundary overlays, media galleries per entity, life-path maps, visual timelines, fan/hourglass/descendant charts) that the existing reports barely use.

This spec redesigns the report set around a single audience — **family members of the genealogist** — and a single purpose: sharing the genealogist's life of research as keepsakes non-genealogists will actually want to read.

## Audience & principle

**Audience:** non-genealogist family members. Cousins, kids, the aunt who doesn't care about sources. Reports are heirloom artefacts: printed, framed, or handed down as PDFs. The researcher themselves and fellow genealogists are served by the app's own views — that is not the Reports view's job.

**Principle:** reports render what the genealogist authored. They do **not** infer historical context, generate narrative prose, or soften uncertainty with invented hedging language. If the genealogist wants rich storytelling in a report, they write prose into the entity's `notes` (directly, or with help from their own AI agent via MCP) and the report renders it verbatim.

The app ships polished, deterministic, visual-first baselines. Custom storytelling and advanced narrative work is done by the researcher + their agent using MCP, not built into the app.

## Scope

Seven reports in the final set (four evolved, three new) plus six framable chart prints (unchanged or lightly repurposed). Two existing reports are dropped because they duplicate the app's own detail views.

## Architecture

No architectural change. Each report remains a Vue component in [src/renderer/components/reports/](../../src/renderer/components/reports/), rendered by [ReportsView.vue](../../src/renderer/views/ReportsView.vue) using the existing preview → zoom → print → export-PDF pipeline. One-shot generation: pick subject, adjust options in the tab controls bar, preview, export. No persisted report workspace.

### New shared primitives

Print-safe Vue components under `src/renderer/components/reports/primitives/`:

| Primitive | Purpose | Used in |
|---|---|---|
| `LifeMap` | Map with a person's geocoded events drawn as a chronological path. Extends existing person-life-path logic. | A Life, Life on One Page, A Marriage (dual path) |
| `PlaceBoundaryMap` | Map with parish/municipality boundary overlay, tree-person pins, event markers. | Place Chronicle |
| `MediaChronological` | Chronological media gallery with captions and entity context. Print-safe. | Photo Album, A Life, A Marriage |
| `TimelineBar` | Visual horizontal timeline bars (per event or life span). Replaces today's text event list in reports. | A Life, A Marriage |
| `ReportCover` | Cover page: title, subtitle, hero image, researcher attribution, date. | All multi-page reports |
| `PersonMiniCard` | Portrait + name + dates + key place. | Your Ancestors, Family in Year X |

### New data function

One legitimate new `src/api/` function:

- **`getAliveInYear(db, year)`** — returns persons alive in year Y with age and place at that time, grouped by family unit. Backed by a single SQL query joining persons, birth events, death events, and place records. Avoids the N+1 that a renderer-side implementation would hit.

All other data needs are served by existing functions: `getPersonSummary`, `getFamilyUnit`, `getAncestorTree`, `getPlaceHistory`, `getEventsForPerson`, `getMediaForEntity`, plus the existing `usePlaceResolver` composable for render-time place resolution.

### New renderer composables

Under `src/renderer/composables/`:

- **`useLifeMap(personId)`** — wraps `getEventsForPerson` + place resolution + chronological sort. Powers `LifeMap` primitive.
- **`useMediaChronological(entityRef)`** — wraps `getMediaForEntity` + date-inference sort (inferred from linked events). Powers `MediaChronological` primitive.

### No new MCP tools

Existing MCP tools (`get_person_summary`, `get_family_unit`, `get_place_history`, `get_ancestor_tree`, plus direct SQL) already expose what agents need to build custom reports. Agent-authored reports are intentionally out of scope for this spec — the genealogist uses MCP + their agent to iterate on custom output.

### Per-report configuration

Options live in the tab controls bar. No persistence. Common options across reports:

- Paper size (A4 / Letter / A3 where applicable)
- Content toggles: photos · sources · notes · map · timeline
- Color mode: themed · bw · sex-colored · branch (using the existing chart pattern)
- Redact living persons (default off)

Report-specific options are noted in the report's own section below.

### Empty-section rule

If an entity has no notes, no media, or no events in a section — **hide the section silently**. Keepsake reports never say "No additional notes recorded" or "No events on record." Empty space is a signal to the reader that there's nothing to show; printed placeholder copy destroys the keepsake feel.

## The seven reports

### A Life *(evolves Biography)*

**Subject:** one person.

**Pages, in order:**
1. Cover — name, birth/death years, profile media, researcher attribution, date.
2. Life Map — `LifeMap` with chronological path and pins for each event.
3. Timeline — `TimelineBar` with life events as bars.
4. Family — parents, spouses (with marriage dates), children (with thumbnails).
5. Events — chronological list with place / date / description.
6. Biography — renders `Person.notes` verbatim as prose.
7. Photos — `MediaChronological` of images linked to the person.
8. Documents *(optional toggle)* — PDFs / non-image media linked to the person as thumbnails.
9. Sources *(optional toggle)* — back-matter appendix.

**Content detail:**
- **Media:** profile photo on cover; all images in chronological gallery; PDFs only if Documents toggle is on.
- **Charts:** small mini-pedigree on the Family page (parents + spouses + children, one generation each way). No full pedigree.
- **Timelines:** `TimelineBar` with bars for birth, marriage(s), children's births, death, plus any other dated events.
- **Places:** `LifeMap` — pin map with events connected chronologically as a path.

**Options:** paper size; content toggles (photos / documents / sources / map / timeline); color mode; redact-living.

### A Marriage *(evolves Family Narrative)*

**Subject:** one couple relationship.

**Pages, in order:**
1. Cover — both names, marriage year, family photo, attribution.
2. Dual Life Map — `LifeMap` with both partners' paths overlaid in two colors.
3. Shared Timeline — `TimelineBar` spanning marriage, children's births, joint events.
4. The Couple — two `PersonMiniCard`s side by side with key dates.
5. Children — grid with thumbnails, birth/death years.
6. Events — couple + family events chronologically.
7. Narrative — renders `Relationship.notes` verbatim as prose.
8. Photos — `MediaChronological` of media linked to couple + marriage event + children.
9. Sources *(optional toggle)*.

**Content detail:**
- **Media:** family photo on cover; portrait of each spouse on The Couple page; all media linked to the relationship + marriage event + each child's profile in the Children grid.
- **Charts:** small descendant diagram on the Children page (couple → children, one generation down).
- **Timelines:** single shared `TimelineBar` across the couple's joint history.
- **Places:** dual `LifeMap` — both paths in contrasting colors, pins highlighted where the paths overlap.

**Options:** paper size; content toggles; color mode; redact-living.

### Place Chronicle *(evolves Place History)*

**Subject:** one place.

**Pages, in order:**
1. Cover — place name, place type, date range covered.
2. Map — `PlaceBoundaryMap` with boundary overlay + tree-person pins.
3. Persons — everyone in the tree linked to this place, chronologically by first associated event.
4. Events at place — chronological.
5. Description — renders `Place.notes` verbatim as prose.
6. Photos — `MediaChronological` of media linked to the place.
7. Child places *(optional toggle)* — hierarchical breakdown (e.g. farms within a parish).
8. Sources *(optional toggle)*.

**Content detail:**
- **Media:** all media linked to the place, chronologically.
- **Charts:** none by default. Optional small hierarchy diagram of child places.
- **Timelines:** chronological event list with date labels. No `TimelineBar` — timeline bars don't read well across 300-year spans.
- **Places:** `PlaceBoundaryMap` with parish/municipality boundary overlay + pins for every tree-person who touched the place + child-place markers.

**Options:** paper size; boundaries on/off; child-places on/off; photos/sources toggles; color mode.

### Your Ancestors *(evolves Ancestor Book)*

**Subject:** one root person's ancestors to N generations.

**Pages, in order:**
1. Cover — fan chart as the cover visual, "N Generations of Ancestors of X."
2. Introduction — root person + scope statement.
3. Full fan chart — full-page.
4. Per-ancestor pages — one page (or half-page if two-per-page density) per ancestor:
   - Portrait · name · dates · key place.
   - Ahnentafel number (1, 2, 3, …).
   - `Person.notes` rendered as prose.
   - Optional: small event list (up to ~6 events).
   - Optional: 1-2 photos.
   - Optional: mini-pedigree showing this ancestor's line back to the root.
5. Surname index — list of surnames appearing in the book with page numbers.
6. Sources *(optional toggle)*.

**Content detail:**
- **Media:** portrait per ancestor; 1-2 extra photos per ancestor page if toggled on.
- **Charts:** fan chart (cover + full-page); optional mini-pedigree on each ancestor page.
- **Timelines:** short chronological event list per ancestor. No `TimelineBar` — too repetitive across many pages.
- **Places:** key place listed in the `PersonMiniCard` header. No full map per ancestor.

**Options:** generations (4–10); paper size; color mode (themed / branch / sex / bw); page density (one / two ancestors per page); per-ancestor toggles (events / extra photos / mini-pedigree).

### Life on One Page *(new)*

**Subject:** one person. Single framable sheet.

**Layout (single page):**
- Large portrait (top).
- Name + birth/death years (large).
- Key dates list (birth / marriage(s) / death / other).
- Small `LifeMap`.
- 3–5 photo grid.
- Short biography snippet (first paragraph of `Person.notes`, truncated with ellipsis).
- Researcher attribution + date (bottom).

**Content detail:**
- **Media:** one large portrait + 3–5 photo grid.
- **Charts:** none — too much for one sheet.
- **Timelines:** key-dates list only. No `TimelineBar`.
- **Places:** small `LifeMap` as one of the layout panels.

**Options:** paper size (A4 / A3 / Letter); orientation (portrait / landscape).

### Family in Year X *(new)*

**Subject:** a target year + a scope (whole tree, or ancestors/descendants of someone).

**Pages, in order:**
1. Cover — "Your Family in [year]" with a hero image.
2. Map — multi-person map showing where everyone was that year.
3. By family unit — each active family rendered with couple names + ages, children + ages, place at that time (if known).
4. Individual cards — `PersonMiniCard` for everyone alive in year Y.
5. Sources *(optional toggle)*.

**Content detail:**
- **Media:** hero image on cover (researcher picks, or auto-chosen from a media link dated near year Y); per-person thumbnails on cards.
- **Charts:** none by default. Optional family-unit diagram showing how the people present that year relate.
- **Timelines:** not applicable — this is a moment in time, not a span.
- **Places:** multi-person map grouped by family unit, showing where everyone was in year Y.

**Options:** year (required); scope (whole tree / ancestors of X / descendants of X); paper size; cover hero image (manual pick or auto); family-unit diagram on/off; redact-living.

**Data source:** new `getAliveInYear(db, year)` function.

### Photo Album *(new)*

**Subject:** a person, family, place, or the whole tree.

**Pages, in order:**
1. Cover — chosen cover photo + title (auto-generated from subject or manual).
2. Chronological media gallery — 1 / 2 / 4 photos per page. Each photo rendered with:
   - Caption from `Media.title` + `Media.notes`.
   - Date label if known (inferred from linked events).
   - Context line: who / what / where it's linked to.
3. Photo index *(optional toggle)* — list of photos with page numbers.

**Content detail:**
- **Media:** images only (JPEG/PNG) by default. Documents/PDFs/other file types skipped unless toggled on. All images from the chosen subject's linked media, respecting `media_links.sort_order` as secondary sort.
- **Charts:** none.
- **Timelines:** implicit chronological ordering. No `TimelineBar`.
- **Places:** each photo's caption line includes place context if the media is linked to a place.

**Options:** subject type (person / family / place / all); subject selector; paper size; photos per page (1 / 2 / 4); captions on/off; index on/off; documents toggle.

### Cross-cutting rules

- **Sources** always appear as a back-matter appendix when included, never inline as footnotes.
- **Notes prose** — whatever lives in `Person.notes` / `Relationship.notes` / `Place.notes` renders verbatim. No truncation except in Life on One Page (first paragraph only).
- **Media selection** — every media gallery respects the existing `media_links.sort_order`. First media = profile media / cover photo.
- **Video and audio media** are ignored in reports (no inline player in a PDF).

## Migration & cleanup

**Dropped** (redundant with the app's own detail views):
- `IndividualSummary.vue` — `PersonDetailView` covers the same ground; **A Life** is the keepsake version.
- `FamilyGroupSheet.vue` — `RelationshipDetailView` covers the same ground; **A Marriage** is the keepsake version.

**Repurposed:**
- `AncestorSheetReport.vue` → renamed `PedigreePrintReport.vue`, rewritten as a clean framable pedigree chart (boxes + lines, not a table). Joins the framable-prints group.

**Renamed** (behaviour evolves per the sections above):
- `PersonBiography.vue` → `ALifeReport.vue`
- `FamilyNarrative.vue` → `AMarriageReport.vue`
- `PlaceHistory.vue` → `PlaceChronicleReport.vue`
- `AncestorBookReport.vue` → `YourAncestorsReport.vue`

**New components:**
- `LifeOnOnePageReport.vue`
- `FamilyInYearReport.vue`
- `PhotoAlbumReport.vue`

**Kept unchanged (framable chart prints):**
- `FanChartReport.vue`, `DescendantChartReport.vue`, `HourglassChartReport.vue`, `TimelineChartReport.vue`, `PedigreeChartReport.vue`, `WallChartReport.vue`.

**Reports view UI:** the flat tab list becomes two chip groups:
- **Keepsake reports:** A Life · A Marriage · Place Chronicle · Your Ancestors · Life on One Page · Family in Year X · Photo Album.
- **Framable prints:** Pedigree · Fan · Descendant · Hourglass · Timeline · Wall Chart.

**i18n migration:**
- Removed keys: `reports.individual.*`, `reports.family.*` (Family Group Sheet keys, not Family Narrative).
- New namespaces: `reports.alife.*`, `reports.amarriage.*`, `reports.placeChronicle.*`, `reports.yourAncestors.*`, `reports.onePage.*`, `reports.familyInYear.*`, `reports.photoAlbum.*`, plus shared `reports.common.*` (cover chrome, attribution, pagination, empty-section labels).
- Both `sv.ts` and `en.ts` updated for every new key.

## Visual design

Minimal, print-first. Photos carry the personality; layout stays restrained so the data shines.

- **Typography:** serif stack for prose sections (biography / narrative / place description), existing sans-serif stack for names, dates, captions, and data. The contrast separates "story" from "facts." New design tokens in [tokens.css](../../src/renderer/styles/tokens.css): `--report-serif-stack`, `--report-prose-leading`.
- **Color modes:**
  - `themed` (default) — uses the app's active theme tokens.
  - `bw` — print-to-black-and-white.
  - `sex-colored` / `branch` — inherited from existing chart color modes where relevant.
- **Cover accent:** single tinted band using `--accent` on each report's cover.
- **Researcher attribution:** cover and page footer render *"Compiled by [researcher_name], [date]."* New db_setting `researcher_name`, editable in Settings → Database tab, falls back to the `default_person_id` person's primary name if unset.

## Privacy

- **Living persons (`living = true`)**: identifiers (personnummer, FamilySearch ID, etc.) are unconditionally hidden in reports regardless of settings.
- **Redact-living toggle** (per-report option, default off): when enabled, replaces birth years with decade (e.g. "born 1970s"), hides photos of living persons, and suppresses their notes.
- **Non-living persons**: no special handling beyond what the data provides.

## Testing

**Unit tests** in [tests/unit/report_data.test.ts](../../tests/unit/report_data.test.ts):
- `getAliveInYear(db, year)` — persons with known birth only, known death only, both, neither. Test edge cases: year of birth, year of death, inferred lifespan from events other than BIRT/DEAT.

**Component tests** in `tests/unit/components/reports/`:
- Smoke test for each new/renamed report: render with seeded test data, assert expected section presence, assert empty-section hiding.
- Snapshot-style test of the Reports view showing the two chip groups and all expected tabs.

**E2E test** in [tests/e2e/app.test.ts](../../tests/e2e/app.test.ts):
- Launch app, navigate to Reports, render each report with seeded person/family/place, trigger export-PDF, assert output file > 0 bytes.

**WCAG tests** in [tests/unit/wcagContrast.test.ts](../../tests/unit/wcagContrast.test.ts) continue to run unchanged; any new tokens must pass the existing contrast thresholds.

## Versioning

Single minor bump when complete: **`v0.130.0 — keepsake reports redesign`**. (v0.128.0 was taken by the wall chart rollup; v0.129.0 by quality checks expansion.)

No version bump during partial rollout. This is feature-sized work — one bump at the end when the full set ships. `CHANGELOG.md` entry lists new reports, removed reports, and migration notes for anyone who had integrations against the dropped components.

## Out of scope

Intentionally deferred or excluded:

- **Custom report authoring / Publishing Center** — persistent book workspace with saved covers, forewords, chapter ordering. The genealogist + their agent + MCP serve this need instead.
- **AI-generated narrative prose** — inferred historical context, generated biographies, softened hedging language written by the app. Reports render what the genealogist authored, nothing more.
- **Agent-authored custom reports** — the architecture does not preclude this, but designing an agent-report rendering pipeline is out of scope for this spec.
- **The Family Book as a built-in aggregate report** — composing multiple reports into a single bound PDF. Genealogist + agent + MCP can assemble this from individual report exports.
- **EPUB / HTML output formats** — PDF only in this spec.
- **Your Descendants report** — the fourth tier (C) from the scope discussion. Deferrable; implementable later using the same `PersonMiniCard` + per-descendant page pattern as Your Ancestors.
- **Report theme variants / decorative border kits** — restraint is the design direction. Visual personality comes from photos, not decoration.

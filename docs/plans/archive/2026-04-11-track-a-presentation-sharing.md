# Track A: Presentation & Sharing

Source: [competitor gap analysis](2026-04-11-competitor-gap-analysis.md)

Research tool that produces something worth sharing. Each milestone is independently shippable.

---

## A1: Narrative Reports [feature]

Person biography, place history, and family narrative reports as PDF with clickable source links.

### Steps

- [x] Create `src/api/reports/person_biography.ts` — assemble person data (names, events with places, relationships with partner/child names, citations) into a structured report object
- [x] Create `src/api/reports/place_history.ts` — all events at a place chronologically, with participants and dates
- [x] Create `src/api/reports/family_narrative.ts` — couple + children with key life events, marriage, sources
- [x] Create `src/api/reports/types.ts` — ReportData, ReportOptions, ReportSection types
- [x] Create HTML report templates with print-optimized CSS (reuse existing printable output patterns from ancestor chart/family group sheet)
- [x] Add prose generation utilities — event-to-sentence converters, date formatters for narrative text
- [x] IPC channel `reports:generatePersonBiography`, `reports:generatePlaceHistory`, `reports:generateFamilyNarrative`
- [x] Preload: expose `window.api.reports.*`
- [x] PDF generation via Electron's `webContents.printToPDF()` with clickable links preserved
- [x] Vue: ReportPreviewModal — shows HTML preview with "Save as PDF" button
- [x] Add "Generate Report" buttons to PersonDetailView, PlaceDetailView
- [x] i18n: Swedish + English prose patterns for narrative text
- [x] MCP tool `generate_report` — returns report HTML or structured data for agent-driven generation
- [x] Unit tests for report data assembly functions
- [x] Test PDF link generation

### Dependencies
None — uses existing API functions.

### Key decisions
- Reports are HTML-first, converted to PDF — this gives us clickable links and consistent rendering
- Prose patterns are i18n-driven, not hardcoded English
- MCP tool returns structured data (not PDF) so agents can further process it

---

## A2: Export Content Options [feature]

Configuration UI for what goes into exports. Shared infrastructure across PDF reports and GEDCOM exports.

### Steps

- [x] Create `src/api/export_options.ts` — ExportOptions type: `{ excludeLiving: boolean, includeMedia: boolean, includeNotes: boolean, includeSources: boolean, branchFilter?: { personId: string, direction: 'ancestors' | 'descendants' | 'both', generations?: number } }`
- [x] Create `filterPersons(db, persons, options)` — applies living exclusion
- [x] Create `filterByBranch(db, personId, direction, generations)` — returns set of person IDs in scope
- [x] Integrate into GEDCOM export (`src/api/gedcom/export.ts`) — filter entities before writing
- [x] Integrate into report generation (A1) — pass options through
- [x] Vue: ExportOptionsPanel.vue — reusable component with checkboxes and branch picker (uses PersonPicker)
- [x] Embed ExportOptionsPanel in GEDCOM export dialog
- [x] Embed ExportOptionsPanel in report generation UI
- [x] Store last-used options in db_settings via `setDbSetting(db, 'export_options', JSON.stringify(...))`
- [x] IPC channels for getting/setting export options
- [x] Unit tests for filtering logic — especially living person exclusion edge cases
- [x] Test branch filtering with complex family trees (multiple marriages, adoptions)

### Dependencies
None, but A1 benefits from this.

### Key decisions
- Living person exclusion is critical for privacy when sharing
- Branch filter enables "export just my maternal line" use cases
- Options are persisted per-database so users don't reconfigure each time

---

## A3: Wall Charts [feature]

Large-format pedigree and descendant charts for printing. SVG-based, supports tiled multi-page PDF.

### Steps

- [x] Create `src/api/reports/wall_chart.ts` — generates SVG chart data for arbitrary paper sizes
- [x] Extend existing pedigree chart renderer for print: no hover effects, high contrast, configurable fonts
- [x] Extend existing descendant chart (hourglass minus ancestors) for print
- [x] Support paper sizes: A4, A3, A2, A1, A0, custom dimensions
- [x] Tiled PDF: split large SVG into page-sized tiles with crop marks and overlap for assembly
- [x] IPC channel `reports:generateWallChart` with options (chart type, paper size, generations, focal person)
- [x] Vue: WallChartDialog.vue — configure chart type, paper size, generations, preview thumbnail
- [x] Add "Print Wall Chart" button to VisualizationView
- [x] Print-optimized CSS: serif fonts for names, thin lines, subtle colors
- [x] Handle large trees: auto-calculate required paper size, warn if > A0
- [x] i18n for chart labels
- [x] Unit tests for SVG generation and tile splitting

### Dependencies
Uses existing chart infrastructure from VisualizationView.

### Key decisions
- SVG-based for crisp printing at any size
- Tiled PDF allows printing on home printers and assembling physically
- Print styling is distinct from screen styling (serif fonts, no interactivity)

---

## A4: Static HTML Site Export [feature]

Generate a browsable family tree website from the database. Self-contained, hostable anywhere.

### Steps

- [x] Create `src/api/html_site/generator.ts` — orchestrates site generation
- [x] Create `src/api/html_site/templates.ts` — HTML templates for person pages, index, place pages, source pages
- [x] Person pages: names, events, relationships, media thumbnails, citations
- [x] Index page: alphabetical person list with search
- [x] Place pages: place hierarchy, events at place
- [x] Source pages: source details, linked citations
- [x] Client-side search: generate JSON index, lightweight JS search
- [x] Copy referenced media files into `site/media/` directory
- [x] Apply export content options (A2) for privacy filtering
- [x] Responsive CSS (mobile-friendly viewing)
- [x] IPC channel `export:htmlSite` with output directory picker
- [x] Vue: button in ImportExportView + progress indicator
- [x] i18n: site generated in user's current language
- [x] Tests for HTML generation and search index

### Dependencies
A2 (export content options) for privacy filtering. Can be built without A2 but less useful.

### Key decisions
- Fully static — no server required, opens from file:// or any host
- Search is client-side JSON, no server needed
- Media copied (not linked) so site is self-contained

---

## A5: CSV Export [feature]

Tabular export of persons, events, sources, places for spreadsheet analysis.

### Steps

- [x] Create `src/api/csv_export.ts` — functions per entity type: exportPersonsCsv, exportEventsCsv, exportSourcesCsv, exportPlacesCsv
- [x] Support configurable delimiter (comma, semicolon, tab) and encoding (UTF-8, UTF-8 BOM for Excel)
- [x] Apply export content options (A2) for filtering
- [x] IPC channel `export:csv` with entity type and options
- [x] Vue: CSV export section in ImportExportView with entity type selector and delimiter option
- [x] i18n for column headers
- [x] Unit tests for CSV generation (quoting, escaping, encoding)

### Dependencies
A2 (export content options) optional.

### Key decisions
- UTF-8 BOM option for Excel compatibility (Excel needs BOM to detect UTF-8)
- One file per entity type, not one mega-file
- Column headers are i18n'd but data is raw (dates in original format)

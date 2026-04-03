# Plan: Printable Output / Reports

## Background

The app has rich data and SVG visualizations (Pedigree, Hourglass, Timeline charts). This milestone surfaces that data as printable/exportable reports: paper-ready ancestor charts, family group sheets, and individual summaries. Target use case is sharing research with family members who expect printed or PDF documents.

Electron's `webContents.printToPDF()` and `webContents.print()` give direct PDF generation and print dialog access without third-party PDF libraries.

---

## Report Types

### 1. Ancestor Chart
A standard pedigree chart showing one person (proband) and their direct ancestors across N generations (default: 4).

**Layout:** Each box contains name (bold), birth date+place, death date+place. Boxes are connected by lines. Use the existing `chartLayout.ts` / `chartData.ts` utilities — same data already used by `PedigreeChart.vue`. Print version renders larger with higher contrast and no navigation chrome.

**Options:**
- Root person (PersonPicker)
- Generations: 3, 4, 5

### 2. Family Group Sheet
One nuclear family unit on a single page: the couple (parents) at the top, children listed below. Each member includes birth/death/marriage events and key sources.

**Layout:**
```
FAMILY GROUP SHEET
Husband: [name] Born: [date, place] Died: [date, place]
Wife:    [name] Born: [date, place] Died: [date, place]
Married: [date, place]

Children:
1. [name] b.[date] d.[date]
2. [name] b.[date] d.[date]
...

Sources:
1. [citation]
```

**Data:** Driven by a `couple` relationship ID — fetches both persons, their birth/death events, marriage events, and all parent_child relationships where either person is a parent.

### 3. Individual Summary
One person's complete research record — all names, events in chronological order, relationships, and citations. Two or three columns; dense but readable. Useful for printing a single person's file.

**Layout:**
- Header: preferred name, birth–death years, ID
- Names section: all name entries with type + dates
- Events: chronological table (type | date | place | description | source)
- Relationships: parents, spouse(s), children (name + birth year)
- Citations: numbered source list

---

## Implementation

### 1. `src/renderer/views/ReportsView.vue`

New route `/reports` with three tabs: Ancestor Chart, Family Group Sheet, Individual Summary.

Each tab has:
- Configuration controls (person picker, generation count, relationship picker)
- "Preview" button → opens preview in the same pane
- "Print" button → triggers `window.api.print.print()`
- "Export PDF" button → triggers `window.api.print.exportPdf(filename)`

### 2. Report Components (`src/renderer/components/reports/`)

| File | Description |
|------|-------------|
| `AncestorChartReport.vue` | Reuses `chartData.ts` pedigree logic; renders printable SVG or HTML table |
| `FamilyGroupSheet.vue` | Fetches couple relationship + events + children |
| `IndividualSummary.vue` | Fetches all person data (names, events, relationships, citations) |

Each component emits a `ready` event after loading. The print button is disabled until `ready`.

### 3. Print CSS

Each report component includes `@media print` styles:
- White background, black text, no sidebar/chrome
- Page breaks between sections where appropriate
- `@page { size: A4; margin: 20mm; }` default

### 4. IPC — Print + PDF Export

```typescript
// src/main/ipc.ts
print:print()          → webContents.print() — opens OS print dialog
print:exportPdf(path?) → webContents.printToPDF({...}) → saves to path (or shows save dialog)
```

`printToPDF` options:
```typescript
{
  format: 'A4',
  printBackground: false,
  margins: { top: 20, bottom: 20, left: 20, right: 20, marginType: 'custom' }
}
```

If `path` is not provided, show `dialog.showSaveDialog` with `filters: [{ name: 'PDF', extensions: ['pdf'] }]`.

### 5. Preload

```typescript
window.api.print.print()
window.api.print.exportPdf(path?: string)
```

### 6. Sidebar Entry

Add "Rapporter" below "Visualisering" in the sidebar. No badge needed.

### 7. Routes

Add `/reports` → `ReportsView` to `src/renderer/router.ts`.

---

## No New API Functions Needed

All data needed for reports is available via existing API functions:
- `getPerson`, `getPersonNames`, `getEventsForPerson`, `getRelationshipsOfPerson` — individual summary
- `getRelationship`, `getRelationshipsOfPerson` (parent_child filter) — family group sheet
- `chartData.ts` `buildPedigreeData(personId, generations)` — ancestor chart (already exists)
- `getCitationsForEvent`, `getCitationsForPerson` — citations in reports (v0.5.2 adds `getCitationsForPerson`)

The renderer fetches data directly via `window.api.*` before rendering the report.

---

## Print Preview Strategy

Rather than a separate print preview window, render the report component in a `<div class="print-preview">` within ReportsView using a constrained viewport (A4 proportions, white background, shadow border). This is simpler than a second BrowserWindow and avoids IPC complexity for the preview.

The actual print/PDF export uses `window.api.print.print()` which calls `webContents.print()` on the focused window — Electron prints exactly what the current page renders, including the preview div, with `@media print` CSS hiding the surrounding app chrome.

---

## Implementation Steps

- [ ] **1. IPC + preload** — `print:print` and `print:exportPdf` handlers in `src/main/ipc.ts`; expose on `window.api.print`
- [ ] **2. Router** — add `/reports` route, sidebar entry "Rapporter"
- [ ] **3. ReportsView.vue** — tab layout with three tabs, PersonPicker/RelationshipPicker controls per tab, preview area, Print + Export PDF buttons
- [ ] **4. AncestorChartReport.vue** — pedigree SVG using existing `chartData.ts`; `@media print` CSS; configurable generations
- [ ] **5. FamilyGroupSheet.vue** — fetches couple + children; renders structured print layout; `@media print` CSS
- [ ] **6. IndividualSummary.vue** — fetches full person record; renders names, events, relationships, citations
- [ ] **7. i18n** — sv/en strings for "Rapporter", tab labels, button labels, column headers
- [ ] **8. Tests** — component tests for report components (mock `window.api`; assert key data appears in rendered output); IPC handlers are thin wrappers around Electron APIs (skip unit testing native calls)
- [ ] **9. Docs** — update `CLAUDE.md` (routes, window.api.print), `PLAN.md`

---

## Skills to Update

- **`add-feature`** — after this milestone, add "print" as a known IPC namespace; note that `webContents.print()` and `printToPDF()` are Electron-only and belong in `src/main/ipc.ts`, never in `src/api/`.
- **`electron-dev`** — add a note about print/PDF IPC: `webContents.print()` targets the focused window; to print a specific window's content, use `event.sender.getOwnerBrowserWindow().webContents.print()`.

---

## What Is NOT in Scope

- Custom paper sizes beyond A4/Letter
- Direct email / share to PDF (user saves manually)
- Narrative "biography" text generation (that's an AI feature, not a report)
- Charts beyond the three types above
- Batch export of all persons

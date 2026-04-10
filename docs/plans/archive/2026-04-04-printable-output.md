# Feature: Printable Output / Reports

## Summary
Added a Reports view with three printable report types: Ancestor Chart, Family Group Sheet, and Individual Summary.

## Components

### IPC + Preload
- `print:print` → `window.api.print.print()` — opens OS print dialog for focused window
- `print:exportPdf(path?)` → `window.api.print.exportPdf()` — saves PDF via printToPDF(); shows save dialog if no path given

### ReportsView.vue (`/reports`)
- Three tabs: Ancestor Chart (Stamtavla), Family Group Sheet (Familjeblad), Individual Summary (Personsammanfattning)
- Configuration controls per tab: PersonPicker, generation selector, couple dropdown
- Print and Export PDF buttons
- Print preview in A4-proportioned white div; @media print hides all chrome

### AncestorChartReport.vue
- Uses fetchPedigreeTree() from chartData.ts
- Renders ahnentafel ancestor list grouped by generation
- Shows ahnentafel number, name, birth–death years

### FamilyGroupSheet.vue
- Fetches couple relationship, both spouses, marriage event, children
- Layout: spouses → marriage → children list → sources

### IndividualSummary.vue
- Fetches names, events (chronological), relationships, citations
- Layout: header → names → events table → relations → notes → sources

### i18n
- `reports.*` keys in sv.ts and en.ts

## Files Changed
- `src/main/ipc.ts` — print IPC handlers
- `src/preload/index.ts` — print namespace
- `src/renderer/router.ts` — /reports route
- `src/renderer/App.vue` — Rapporter sidebar entry
- `src/renderer/views/ReportsView.vue` — new view
- `src/renderer/components/reports/AncestorChartReport.vue` — new component
- `src/renderer/components/reports/FamilyGroupSheet.vue` — new component
- `src/renderer/components/reports/IndividualSummary.vue` — new component
- `src/renderer/i18n/sv.ts` / `en.ts` — reports.* keys

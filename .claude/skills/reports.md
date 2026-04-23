# Reports Skill

Use when working on: PDF export, SVG export, print button, print CSS, chart orientation, fit-to-page layout, or any `ReportsView` rendering concern.

---

## The Fundamental Rule

**Print and PDF must produce identical output.** The preview IS the output — never add, remove, or modify anything relative to what is shown in the preview. Both `print:print` and `print:exportPdf` call the main window's renderer — they print exactly what Chromium sees, styled by the `@media print` CSS block.

---

## Print vs PDF: How They Work

Both paths render the **main BrowserWindow** (the live app) — not a hidden window, not a re-serialized SVG.

| Handler | IPC channel | Electron API | Result |
|---------|-------------|--------------|--------|
| Print button | `print:print` | `webContents.print({ printBackground: true })` | System print dialog → printer / virtual PDF printer |
| Export PDF | `print:exportPdf` | `webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: none })` | Save dialog → `.pdf` file |

**Key: both must use `printBackground: true`** — charts are almost entirely background colors (SVG fills, CSS backgrounds). Without it, you get blank white output.

### The hidden BrowserWindow anti-pattern

Do NOT serialize the SVG, write it to a temp file, load it in a `new BrowserWindow`, and call `printToPDF` on that. It fails because:
- CSS custom properties (`var(--accent)` etc.) are not resolved in an isolated window with no app CSS
- Results in empty white PDFs
- The main window already has all the right CSS — just print that

---

## SVG Export

```ts
// ReportsView.vue — saveChartSvg()
const svg = getChartSvg();  // querySelector('svg') on previewContainer
await window.api.chart.saveSvg(buildExportSvgString(svg), filename + '.svg');
```

`buildExportSvgString(el)` clones the SVG and adds `xmlns`. That's it — no title injection, no wrapper, no modifications.

**Never call `wrapWithTitle()`** for chart SVG export. It injects a `<text>` node at the top that extends outside the viewBox and clips the chart content. The SVG must be exactly what is rendered in the preview.

---

## PDF Export (chart tabs)

```ts
// ReportsView.vue — saveChartPdf()
async function saveChartPdf() {
  const tab = activeTab.value;
  const landscape = tab === 'descendantChart' || tab === 'hourglassChart';
  await window.api.print.exportPdf(chartExportName() + '.pdf', landscape);
}
```

### Orientation mapping

| Tab | Orientation | Reason |
|-----|-------------|--------|
| `descendantChart` | landscape | Wide tree, many children per row |
| `hourglassChart` | landscape | Both ancestor and descendant branches spread wide |
| `pedigreePrint` | portrait | Vertical pedigree fits A4 portrait |
| `fanChart` | portrait | Circular chart, square aspect |
| `timeline` | portrait | Vertical timeline bar chart |

### File naming

```ts
function chartExportName(): string {
  const names: Record<string, string> = {
    pedigreePrint:   'pedigree-chart',
    hourglassChart:  'hourglass-chart',
    descendantChart: 'descendant-chart',
    fanChart:        'fan-chart',
    timeline:        'timeline',
  };
  return names[activeTab.value] ?? 'chart';
}
```

---

## Print CSS Architecture

All print styling lives in the `@media print` block inside `ReportsView.vue`'s `<style scoped>` section.

### What print CSS does

- Hides sidebar, panel, zoom controls, tab bar (`display: none !important`)
- Makes `.reports-main` fill the full page width
- Sets `.print-preview` to `width: 170mm; margin: 20mm auto` (content area of A4 portrait with 20mm margins)
- Sets `.preview-landscape` to `width: 297mm` (A4 landscape content width)

### Fit-to-page for chart prints

Charts need a different layout — they should fill the page rather than sitting in a fixed 170mm column. Add `chart-print` class to the `.print-preview` div in chart tabs:

```css
/* In @media print block */
.chart-print {
  width: 100% !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
}
.chart-print :deep(svg) {
  max-width: 100% !important;
  max-height: 100vh !important;
  width: auto !important;
  height: auto !important;
}
```

### Template pattern for chart tabs

```vue
<!-- Portrait chart (pedigree, fan, timeline) -->
<div v-if="store.personId" class="print-preview chart-print" :style="{ zoom: effectiveZoom }">
  <PedigreeChartReport ... />
</div>

<!-- Landscape chart (hourglass, descendant) -->
<div v-if="store.personId" class="print-preview preview-landscape chart-print" :style="{ zoom: effectiveZoom }">
  <HourglassChartReport ... />
</div>
```

`preview-landscape` controls the on-screen preview width (297mm). `chart-print` controls the print layout (fill page, scale SVG to fit).

---

## IPC Reference

### `print:print` → `window.api.print.print()`
Triggers the system print dialog on the focused window.

### `print:exportPdf(defaultPathHint?, landscape?)` → `window.api.print.exportPdf(hint, landscape)`
Shows a Save dialog, then calls `printToPDF` with A4, `printBackground: true`, `margins: none`.

### `chart:saveSvg(svgContent, fileNameHint?)` → `window.api.chart.saveSvg(svg, hint)`
Shows a Save dialog and writes the SVG string to disk.

### `chart:savePdf(svgContent, pxWidth, pxHeight, fileNameHint?)` → `window.api.chart.savePdf(...)`
Writes SVG to a temp `.svg` file, loads it in a hidden BrowserWindow, calls `printToPDF` with exact pixel dimensions. Only use this for the wall chart (WallChartView) where the canvas is a standalone SVG without app CSS dependencies.

---

## Checklist When Adding a New Report Tab

- [ ] Template: `class="print-preview"` (add `preview-landscape` if landscape, `chart-print` if it's a chart that needs fit-to-page)
- [ ] `chartExportName()`: add tab → filename mapping
- [ ] `saveChartPdf()` orientation: update landscape condition if needed
- [ ] Print CSS: verify the new report renders correctly in `@media print` (hide controls, correct width)
- [ ] `printBackground: true` is already set in both handlers — don't change it

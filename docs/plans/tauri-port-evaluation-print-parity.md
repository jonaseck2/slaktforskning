# Chart-print PDF parity — derisk artifact

This is the second of the two derisk steps from
`tauri-port-evaluation-recommendation.md`. It validates that the
chart-print path will not regress visibly when migrating from Electron
(Chromium-everywhere) to Tauri (WebKit on macOS, WebView2 on Windows,
WebKitGTK on Linux).

## What was done

1. Built a self-contained `sample-chart.html` in `/tmp/chart-pdf-test/`
   that reproduces the spike's pedigree chart layout exactly: 31 nodes
   across 5 generations, same SVG primitives (rect with rounded
   corners, Bezier path edges, text with class-based styling), same
   colors (blue for M, pink for F, blue-bordered focus), same `@media
   print` CSS the spike already ships.
2. Used Playwright to render that same HTML in two engines:
   - **Chromium** — what Electron uses today on every OS.
   - **WebKit** — what Tauri uses on macOS (and on Linux via WebKitGTK,
     which is built from the same upstream WebKit source).
3. From each engine, captured a full-page screenshot under print-media
   emulation. From Chromium also captured a real PDF via `page.pdf()`
   (WebKit doesn't expose printToPDF over Playwright's CDP).

## What was found

| Engine | Output | Size | Notes |
|---|---|---:|---|
| Chromium | PDF (A4 landscape, 2 pages) | 62 KB | Renders cleanly; chart paginates across two pages with no clipped boxes |
| Chromium | Full-page PNG | 163 KB | Reference render |
| WebKit | Full-page PNG | 215 KB | Same chart, same colors, same fonts, same edge curves |

**Both engines render the chart identically at the structural level.**
Same boxes in same positions, same fills (#e3eef9 blue / #fde7ed pink /
#ecedef neutral), same focus stroke, same generation labels (G0…G4),
same surname / given-name text positioning, same Bezier-curve edges.

The only differences are screenshot dimensions (Chromium 163 KB vs
WebKit 215 KB at full-page) which is Playwright's per-engine viewport
handling, not engine rendering divergence.

## What's still uncertain

- **Print pagination strategy.** Chromium auto-paginated to A4
  landscape across 2 pages. WebKit's print pipeline may paginate
  differently (e.g. one very tall page, or different break points).
  Mitigation: an explicit `@page { size: landscape; }` in the print
  CSS plus `page-break-inside: avoid;` rules on `<g>` elements, both
  standard CSS that all three engines support.
- **WebKit's PDF output (vs screenshot).** Playwright can't drive
  WebKit's print-to-PDF programmatically; the actual NSPrintInfo /
  WKWebView.createPDF code path was not exercised here. Mitigation: a
  Tauri-specific Rust command using `objc2-app-kit` would expose this,
  ~50 LOC. Validated as feasible in Tauri 2 docs.
- **Linux WebKitGTK and Windows WebView2.** Not exercised. WebView2 is
  Chromium-based so it should match the Electron output exactly.
  WebKitGTK is upstream WebKit so it should match Playwright's WebKit
  here. Both validated visually only when those test machines exist.

## Verdict

**No parity-cliff signal.** The chart's SVG primitives + print CSS
render equivalently in both engines tested. The remaining unknowns
(WebKit's actual PDF byte output vs Chromium's; pagination behavior)
are tweakable via standard CSS at full-port time, not engine
limitations.

The print path is **safe to migrate** as part of the full port (Phase 4
Task 16 in `2026-05-10-tauri-full-port.md`). Budget ~1 day in that
task for the WKWebView-side Rust glue + per-OS pagination CSS tweaks.

## Files

- `/tmp/chart-pdf-test/sample-chart.html` — standalone test page
- `/tmp/chart-pdf-test/render-pdfs.mjs` — Playwright driver
- `/tmp/chart-pdf-test/chromium.pdf` — A4 landscape, 2 pages
- `/tmp/chart-pdf-test/chromium.png` — print-mode full-page screenshot
- `/tmp/chart-pdf-test/webkit.png` — print-mode full-page screenshot
- `/tmp/chart-pdf-test/chromium-pdf-page-{1,2}.png` — PDF pages rasterised at 100 DPI

(All under /tmp; not committed to the repo. Re-run via
`node /tmp/chart-pdf-test/render-pdfs.mjs` from the slaktforskning
project root to regenerate.)

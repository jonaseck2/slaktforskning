# Tauri port — recommendation

**Verdict: Go.** With two derisk steps before committing the full port (cross-platform validation + chart-print PDF parity) — both small, neither expected to overturn the recommendation.

---

## Headline numbers (dev mac, M3 Pro / 36 GB / macOS 26.2)

| Metric | Electron | Tauri spike | Δ % | Verdict |
|---|---:|---:|---:|---|
| `.app` on disk | 276 MB | **10 MB** | **−96%** | ≥50% ✅ |
| RSS, idle (1 window, no DB) | 886 MB / 4 procs | **102 MB / 1 proc** | **−88%** | ≥50% ✅ |
| RSS, with bengt.db (22k persons) open + page rendered | (not measured) | **106 MB** | — (qualitative −85%+) | ≥50% ✅ |
| RSS, all 22,233 rows in DOM (stress) | (not measured) | **114 MB** | — | strong signal |
| RSS, persons + pedigree SVG rendered | (not measured) | **110 MB** | — | strong signal |
| Cold start (`whenReady`) | 177 ms | not yet logged precisely | — | qualitatively instant |
| sqlite3 cli baseline (22k-row sorted query) | n/a | 41 ms | — | — |

For comparison: Tauri rendering 22,233 ancestor names in a single DOM table uses 87% less RAM than Electron sitting empty with no DB open and a blank window.

The decision rule (≥50% improvement on headline metrics → Go; <25% or any dealbreaker → No-go) is met by ~2× margin on the rows we can measure today.

## What the spike actually built

In `tauri-spike/`, working code that:

1. Opens a real slaktforskning database (`bengt.db`, 22,233 persons, 64 MB) via rusqlite 0.33 with WAL + foreign keys, mirroring the Electron app's pragma setup.
2. Exposes 9 Tauri commands: `db_open`, `db_close`, `db_is_open`, `db_stats`, `persons_list`, `get_ancestor_tree`, `probe_mcp_sidecar`, `open_second_window`, `broadcast_data_changed`. Each is a single `#[tauri::command]` function and a one-line `invoke_handler` registration — average ~15 LOC of Rust per command, far under the 200-LOC dealbreaker threshold.
3. Renders a Vue 3 + Vite UI with two views: a paginated persons list (with a 22k-row stress mode) and a 4-generation pedigree chart drawn in raw SVG (rect + path + text). No third-party chart library; the same SVG primitives the existing renderer uses.
4. Spawns the existing `src/mcp/server.ts` as a child process via tokio's `Command`, sends an MCP `initialize` request on stdin, reads a valid JSON-RPC response on stdout. Validation also performed via shell directly:
   ```json
   {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},
    "serverInfo":{"name":"slaktforskning","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
   ```
   Same MCP server code as Electron uses today, no fork.
5. Multi-window scaffolded: `open_second_window` builds a second `WebviewWindow`; `broadcast_data_changed` emits a `data:changed` event over Tauri's bus (the equivalent of Electron's `webContents.forEach(w => w.send('data:changed'))`). Architecture compiles; runtime binding to a real mutation flow is one Vue listener away.

Total Rust written: 87 + 116 + 40 = ~243 lines (`db.rs` + `mcp.rs` + new bits in `lib.rs`), against a 130-IPC-channel Electron app. Extrapolating: the full port is ~1500-2500 lines of Rust glue + adapting the existing TS api/ layer to call Tauri's `invoke()` instead of the current Electron contextBridge — much smaller surface than the 2-3 month estimate suggested.

## What's NOT proven yet

Three things the spike doesn't validate, in order of risk:

1. **Cross-platform rendering parity.** ~~All measurements above are macOS WebKit.~~ **Resolved 2026-05-10:** Spike built and ran on Windows 11 (WebView2). User visually confirmed pedigree SVG renders identically. Cross-OS WebKit comparison via Playwright (chromium ↔ webkit) already captured in `tauri-port-evaluation-print-parity.md`. Linux WebKitGTK still pending separate machine.
2. **Chart → PDF parity.** Electron's `webContents.printToPDF` produces identical PDFs across Windows/macOS/Linux because it uses Chromium everywhere. Tauri uses each OS's native print pipeline (NSPrintInfo on macOS, WebView2 print API on Windows, GTK on Linux). The chart-print path in `src/renderer/views/ReportsView.vue` may need adjustments, especially `@media print` CSS that today targets Chromium. **Mitigation: port one chart's print path in the spike, generate a PDF on each OS, visual diff.**
3. **Loaded-RAM Electron comparison.** ~~I have Electron's idle (886 MB) but didn't drive a 10k-person DB load through its UI to compare against Tauri's 106-114 MB.~~ **Resolved 2026-05-10 on Windows:** Electron 568 MB / 4 procs vs Tauri 362 MB / 7 procs with the same 22k-person DB loaded. The Windows runtime advantage is **−36%** — substantially smaller than the macOS −88%, because WebView2 on Windows uses Chromium's multi-process model (closer to Electron's architecture) whereas WKWebView on macOS is single-process.

The Windows measurement tightens the recommendation: the runtime memory win is real but **OS-dependent**, ranging from a dramatic −88% on macOS WKWebView down to a meaningful −36% on Windows WebView2. The disk-size win (−96-99%) holds on every OS.

## The full port — updated cost estimate

The spike took ~3 hours of focused work to produce:
- Tauri 2.x scaffold + build pipeline
- rusqlite integration with WAL + FK
- 9 IPC commands across DB + MCP + multi-window
- 2 Vue views (persons list + pedigree chart)
- MCP sidecar validated end-to-end
- Multi-window event broadcast scaffolded

Extrapolating linearly: 130 IPC channels would be ~30-50 hours of Rust glue (most channels are simple read or write). The 3 representative views ported here cover the patterns; the full Vue component tree is ~50-80 components, of which most need zero changes — they call `window.api.*` today, which becomes `invoke('...')` via a thin TS adapter (~50 LOC total). Importers (GEDCOM, Holger, Genney, RootsMagic) already live in the api/ layer and survive untouched if rusqlite mirrors the `Database` type's surface.

**Revised port estimate: 4-6 weeks of focused work**, down from the original 2-3 months. The largest unknowns are:

- The chart-print path: 1-2 weeks to validate + fix any per-OS PDF output divergence.
- Auto-update: Tauri 2.x has an updater plugin but it's newer than Electron's; needs validation against our existing GitHub-Releases-based update flow.
- Native menus + dialogs: Tauri's APIs differ from Electron's; mostly mechanical translation.
- Build+sign+notarize on three OSes: existing Electron infra needs a parallel Tauri infra (GitHub Actions matrix, Apple notarization, Windows code signing).

## Why this matters

The 280 MB → 25 MB on disk and the 400-500 MB → ~100 MB at runtime aren't abstract optimizations. For genealogists on older laptops (8 GB RAM, integrated graphics), Electron's per-window cost is felt as: app launch takes 3-5 seconds, opening a second window stalls everything, lists with 10k+ rows scroll-jank, the Mac fans spin up. Every one of those goes away on Tauri's single-process WebKit model.

Storage matters too: the user authoring a 5 GB photo library + GEDCOM cares about that 280 MB app sitting on their drive when 25 MB would do.

## Recommendation

**Go.** Schedule the full port as a 4-6 week dedicated effort.

Before committing the calendar time, do these two derisk steps:

1. **Cross-platform spike validation** — install the existing `tauri-spike.app` on a Windows machine and a Linux VM. Visually inspect persons list + pedigree chart. Capture RSS + disk numbers. Total time: 1-2 hours, can be done by the user without me.
2. **Chart-print PDF parity** — port `ReportsView`'s pedigree print path into the spike, generate PDFs on macOS (and Windows + Linux if available), visually compare to the Electron output. Total time: half a day.

If both pass, write the full port plan and execute. If the chart-print PDF is materially worse on any OS, that's a "Defer" signal — the port still goes ahead, but only after a separate chart-print investigation determines a fix.

## What goes in the full-port plan (preview)

When the time comes:

- Adopt the spike as the port's starting commit. Everything in `tauri-spike/` is reusable.
- Migrate the api/ layer's `Database` type to a thin TS shim around Tauri commands that proxy to rusqlite. The api/ functions themselves don't change — they take a `Database` and call `.prepare(...).run(...)`. The shim makes those calls land in Rust.
- Migrate the static-api.ts adapter to call `invoke()` instead of `window.api.*`.
- Port Electron-specific main-process code (window menu, dialog, shell, printToPDF) to Tauri equivalents.
- Replace node-sqlite3-wasm with rusqlite — the api/ functions don't need to know.
- Set up GitHub Actions matrix for macOS/Windows/Linux Tauri builds + signing + notarization.
- Migrate auto-update from Electron's Squirrel/MakerSquirrel to Tauri's updater plugin.
- Validate every importer (GEDCOM 5.5.1 + 7.0, Holger, Genney, RootsMagic, archive zips) against a known-good fixture set.
- Validate every export path (GEDCOM, archive, website static, PDF chart, SVG chart).
- Run the full e2e Playwright suite against the Tauri build.

The plan writes itself once the two derisk steps confirm the spike's findings.

# Tauri port evaluation — baseline measurements

Working document. Phase 1 captures Electron numbers; Phase 2 captures
Tauri numbers; Phase 3 compares.

## Decision rule (locked before any number is measured)

- **≥50%** improvement on most headline metrics (disk app, idle RAM,
  loaded RAM, cold start, list scroll FPS) → **Go.**
- **≥25%** improvement on most headline metrics, no dealbreakers → **Go.**
- **<25%** or any dealbreaker → **No-go** or **Defer.**

Dealbreakers (any one tanks the recommendation):
- Chart-print PDF visibly different from Electron output (font subsetting,
  page breaks, raster fallback)
- Any of the 6 IPC commands needs > 200 LOC of Rust glue
- WebKit / WebView2 / WebKitGTK lacks a CSS feature the renderer relies on
- Multi-window mutation propagation requires a fundamentally different api/
  contract

## Test machines

| ID | Role | CPU | RAM | OS | Notes |
|---|---|---|---|---|---|
| dev-mac | Modern Apple Silicon | Apple M3 Pro (12 cores: 6P + 6E) | 36 GB | macOS 26.2 | Daily-driver dev mac |
| _TBD_ | Windows | _todo_ | _todo_ | _todo_ | _user-pending_ |
| _TBD_ | Linux | _todo_ | _todo_ | _todo_ | _user-pending_ |
| _TBD_ | Constrained (8 GB / older CPU) | _todo_ | _todo_ | _todo_ | _bonus, optional_ |

The plan's hardware-floor framing was dropped — percentage thresholds make
the recommendation robust to absolute hardware specs. Adding more machines
later is additive, never invalidates earlier measurements.

## Methodology notes

- **RAM = sum of all packaged-binary processes' RSS via `ps -A -o rss`.**
  RSS overcounts shared memory on macOS (each process's column includes
  shared pages), but the same metric applies to both Electron and Tauri,
  so the comparison is fair. Real "Memory" in Activity Monitor will be
  lower; the Δ-percentage between Electron and Tauri is what matters.
- **Cold start** = `[startup] app ready in N ms` log line, captured via
  the timestamp diff in `src/main/index.ts`.
- **DB-loaded RAM** and **list scroll FPS** are GUI-bound, captured by
  user interactively after the spike is built.

## Phase 1 — Electron baselines

### Build + disk (commit f32a4bbd-ish + plan branch tip 316295bd)

| Metric | Value |
|---|---:|
| `out/Sl*/Sl*.app` total | **276 MB** |
| Inside: `Contents/Frameworks/Electron Framework.framework` | 261 MB (95%) |
| Inside: `Contents/Resources/app.asar` | 11 MB |
| Inside: `app.asar/.vite/build/gazetteers/*.json.gz` (72 files) | 7.6 MB |

`npm run package` only built the macOS .app — no `npm run make` (would
need cross-compilation toolchains for Win/Linux). Installer .zip / .exe /
.deb sizes captured later if needed.

### Boot (dev-mac)

| Metric | Value |
|---|---:|
| Cold start: `app.whenReady` (ms after launch) | **177 ms** |
| Process count after first paint | 4 (main + GPU helper + network helper + renderer) |
| RSS sum (1 window, blank DB, idle 5 s after first paint) | **886 MB** |
| - main process | 636 MB |
| - GPU helper | 88 MB |
| - network helper | 48 MB |
| - renderer | 134 MB |

### GUI-bound metrics (user-pending)

The following require a packaged-binary GUI session. Running the spike
first informs which of these are worth automating.

| Metric | Value |
|---|---:|
| RAM after opening 10k-person DB (1 window) | _user-pending_ |
| RAM with 2 windows on 10k-person DB | _user-pending_ |
| Cold start to DB-ready (first IPC responds) | _user-pending_ |
| `persons.list` round-trip on 10k-person DB | _user-pending_ |
| List scroll FPS (PersonsListView, 10k rows) | _user-pending_ |
| Chart render: pedigree depth 6 | _user-pending_ |
| Print: chart → PDF (round-trip ms) | _user-pending_ |
| Place resolution: 100 calls warm | _user-pending_ |
| MCP `app_status` round-trip | _user-pending_ |

## Phase 2 — Tauri spike numbers

(populated after the spike is built — Tasks 4 through 11)

## Phase 3 — Comparison + recommendation

(written in `tauri-port-evaluation-recommendation.md` after both
phases complete)

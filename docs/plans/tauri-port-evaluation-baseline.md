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

### Empty-app baseline (Task 4 — scaffold only, no views/DB/IPC ported yet)

The Tauri 2.x scaffold (`cargo create-tauri-app --template vue-ts`) was
built in release mode. This is the floor — any porting from Phase 2's
later tasks adds Vue/Vite renderer bytes and Rust IPC LOC on top of
this, but the OS-webview design means there's no Chromium framework to
ship.

| Metric | Value |
|---|---:|
| `tauri-spike.app` total | **8.3 MB** |
| Inside: `Contents/MacOS/tauri-spike` (the Rust binary) | 8.2 MB |
| Inside: `Contents/Resources` | 100 KB |
| Inside: `Contents/Info.plist` | 4 KB |
| Cold-start to window visible | ~1 s (no in-app log; observable, not yet measured precisely) |
| RSS sum (idle, 1 window, no DB) | **102 MB across 1 process** |

### Projected vs Electron (preliminary, before view porting)

| Metric | Electron | Tauri (empty) | Δ |
|---|---:|---:|---:|
| `.app` on disk | 276 MB | 8.3 MB | **−268 MB / −97%** |
| RSS sum (idle, 1 window, no DB) | 886 MB | 102 MB | **−784 MB / −88%** |
| Process count | 4 | 1 | −3 |

**Caveats:**
- The Tauri spike has no views, no DB, no IPC commands ported yet. Adding the
  renderer bundle (Vue 3 + Vite output) will add ~3 MB to disk; the gazetteer
  payload (currently 7.6 MB as `.json.gz`) is identical in both, so a
  fully-ported Tauri build is projected at ~20-25 MB on disk vs Electron's
  276 MB — still a ~92% reduction.
- RSS sum is not a perfect cross-process metric on macOS (each process's
  column double-counts shared mach pages), so Electron's "886 MB" overstates
  real memory cost. But Tauri's single-process model can't double-count
  shared-mem because there's only one process — its 102 MB number is the
  ceiling, not a sum-of-overlaps. The directional signal (massive reduction)
  holds even after correcting for the RSS-sum bias.
- These are dev-mac numbers (Apple Silicon, 36 GB RAM). Behavior on
  constrained hardware is expected to scale linearly per the percentage
  decision rule.

### Decision rule against this preliminary signal

| Headline metric | Δ % | Verdict |
|---|---:|---|
| Disk: app | −97% | **≥50% ✅** |
| Memory: idle | −88% | **≥50% ✅** |

Both headline rows that we can measure right now hit the **≥50%** "Go"
bar by a wide margin. Cold start, loaded RAM, list scroll, and chart
render still need the spike to be ported far enough to exercise them
(Tasks 5-10).

### Tasks 5-14 status

(pending — porting views + rusqlite + IPC + multi-window + MCP +
chart print, then capture spike numbers under realistic load)

## Phase 3 — Comparison + recommendation

(written in `tauri-port-evaluation-recommendation.md` after both
phases complete)

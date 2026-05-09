# Tauri Port Evaluation Plan

> **For agentic workers:** this is a research/spike plan, not an implementation plan. Its output is a go/no-go decision grounded in numbers measured on real elderly-user hardware. Do NOT begin a full port until this plan completes and the user accepts a "go" recommendation.

**User goal:** Decide with confidence, based on measurements, whether a Tauri port of Släktforskning is worth 2-3 months of focused engineering. The decision artifact is a one-page recommendation with concrete numbers — RAM, disk, startup, scroll FPS, chart render time — captured on whatever hardware we have available, on all three OSes the app supports today. The decision rule is simple: if the port delivers ≥25% improvement across the headline metrics (app size, idle RAM, RAM under load, cold start, list scroll, chart render), it's worth doing; ≥50% is clearly worth doing; below 25% is not. We don't tune for any specific user segment or hardware floor.

**Why this matters now:** Today's app ships ~280 MB on disk and a typical session resident-set after opening 1-2 windows on a real database lands in the 400-500 MB range. That's a lot of bytes for software that does CRUD over an SQLite database and renders some Vue components. A Tauri port could plausibly deliver −250 MB on disk and a 2× to 5× idle-RAM reduction. But that's an estimate. This plan replaces the estimate with measured numbers, and uses percentage thresholds — not arbitrary absolute targets — so the recommendation reflects the actual lift, not a goalpost we picked to hit.

**Non-goal:** This plan does not perform the port. It produces enough evidence to choose between three outcomes:
1. **Go** — the win on real hardware is large enough to justify a 2-3 month port plan.
2. **Defer** — the win is real but smaller than expected, and other priorities (e.g. the European gazetteer roadmap follow-ups) come first. Re-evaluate in 6-12 months.
3. **No-go** — the win evaporates on real hardware (e.g. WebKit/WebView2 fragmentation introduces regressions that outweigh the savings).

The plan ships when the user has read the recommendation and accepted one of those three outcomes.

**Architecture:** Three phases. Phase 1 captures Electron baselines. Phase 2 builds a minimal Tauri spike — just enough surface area to exercise the riskiest pieces. Phase 3 compares them and writes the recommendation.

**Tech stack:**
- Electron (current): Electron 41, Vue 3, node-sqlite3-wasm, MCP via @modelcontextprotocol/sdk over stdio.
- Tauri spike: Tauri 2.x (latest stable), same Vue 3 renderer, rusqlite for SQLite (native), Tauri sidecar for MCP stdio bridge.

---

## Scope

**The spike covers exactly these surfaces — everything else stays in Electron-land for the evaluation phase.** Picking these is the design call: they cover every category of platform-API dependency we currently rely on, so a clean spike implies a clean full port.

1. **Three representative renderer views**, ported verbatim from the existing Vue codebase:
   - `PersonsListView` — the heaviest-list view. Tests virtual scrolling, list refresh on data:changed, and per-row icon rendering.
   - `ChartView` (any one chart layout — pedigree is fine) — tests SVG rendering at scale, tree-layout perf, the chart→print pipeline.
   - `ReportsView` — tests print CSS, Save PDF, Save SVG paths.
2. **6 representative IPC commands**, ported to Tauri's `#[tauri::command]` model:
   - `persons.list` (the highest-frequency read)
   - `persons.create` (a write that triggers undo + data:changed)
   - `events.recordEvent` (a write that touches multiple tables)
   - `places.resolveBoundary` (a CPU-heavy gazetteer call)
   - `undo.undo` (cross-cutting state)
   - `db.switchDatabase` (test the DB lifecycle)
3. **SQLite via rusqlite** (native Rust binding) instead of node-sqlite3-wasm. The api/ layer's `Database` type abstraction is the seam — we write a thin TS-shape adapter on top of a Rust-side DB pool exposed via Tauri commands.
4. **Multi-window.** Two windows on the same DB; mutation in one propagates to the other via Tauri's event bus.
5. **MCP stdio bridge.** Tauri spawns an MCP sidecar process at app start that reads stdio. External `claude` CLI must be able to connect.
6. **Print to PDF + Save SVG** from `ReportsView`. Compare output against current Electron-produced PDFs/SVGs byte-for-byte? No — visually, on the same chart, with a documented diff if any.

### Scope deviations (explicit)

- **Don't port all 130+ IPC channels.** The 6 above cover every category (read, write, CPU-bound, DB-lifecycle, undo). If they work, the rest is mechanical and the architecture is proven.
- **Don't port the entire Vue component tree.** 3 views suffice — they exercise list rendering, SVG, and print, the three platform-engine-sensitive paths.
- **Don't migrate the gazetteer build pipeline.** Reuse `data/*.json` + the existing Vite gzip plugin.
- **Don't port the static SPA build.** Out of scope for a spike — and the static build would be unaffected by the desktop port anyway.
- **Don't port the Holger / Genney / GEDCOM importers.** These are pure-TS and live in the api/ layer; if `persons.create` works under Tauri, they work.
- **Don't migrate auto-update.** Tauri 2.x has a working auto-updater plugin; we trust it for the spike. Real validation goes in the full-port plan.

### Hardware: whatever we have

No hardware floor. We measure on whichever machines are at hand — at minimum the dev mac, plus a Windows machine and a Linux VM or runner for cross-platform parity. Percentage-improvement thresholds make the decision robust to absolute hardware specs: if Tauri saves 50% RAM on a 32 GB dev mac, it'll save roughly 50% RAM on an 8 GB user laptop too, and the recommendation is the same in both cases. We don't need to source a specific elderly-target machine to make a defensible call.

If we happen to have access to a constrained machine (8 GB RAM, integrated GPU, older OS), great — add it to the measurement set. But it's not a gating requirement.

---

## Verification

The plan succeeds when **a one-page recommendation** exists at `docs/plans/tauri-port-evaluation-recommendation.md` containing all of the following, populated with measured numbers per machine we tested on:

| Metric | Electron | Tauri | Δ % | Verdict |
|---|---:|---:|---:|---|
| Disk: installer size | … | … | … | ≥50% / ≥25% / below |
| Disk: installed app | … | … | … | … |
| Memory: idle (1 window, blank DB) | … | … | … | … |
| Memory: 2 windows, 10k-person DB | … | … | … | … |
| Memory: after 10k-person GEDCOM import | … | … | … | … |
| Cold start: launch → first paint | … | … | … | … |
| Cold start: launch → DB ready (IPC responds) | … | … | … | … |
| `persons.list` round-trip on 10k-person DB | … | … | … | … |
| List scroll FPS (PersonsListView, 10k rows) | … | … | … | … |
| Chart render: pedigree to depth 6 | … | … | … | … |
| Print: chart → PDF | … | … | … | … |
| Place resolution: 100 calls warm | … | … | … | … |
| MCP `app_status` round-trip | … | … | … | … |

The recommendation rule:
- **≥50% improvement** across the headline rows (disk app, idle RAM, loaded RAM, cold start, list scroll) → **Go.** Clear win, justifies the port outright.
- **≥25% improvement** on most headline rows, no dealbreakers → **Go.** The lift is meaningful even if not dramatic.
- **<25% improvement**, or any dealbreaker (chart-print regression, IPC commands needing >200 LOC of Rust, WebKit/WebView2 lacking a feature the renderer relies on) → **No-go** or **Defer**.

A separate row for each test machine. If results diverge across machines, that itself is a signal — usually it means our wins are RAM-pressure-dependent and bigger on constrained hardware.

Also required:

- **Cross-platform parity report** — for each of the 3 views, screenshots from WebKit (macOS), WebView2 (Windows), WebKitGTK (Linux). Diffs called out: font rendering, scroll behavior, SVG strokes, print page break behavior, anything else surprising.
- **Feature gaps** — anything in the 6 IPC commands that didn't port cleanly. Anything Tauri 2.x doesn't have a built-in equivalent for (auto-update story, deep-link handling, OS dialogs, etc.).
- **Risk register** — concrete things that could blow up the full port (e.g. WebKit on macOS 12 lacking a CSS feature; WebView2 needing an installer bootstrap; WebKitGTK package fragmentation).
- **Cost estimate update** — after the spike, is "2-3 months" still right? Tighter (6-8 weeks)? Looser (4-5 months)?

The recommendation closes with one of: **Go**, **Defer**, **No-go**, plus the reasoning.

---

## Failure modes / RCA reference

- **Risk: confirmation bias.** "We invested 2 weeks on the spike, of course we should port." The recommendation must be defensible against "the numbers don't justify it." Establishing the elderly-target hardware floor and the threshold table BEFORE the spike runs is what protects against this.
- **Risk: spike too small.** A spike that doesn't touch the chart-print path or multi-window will declare success and miss the things that actually break in a real port. The 6-IPC + 3-view + print + multi-window combination is the floor.
- **Risk: the spike succeeds in a way that doesn't transfer.** E.g. rusqlite works for `persons.create` but the api/ layer's bulk-import paths (GEDCOM importer's `withStatementCache` pattern) don't have a clean Rust analog. Mitigation: include one importer-shaped IPC (a small bulk insert) in the 6.
- **Past similar work:** none in this project. This is the first cross-engine evaluation we've done.
- **Per `feedback_dont_invent_when_revert_works.md`** (memory): if the Electron path is fine and our problems can be addressed without leaving Electron (e.g. the 128 → 9 MB asar fix earned ~95% of "smaller-bundle" wins without any port), favor incremental over rewrite.

---

## Tasks

### Phase 1 — Baseline measurements

#### Task 1: List the test machines

**Goal:** Write down which machines we'll measure on. No hardware-spec gating — whatever's at hand counts.

- [ ] **Step 1:** Inventory available test surfaces. Minimum useful set is the dev mac plus one Windows machine (or VM) plus one Linux VM. If a constrained machine (older laptop, 8 GB RAM, integrated GPU) is around, add it as a bonus.
- [ ] **Step 2:** Record CPU model, RAM, OS version, disk type per machine in `docs/plans/tauri-port-evaluation-baseline.md`. Confidential? Don't commit. Generic? Commit.

#### Task 2: Note the decision rule

**Goal:** Lock in the percentage-threshold rule so it's the same yardstick before and after measurement.

- [ ] **Step 1:** Confirm the rule (no per-metric absolute targets):
  - **≥50%** improvement on most headline metrics (disk app, idle RAM, loaded RAM, cold start, list scroll) → **Go.**
  - **≥25%** improvement on most headline metrics, no dealbreakers → **Go.**
  - **<25%** improvement, or any dealbreaker, → **No-go** or **Defer.**
- [ ] **Step 2:** Note the dealbreakers (any one is enough to tank the recommendation):
  - Chart-print PDF visibly different from Electron output (font subsetting, page breaks, raster fallback)
  - Any of the 6 IPC commands needs > 200 LOC of Rust glue
  - WebKit/WebView2/WebKitGTK lacks a CSS feature the renderer currently relies on
  - Multi-window mutation propagation requires a fundamentally different api/ contract
- [ ] **Step 3:** Add this rule to the top of `tauri-port-evaluation-baseline.md` so the recommendation in Phase 3 is graded against the same rule.

#### Task 3: Capture Electron baselines

**Goal:** All 13 metrics from the Verification table populated for Electron, on each reference machine.

- [ ] **Step 1:** Build current main: `npm run make`. Note the installer size for each platform (or skip the platform-makers and just measure the .app/.exe bundle if cross-compilation isn't set up).
- [ ] **Step 2:** Install on each test machine.
- [ ] **Step 3:** Prepare a 10k-person reference DB. Use an existing GEDCOM fixture or seed via the dev MCP's `seed_family` tool. Save the .db file so the same dataset is used in Phase 2.
- [ ] **Step 4:** Capture each metric per the verification table. For RAM, sum all process RSS via Activity Monitor / Task Manager / `ps`. For FPS, use the OS performance overlay or Chrome DevTools' FPS meter (Electron exposes it via `devtools` toggle).
- [ ] **Step 5:** Record numbers in `docs/plans/tauri-port-evaluation-baseline.md`.
- [ ] **Step 6:** Commit baseline.

### Phase 2 — Tauri spike

#### Task 4: Tauri scaffold

**Goal:** Minimal Tauri 2.x app + Vue 3 + Vite renderer that opens a window. Locked-down to the same Vue + Vite versions as the Electron build, so the renderer code is identical.

- [ ] **Step 1:** Create a `tauri-spike/` worktree (or sibling repo) — keeps the spike's heavy Cargo deps out of the main repo's `node_modules`.
- [ ] **Step 2:** `npm create tauri-app@latest` with Vue 3 + Vite + TS. Adopt the same `vite.renderer.config.ts` shape as main.
- [ ] **Step 3:** Verify `npm run tauri dev` opens a window on macOS. Document the bundle size of the empty Tauri app — that's the "Tauri runtime cost" baseline.

#### Task 5: Port 3 representative views

**Goal:** PersonsListView, ChartView (pedigree), ReportsView render against the spike — even if data is mocked at first.

- [ ] **Step 1:** Copy `src/renderer/views/PersonsListView.vue` + its direct dependencies into the spike. Replace `window.api.persons.list(...)` calls with mocked data initially.
- [ ] **Step 2:** Same for ChartView (whichever chart is simplest — pedigree).
- [ ] **Step 3:** Same for ReportsView.
- [ ] **Step 4:** Verify all 3 render in WebKit (macOS) without obvious visual regression. Don't sweat fine details yet — that's Task 12.

#### Task 6: rusqlite + DB lifecycle

**Goal:** Tauri-side Rust manages a SQLite connection pool via rusqlite. Open/close/switch a DB file. Schema initialization runs.

- [ ] **Step 1:** Add `rusqlite = { version = "0.33", features = ["bundled"] }` to the spike's `Cargo.toml`.
- [ ] **Step 2:** Open one of the reference DBs prepared in Task 3.
- [ ] **Step 3:** Implement `db_switch_database` Tauri command that takes a path and re-points the connection.
- [ ] **Step 4:** Run a `SELECT count(*) FROM persons` from the renderer via a Tauri command. Confirm the same count as Electron.

#### Task 7: Port 6 representative IPC commands

**Goal:** Each of the 6 commands works end-to-end through Tauri.

- [ ] **Step 1:** `persons.list` — the cheap read.
- [ ] **Step 2:** `persons.create` — write + undo entry.
- [ ] **Step 3:** `events.recordEvent` — multi-table write.
- [ ] **Step 4:** `places.resolveBoundary` — CPU-bound gazetteer. This is the test of "can the api/ layer's pure-TS gazetteer code coexist with Rust DB access?". Two design options to prototype:
  - (a) Run the gazetteer resolver in the Tauri webview (renderer-side TS), keep Rust pure for DB.
  - (b) Cross-compile the gazetteer resolver to Rust (much bigger lift).
  - Pick (a) for the spike. Document the choice and its tradeoff.
- [ ] **Step 5:** `undo.undo` — cross-cutting state lookup.
- [ ] **Step 6:** `db.switchDatabase` (already done in Task 6, just polish).

#### Task 8: Multi-window with mutation propagation

**Goal:** Two windows on the same DB; mutation in one shows up in the other.

- [ ] **Step 1:** Use Tauri's `WebviewWindowBuilder` to open a second window.
- [ ] **Step 2:** Wire a Tauri event broadcast (analogous to today's `data:changed` IPC fan-out) so when one window mutates, the other reloads.
- [ ] **Step 3:** Verify by editing a person's name in window A and confirming window B's PersonsListView refreshes.

#### Task 9: MCP sidecar

**Goal:** External `claude` CLI can connect to the Tauri app's MCP server.

- [ ] **Step 1:** Use Tauri's sidecar pattern to spawn `tsx src/mcp/server.ts` (re-using the existing Node stdio bridge — that code is engine-agnostic).
- [ ] **Step 2:** Confirm one MCP tool round-trip via the existing `.mcp.json`-style config pointing at the spike's binary.

#### Task 10: Chart print + Save PDF

**Goal:** Open ReportsView with a real chart, print to PDF, save SVG.

- [ ] **Step 1:** Tauri's `print()` API or `window.print()` — investigate which path is closest to Electron's `webContents.printToPDF`.
- [ ] **Step 2:** Save PDF on a reference chart. Open in Preview / Acrobat.
- [ ] **Step 3:** Save SVG via the existing renderer-side serialization. Verify byte-level it's the same as Electron's output.

### Phase 3 — Comparison + recommendation

#### Task 11: Capture Tauri spike numbers on the same machines

**Goal:** All 13 verification-table metrics populated for the Tauri spike, on each machine from Task 1.

- [ ] **Step 1:** Bundle the spike: `npm run tauri build`. Record installer/.app size per platform.
- [ ] **Step 2:** Install on each test machine.
- [ ] **Step 3:** Same metrics + same procedure as Task 3, against the spike. Use the same reference DB.
- [ ] **Step 4:** Append to `tauri-port-evaluation-baseline.md`.

#### Task 12: Cross-platform parity report

**Goal:** Document any rendering differences between WebKit / WebView2 / WebKitGTK on the 3 views.

- [ ] **Step 1:** Same chart, same person, same window size — screenshot from each engine.
- [ ] **Step 2:** Diff visually. Document any: font rendering, sub-pixel positioning, SVG stroke behavior, scroll smoothness, print page-break behavior, focus-ring rendering.
- [ ] **Step 3:** For each diff, classify: cosmetic / functional / dealbreaker.
- [ ] **Step 4:** Save into the recommendation as a section.

#### Task 13: Feature-gap audit

**Goal:** Honest list of "what doesn't port cleanly."

- [ ] **Step 1:** For each of the 6 IPC commands, count Rust LOC needed to glue. If any exceeded 200 LOC, that's a flag.
- [ ] **Step 2:** Note any Tauri 2.x absence the full port would have to write or wait for: auto-update on Linux, deep-link handling, native menus (compare against current Electron menu), printer dialog, etc.
- [ ] **Step 3:** Estimate if the api/ layer survives a port (it should — that's the design rationale for it being pure-TS) or whether sections would need rewriting.

#### Task 14: Cost estimate update + write the recommendation

**Goal:** A one-page `docs/plans/tauri-port-evaluation-recommendation.md` that the user can read in 5 minutes and decide on.

- [ ] **Step 1:** Populate the comparison table with measured numbers from Tasks 3 + 11. Compute Δ % per row per machine.
- [ ] **Step 2:** Apply the Task-2 rule. Headline rows (disk app, idle RAM, loaded RAM, cold start, list scroll) carry the verdict; secondary rows are informational.
- [ ] **Step 3:** Write the parity report findings, the feature-gap audit, the risk register.
- [ ] **Step 4:** Update the cost estimate. Was 2-3 months still right? If the spike took 1 week, the full port might be 6-8 weeks. If it took 3 weeks, scale accordingly.
- [ ] **Step 5:** Recommendation: **Go**, **Defer**, or **No-go**, with one paragraph of reasoning grounded in the numbers and the percentage rule.
- [ ] **Step 6:** Hand to user. They accept one of the three outcomes. If "go," a separate full-port plan opens. If "defer" or "no-go," archive this plan.

---

## Effort estimate

- Phase 1 (baselines): 2-4 days, mostly hardware setup + measurement runs.
- Phase 2 (spike): 1.5-2.5 weeks of focused work. The Tauri scaffold + 3 views + 6 commands + multi-window is a known shape; rusqlite integration is the unknown.
- Phase 3 (comparison + writeup): 2-3 days.

**Total: ~3-4 weeks of focused effort to reach the decision point.**

That's significant but it's < 20% of the cost of the full port (2-3 months). If the spike says "no-go" or "defer," it saves the port cost entirely. If it says "go," the spike code is reusable as the port's starting commit.

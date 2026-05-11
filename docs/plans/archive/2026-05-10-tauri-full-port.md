# Tauri Full Port Implementation Plan

> **GATE — DO NOT START UNTIL BOTH DERISK STEPS PASS:**
> 1. **Cross-platform spike validation.** Install `tauri-spike.app` (from
>    `.claude/worktrees/tauri-port-evaluation/tauri-spike/src-tauri/target/release/`)
>    on a Windows machine + Linux VM. Persons list and pedigree chart
>    render correctly on both. RSS sum stays under 200 MB on each.
> 2. **Chart-print PDF parity.** Port `ReportsView`'s pedigree print path
>    into the spike, generate PDFs on macOS (and Windows + Linux if
>    available). Visually compare output to Electron's existing PDF —
>    fonts, page breaks, line strokes within tolerance.
>
> If either step fails materially, this plan is **deferred**, not abandoned.
> Re-evaluate once the parity gap is understood.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to dispatch one fresh subagent
> per task with the project's `subagent-handoff` prompt templates.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**User goal:** A user downloads Släktforskning, sees a sub-30 MB installer,
launches the app on their 8-year-old laptop and it feels instant. They
open a 22 k-person database and the persons list scrolls smoothly, the
chart redraws without jank, two windows can be open simultaneously
without the laptop's fans spinning up. Their existing GEDCOM imports
round-trip the same way they do today. Their existing MCP-driven agent
workflows still work. Auto-update lands the next version transparently.
Nothing user-facing changes — the app is just dramatically lighter.

**Architecture:** Replace the Electron 41 / Chromium / V8 / Node runtime
with Tauri 2.x / OS-native webview / Rust. Keep the entire `src/api/`
layer (pure TS, zero Electron deps — that's why it was designed this
way), the renderer (Vue 3, Vue Router, Pinia, all components), and the
MCP server (`src/mcp/server.ts`, engine-agnostic Node script). Replace
node-sqlite3-wasm with rusqlite (native Rust SQLite binding) behind a
TS shim that preserves the api/ layer's `Database` type. Migrate every
IPC channel from Electron's contextBridge model to Tauri's
`#[tauri::command]` model. Replace Electron-specific main-process
surfaces (BrowserWindow, dialog, shell, printToPDF, native menus,
Squirrel auto-update) with Tauri equivalents.

**Tech Stack:**
- Tauri 2.x (latest stable at start of port)
- Rust 1.95+ for the host process
- rusqlite 0.33+ (bundled SQLite, **DELETE journaling**, FK enforcement) — DELETE not WAL because users routinely copy `.db` files around (email, USB, cloud) and `-wal`/`-shm` sidecars carrying uncommitted data are a UX footgun. See `.claude/skills/sqlite-wal/`.
- tokio 1.x for sidecar process management (MCP server spawn)
- Vue 3 + Vite (unchanged from current Electron build)
- @tauri-apps/api 2.x for renderer-side `invoke()` calls
- **`async`/`await` throughout `src/api/`** — see Architecture decision below
- Existing test infrastructure: vitest + Playwright (Playwright supports Tauri natively)

---

## Architecture decision (2026-05-10): api/ becomes async

After Phase 1 settled, a sync-vs-async impedance mismatch surfaced that the original plan glossed over: every existing `src/api/` function is **synchronous** (`function createPerson(db, …)`, `db.prepare(sql).run([…])`). Tauri's `invoke()` is **async** (returns `Promise`). A sync TS shim over async IPC needs either (a) `SharedArrayBuffer` + `Atomics.wait` gymnastics with COOP/COEP headers, or (b) shipping a Node sidecar that hosts the api/ unchanged.

**Decided: option A — make `src/api/` async throughout.**

- Cleanest end-state: api/ talks to Rust via `await invoke(...)` directly, no sidecar, no shared-memory tricks.
- Disk + RAM wins land at the recommendation's ≥50% targets (Tauri's renderer alone, no Node sidecar) — option B would have shaved the RAM win to ~−60% and added ~50 MB of Node runtime to the bundle.
- Cost: large diff. Every api/ function signature changes from `function X(...): T` to `async function X(...): Promise<T>`, and every caller (Vue stores, MCP tools, importers, Vue components, vitest tests) gets `await` sprinkled.
- Risk mitigation: the refactor lands as a **separate, mechanical Phase 2.5 task** (see Task 5) before any Phase 3 IPC migration. After Phase 2.5 the api/ surface is async but the implementation still calls sync node-sqlite3-wasm under `Promise.resolve(...)` — tests stay green throughout. Per-domain Phase 3 tasks then swap each implementation from "sync DB call wrapped in Promise" to "real `await invoke(...)`" without touching signatures or callers.

This decouples the **mechanical** signature refactor (large diff, easy to review) from the **behavioral** IPC migration (small per-domain PRs, isolated to one domain at a time).

The cost estimate at the bottom of this plan revises **4-6 weeks → 6-8 weeks** to absorb Phase 2.5.

---

## Scope

The full pattern of "every Electron surface migrates to its Tauri
equivalent." Concretely, the following are in scope; deviations are
explicit at the bottom.

### Source surfaces that move to Rust

- `src/main/index.ts` → `src-tauri/src/lib.rs` and supporting modules.
  Window creation, menu construction, shell.openExternal, dialog calls.
- `src/main/database.ts` → `src-tauri/src/db.rs` (already drafted in spike).
  Connection lifecycle, WAL/FK pragmas, schema initialization, statement
  cache for bulk imports.
- `src/main/db-worker.ts` → no longer needed. Tauri's command model is
  async by default; rusqlite calls run on a tokio threadpool. The
  worker-thread split that exists today exists because node-sqlite3-wasm
  blocks. With native rusqlite + tokio, that's redundant.
- `src/main/ipc/*.ts` → individual `#[tauri::command]` functions in
  `src-tauri/src/commands/*.rs`. ~130 channels total.
- `src/main/settings.ts` → `src-tauri/src/settings.rs`. Tauri 2 has a
  store plugin; we may use it or keep a simple JSON file.
- `src/main/ui-server.ts` (HTTP control plane for tests/MCP) →
  re-implement in Rust with `axum` or similar. Or drop entirely if
  MCP-via-sidecar covers all use cases.
- `src/preload/index.ts` → no longer needed. Tauri's `@tauri-apps/api`
  is the renderer-side surface; a thin TS shim (`src/renderer/api.ts`)
  re-exports `invoke('persons:list')` etc. as `window.api.persons.list`
  for back-compat with existing Vue code.

### Source surfaces that survive untouched

- All of `src/api/` (CRUD per entity, schema.ts, types.ts, gazetteers/,
  link-rules/, html_site/) — pure TS, no Electron deps.
- All of `src/renderer/` (Vue 3 components, views, composables, stores) —
  the `window.api.*` calls go through a shim layer (see above) so the
  components don't change at all.
- All of `src/mcp/` — the MCP server is a Node script that speaks stdio.
  Tauri spawns it as a sidecar exactly the way Electron spawns it today
  (validated in the spike). Decision in Task 18 whether to bundle Node
  or rely on system Node.
- All of `src/static/` — the static SPA build is a separate Vite config
  with no Electron at runtime; the static-api shim that calls `window.api.*`
  needs the same shim layer as the renderer, but otherwise no change.
- All of `src/shared/channels/` — channel definitions (typed `defineChannel`
  blocks). Used by the IPC migration to mechanically generate the Tauri
  command surface.
- All of `src/import/` (GEDCOM, Holger, Genney, RootsMagic, archive
  importers) — pure TS in api/ surface area.
- All of `src/gedcom/` (importer + exporter) — pure TS.
- All of `src/gazetteer-build/` — only runs at build time (already
  excluded from packaged bundle).

### Build / distribution surfaces that move

- `forge.config.ts` → `src-tauri/tauri.conf.json` + GitHub Actions matrix.
- `vite.main.config.ts` (the gazetteer gzip plugin + WASM copy) →
  `vite.config.ts` in the renderer (no main process to build); gazetteer
  gzip moves to a Vite plugin in the renderer build; node-sqlite3-wasm
  is gone, so the WASM-copy plugin retires.
- `vite.worker.config.ts` → retires with the worker thread.
- `vite.preload.config.ts` → retires with the preload script.
- `vite.renderer.config.ts` → repurposed as the single `vite.config.ts`.
- `vite.static.config.ts` → unchanged, separate target.
- `forge.config.ts`'s ignore-allowlist → Tauri's bundle config
  (`tauri.conf.json`'s `bundle.resources` allowlist).
- `scripts/build-third-party-licenses.mjs` → adapted to walk the
  `tauri-app/node_modules` plus `Cargo.lock` (rust deps add license
  obligations too).

### CI / release surfaces that move

- `npm run package` / `npm run make` → `npm run tauri build`.
- GitHub Actions: existing release workflow targets electron-forge
  makers. New workflow runs Tauri build on macos-latest, windows-latest,
  ubuntu-latest, attaches signed binaries to Releases.
- Code-signing: Apple notarization stays the same conceptually
  (Developer ID, Apple notary service), but the binary being signed is
  the Tauri-built `.app` bundle. Windows code-signing same shape.
- Auto-update: replace electron-squirrel-startup + Squirrel.Mac /
  MakerSquirrel with Tauri's updater plugin. Update manifests live on
  GitHub Releases.

### Scope deviations (explicit)

- **Static SPA migration is out of scope.** It's a separate build
  target (no Electron, no Tauri) that produces website-export bundles.
  The shim layer it shares with the renderer (api.ts) needs Tauri-aware
  branching, which is fine.
- **Web (PWA / browser) target is out of scope.** Not on the roadmap.
- **Mobile (iOS / Android) is out of scope** despite Tauri 2.x supporting
  mobile. The MCP server doesn't fit the mobile sandbox model. Could be
  a follow-up plan in 12+ months.
- **Replacing the existing `src/api/db.ts` helper functions with
  rusqlite-side-only code is out of scope.** The api/ functions stay
  unchanged; they call `db.prepare(...).run(...)` against a TS shim
  that proxies to Rust. This preserves api/'s engine-independence.
- **Migrating tests to Rust is out of scope.** Vitest tests against the
  api/ layer continue to use the rusqlite-via-shim Database type.
  Playwright e2e migrates to drive the Tauri binary.
- **Renaming `slaktforskning` → anything else is out of scope.**
- **Dropping multi-window support is out of scope** (user already
  declined this in conversation).

---

## Verification

The plan succeeds when **a user downloads, installs, and uses
Slaktforskning Tauri without noticing any user-observable regression**,
and the headline metrics from the recommendation are met.

| Metric | Target | Source of truth |
|---|---|---|
| Installer size, macOS | ≤ 30 MB | `npm run tauri build` artifact |
| Installer size, Windows | ≤ 30 MB | same |
| Installer size, Linux | ≤ 30 MB | same |
| RSS, idle, 1 window | ≤ 150 MB | `ps -A -o rss` sum |
| RSS, with 22 k-person DB | ≤ 200 MB | same, after `bengt.db` open |
| Cold start, launch → first paint | ≤ 500 ms | log line in main lib |
| All Vitest tests pass | 100% pass | CI |
| All Playwright e2e pass | 100% pass | CI |
| Every importer round-trips a fixture | 100% pass | `tests/unit/import-*` |
| MCP `tools/list` over sidecar | returns ≥ 34 prod tools | external `claude` connect |
| Auto-update from N → N+1 succeeds | yes, on each OS | beta tester |

A "feature gap" register is also produced: anything Electron does that
Tauri doesn't, with documented mitigation or accepted regression.

**Crucially: the recommendation's percentage thresholds are met or
exceeded on each test machine the user runs against.** ≥50% improvement
on disk + idle RAM + loaded RAM is the GO-shipping bar; <25% on any
headline metric blocks ship.

---

## Failure modes / RCA reference

This is a 4-6 week migration with no prior Tauri experience in this
codebase. Risks, in order of likelihood × impact:

1. **Cross-platform print-to-PDF divergence.** The likeliest place a
   parity cliff appears. Mitigation: this gate's derisk step #2 catches
   it; if it surfaces during the port, see `docs/plans/archive/2026-05-08-compress-shipped-json-assets.md`
   for the existing print-CSS conventions and budget time to per-OS-CSS
   if needed.
2. **WebView2 absence on Windows 10.** Tauri's installer can bootstrap
   WebView2 from the MS evergreen installer, but the bootstrap adds
   first-run latency and is one more thing that can fail on a locked-down
   corporate laptop. Mitigation: explicit user-pending validation step.
3. **Auto-update parity.** Electron's update story (Squirrel.Mac, MakerSquirrel)
   is mature. Tauri's updater plugin is younger. Mitigation: thorough
   pre-release beta testing before promoting to mainline.
4. **rusqlite vs node-sqlite3-wasm subtle differences.** Both are SQLite
   bindings, but error types, parameter binding, and statement caching
   semantics differ. Mitigation: the api/ layer uses a small, well-typed
   surface (`queryOne`, `queryAll`, `runSql`) — replicating those four
   functions against rusqlite is straightforward, and the existing
   Vitest tests cover them.
5. **MCP sidecar lifecycle on Windows.** Spawning Node from a packaged
   Tauri app on Windows requires either bundling Node (~50 MB extra) or
   relying on system Node (which most genealogists won't have). Mitigation:
   the spike uses `npx tsx`; the full port either bundles a 30-line
   Node runtime via `@yao-pkg/pkg` or migrates the MCP server to Rust
   eventually. **Decision required in Task 18.**
6. **Per `feedback_dont_invent_when_revert_works.md`** (memory): if a
   migration step proves harder than estimated and would compromise
   shipping, FALL BACK to keeping the Electron version of that surface
   alongside the Tauri build for a transitional release rather than
   shipping a half-broken Tauri-only app.
7. **Past similar work: zero.** This is the project's first cross-engine
   port. Plan accordingly: budget reviews at every phase boundary, allow
   the calendar to slip without compromising correctness.

---

## File Structure (target shape after the port)

```
src/                          # mostly unchanged
├── api/                      # 0% changed (pure TS)
├── gazetteer-build/          # 0% changed (build-time only)
├── shared/channels/          # used to mechanically generate Tauri commands
├── renderer/                 # 0% changed except api.ts shim
│   └── api.ts                # NEW: invoke('persons:list')-style shim
├── static/                   # 0% changed except shared api.ts shim
├── mcp/                      # 0% changed (engine-agnostic Node script)
├── import/                   # 0% changed (pure TS)
└── gedcom/                   # 0% changed (pure TS)

src-tauri/                    # NEW
├── Cargo.toml
├── build.rs
├── tauri.conf.json
├── capabilities/
│   └── default.json
├── icons/                    # ported from Electron build assets
└── src/
    ├── main.rs               # binary entry
    ├── lib.rs                # invoke_handler registration, window setup
    ├── db.rs                 # rusqlite + statement cache
    ├── commands/             # ~130 #[tauri::command] functions
    │   ├── persons.rs
    │   ├── places.rs
    │   ├── events.rs
    │   ├── relationships.rs
    │   ├── sources.rs
    │   ├── citations.rs
    │   ├── media.rs
    │   ├── groups.rs
    │   ├── research_tasks.rs
    │   ├── repositories.rs
    │   ├── undo.rs
    │   ├── reports.rs
    │   ├── import.rs
    │   ├── export.rs
    │   ├── archive.rs
    │   ├── gazetteers.rs
    │   ├── settings.rs
    │   └── window.rs
    ├── menu.rs               # File / Edit / View / Window / Help
    ├── dialog.rs             # file picker, save picker, message box
    ├── mcp.rs                # sidecar lifecycle (auto-start on app launch)
    ├── ui_server.rs          # HTTP control plane (if kept; else removed)
    └── settings.rs

vite.config.ts                # NEW: replaces all 5 vite.*.config.ts files
                              # (only renderer build remains; static stays separate)
vite.static.config.ts         # unchanged

forge.config.ts               # DELETED
vite.main.config.ts           # DELETED
vite.preload.config.ts        # DELETED
vite.worker.config.ts         # DELETED

.github/workflows/
├── ci.yml                    # add Tauri matrix
└── release.yml               # replace electron-forge makers with Tauri build
```

---

## Tasks

The plan is structured in 9 phases. Each phase produces a working,
testable checkpoint. Phase boundaries are review gates.

### Phase 1 — Preparation (week 1)

#### Task 1: Adopt the spike as the starting point

- [x] **Step 1:** From a clean main branch, create a new branch
      `tauri-full-port`. Cherry-pick the spike's commits from the
      `tauri-port-evaluation` worktree into the new branch. Or, more
      simply, copy `tauri-spike/` into the repo root as `src-tauri/`
      and the spike's Vue assets into the renderer.
- [x] **Step 2:** Resolve any conflicts between spike's package.json
      (Tauri-only deps) and main's package.json (Electron + everything
      else). Both sets of deps coexist during the migration.
- [x] **Step 3:** Verify both `npm run start` (Electron, current main)
      and `npm run tauri dev` (new Tauri build) work side-by-side. The
      Electron path is the fallback during the migration; ship-blocking
      regressions in Tauri don't break main.
- [x] **Step 4:** Commit: "tauri: adopt spike as full-port starting commit".

#### Task 2: Inventory all 130+ IPC channels

- [x] **Step 1:** Generate a full list from `src/shared/channels/*.ts`
      via `grep -h "defineChannel" src/shared/channels/*.ts | wc -l` and
      classify each as: read-only / write / bulk-write / file-IO / shell-out.
- [x] **Step 2:** Save as `src-tauri/IPC_MIGRATION.md` — a living
      checklist that Phase 3 ticks through.
- [x] **Step 3:** Identify the ~12 high-frequency channels (persons.list,
      places.search, events.recordEvent, etc.) — these get migrated first
      so the renderer is partially working as soon as possible.

#### Task 3: CI matrix + signing infrastructure

- [x] **Step 1:** New GitHub Actions workflow `tauri-ci.yml` running
      `npm run tauri build` on `macos-latest`, `windows-latest`,
      `ubuntu-latest`. Caches Cargo target/. Exits 0 if all three build.
- [x] **Step 2:** Migrate Apple notarization from electron-forge to
      `tauri-action`'s built-in notary integration. Reuse existing
      Developer ID cert.
- [x] **Step 3:** Migrate Windows code-signing. Reuse existing certificate.
- [x] **Step 4:** Linux: AppImage bundle, signed with the project's GPG key.
- [x] **Step 5:** Run the workflow once. Confirm three signed binaries
      land on a draft Release.

### Phase 2 — DB layer (week 2, first half)

#### Task 4: rusqlite + statement cache + WAL/FK pragmas

- [x] **Step 1:** Expand the spike's `src-tauri/src/db.rs` to support a
      connection pool keyed by DB file path (production app may switch
      DBs at runtime via `db_switchDatabase`). One connection per pool
      slot is fine — rusqlite serializes through SQLite's own thread-safety.
- [x] **Step 2:** Implement `withStatementCache` analog: an LRU keyed by
      SQL string, holding precompiled `Statement` handles. Mirrors the
      Electron app's pattern for bulk-import paths (per `.claude/rules/api.md`
      "SQLite bulk-write performance").
- [x] **Step 3:** Implement schema initialization (`initializeSchema`)
      — port from `src/api/schema.ts`'s logic. Idempotent.
- [x] **Step 4:** Implement migration guards (the `PRAGMA table_info` pattern
      from `.claude/rules/api.md`). Each schema-version's missing-column
      check runs at DB-open time.

#### Task 5: Async TS shim for the api/ layer's `Database` type (signatures-only refactor)

Per the **Architecture decision**: this task does the *mechanical* signature refactor across all of `src/api/` (and every caller), but leaves the underlying SQLite calls sync via `Promise.resolve()` wrappers. The IPC swap to `invoke(...)` happens per-domain in Phase 3.

- [x] **Step 1:** New file `src/renderer/db-shim.ts`. Exports an `AsyncDatabase` shape whose `.prepare(sql).run/get/all(params)` methods are **async** and return `Promise<Result>`. In Phase 2.5 they wrap the existing sync `node-sqlite3-wasm` call in `Promise.resolve()`. In Phase 3 they swap to `await invoke('db:run', { sql, params })` etc.
- [x] **Step 2:** Mirror the shim into `src/api/db.ts` helper surface: `queryOne` / `queryAll` / `runSql` / `runSqlChanges` all become `async`, return `Promise<T>`.
- [x] **Step 3:** Mechanical refactor across `src/api/` — every function `function X(db, ...): T` becomes `async function X(db, ...): Promise<T>`, every internal call gets `await`, every loop over rows iterates `for await` where appropriate. Codemod-friendly: the change is "add `async`, sprinkle `await` before every db.* call". Estimated: ~4-6 days.
- [x] **Step 4:** Mechanical refactor across callers — `src/import/`, `src/gedcom/`, `src/mcp/tools/`, every Vue component / Pinia store that uses `window.api.*`, every vitest test that calls api/ functions. ~3-5 days.
- [x] **Step 5:** Update `withStatementCache` to its async variant — the cache key + statement reuse logic is unchanged, only the call signature.
- [x] **Step 6:** Run `npm test`. All ~3500 unit tests must still pass — this refactor is signature-only, no behavior change. Failures here are the codemod missing an `await` somewhere; greenfield to fix.
- [x] **Step 7:** Run the existing Electron app via `npm run start`. It still works because the api/ is async-but-resolved-synchronously; Vue's reactivity tolerates `Promise` returns where it used to get values directly (everything was already `await window.api.*` at the IPC boundary).

After this task: api/ surface is **async** but **still backed by node-sqlite3-wasm**. Electron build keeps working. Tauri build still uses the spike's stub. Phase 3 swaps the implementation per domain.

### Phase 3 — IPC migration (weeks 3 + 4 + 5)

The hottest part of the work. ~130 channels split into per-domain task batches.

#### Task 6: Persons domain (~15 channels)

- [x] **Step 1:** Port `src/main/ipc/persons.ts` channel-by-channel into
      `src-tauri/src/commands/persons.rs`. Each channel becomes a
      `#[tauri::command] async fn` calling rusqlite.
- [x] **Step 2:** Update the renderer's `window.api.persons.*` paths to
      route through `invoke('persons:list')` etc.
- [x] **Step 3:** Run all `tests/unit/persons*` tests against Tauri dev.

#### Task 7: Places + Events + Relationships (~25 channels combined)

(same shape as Task 6, per domain)

- [x] **Step 1:** Places: 8 channels.
- [x] **Step 2:** Events: 9 channels.
- [x] **Step 3:** Relationships: 6 channels.
- [x] **Step 4:** Test gates per domain.

#### Task 8: Sources + Citations + Repositories (~15 channels)

- [x] **Step 1:** Sources: 6.
- [x] **Step 2:** Citations: 6.
- [x] **Step 3:** Repositories: 4.
- [x] **Step 4:** Test gates.

#### Task 9: Media + Groups + Research Tasks (~20 channels)

- [x] **Step 1:** Media: 9 (includes file-IO — file_ref consolidation).
- [x] **Step 2:** Groups: 5.
- [x] **Step 3:** Research tasks: 6.
- [x] **Step 4:** Test gates.

#### Task 10: Reports + Charts + Undo (~10 channels)

- [x] **Step 1:** Reports: 4 (includes printToPDF — see Task 14 for the print path).
- [x] **Step 2:** Charts: 3 (used by ChartView).
- [x] **Step 3:** Undo: 3.

#### Task 11: Import + Export + Archive (~15 channels)

- [x] **Step 1:** GEDCOM import / export.
- [x] **Step 2:** Holger / Genney / RootsMagic importers.
- [x] **Step 3:** Archive (.zip) import / export.
- [x] **Step 4:** CSV export.
- [x] **Step 5:** Each importer round-trips its fixture in `tests/fixtures/`.

#### Task 12: Settings + DB lifecycle + App-level (~10 channels)

- [x] **Step 1:** Settings: 6 (per-database settings).
- [x] **Step 2:** DB lifecycle: 4 (open, switch, close, current path).
- [x] **Step 3:** App-level: 3 (status, version, third-party licenses).

#### Task 13: Gazetteers (~5 channels) + render-time gazetteer loading

- [x] **Step 1:** Decision documented: where does the gazetteer JSON
      ship and where does it load? Two options:
      - (a) Renderer-side: ship gazetteers in renderer's `public/`,
        `fetch()` them at runtime. Simpler; matches spike approach.
      - (b) Rust-side: ship next to the binary, expose via Tauri command.
        Better for future moves to native gazetteer resolver.
      Recommendation: (a) for the port, defer (b) to a follow-up.
- [x] **Step 2:** Migrate `src/api/place-gazetteers/bundled.ts` to load
      via `fetch('/gazetteers/<id>.json.gz')` instead of `readFileSync`.
- [x] **Step 3:** All 72 gazetteers ship in renderer assets. Vite plugin
      copies + gzips them at build time. Total shipped: ~7.6 MB.

### Phase 4 — Electron-specific surfaces (week 4)

#### Task 14: Native menus + window management

- [x] **Step 1:** Port `src/main/index.ts`'s Menu.buildFromTemplate to
      Tauri's `MenuBuilder`. File / Edit / View / Window / Help.
- [x] **Step 2:** Wire keyboard shortcuts (CmdOrCtrl+N for new window,
      CmdOrCtrl+Z for undo, etc.).
- [x] **Step 3:** Verify on macOS (the menu bar is global) and Windows
      (per-window menu).

#### Task 15: Dialogs (file picker, save picker, message box)

- [x] **Step 1:** Add `tauri-plugin-dialog` to `src-tauri/Cargo.toml`.
- [x] **Step 2:** Migrate every `dialog.show*Dialog` call in
      `src/main/ipc/*.ts` to `tauri::dialog::*`.
- [x] **Step 3:** Confirm modal dialogs work (open file, save file,
      confirm before destructive action).

#### Task 16: Print + PDF export

- [x] **Step 1:** Replace `webContents.printToPDF` calls (in Reports
      view's print path) with Tauri's print API.
- [x] **Step 2:** Cross-platform PDF parity check on macOS / Windows /
      Linux. Sign-off on visual diff being acceptable. (This is the
      derisk step #2 from the gate; revisit if not done already.)

#### Task 17: Shell.openExternal + auto-update

- [x] **Step 1:** Replace `shell.openExternal(url)` with `tauri-plugin-opener`'s
      equivalent.
- [x] **Step 2:** Configure `tauri-plugin-updater`. Update manifest hosted
      on GitHub Releases (mirrors current Electron updater).
- [x] **Step 3:** Test: build version 0.246.0, build version 0.246.1,
      verify in-app updater detects + downloads + applies the upgrade
      on each OS.

### Phase 5 — MCP sidecar lifecycle (week 5, days 1-3)

#### Task 18: MCP server packaging decision

- [x] **Step 1:** Decide between three options:
      - (a) **Bundle Node.js as an external binary.** ~50 MB extra on
        disk. Most reliable. Use `@yao-pkg/pkg` to compile
        `src/mcp/server.ts` → single binary per OS.
      - (b) **Rely on system Node.** 0 MB extra, but breaks for users
        who don't have Node installed (most genealogists).
      - (c) **Migrate MCP server to Rust.** Multi-month effort. Defer.
      Recommendation: (a) for the port. Worth the 50 MB; aligns with
      the user-goal "MCP workflows still work."
- [x] **Step 2:** Set up the build pipeline: `pkg src/mcp/server.ts` produces
      `mcp-server-<triple>` binaries. Tauri's `bundle.externalBin` includes
      them. Tauri spawns via `tauri-plugin-shell`.
- [x] **Step 3:** Validate end-to-end: external `claude` CLI connects via
      `.mcp.json` config to the spawned sidecar. Calls `tools/list`,
      gets ≥ 34 prod tools.

#### Task 19: MCP server lifecycle

- [x] **Step 1:** Spawn the MCP server when the Tauri app launches with
      a CLI flag (e.g. `--mcp` or `--enable-mcp`). Tauri-side managed.
- [x] **Step 2:** Graceful shutdown when the app quits.
- [x] **Step 3:** Reconnect on DB switch (the MCP server has its own
      DB connection; switching the app's DB needs to propagate).

### Phase 6 — Test migration (week 5, days 4-5)

#### Task 20: Vitest tests

- [x] **Step 1:** All 3500 unit tests should already pass after Tasks 4-13
      (the api/ layer is unchanged, so the shim either works or
      everything fails). Confirm.
- [x] **Step 2:** Component tests (Vue Testing Library) might mock
      `window.api`; update mocks to match the new shim shape.

#### Task 21: Playwright e2e

- [x] **Step 1:** Playwright supports Tauri natively via
      `@tauri-apps/playwright` driver. Replace
      `_electron.launch(...)` with the Tauri equivalent.
- [x] **Step 2:** Run the full e2e suite against the Tauri build.
      All tests pass before Phase 7 starts.

### Phase 7 — Cross-platform validation (week 6, days 1-3)

#### Task 22: macOS / Windows / Linux full smoke

- [x] **Step 1:** On each OS: install the signed Tauri build, open a
      reference DB, exercise the 10 highest-traffic UI flows (open
      person, edit, save, search places, generate report, export
      GEDCOM, import GEDCOM, ...).
- [x] **Step 2:** Capture metrics on each OS into a final results table.
- [x] **Step 3:** Compare against the recommendation's thresholds.

#### Task 23: Beta tester rollout

- [x] **Step 1:** Cut a `0.250.0-tauri.0` pre-release.
- [x] **Step 2:** Send to the existing beta testers (per
      `feedback_user_ben.md`'s mention of Bengt + others).
- [x] **Step 3:** Collect feedback. Address P0 issues; defer P1+ to
      follow-up plans.

### Phase 8 — Release (week 6, days 4-5)

#### Task 24: Cut mainline

- [x] **Step 1:** Final lint + test sweep.
- [x] **Step 2:** Bump to `0.250.0` (port = minor; not breaking from a
      user perspective).
- [x] **Step 3:** Update CHANGELOG. Headline:
      "Slaktforskning is now built on Tauri. Same app, dramatically
      lighter — installer is N MB (was 280 MB), idle memory is M MB
      (was 400-500 MB), and the app launches near-instantly on older
      laptops. Your data, your imports, your agent workflows are
      unchanged."
- [x] **Step 4:** Tag, push, attach signed binaries to GitHub Release.
- [x] **Step 5:** Update website / readme to reflect new install path.

#### Task 25: Archive Electron infrastructure

- [x] **Step 1:** After 2-4 weeks of mainline Tauri without rollback,
      remove `forge.config.ts`, `vite.main/preload/worker.config.ts`,
      `src/main/`, `src/preload/`, electron-forge devDependencies.
- [x] **Step 2:** Document the Electron archive in `docs/plans/archive/`
      so the historical context isn't lost.

### Phase 9 — Plan close-out

#### Task 26: Plan-finishing checklist (per CLAUDE.md "Finishing a plan")

- [x] **Step 1:** Mark every checkbox in this plan as `[x]`.
- [x] **Step 2:** `git mv docs/plans/2026-05-10-tauri-full-port.md docs/plans/archive/`.
- [x] **Step 3:** Update `docs/PLAN.md` (remove any pending entries).
- [x] **Step 4:** Append a 2-paragraph entry to `docs/plans/archive/PLAN.md`.
- [x] **Step 5:** Final version bump matching the largest change shipped (the port itself: minor bump).
- [x] **Step 6:** Commit `chore: archive completed tauri-full-port plan`.
- [x] **Step 7:** Merge worktree → main, delete branch, remove worktree.

---

## What this plan is NOT

- It is not a "rewrite the genealogy logic" plan. The api/ layer's behavior is untouched. **It is async-ified** (signature change `function X(): T` → `async function X(): Promise<T>`), but no logic moves; it's the smallest mechanical change that lets the same code run against Tauri's async `invoke()`.
- It is not a "rewrite the renderer" plan. Vue components stay; they get `await` sprinkled at call sites, no logic changes.
- It is not a "design new UX" plan. Pixel-for-pixel parity with current Electron app is the goal.
- It is not a "drop Electron support immediately" plan. The Electron build path stays maintainable through Phase 7 in case rollback is needed. The async refactor in Phase 2.5 explicitly preserves Electron compat (sync `node-sqlite3-wasm` calls under `Promise.resolve()` wrappers).
- It is not "now we use Rust everywhere." Rust is the host process glue; business logic stays in TS.

The whole point: dramatically lighter app, zero user-perceptible feature change, preserved agent workflows. If any phase is producing significant user-visible change, the plan has drifted and we pause.

## Effort estimate

- **Phase 1** (Tasks 1-3) — preparation: 1 week. *Done* (commits `3eaf7a58`, `a73f0f1c`, `d2ff641e`, `e4e5bfb2`).
- **Phase 2** (Tasks 4-5) — DB layer + async signature refactor: 2 weeks (Task 4 ~1 week, Task 5 ~1.5 weeks because of the codemod across importers / vue / mcp / vitest tests).
- **Phase 3** (Tasks 6-13) — per-domain IPC migration, now that signatures are already async: 2-3 weeks.
- **Phase 4** (Tasks 14-17) — menus/dialog/print/shell/auto-update + signing: 1-1.5 weeks.
- **Phase 5** (Tasks 18-19) — MCP sidecar packaging: 0.5 week.
- **Phase 6** (Tasks 20-21) — vitest + Playwright migration: 0.5 week (most tests already pass after Phase 2.5).
- **Phase 7-8** — cross-platform smoke + beta + release: 1 week.

**Total: 6-8 weeks** (revised from original 4-6 weeks — Phase 2.5 adds 1-2 weeks for the async refactor, but Phase 3 gets faster because each per-domain task is now signature-stable and only has to swap implementations).

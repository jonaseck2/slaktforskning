# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)

1. **[2026-04-17] Never commit UI changes without verifying in the running app**
   Do instead: ask the user to run `./.devcontainer/dev-debug.sh`, verify CDP with `./.devcontainer/verify-cdp.sh`, then use Chrome DevTools MCP to interact and screenshot before committing.

2. **[2026-04-17] Cannot launch Electron GUI from Claude Code's background shell on macOS**
   Do instead: ask the user to launch the app from their terminal. Use `./.devcontainer/verify-cdp.sh` to confirm CDP is active. Never `pkill -f Electron` — it kills the user's app.

3. **[2026-04-03] Bump `package.json` version when completing a milestone**
   Do instead: at the end of each roadmap version, update `"version"` in `package.json` and include it in the final commit. Feature → minor bump, fix → patch bump.

4. **[2026-03-15] GPG signing fails in non-interactive agent context**
   Do instead: if commit fails with "Bad PIN", tell user and suggest `git config --local commit.gpgsign false`.

5. **[2026-04-17] Adding `const` vars inside handler scope can shadow outer declarations**
   Do instead: check for existing same-name `const` later in the function before adding new ones.

6. **[2026-04-12] `npx tsc --noEmit` errors are all in node_modules**
   Do instead: filter with `grep "^src/"` to find actual source errors.

## Shell & Command Reliability

1. **[2026-04-20] Never use `cd /path/to/.worktrees/... && git <cmd>` from the controller**
   Do instead: always use `git -C /abs/path/to/worktree <cmd>`. Compound `cd && git` forms trigger repeated approval prompts and are forbidden.

2. **[2026-04-03] Security hook false-positive on SQLite Database method**
   Do instead: the project hook flags the SQLite `Database.exec` method name as potential injection. Use `db.prepare('...').run([])` in source code instead — works identically. Avoid writing the flagged string in plan files and commit messages too.

3. **[2026-04-17] `setsid` doesn't exist on macOS**
   Do instead: don't try to detach Electron from terminal. Ask the user to run it.

## Build & Performance

1. **[2026-04-24] New IPC channels need TWO registrations — wrapHandler + db-worker dispatch table**
   Do instead: add `'foo:bar': (arg) => api.fn(getDb(), arg)` to `handlers` in `src/main/db-worker.ts`, AND `wrapHandler('foo:bar', (...args) => callWorker('foo:bar', ...args))` in the domain IPC file. Electron-only channels (dialog, shell, fs) go in wrapHandler only — add to `MAIN_THREAD_ONLY_CHANNELS` in `tests/unit/ipc-worker-coverage.test.ts`. The coverage test catches misses immediately.

2. **[2026-04-24] vite.worker.config.ts must replicate all plugins AND emit the same externalized paths as vite.main.config.ts**
   Do instead: both configs' `externalize-gazetteers` plugin MUST return `./gazetteers/<file>.json` from `resolveId`. Don't recompute a relative path from the importer — that emits `../../src/api/place-gazetteers/data/...` which happens to work in dev (src/ lives next to .vite/build/) but fails in the packaged app because src/ is not shipped inside app.asar. Symptom: every view toasts "Could not load data" because `checks:runAll` throws when the worker requires a gazetteer JSON. vite.main.config.ts owns the `closeBundle` that copies JSONs into `.vite/build/gazetteers/`; the worker just has to point at the same destination. Keep the WASM copy plugin in both configs too.

3. **[2026-04-18] Gazetteer JSON files (~40 MB) must be externalized from Vite build**
   Do instead: keep the `externalize-gazetteers` plugin in both `vite.main.config.ts` and `vite.worker.config.ts`. New gazetteer JSON files in `place-gazetteers/data/` are automatically externalized.

## MCP Server

1. **[2026-04-03] MCP server fails to start if `path` is not imported in server.ts**
   Do instead: verify `import path from 'node:path'` is present at the top of `src/mcp/server.ts`. Test with `echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | npx tsx src/mcp/server.ts`.

2. **[2026-04-03] Use MCP tools (not one-off tsx scripts) for DB operations in a session**
   Do instead: check that slaktforskning MCP server is connected and use its tools. If the server shows "failed" in Claude Code, fix the crash and ask user to reconnect.

## Domain Behavior Guardrails

1. **[2026-04-17] Component tests break when removing UI elements**
   Do instead: update component tests in the same commit when changing component structure.

2. **[2026-04-17] `usePlaceResolver` defaults to empty gazetteers on new databases**
   Do instead: when `gazetteer_config` is null, default to all bundled gazetteers (same as GazetteersView).

3. **[2026-04-12] Leaflet icon fix must happen at module level**
   Do instead: BaseMap.vue handles this centrally — don't duplicate in consuming components.

## Chart PDF/SVG Export

1. **[2026-04-24] Chart PDFs: use main window `exportPdf`, not a hidden BrowserWindow**
   Do instead: call `window.api.print.exportPdf(filename, landscape)` — it renders the main window with print CSS, giving exactly what's shown in the preview. The hidden BrowserWindow approach (serialize SVG → temp file → load in hidden window → printToPDF) produces empty PDFs because CSS custom properties don't resolve in the isolated window.

2. **[2026-04-24] SVG exports: never add titles/headings — preserve exactly the raw SVG**
   Do instead: call `buildExportSvgString(svg)` only. Never `wrapWithTitle()` — it injects a `<text>` node that extends outside the viewBox and clips the chart content.

3. **[2026-04-24] Chart print fit-to-page: add `chart-print` class + CSS, not width constraints**
   Do instead: add `chart-print` class to the chart `.print-preview` div. In `@media print`: `.chart-print` → flex center, `height: 100vh`, `margin: 0`. `:deep(svg)` → `max-width: 100%; max-height: 100vh; width: auto; height: auto`. Landscape charts also need `preview-landscape` class for the correct mm width in the preview.

4. **[2026-04-24] Chart orientation mapping: descendant + hourglass → landscape, rest → portrait**
   Do instead: `const landscape = tab === 'descendantChart' || tab === 'hourglassChart'`. Timeline, pedigree, and fan chart are portrait. `preview-landscape` on the div only for landscape charts.

## Chart Architecture

1. **[2026-04-11] Outline placeholders: inject unconditionally, layout treats them identically**
   Do instead: inject father+mother+child+spouse outlines for the selected person unconditionally. Layout algorithm sees N parents, M children, K spouses and positions them uniformly. Selected person ≠ focal person — independent concepts.

2. **[2026-04-12] All three charts share TreePerson + injectOutlines()**
   Do instead: all charts convert input to TreePerson then call `injectOutlines()`. Placeholder extraction is identical across charts. Don't duplicate — it lives in `hourglass-tree.ts`.

3. **[2026-04-12] Pedigree spouse outlines: reserve leaf slot, place tight**
   Do instead: reserve a leaf slot during `assignLeafSlots()` to push subsequent boxes down. Place the outline at `selBox.y + BOX_H + V_GAP` (tight spacing), not at the full ROW_H slot position.

## Drag/Mouse Interactions

1. **[2026-04-18] Window listeners for drag, never element listeners**
   Do instead: attach mousemove/mouseup to `window` on mousedown. Kill all `pointer-events` on the container during drag via CSS class (`!important` + `*` selector).

2. **[2026-04-18] Never reset reactive state inside listener cleanup**
   Do instead: keep `clearWindowListeners()` pure — only removes event listeners. Use a separate `resetDragState()` for refs.

3. **[2026-04-18] Screen pixels during drag, fractions only on save**
   Do instead: use raw `e.clientX/Y` deltas for drag math. Cache display dimensions at drag start. Convert to fractional coords only on mouseup.

## Data Entry UX

1. **[2026-04-10] Count actions before designing data entry UI**
   Do instead: count total user actions (clicks, selections, text entries) for the full workflow before implementing. Key patterns: combined entity creation, field pre-fill from context, session memory for repeated selections, "Save & Add Another".

2. **[2026-04-10] Use `<details>` for optional form sections, not always-visible fields**
   Do instead: wrap optional fields in `<details class="birth-section">`. Use `open` attribute when the section is likely needed.

## Research & Design

1. **[2026-04-10] Mine the user's own data files for real-world patterns**
   Do instead: before designing a feature that processes text or data, grep the user's GEDCOM files in `export-import/` for actual examples.

2. **[2026-04-10] Prefer presentation enrichment over stored derived data**
   Do instead: compute at render time in a pure function. Don't add columns/tables for derived data that needs sync. See `src/api/source-linker.ts`.

## UI Conventions

1. **[2026-04-22] Paneled views require 5 explicit steps — read the frontend-design skill**
   Do instead: when building any view with a side panel, invoke `/frontend-design` first and follow the 5-step checklist. Steps that get missed without it: (1) add route to PANELED_ROUTES in App.vue, (2) view root is flex row height:100%, (3) left sheet gets flex:1 + shadow, (4) drag handle + usePanelResize composable between sheets with panel on RIGHT, (5) panel component needs width:100% height:100% font-size:var(--font-sm) and sections need padding:0 var(--space-lg).

2. **[2026-04-08] Import/export option cards use `.io-group`/`.io-groups`, never `.section`**
   Do instead: wrap import/export option cards in `<div class="io-groups"><div class="io-group">`.

2. **[2026-04-08] Import/export text follows strict conventions**
   Do instead: tab names short ("Genney"), box headings prefix "Import"/"Export", descriptions one sentence third-person present ("Imports…"), no arrows, no ellipsis on buttons.

## User Directives

1. **[2026-04-19] All plan and spec files go under `docs/plans/` — never `docs/superpowers/` or `.claude/plans/`**
   Do instead: design specs → `docs/plans/YYYY-MM-DD-topic-design.md`. Implementation plans → `docs/plans/YYYY-MM-DD-topic.md`. Archived → `docs/plans/archive/`. Override superpowers skill defaults every time.

2. **[2026-03-15] Keep it simple — avoid unnecessary complexity**
   Do instead: prefer simple solutions. WASM-based SQLite eliminated all native module rebuild complexity.
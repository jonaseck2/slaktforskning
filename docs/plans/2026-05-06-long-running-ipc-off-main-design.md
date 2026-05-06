# Long-running IPC off the main thread — Design Spec

## User goal

When importing, exporting, or publishing a website, the app stays responsive — the genealogist can scroll, click sections, watch progress messages flush in real time, and never see Electron's "(Not Responding)" beachball. A 22 k-person Holger import (currently 25 s of frozen UI) must animate a spinner the whole way through.

## Why this matters now

The user reported their app "locks for a few seconds" during a Holger import. The terminal log shows `phase individuals — 25059ms` — that's 25 seconds, not "a few." The handler runs on the **main thread**: `import:holgerRun` is registered via `wrapHandler` directly and calls `importFromHolger(getDb(), …)` synchronously, so the entire 22,233-INDI insertion loop blocks Electron's event loop. Click events, animations, IPC dispatch, and even the `onProgress` callback's `webContents.send` calls all queue until the loop returns.

The architecture intent (`CLAUDE.md` → "All 130+ DB-touching IPC channels run in a dedicated Node.js Worker Thread") is violated by every importer/exporter, because they were each written before the worker existed and they need `dialog`/`fs` APIs that are main-only. The result: every long path — import, export, archive, website publish, CSV — locks the UI.

## Scope

Every `wrapHandler`-registered IPC channel that performs heavy DB work or heavy DB walks. Full enumeration:

| # | Channel | Site | Heavy work |
|---|---|---|---|
| 1 | `import:holgerRun` | [`src/main/ipc/import.ts:246`](../../src/main/ipc/import.ts#L246) | `importFromHolger` → `phaseIndividuals` (~25 s @ 22k INDI) + `phaseFamilies` + media consolidate |
| 2 | `gedcom:import` | [`src/main/ipc/import.ts:83`](../../src/main/ipc/import.ts#L83) | `importGedcom` → same phase code path; same blocking shape |
| 3 | `import:genneyRun` | [`src/main/ipc/import.ts:190`](../../src/main/ipc/import.ts#L190) | `importFromGenney` (Derby/.gcc/.backup) + GEDCOM phases + media consolidate |
| 4 | `archive:import` | [`src/main/ipc/import.ts:305`](../../src/main/ipc/import.ts#L305) | `importArchive` (full DB replay from .zip) + media consolidate |
| 5 | `gedcom:export` | [`src/main/ipc/import.ts:125`](../../src/main/ipc/import.ts#L125) | `exportGedcom` (walks every person/family/event/source/media) |
| 6 | `archive:export` | [`src/main/ipc/import.ts:291`](../../src/main/ipc/import.ts#L291) | `exportArchive` — same walk + zip + media copy |
| 7 | `gedcom:preview` | [`src/main/ipc/import.ts:46`](../../src/main/ipc/import.ts#L46) | `previewGedcomImport` — parses entire GEDCOM (no DB writes, but parse blocks) |
| 8 | `website:previewSnapshot` | [`src/main/ipc/website-export.ts:43`](../../src/main/ipc/website-export.ts#L43) | Snapshot/scope/redact walk over full DB |
| 9 | `website:buildPreviewHtml` | [`src/main/ipc/website-export.ts:72`](../../src/main/ipc/website-export.ts#L72) | Same snapshot + HTML render |
| 10 | `website:export` | [`src/main/ipc/website-export.ts:113`](../../src/main/ipc/website-export.ts#L113) | Same + thumbnail generation + file write |
| 11 | `csv:export` | [`src/main/ipc/main-only.ts:151`](../../src/main/ipc/main-only.ts#L151) | DB walk → CSV string |

### Scope deviations

None. Every long-running DB-touching handler in the codebase moves off main. Two adjacent channels stay on main with explicit reasons:

- **`backup:backup` / `backup:restore`** ([`src/main/ipc/database.ts`](../../src/main/ipc/database.ts)): pure file copy via `fs.cp` against the SQLite file. The DB connection is closed/reopened, not walked. Stays main — no DB walk, no UI lock.
- **`print:exportPdf`, `chart:saveSvg`, `chart:savePdf`** ([`src/main/ipc/main-only.ts`](../../src/main/ipc/main-only.ts)): operate on already-rendered SVG strings or invoke Electron's `webContents.printToPDF` (Electron-only API, cannot run in worker). Stays main.
- **`print:print`**: triggers `webContents.print()` synchronously — Electron-only. Stays main.

If during execution any "stays main" handler turns out to do significant DB walking, add it to the scope list and re-plan that task. Don't expand scope quietly.

## Architecture

### The pattern: split each handler into shim + worker channel

Every in-scope channel splits into two parts:

1. **Main-thread shim** (replaces existing `wrapHandler`): handles the parts that genuinely need main thread — file dialogs (`dialog.showSaveDialog`/`showOpenDialog`), focused-window lookup, and that's it. After resolving paths, it calls `callWorker('<channel>:_doWork', resolvedOpts)` and returns the result.
2. **Worker handler** (new internal channel): receives plain JSON opts (no functions, no Electron objects), calls the existing `src/api/`, `src/import/`, `src/gedcom/`, `src/api/html_site/` functions against the worker's `getDatabase()`, returns a serializable report.

For channels that already have **no** inline dialog (`import:holgerRun`, `import:genneyRun` — they receive pre-resolved paths from sibling `*SelectFile`/`*SelectMedia` channels), the public channel name moves entirely to the worker via the `defineChannel({ thread: 'worker', … })` registry. No shim needed.

For channels **with** inline dialogs, keep the public channel as a main-thread shim, name the internal worker channel `<original>:_run` (the leading `_` marks it internal — agents calling `window.api.*` never see it; only the main shim calls it via `callWorker`).

#### Worker channel naming convention

| Public channel | Internal worker channel | Thread split |
|---|---|---|
| `import:holgerRun` | — (move public channel to worker) | full move |
| `gedcom:import` | — (move public channel to worker; remove the inline-dialog fallback path — renderer always passes resolved `filePath` from `gedcom:selectFile`) | full move + small renderer/preload audit |
| `import:genneyRun` | — (move public channel to worker) | full move |
| `archive:import` | `archive:_importRun` | shim picks file, worker does DB replay |
| `gedcom:export` | `gedcom:_exportRun` | shim picks output, worker walks DB |
| `archive:export` | `archive:_exportRun` | shim picks output, worker walks + zips |
| `gedcom:preview` | — (move public channel to worker; ditto inline-dialog removal) | full move |
| `website:previewSnapshot` | — (no dialog — move to worker) | full move |
| `website:buildPreviewHtml` | — (no dialog — move to worker) | full move |
| `website:export` | `website:_exportRun` | shim picks output dir, worker does the rest |
| `csv:export` | `csv:_exportRun` | shim picks output, worker walks |

`_`-prefixed channels are added to a new `INTERNAL_WORKER_CHANNELS` set in `tests/unit/preload-coverage.test.ts` and `tests/unit/static-api-coverage.test.ts` to satisfy the existing coverage tests without exposing them to the renderer.

### Progress event forwarding (worker → main → all windows)

Today the worker has request/response (`{ id, channel, args }` ↔ `{ id, result }`) and a few lifecycle messages (`ready`, `switched`, `import-start`, `import-end`). There's no path for unsolicited "progress" events from worker to main.

We add one new message shape:

```typescript
// Worker → main
{ type: 'broadcast'; topic: string; payload: unknown }
```

`worker-client.ts` adds a handler in its existing `worker.on('message', …)` switch:

```typescript
if (msg.type === 'broadcast') {
  const { BrowserWindow } = require('electron');
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(msg.topic, msg.payload);
  }
  return;
}
```

The worker side gets a small helper:

```typescript
// src/main/db-worker.ts
function broadcast(topic: string, payload: unknown) {
  parentPort!.postMessage({ type: 'broadcast', topic, payload });
}
```

Importers' `onProgress: (msg) => broadcast('import:holgerProgress', { message: msg })` replaces the current `webContents.send(...)` call. The renderer side is unchanged — `import:holgerProgress` / `import:genneyProgress` listeners in `src/preload/index.ts` keep working verbatim.

This is also forward-compatible: any future need for unsolicited worker → renderer messages (cancellation, partial results, db-stats updates) reuses the same `broadcast` channel.

### Inline dialog patterns — a note on `gedcom:import` and `gedcom:preview`

Both `gedcom:import` and `gedcom:preview` accept either a pre-resolved `filePath` or open a fallback dialog inline. The two-source-of-truth nature is what currently forces them onto the main thread. We remove the inline fallback: the renderer always pairs them with `gedcom:selectFile` (which is the documented flow already; the inline dialog was a leftover convenience). Verification: grep `src/renderer/` for `window.api.gedcom.import(` / `window.api.gedcom.preview(` and confirm every call site supplies `filePath`. If not, the call site is fixed — same task.

### Media consolidate stays in the worker

`consolidateMediaFolder` (in `src/api/media_consolidate.ts`) walks the `media` table and copies files. It already takes a `Database` arg. After moving each importer to the worker, the call to `consolidateMediaFolder(db, dbPath)` runs in the worker, not main. No code changes to `media_consolidate.ts` itself — the `fs/promises` calls work in the worker just fine.

`bulkCopyMediaFolder` (the up-front recursive `fs.cp`) is currently invoked on main before the importer runs ([`src/main/ipc/import.ts:261`](../../src/main/ipc/import.ts#L261)). It does no DB work and is short (~885 ms for the user's 12k-file media folder). It can stay on main, OR move to the worker — moving it is mildly cleaner (one less main-thread pause) and trivial since it's pure `fs/promises`. **We move it.** All bulk file ops associated with an import live with the importer in the worker.

### Cancellation

Out of scope for this plan. Today only the quality checks (`checks:cancel`) support cancellation; no importer/exporter does. Adding cancellation to importers is a separate, larger plan — and irrelevant to the user goal here, which is "UI doesn't lock," not "user can abort an import."

## Verification

User-observable, in this order:

1. **Manual smoke (the one that proves the user goal):**
   - `npm start`, open the app, switch to a database with ≥10k people, or use the `wetransfer_testmaterial` GEDCOM the user has in `export-import/`.
   - Trigger Holger import. While it runs:
     - Hover over chart nodes — tooltips appear.
     - Click between sections — panels swap.
     - The `<ImportProgress>` spinner / progress text updates smoothly (not in one burst at the end).
   - Repeat for: GEDCOM import, GEDCOM export, archive import, archive export, website export, CSV export, Genney import. None freezes the UI.
2. **Automated: main-thread idleness invariant.** A new test (`tests/unit/main-thread-responsive-during-import.test.ts`) starts the worker against an in-memory DB seeded with 5k persons, kicks off `callWorker('import:holgerRun', …)` against a fixture GEDCOM, and on the main thread runs a `setImmediate` ping loop measuring the time between scheduled and executed callbacks. Asserts the 99th-percentile gap stays under 100 ms throughout the import. (This is the non-aspirational version of "UI is responsive" — the perf skill's `checks-perf.test.ts` uses the same pattern.)
3. **Existing tests stay green:**
   - `tests/unit/ipc-worker-coverage.test.ts` — every `wrapHandler` resolves to a worker handler, registry entry, or main-only allow-list (the allow-list shrinks as channels migrate).
   - `tests/unit/preload-coverage.test.ts` — every public registry channel is exposed; `_`-prefixed internal channels excluded.
   - `tests/unit/static-api-coverage.test.ts` — same exclusion.
   - All existing import/export end-to-end tests in `tests/unit/import-*.test.ts`, `tests/unit/export-*.test.ts` keep passing — they test the api functions directly, untouched by the IPC refactor.
4. **Timing log proof:** after the refactor, `[import-timing] phase individuals — Nms` lines still print (logging is preserved), but they print from the worker. Adding a `[main] event-loop idle: Xms` log near the IPC handler's `await callWorker(...)` shows the main thread sitting idle the whole time.

A non-counted form of verification we explicitly **reject**: "lint passes + types compile" alone. Both could pass while the worker channel is registered but the renderer still calls a removed handler and hits a 404. Verification #1 (manual click-through) is required before declaring done.

## File map

### Created

- `tests/unit/main-thread-responsive-during-import.test.ts` — UI-responsiveness invariant test described in §Verification #2.
- (Optional, can fit inline) None other; see "Modified."

### Modified

- `src/main/ipc/worker-client.ts` — add `broadcast` message type handler, forward to all `BrowserWindow`s.
- `src/main/db-worker.ts` — add `broadcast()` helper; route the new internal worker channels via the same registry/dispatch pattern checks already use; clear progress messages route through `broadcast` instead of needing a `webContents` handle.
- `src/main/ipc/import.ts` — convert each of the 7 in-scope handlers to either (a) `defineChannel({ thread: 'worker' })` in a new `src/shared/channels/import.ts`, or (b) thin shim + `callWorker('<name>:_run', …)`.
- `src/main/ipc/website-export.ts` — same: 3 handlers; `previewSnapshot` and `buildPreviewHtml` become worker channels; `export` becomes shim + `_run`.
- `src/main/ipc/main-only.ts` — `csv:export` becomes shim + `csv:_exportRun`. The other handlers in this file (chart save, print, etc.) stay as-is per scope deviations.
- `src/shared/channels/import.ts` (new file in `src/shared/channels/`, registered from `index.ts`) — `defineChannel` entries for the moved-public channels and the internal `_run` channels.
- `src/shared/channels/website-export.ts` (new) — same.
- `src/shared/channels/csv.ts` (new) — same.
- `src/preload/index.ts` — confirm public channel mappings still match (no removals expected since public channel names don't change).
- `src/static/static-api.ts` — same audit.
- `tests/unit/preload-coverage.test.ts` — extend the existing exclusion machinery to skip `_`-prefixed channels (or add an `INTERNAL_WORKER_CHANNELS` set).
- `tests/unit/static-api-coverage.test.ts` — same.
- `tests/unit/ipc-worker-coverage.test.ts` — shrink `MAIN_THREAD_ONLY_CHANNELS` accordingly.
- `docs/IPC_REFERENCE.md` — update the table to reflect the new worker channels (the doc has rows for each public channel; mark the new ones as worker-thread).

### Untouched

- `src/api/`, `src/import/`, `src/gedcom/`, `src/api/html_site/` — zero changes. The functions are already pure-TS and DB-injected.
- The renderer (`src/renderer/`) — zero changes. Public channel names and signatures don't change. Progress events fire on the same `webContents.send` topic via the new `broadcast` route.

## Failure modes / RCA reference

This plan addresses two prior failures:

1. **The `phaseIndividuals` 25 s freeze (today's report).** Root cause: importer registered with `wrapHandler` direct, runs on main, no yield. Fix: the whole worker move described above. A "yield-in-the-loop" mitigation was considered and rejected — it doesn't reduce wall time, just spreads the freeze, and would still block worker-side check runs from making progress concurrently. Worker move is the right shape.
2. **Empty UI views post-import (perf skill, "Empty UI views right after import / DB switch").** Root cause: `runAll` is in the worker but each importer queues right next to it because they're on main. After this refactor, an import and a `runAll` both run on the worker; the worker's existing yield discipline (already added per the perf skill) keeps them interleaved. The renderer's `media:listPage` / `persons:list` calls fan out to the same worker but compete on equal footing instead of queuing behind a synchronous main-thread import.

A future failure mode to guard against in execution: **regressing a public channel's argument shape.** The shim + worker split adds an extra hop. Existing renderer code passes args via `window.api.<domain>.<method>(...)` → `ipcRenderer.invoke(channel, ...)` → main-thread shim → `callWorker(channel:_run, args)`. The args payload must round-trip through `postMessage`'s structured clone. **No `Function`, `Date`, or class-instance args.** All in-scope handlers today take plain JSON-compatible options, so this is a no-op concern, but the plan's tests must seed each handler with its real options object to confirm.

---
paths:
  - "src/shared/channels/**/*.ts"
  - "src/main/ipc/**/*.ts"
  - "src/main/db-worker.ts"
  - "src/preload/**/*.ts"
  - "src/static/static-api.ts"
---

# IPC Bridge Rules

Loads when working in the channel registry, main-process IPC handlers, the DB worker, the preload, or the static SPA api stub.

## How it works

All ~131 IPC channels are defined once in `src/shared/channels/` via `defineChannel()`. The registry drives three layers automatically:

1. **Main process** (`src/main/ipc/index.ts`): walks `channelRegistry` — worker channels get `wrapHandler('foo:bar', (...args) => callWorker('foo:bar', ...args))`; main-thread channels get `wrapHandler('foo:bar', (...args) => ch.handler(...args))`
2. **Worker dispatch** (`src/main/db-worker.ts`): checks the registry first on every message; registry worker channels are dispatched before the small legacy fallback table
3. **Preload** (`src/preload/index.ts`): **hand-maintained** map of `window.api.<domain>.<method>` to `ipcRenderer.invoke('domain:method', ...)`. Adding a `defineChannel` does NOT auto-expose it here — you must add the matching line in the preload's domain block. `tests/unit/preload-coverage.test.ts` parses the preload as text and fails CI if any registry channel is missing. Mutating channels are wrapped via the local `mutating()` helper so `onDataChanged` listeners fire.
4. **Renderer**: Vue components call `window.api.persons.create(...)` etc. The `window.api` surface is **typed** — `ApiSurface<typeof channelRegistry>` derives the type at compile time, no loose `Record<string, …>` casts needed.

A small set of channels cannot fit the registry pattern and are registered separately:
- `src/main/ipc/database.ts`: `db:getCurrent/getRecent/createNew/switchTo/openExisting`, `undo:undo/redo` (need post-call BrowserWindow broadcast), `backup:*`
- `src/main/ipc/media.ts`: `media:attach`, `media:openFile` (Electron dialog + fs); `media:getFilePath`, `media:readAsDataUrl` (worker-local `getDbDir()`)
- `src/main/ipc/main-only.ts`: `checks:*` (worker-local cancellation state), `chart:*`, `print:*`, `csv:export`, `export:openFolder` (Electron dialog / BrowserWindow / fs)
- `src/main/ipc/import.ts`, `src/main/ipc/website-export.ts`: file dialog + fs operations

## Adding a new worker channel

One step: add a `defineChannel` entry to the appropriate `src/shared/channels/<domain>.ts` file:

```typescript
defineChannel({
  name: 'foo:bar',
  thread: 'worker',
  mutating: true,           // set true if this writes — triggers onDataChanged in renderer
  handler: (db, arg: string) => api.createFoo(db, arg),
});
```

The registry walk in `index.ts` registers `ipcMain.handle`, the worker dispatch loop calls the handler, and the preload walk adds `window.api.foo.bar` — all automatically. No edits to three separate files.

The domain file must be imported in `src/shared/channels/index.ts` (one line).

**Then manually:** add the matching `bar: mutating((arg) => ipcRenderer.invoke('foo:bar', arg))` line to the preload's `<domain>` block in `src/preload/index.ts`, and a stub in `src/static/static-api.ts`. The preload-coverage and static-api-coverage tests will fail CI if you skip these.

## Adding a main-only channel

Same `defineChannel` with `thread: 'main'`. The handler runs on the main thread (no `db` argument). For channels that need Electron APIs unavailable in shared code, register manually via `wrapHandler` in the appropriate `src/main/ipc/*.ts` file and add the channel name to `MAIN_THREAD_ONLY_CHANNELS` in `tests/unit/ipc-worker-coverage.test.ts`.

## Enforcement (run after any channel change)

```bash
npx vitest run tests/unit/ipc-worker-coverage.test.ts \
                tests/unit/preload-coverage.test.ts \
                tests/unit/static-api-coverage.test.ts
```

- `ipc-worker-coverage` — every `wrapHandler` resolves to a worker handler, registry entry, or `MAIN_THREAD_ONLY_CHANNELS`
- `preload-coverage` — every registry channel is exposed on `window.api`
- `static-api-coverage` — every registry channel has a stub in the static SPA api

## window.api Surface + IPC Channel Mapping

See `docs/IPC_REFERENCE.md` for the complete `window.api` surface and IPC channel → API function mapping table.

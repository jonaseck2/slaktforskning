# Plan: Database Switcher

**Version:** v0.6.3
**Date:** 2026-04-03
**Status:** Done
**Prerequisite for:** v0.6.4 (Extended GEDCOM Roundtrip) — import into a fresh database without overwriting the active one

## Goal

Let the user manage multiple separate family tree databases — creating new ones and opening previously created ones — without losing the current database. The active database is remembered across launches. All windows share the same database (unchanged from current behavior).

## User Flow

- On launch: reopen the last-used database automatically (or fall back to the existing default if no preference saved)
- Bottom-left sidebar has a "Database" entry above Import/Export showing the current database filename
- Clicking it opens a modal with:
  - The current database path (display only)
  - A list of recently used databases (click to switch)
  - "New database…" button — native Save dialog → create + switch
  - "Open database…" button — native Open dialog → switch to selected `.db` file

Switching database:
1. Close the current SQLite connection
2. Remove any stale `.lock` directory for the new path
3. Open the new database, run `initializeSchema`
4. Save the new path to persistent settings as `lastDatabase`
5. Add to `recentDatabases` list (max 10, deduplicated, most-recent first)
6. Broadcast `db:switched` to all renderer windows → they reload via `window.location.reload()`

## Persistent Settings

New file: `src/main/settings.ts` — read/write a JSON file at `path.join(app.getPath('userData'), 'settings.json')`.

```typescript
interface AppSettings {
  lastDatabase?: string;       // absolute path
  recentDatabases: string[];   // absolute paths, most-recent first, max 10
}

export function loadSettings(): AppSettings
export function saveSettings(s: AppSettings): void
```

`database.ts` calls `loadSettings().lastDatabase` on first open (when `SLAKTFORSKNING_DB` env var is absent). On switch, calls `saveSettings`.

## Architecture Changes

### `src/main/database.ts`

Add `switchDatabase(newPath: string): void`:
- Calls `closeDatabase()`
- Clears stale lock at `newPath + '.lock'`
- Opens `new Database(newPath)`, runs `initializeSchema`
- Sets module-level `db` to the new connection
- Saves `newPath` as `lastDatabase` in settings; prepends to `recentDatabases`

`getDatabase()` first-open path: prefer `process.env.SLAKTFORSKNING_DB`, then `loadSettings().lastDatabase`, then the existing default (`userData/slaktforskning.db`).

### `src/main/ipc.ts`

Three new IPC handlers:

```
db:getCurrent  → { path: string, name: string }
db:getRecent   → { path: string, name: string }[]
db:createNew   → showSaveDialog → switchDatabase → broadcast db:switched → { path }
db:openExisting → showOpenDialog → switchDatabase → broadcast db:switched → { path }
```

Broadcast via `BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'))`.

### `src/preload/index.ts`

Expose under `window.api.db`:
```typescript
db: {
  getCurrent: () => ipcRenderer.invoke('db:getCurrent'),
  getRecent:  () => ipcRenderer.invoke('db:getRecent'),
  createNew:  () => ipcRenderer.invoke('db:createNew'),
  openExisting: () => ipcRenderer.invoke('db:openExisting'),
  onSwitched: (cb: () => void) => ipcRenderer.on('db:switched', cb),
}
```

### `src/renderer/App.vue`

- Listen for `db:switched` in `onMounted`; call `window.location.reload()` when received
- Add a `<router-link to="/database" class="nav-bottom">` above the Import/Export link, showing the current database filename (loaded via `window.api.db.getCurrent()`)

### `src/renderer/views/DatabaseView.vue` (new)

Route `/database`. Shows:
- Current database path (full path, selectable text)
- Recent databases list — each row shows the filename + truncated path; click → `openExisting` with path (no dialog, direct switch)
- "New database…" button
- "Open other database…" button

No modal needed — full view keeps the UI clean and has room for the recent list.

### `src/renderer/router.ts`

Add `{ path: '/database', component: () => import('./views/DatabaseView.vue') }`.

## i18n

Add to `sv.ts` and `en.ts`:

```typescript
database: {
  nav: 'Databas',           // sidebar link label
  title: 'Databas',
  current: 'Aktiv databas',
  recent: 'Senast använda',
  noRecent: 'Inga tidigare databaser.',
  createNew: 'Ny databas…',
  openOther: 'Öppna annan…',
  switchedTo: 'Öppnade: {name}',
}
```

## MCP

No MCP tools for database switching — the MCP server is launched with a specific `SLAKTFORSKNING_DB` env var and has no concept of interactive switching. No change needed.

## Unit Tests

No unit tests for this milestone (pure Electron IPC + file I/O, not api/ business logic). Manual verification:

- [ ] Launch with no settings → opens default DB
- [ ] Create new DB → app reloads, shows new (empty) DB
- [ ] Open existing DB → app reloads, shows correct data
- [ ] Recent list shows last 10, deduplicates, most-recent first
- [ ] Relaunch → reopens last-used DB
- [ ] All windows reload simultaneously on switch

## Implementation Order

1. `src/main/settings.ts` — `AppSettings`, `loadSettings`, `saveSettings`
2. `src/main/database.ts` — `switchDatabase`, update `getDatabase` to consult settings
3. `src/main/ipc.ts` — four new handlers + broadcast
4. `src/preload/index.ts` — expose `window.api.db`
5. `src/renderer/views/DatabaseView.vue` — new view
6. `src/renderer/router.ts` — add `/database` route
7. `src/renderer/App.vue` — sidebar link + `db:switched` listener → reload
8. i18n sv + en
9. Docs

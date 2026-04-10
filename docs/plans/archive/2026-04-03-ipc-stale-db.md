# Fix: Stale database reference after switchDatabase

## Problem

After the user switched databases (new or open via the Database view) and then
imported a GEDCOM file, navigating to any person/source/etc produced:

> `Error invoking remote method 'persons:get': SQLite3Error: Database already closed`

Restarting the app fixed it because `getDatabase()` created a fresh connection.

## Root Cause

`registerIpcHandlers()` in `src/main/ipc.ts` called `const db = getDatabase()`
once at startup and all ~40 `wrapHandler` closures captured that single object:

```typescript
export function registerIpcHandlers(): void {
  const db = getDatabase();   // ← captured once
  wrapHandler('persons:get', (id) => persons.getPerson(db, id as string));
  // ... all other handlers use the same captured `db`
}
```

When `switchDatabase()` is called (from `db:createNew`, `db:openExisting`, or
`db:switchTo`), it calls `closeDatabase()` which closes the old database and
sets the module-level `db` to `null`, then opens a new one. But every handler
closure still held a reference to the now-closed old database object.

The GEDCOM import handler happened to work because it already called
`getDatabase()` inline (not from the captured variable), so it wrote into the
new database correctly. But all subsequent IPC calls (`persons:get`, etc.) used
the closed old object and crashed.

Typical failure sequence:
1. User creates a new database (`db:createNew`) → old db closed, new db opened
2. User imports GEDCOM → works (that handler used `getDatabase()` fresh)
3. User navigates to a person → `persons:get` hits closed old db → crash

## Fix

Removed `const db = getDatabase()` from `registerIpcHandlers()`. Every
`wrapHandler` closure now calls `getDatabase()` inline at invocation time,
so they always use the current live database regardless of prior switches.

```typescript
// Before
wrapHandler('persons:get', (id) => persons.getPerson(db, id as string));

// After
wrapHandler('persons:get', (id) => persons.getPerson(getDatabase(), id as string));
```

## Files Changed

- `src/main/ipc.ts` — removed captured `db`; all ~40 handlers call `getDatabase()` per invocation

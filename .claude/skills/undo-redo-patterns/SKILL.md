---
name: undo-redo-patterns
description: Wire undo/redo support for new mutations. Use when adding any function in src/api/ that writes to the database, when composing multi-step operations that must undo atomically, when adding a new IPC channel that mutates state, or when investigating "why didn't my action show up in the undo stack". Covers UndoAction shape, the snapshot-old-state-then-mutate sequence, beginGroup/endGroup for atomic multi-step ops, the data-changed fan-out (Electron preload mutating() / Tauri auto-walk fireDataChanged()), and the relationship between undo and onDataChanged.
---

# Undo / Redo Patterns

The undo system in this codebase is a **command pattern** living in [src/api/undo.ts](src/api/undo.ts). It's straightforward but quietly opinionated — and the wiring crosses three layers (api / preload / renderer), so most "my mutation isn't undoable" bugs are wiring bugs.

## The model in one paragraph

Every mutating API function has a sibling in [src/api/undo_wrappers.ts](src/api/undo_wrappers.ts) that snapshots the pre-mutation state, calls the original API function, and pushes an `UndoAction` onto `undoManager`. IPC handlers call the **wrapper**, not the raw function. The renderer never sees the wrapper layer — it calls `window.api.persons.create(...)` and gets undo for free, because the preload-side `mutating()` helper *also* fires `onDataChanged` listeners so all `useEntityData` / `usePagedList` consumers refresh.

## The `UndoAction` contract

```typescript
export interface UndoAction {
  label: string;          // i18n key, shown in the Undo/Redo menu (`undo.createPerson`)
  undo: () => void;       // fully reverses the mutation
  redo: () => void;       // re-applies it (after the user undid)
}
```

Three rules:

1. **`undo` and `redo` close over snapshots, not over `db` lookups.** Capture the values you need at push time. Reading "current state" inside `undo()` is a bug — by the time undo runs, the mutation has already moved that state.
2. **`undo` must put the DB into the exact state before the mutation, not "approximately"**. This includes `display_id`, FK targets, and child rows. See [persons.deletePersonUndo](src/api/undo_wrappers.ts#L51) — it captures names, identifiers, relationships, events, and participants, then re-`INSERT`s them all on undo.
3. **Snapshots are produced by `JSON.parse(JSON.stringify(data))` for plain-data inputs.** This rejects circular refs, functions, and `Date` instances at write time (loud failure beats silent corruption). For DB rows, store the row objects directly — they're already plain.

## The wrapper template

For a single-step mutation:

```typescript
export function updatePersonUndo(
  db: Database,
  id: string,
  data: Parameters<typeof persons.updatePerson>[2]
): Person | null {
  const old = persons.getPerson(db, id);              // 1. snapshot pre-state
  if (!old) return null;
  const oldData = { sex: old.sex, notes: old.notes }; //    only the fields data touches
  const result = persons.updatePerson(db, id, data);  // 2. perform the mutation
  const newData = { ...data };                        //    snapshot the input
  undoManager.push({                                  // 3. push the action
    label: 'undo.updatePerson',
    undo: () => { persons.updatePerson(db, id, oldData); },
    redo: () => { persons.updatePerson(db, id, newData); },
  });
  return result;
}
```

For a creation:

```typescript
const result = persons.createPerson(db, data);
const id = result.id;
const snapshot = JSON.parse(JSON.stringify(data));
undoManager.push({
  label: 'undo.createPerson',
  undo: () => { persons.deletePerson(db, id); },
  redo: () => { persons.createPerson(db, snapshot); },
});
```

## Atomic multi-step operations: `beginGroup` / `endGroup`

Workflows that perform multiple writes (e.g. create-person-with-birth-event, merge-persons) must surface as a *single* undo step. Wrap them:

```typescript
undoManager.beginGroup('undo.createPersonWithEvent');
try {
  const person = createPersonUndo(db, personData);
  recordEventUndo(db, { ...eventData, primaryParticipantId: person.id });
} finally {
  undoManager.endGroup();
}
```

While `groupStack !== null`, every `undoManager.push()` call routes into the group buffer instead of the main stack. `endGroup()` collapses the buffer into a single `UndoAction` whose `undo()` reverses each action in **reverse order** and whose `redo()` re-applies in original order. **Always pair `beginGroup` with `endGroup` in a `try/finally`** — orphaned groups silently swallow every subsequent push until the next `endGroup`.

The renderer can also drive grouping for compound user-initiated flows via `window.api.undo.beginGroup(label)` / `endGroup()`. Use this when a single user gesture fires multiple `window.api.*` mutations that should undo together.

## Data-changed fan-out — the renderer-facing half

The user-observable contract is the same in both runtimes: every mutating IPC call must fire `data:changed` listeners after it resolves so `useEntityData` / `usePagedList` consumers refresh. The mechanism differs.

### Tauri (current)

`src/renderer/tauri-window-api.ts` walks the channel registry. For every channel declared `mutating: true`, the auto-walked wrapper calls `fireDataChanged()` after the handler resolves:

```typescript
// tauri-window-api.ts (sketch — the auto-walk loop)
api[domain][method] = async (...args) => {
  const result = await channel.handler(getDb(), ...args);
  if (channel.mutating) fireDataChanged();
  return result;
};
```

`fireDataChanged()` does two things: (1) emits a Tauri event so all open windows react, and (2) calls every locally-registered `dataChangedListeners` callback. The two `undo:undo` / `undo:redo` polyfills in `tauri-window-api.ts` also call `fireDataChanged()` — undoing an action is a mutation from the renderer's point of view.

### Electron (legacy)

`src/preload/index.ts` wraps every mutating IPC call:

```typescript
function mutating<T extends unknown[], R>(fn: (...args: T) => Promise<R>): (...args: T) => Promise<R> {
  return async (...args: T) => {
    const result = await fn(...args);
    dataChangedListeners.forEach(cb => cb());
    return result;
  };
}
// ...
update: mutating((id, data) => ipcRenderer.invoke('persons:update', id, data)),
```

The DB worker also broadcasts `data:changed` on completion (since `c3f12d95`) so MCP-side mutations refresh other windows the same way renderer-initiated ones do.

### What both share

`useEntityData` / `usePagedList` register against `window.api.onDataChanged(cb)` — one source of truth, runtime-agnostic. The composables don't care which implementation fired the listener.

**Implication for new channels:** if you add a registry channel via `defineChannel` and forget `mutating: true`, the IPC fires, undo records correctly, but **renderer views won't refresh until the user manually changes routes**. This was the v0.227.2 PlacePanel research-tasks regression — the data path was sound, the broadcast was missing. The flag is engine-agnostic; the bug class survives the runtime change.

## Wiring checklist for a new mutation

When you add `myThings.create`, `myThings.update`, etc.:

1. **API function** in [src/api/myThings.ts](src/api/) — pure CRUD, `db: Database` first parameter.
2. **Undo wrapper** in [src/api/undo_wrappers.ts](src/api/undo_wrappers.ts) — snapshot + delegate + push.
3. **IPC channel** in [src/shared/channels/myThings.ts](src/shared/channels/) — `defineChannel({ name: 'myThings:create', thread: 'worker', mutating: true, handler: (db, args) => undoWrappers.createMyThingUndo(db, args) })`. Do not call the raw `myThings.create` from the channel handler — it bypasses undo.
4. **Renderer wiring (Electron)** in [src/preload/index.ts](src/preload/index.ts) — `create: mutating((args) => ipcRenderer.invoke('myThings:create', args))`. The hand-maintained map; `preload-coverage.test.ts` asserts parity with the registry.
5. **Renderer wiring (Tauri)** — usually nothing to do; `tauri-window-api.ts`'s auto-walk picks up the registry entry and fires `fireDataChanged()` automatically because `mutating: true`. Only add an explicit polyfill if the channel needs Tauri-native services; if you do, the polyfill must call `fireDataChanged()` itself (the auto-walk wrapper is bypassed). `tauri-channel-coverage.test.ts` asserts every registry channel either auto-walks or has an explicit polyfill.
6. **Static API stub** in [src/static/static-api.ts](src/static/static-api.ts) — read-only context, so use `noopVoid` or similar.
7. **i18n labels** — add `undo.createMyThing`, `undo.updateMyThing`, `undo.deleteMyThing` to both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` so the menu can render the verb.

If step 2 is skipped, the mutation works but isn't undoable. If `mutating: true` is missing on the `defineChannel` (or a Tauri polyfill forgets `fireDataChanged()`), the mutation works AND is undoable but the UI goes stale. Both are silent failures.

## Lifecycle quirks

- **In-memory only.** The undo stack is a single `undoManager` instance in the worker thread. App restart, DB switch (`db:switchTo`), and `undoManager.clear()` all reset it. There is no on-disk undo log — large multi-step user actions (a 1000-row import, say) are *not* undoable. This is by design.
- **Stack depth is 100.** [`UndoManager.maxDepth`](src/api/undo.ts#L16). When exceeded, the oldest action is dropped silently. If you're composing a workflow that pushes >100 individual actions, group them — it's also faster and gives the user one labeled step instead of 100.
- **Redo stack invalidates on any new push.** Standard command-pattern semantics — once the user takes a new action, "redo" of the discarded branch is gone.
- **`getPersonIdentifiers`-style child queries** must run *before* the delete, never inside the `undo` closure. The delete cascades; running the query in the closure returns nothing.

## Testing undo for a new wrapper

```typescript
// tests/unit/undo.test.ts pattern
const db = createTestDb();
const created = createPersonUndo(db, { sex: 'M', notes: 'first' });
expect(persons.getPerson(db, created.id)).toBeDefined();

undoManager.undo();
expect(persons.getPerson(db, created.id)).toBeNull();

undoManager.redo();
expect(persons.getPerson(db, created.id)).toBeDefined();
```

For grouped workflows, assert that **one** `undo()` call fully reverses the multi-step operation:

```typescript
undoManager.beginGroup('undo.workflow');
createPersonUndo(db, ...);
recordEventUndo(db, ...);
undoManager.endGroup();

undoManager.undo(); // single call must reverse both
expect(...).toBeNull();
```

## Anti-patterns

- **Calling raw API functions from IPC.** Bypasses the wrapper — the mutation works, undo never sees it.
- **`undo: () => raw(db, ...)`.** Calling the raw function (not the wrapper) inside `undo()` is correct — undo itself shouldn't push another undo action. The wrapper is only for *user-initiated* mutations.
- **Skipping `mutating: true` on a registry channel.** Renderer goes stale. See PlacePanel v0.227.2.
- **Closing over `db` lookups instead of snapshots.** The lookup runs at undo time, by which point the row has been mutated.
- **Snapshotting via spread instead of `JSON.parse(JSON.stringify(...))` for inputs containing nested objects.** Spread is shallow; nested mutations corrupt the snapshot.
- **Forgetting `endGroup()` on an exception path.** Use `try/finally`. An orphaned group eats every subsequent push.

## Reference

- [src/api/undo.ts](src/api/undo.ts) — `UndoManager` class (engine-agnostic; lives in api/)
- [src/api/undo_wrappers.ts](src/api/undo_wrappers.ts) — every undo-aware mutation in one file
- [src/shared/channels/undo.ts](src/shared/channels/undo.ts) — IPC bindings (`undo:undo`, `undo:redo`, `undo:state`, `undo:beginGroup`, `undo:endGroup`)
- [src/renderer/tauri-window-api.ts](src/renderer/tauri-window-api.ts) — Tauri auto-walk + `fireDataChanged()`; `undo:undo` / `undo:redo` polyfills
- [src/preload/index.ts](src/preload/index.ts) — Electron `mutating()` helper + listener registry
- [tests/unit/undo.test.ts](tests/unit/undo.test.ts) — existing test patterns

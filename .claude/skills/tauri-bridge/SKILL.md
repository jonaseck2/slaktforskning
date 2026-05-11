---
name: tauri-bridge
description: How the renderer talks to Rust in the Tauri build — the auto-walk vs polyfill pattern in `tauri-window-api.ts`, when to add a Rust command vs a renderer-side polyfill, the generic Rust commands already shipped (`dialog_pick`, `fs_*`, `shell_*`, `media_*`, `db_*`), the `invoke()` shape and error convention. Use when editing `src/renderer/tauri-window-api.ts`, editing `src-tauri/src/lib.rs`, adding a polyfill that needs fs/dialog/shell/multi-window, or whenever the question is "should this be a Rust command or pure JS?".
---

# Tauri Bridge — Renderer ↔ Rust

This skill is the canonical reference for **how a renderer-side `window.api.foo.bar(...)` call gets answered** in the Tauri build. The general rule is "let the auto-walk handle it"; the exceptions are documented below.

## The decision tree

When wiring a new `window.api.foo.bar` channel:

```
1. Does the channel only touch SQLite + pure TS api/ functions?
   → YES: stop. `tauri-window-api.ts` auto-walks the registry; ship nothing more.
          The `defineChannel({ name: 'foo:bar', mutating: true|false, handler })`
          declaration is the whole job.

2. Does the channel need a native capability?
   → file dialog (open, save, pick folder)?
   → fs read/write/copy?
   → reveal-in-finder, open external URL, open file with default app?
   → spawn a sidecar / native binary?
   → multi-window orchestration?
   → native screenshot (the dev MCP, not user-facing)?

   → YES to any of the above: you need a polyfill in `tauri-window-api.ts`.

3. Does the polyfill rely on a Rust capability that's already shipped?
   → YES: write a small async function in `tauri-window-api.ts` that calls
          `invoke('<existing_command>', { ... })`. No Rust changes.
   → NO:  add a new `#[tauri::command]` to `src-tauri/src/lib.rs`, register it
          in the `invoke_handler!` macro, then write the renderer polyfill.
```

**Generic rule:** prefer reaching for an existing Rust command before adding a new one. The shipped command set is intentionally generic (read bytes, write text, pick file, reveal path) so most renderer needs compose from primitives.

## Rust commands already shipped

In `src-tauri/src/lib.rs` (Cluster M items + the original spike):

| Command | Signature | Use for |
|---|---|---|
| `dialog_pick` | `({ kind: 'open'|'save'|'folder', title, extensions?, defaultName? }) → { path } | null` | File / folder pickers — every importer's `*SelectFile` polyfill uses this. |
| `fs_read_text` | `(path) → string` | UTF-8 file read — config files, GEDCOM source files, Gramps XML. |
| `fs_read_bytes_base64` | `(path) → base64 string` | Binary file read — every `import:*Run` polyfill needs this; renderer base64-decodes to a `Uint8Array`. |
| `fs_write_text` | `(path, contents)` | Save dialogs that write text — GEDCOM export, CSV export. |
| `fs_copy_file` | `(src, dest)` | Single-file copy. |
| `shell_reveal` | `(path)` | "Show in Finder" / "Show in Explorer" — opens the file's parent in the OS file manager and selects it. |
| `shell_open_path` | `(path)` | Open a file with its default app (Cluster M follow-up). |
| `media_pick_and_copy` | `() → { fileRef, format, ... }` | The full media-attach flow — user picks a file, Rust copies it into `<dbname>-media/`, returns the relative ref the renderer inserts into the DB. |
| `media_read_as_data_url` | `(file_ref) → string | null` | Read a media file as `data:image/...;base64,...` for preview — used by `<AppAvatar>`, the media browser, and report previews. |
| `default_db_path` | `() → string` | OS-default DB location (`~/Library/Application Support/...` on macOS, etc.). |
| `db_current_path` | `() → string | null` | Currently-open DB path. Mirrors the dev MCP `/db_path` HTTP endpoint, but for in-renderer use. |
| `db_pick_existing` | `() → string | null` | DB-flavoured `dialog_pick` for "Open existing database…". |
| `db_pick_new` | `() → string | null` | DB-flavoured `dialog_pick` for "Create new database…". |
| `db_open` / `db_close` / `db_is_open` | DB lifecycle | Open/close the rusqlite global connection. |
| `db_run` / `db_get` / `db_all` / `db_batch` / `db_run_changes` | The 5 SQL primitives | The renderer's `db-shim` calls these; you almost never call them from a polyfill directly. See `/rusqlite-patterns`. |
| `app_version` | `() → string` | Read the Tauri bundle's version — used by Settings → About. |
| `open_second_window` | `(label) → ()` | Multi-window — opens a second `WebviewWindow` with the given label. |
| `broadcast_data_changed` | `(kind) → ()` | Cross-window `data:changed` fan-out — used by `fireDataChanged()` in `tauri-window-api.ts`. |
| `probe_mcp_sidecar` | `(repoRoot, dbPath) → McpProbe` | Test whether the sidecar MCP can be spawned (Cluster post-launch follow-up). |

When you write a polyfill, check this list first. If your need composes from these, no Rust changes are needed.

## The auto-walk vs polyfill pattern

**Auto-walk (default).** `tauri-window-api.ts` imports `src/shared/channels` for side effects, walks the registered channels, and assigns each one to `window.api.<domain>.<method>`. The wrapper:

1. Calls the channel's `handler(getDb(), ...args)` directly — handlers are pure TS, they run in the renderer.
2. If `mutating: true`, calls `fireDataChanged()` after the handler resolves.
3. Returns the result.

For pure-DB channels, this is the entire path. There is no IPC roundtrip, no serialization — the renderer is the host of the api/ layer.

**Polyfill (override).** After the auto-walk, code at the bottom of `tauri-window-api.ts` overrides specific entries that need native services:

```typescript
api.gedcom.export = async (opts: unknown) => {
  const o = opts as { defaultPath?: string; version?: '5.5.1' | '7.0' };
  const r = await invoke<{ path: string } | null>('dialog_pick', {
    kind: 'save',
    title: 'Spara GEDCOM',
    extensions: ['ged'],
    defaultName: o.defaultPath ?? 'export.ged',
  });
  if (!r?.path) return { success: false, cancelled: true };
  const ged = exportToGedcom(getDb(), { version: o.version ?? '7.0' });
  await invoke('fs_write_text', { path: r.path, contents: ged });
  return { success: true, path: r.path };
};
```

Polyfills bypass the auto-walk wrapper entirely. **If the channel is mutating, the polyfill must call `fireDataChanged()` itself** — the wrapper's automatic call is gone. Easy to forget; the symptom is "save succeeded but the list view didn't refresh."

### When to write a polyfill vs a Rust command

A useful sanity check: **does the renderer have everything it needs to do this work, or is it asking the host to do something it can't?**

- Renderer has the data, the host needs to put it on disk → polyfill that calls `fs_write_text`.
- Renderer needs bytes from a file the user picked → polyfill that calls `dialog_pick` then `fs_read_bytes_base64`.
- Renderer needs to spawn a sidecar binary, copy a directory tree, take a screenshot, open a second window → new Rust command (the renderer can't do these at all).
- Renderer needs a complex multi-step DB transaction with rollback semantics → still a renderer-side composition (rusqlite is single-threaded; serialise via the api/ layer).

## The `invoke()` shape

```typescript
import { invoke } from '@tauri-apps/api/core';

// Generic — value type T
const result = await invoke<{ path: string } | null>('dialog_pick', {
  kind: 'open',
  title: 'Pick a file',
  extensions: ['ged', 'xml'],
});

// Errors — Rust returns Result<T, String>; the String becomes a thrown Error in JS
try {
  await invoke('fs_write_text', { path: '/etc/passwd', contents: 'no' });
} catch (err) {
  // err is an Error whose .message is the Rust-side String
  console.error('write failed:', (err as Error).message);
}
```

**Argument shape:** the second argument is an object whose keys match the Rust function's parameter names. Tauri converts JS camelCase to Rust snake_case automatically (`{ filePath: '...' }` → `file_path: String`), but staying in snake_case both sides reduces surprise.

**Return type:** Rust `Result<T, String>` becomes either `T` (resolved) or `Error` (rejected). Rust `Result<Option<T>, String>` becomes either `T | null` or `Error`. Pre-cast at the call site: `await invoke<MyType | null>(...)`.

## Error-handling convention

Polyfills in `tauri-window-api.ts` follow the importer pattern: catch, return a structured error object the renderer can display, never let the exception bubble to the caller's try/catch as an opaque Tauri panic. Reference shape from `api.import.grampsRun`:

```typescript
try {
  // ... do the work ...
  return { success: true, summary: result.summary };
} catch (e) {
  return { success: false, error: String((e as Error)?.message || e) };
}
```

The renderer's caller handles the `success: false` branch with a toast (`toast.error(t('errors.importFailed'))`). The error string includes the Rust-side message verbatim, which is what the user sees if they open DevTools.

## When the channel needs a NEW Rust capability

If steps 1–3 of the decision tree all said "no" — i.e. you need something not on the shipped Rust command list — add the command in `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
fn my_new_command(arg1: String, arg2: u32) -> Result<String, String> {
    // ... do the work ...
    Ok("result".to_string())
}
```

Then register it in the `invoke_handler!` macro in the `run()` function (the existing list is alphabetised — keep it that way). Restart `npm run tauri:dev` (Vite picks up the renderer side via HMR; Rust changes need an incremental rebuild — ~3 seconds).

For the polyfill side: write the renderer-side wrapper that calls `invoke('my_new_command', { arg1, arg2 })`, add it to `tauri-window-api.ts`, run `tests/unit/tauri-channel-coverage.test.ts` to confirm coverage.

## Reference: the `tauri-window-api.ts` layout

The file is ~590 lines, structured top-to-bottom:

1. Imports (`@tauri-apps/api/core`, the channel registry, the api/ modules called from polyfills).
2. `dbInstance` global + `getDb()` — the renderer-side `Database` shim that proxies into rusqlite via `db-shim`.
3. `fireDataChanged()` — emits the Tauri event AND calls every locally-registered listener.
4. The auto-walk — iterates the registry, assigns to `window.api.<domain>.<method>`, wraps with `fireDataChanged()` when mutating.
5. Targeted polyfills, grouped by domain (db, media, checks, undo, gedcom, import, archive, csv, export).
6. The `notWired` helper — used by the not-yet-wired importers (Holger, RootsMagic, Genney) to return a structured error instead of crashing.
7. `bootTauriApi(path?: string)` — the bootstrap entry point called from `main.ts` when `__TAURI_INTERNALS__` is detected.

When extending: add new polyfills in their domain group; add new domains in alphabetical order. The auto-walk runs first, so any later assignment to `api.foo.bar` overrides what the auto-walk put there.

## What this skill does NOT cover

- **rusqlite SQL patterns** — see `/rusqlite-patterns`.
- **The dev MCP HTTP bridge** (`src-tauri/src/ui_server.rs`) — see `/slaktforskning-mcp-dev` "The dev MCP HTTP bridge" section.
- **Cargo / Tauri build / packaging** — see `/tauri-dev`.
- **The Electron preload, the `mutating()` wrapper, the worker thread** — see `/add-feature` IPC Layer for the legacy parity story.

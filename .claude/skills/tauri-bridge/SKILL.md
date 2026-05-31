---
name: tauri-bridge
description: How the renderer talks to Rust in the Tauri build — the Specta-generated `bindings.ts` for Rust commands, the inlined renderer-local bindings in `tauri-window-api.ts`, when to add a Rust command vs a pure-TS binding, the generic Rust commands already shipped (`dialog_pick`, `fs_*`, `shell_*`, `media_*`, `db_*`), the `invoke()` shape and error convention. Use when editing `src/renderer/tauri-window-api.ts`, editing `src-tauri/src/lib.rs`, adding a binding that needs fs/dialog/shell/multi-window, or whenever the question is "should this be a Rust command or pure TS?".
---

# Tauri Bridge — Renderer ↔ Rust

## ⚠️ Tauri 2 is new — check the docs before implementing

Tauri 2 shipped post-training-cutoff for most models, and plugin APIs change between RCs. **Before writing any code that touches a Tauri plugin or Tauri-core API, WebFetch the official page** — don't rely on what feels familiar.

- Plugin docs: `https://v2.tauri.app/plugin/<name>/` (updater, dialog, fs, shell, opener, store, process, etc.)
- Core: `https://v2.tauri.app/reference/` and `https://v2.tauri.app/security/`
- The plugin's JS package on npmjs.com — the README usually has the canonical "5-line example."

Specific failure mode caught **2026-05-31** (commit `27afc686`): the auto-updater was wired via raw `invoke('plugin:updater|check')` + `invoke('plugin:updater|download_and_install')` because that looked like "the plugin invoke pattern" from training data. The official path is `import { check } from '@tauri-apps/plugin-updater'`, then `update.downloadAndInstall(progressCb)` — which is the only way to receive download progress events. The raw-invoke shape silently lost a major capability (progress) and left the `@tauri-apps/plugin-updater` npm dep installed-but-unused as a dead-giveaway smell. **An unused `@tauri-apps/plugin-*` dependency is a red flag: either you're meant to be using it, or you should remove it.**

**Decision rule for Tauri plugins:** start from the plugin's JS package (`@tauri-apps/plugin-<name>`). Drop to raw `invoke('plugin:<name>|<cmd>')` only when (a) the plugin ships no JS wrapper, or (b) you've read the wrapper's source and it offers nothing the raw invoke doesn't (e.g. one-shot fire-and-forget, no channels, no Update-style stateful objects, no progress). Default to the wrapper.

The `window.api` surface is built from two ingredients:

1. **Specta-generated bindings** (`src/renderer/bindings.ts`): every `#[tauri::command] #[specta::specta]` Rust function in `src-tauri/` produces a typed wrapper. `cargo build` regenerates; this is the source of truth for the Rust-IPC surface.
2. **Inlined renderer-local bindings** (`src/renderer/tauri-window-api.ts → mountWindowApi()`): every `api.<domain>.<method>` that runs as pure TS over the renderer-side DB shim is bound directly to its `src/api/*` function, with `mutating()` / `readOnly()` helpers for the `data:changed` broadcast.

No registry, no auto-walk, no preload, no parity test gate. Adding a binding edits one file (or two if Rust-backed).

## The decision tree

When wiring a new `window.api.foo.bar`:

```
1. Does the operation only touch SQLite + pure TS api/ functions?
   → YES: add a single line to mountWindowApi() in tauri-window-api.ts.
          mutating() wraps writes; readOnly() wraps reads. Done.

2. Does it need a native capability?
   → file dialog (open, save, pick folder)?
   → fs read/write/copy?
   → reveal-in-finder, open external URL, open file with default app?
   → spawn a sidecar / native binary?
   → multi-window orchestration?
   → image thumbnailing / preview generation?

   → YES to any of the above: you need a Rust-backed command.

3. Does that capability already exist in the shipped command set?
   → YES: write a thin async function in tauri-window-api.ts that calls
          `commands.<existingCommand>(...)` from bindings.ts.
   → NO:  add a new #[tauri::command] #[specta::specta] in
          src-tauri/src/lib.rs (or a sibling .rs), register it in the
          tauri_specta::Builder::collect_commands! macro, then `cargo build`
          regenerates bindings.ts. Then write the renderer polyfill.
```

**Generic rule:** prefer reaching for an existing Rust command before adding a new one. The shipped command set is intentionally generic (read bytes, write text, pick file, reveal path) so most renderer needs compose from primitives.

## Rust commands already shipped

In `src-tauri/src/lib.rs` and sibling modules. The source of truth is `src/renderer/bindings.ts` — run `cat src/renderer/bindings.ts` to see the typed wrappers Specta emitted.

| Command (Specta name) | Signature | Use for |
|---|---|---|
| `commands.dialogPick` | `(kind, title?, extensions?, extensionLabel?, defaultName?)` → `{ canceled, path? }` | File / folder pickers — every importer's `*SelectFile` polyfill uses this. |
| `commands.fsReadText` | `(path)` → `string` | UTF-8 file read — config files, GEDCOM source files, Gramps XML. |
| `commands.fsReadBytesBase64` | `(path)` → `base64 string` | Binary file read — every `import:*Run` polyfill needs this; renderer base64-decodes to a `Uint8Array`. |
| `commands.fsWriteText` | `(path, contents)` | Save dialogs that write text — GEDCOM export, CSV export. |
| `commands.fsWriteBytesBase64` | `(path, b64)` | Save dialogs that write binary — archive export, per-media archive import. |
| `commands.fsWriteTempBytesBase64` | `(name, b64)` → `string` (absolute path) | Write to OS temp dir — used by RootsMagic import to materialize the picked file before opening as a secondary SQLite connection. |
| `commands.fsRemoveFile` / `commands.fsRemoveDir` | `(path)` | Best-effort cleanup. |
| `commands.fsCopyFile` | `(src, dest)` | Single-file copy. |
| `commands.shellReveal` | `(path)` | "Show in Finder" / "Show in Explorer". |
| `commands.shellOpenPath` | `(path)` | Open a file with its default app. |
| `commands.mediaPickAndCopy` | `()` → `{ canceled, fileRef?, format?, title? }` | The full media-attach flow — user picks a file, Rust copies it into `<dbname>-media/`, returns the relative ref. |
| `commands.mediaReadAsDataUrl` | `(fileRef)` → `string | null` | Read a media file as `data:image/...;base64,...` for preview. |
| `commands.mediaThumbnail` | `(fileRef, maxWidth?)` → `string | null` | JPEG thumbnail via the Rust `image` crate. |
| `commands.defaultDbPath` | `()` → `string` | OS-default DB location. |
| `commands.dbCurrentPath` | `()` → `string | null` | Currently-open DB path. |
| `commands.dbPickExisting` / `dbPickNew` | `()` → `string | null` | DB-flavoured dialog_pick. |
| `commands.dbOpen` / `dbClose` / `dbIsOpen` | DB lifecycle | Open/close the rusqlite global connection. |
| `commands.dbRun` / `dbGet` / `dbAll` / `dbBatch` / `dbBatchRun` / `dbRunChanges` | SQL primitives | The renderer's `db-shim` calls these; you almost never call them directly. See `/rusqlite-patterns`. |
| `commands.secondaryDbOpen` / `secondaryDbClose` / `secondaryDbRun` / `secondaryDbGet` / `secondaryDbAll` | Secondary DB handle | RootsMagic import uses this — open a read-only second SQLite connection. |
| `commands.appVersion` | `()` → `string` | Read the Tauri bundle's version — Settings → About. |
| `commands.readBundledResource` | `(name)` → `string` | Read a file shipped as a Tauri resource (`tauri.conf.json` bundle.resources). Used for `THIRD_PARTY_LICENSES.txt`. |
| `commands.openSecondWindow` | `(label)` | Multi-window — opens a second `WebviewWindow`. |
| `commands.broadcastDataChanged` | `(kind)` | Cross-window `data:changed` fan-out. |
| `commands.holgerExtractGed` / `holgerBulkCopyMedia` / `holgerConsolidateMedia` | Holger import flow | The three-step Rust-side pipeline for OurKind imports — extract .ged, bulk-copy media, consolidate refs. |
| `commands.websiteBakePreviewThumbnails` / `websiteLoadStaticIndexHtml` / `websiteExportMedia` | Website export | Inline thumbnail bake + dist-static index.html load + per-media copy. |
| `commands.probeMcpSidecar` | `(repoRoot, dbPath)` → `McpProbe` | Test whether the sidecar MCP can be spawned. |

When you write a polyfill, run `grep -E "^\s+\w+:.*__TAURI_INVOKE" src/renderer/bindings.ts` to see the current set with their signatures.

## The Specta pattern

### Annotate the Rust function

```rust
// src-tauri/src/lib.rs (or sibling module)

#[tauri::command]
#[specta::specta]
async fn thing_export(id: String, path: String) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || things::export(&id, &path))
        .await
        .map_err(|e| e.to_string())?
}
```

The `#[specta::specta]` annotation is what makes the command show up in `bindings.ts`. Without it, you have a working Tauri command that the renderer can `invoke()` by string name — but no TypeScript types and no compile-time check that the parameters match.

### Annotate the types

Every type used in a command signature (parameter, return type, anything inside `Result<...>`) needs `#[derive(specta::Type)]`:

```rust
#[derive(Debug, Serialize, Deserialize, specta::Type)]
pub struct ThingExportResult {
    pub bytes_written: u64,
    pub elapsed_ms: u64,
}
```

If you add a command that returns a complex type and `cargo build` errors with "type X does not implement specta::Type", that's the fix — add the derive.

### Special case: `serde_json::Value`

`serde_json::Value` cannot be used directly in a Specta-annotated command signature on the version we pin (`specta = "=2.0.0-rc.25"`) — the type-derivation pass stack-overflows on Value's recursive enum. Use the `wire::JsonValueWire` newtype instead:

```rust
// In src-tauri/src/wire.rs (already shipped):
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct JsonValueWire(pub serde_json::Value);

// Hand-rolled specta::Type impl returns an empty named struct (TS: {}).
// Wire format is `serde(transparent)` so callers see plain JSON.
```

Use in a command signature like:

```rust
use crate::wire::JsonValueWire;

#[tauri::command]
#[specta::specta]
async fn thing_take_json(value: JsonValueWire) -> Result<JsonValueWire, String> {
    let inner: serde_json::Value = value.0;
    // ... do work ...
    Ok(JsonValueWire(result))
}
```

Helpers `wire::unwrap_params` and `wire::unwrap_params_list` keep call sites tidy at module boundaries.

When Specta hits stable and (hopefully) fixes the recursive-type stack overflow, we can revisit and remove `JsonValueWire`. Until then, treat any `serde_json::Value` boundary as needing the newtype.

### Register the command

In `src-tauri/src/lib.rs`, add the command name to the builder's `collect_commands!` macro:

```rust
let builder = tauri_specta::Builder::<tauri::Wry>::new()
    .commands(tauri_specta::collect_commands![
        // ... existing commands ...
        thing_export,
    ]);
```

### Build → bindings.ts regenerates

`cargo build` (or `npm run build` / `npm run tauri:dev`) runs the builder's export step in debug mode and writes `src/renderer/bindings.ts`. Inspect the diff to confirm your command shows up:

```bash
grep -A2 'thingExport' src/renderer/bindings.ts
```

The generated file is committed to git so reviewers see API surface changes in PR diffs.

### Write the renderer polyfill

In `src/renderer/tauri-window-api.ts`:

```typescript
api.things.exportToFile = async (id: unknown, dest: unknown) => {
  if (typeof id !== 'string' || typeof dest !== 'string') {
    return { success: false, error: 'id and dest must be strings' };
  }
  try {
    const bytes = await unwrap(commands.thingExport(id, dest));
    fireDataChanged();  // only if this mutates renderer-observable state
    return { success: true, bytesWritten: bytes };
  } catch (e) {
    return { success: false, error: String((e as Error)?.message || e) };
  }
};
```

`unwrap()` handles the `Result<T, String>` envelope Specta wraps fallible commands in. `__TAURI_INVOKE<T>` (used for infallible commands like `appVersion`) returns `T` directly without the envelope.

## Pure-TS bindings (no Rust at all)

Most CRUD bindings don't need Rust. The api/* function already runs in the renderer (via the DB shim that proxies to rusqlite). Just bind it:

```typescript
api.things = {
  list: readOnly((db) => things.listThings(db)),
  get: readOnly((db, id: string) => things.getThing(db, id)),
  create: mutating((db, data: Parameters<typeof things.createThing>[1]) => things.createThing(db, data)),
  update: mutating((db, id: string, data) => things.updateThing(db, id, data)),
  delete: mutating((db, id: string) => things.deleteThing(db, id)),
};
```

`mutating()` fires `data:changed` after the call (so `useEntityData` / `usePagedList` subscribers reload). `readOnly()` doesn't. Both thread the renderer-side `Database` instance into the handler as the first argument.

### When to write a Rust command vs a pure-TS binding

A useful sanity check: **does the renderer have everything it needs to do this work, or is it asking the host to do something it can't?**

- Renderer has the data, the host needs to put it on disk → pure-TS binding that calls `commands.fsWriteText(...)`.
- Renderer needs bytes from a file the user picked → pure-TS binding that calls `commands.dialogPick(...)` then `commands.fsReadBytesBase64(...)`.
- Renderer needs to spawn a sidecar binary, copy a directory tree, take a screenshot, open a second window → new Rust command (the renderer can't do these at all).
- Renderer needs a complex multi-step DB transaction with rollback semantics → pure-TS binding with `BEGIN IMMEDIATE` / `COMMIT` via the api/ layer (rusqlite is single-threaded; serialise via `withStatementCache`).

## Tauri plugin commands — prefer the JS wrapper

For **our own** Rust commands, always use `commands.*` from `bindings.ts` — Specta types catch parameter/return drift at compile time.

For **plugin** commands (anything namespaced `plugin:<name>|<cmd>` in raw `invoke`), the order is:

1. **First choice — the plugin's JS package.** `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-opener`, etc. These ship typed wrappers, handle the plugin's channel-based progress events, and surface stateful objects (`Update`, `Watcher`, `Store`) that raw invokes can't return cleanly. Live-binding pattern:

   ```typescript
   import { check } from '@tauri-apps/plugin-updater';
   const update = await check();
   if (update) await update.downloadAndInstall(event => { /* Started | Progress | Finished */ });
   ```

   For lazy-loading inside a composable that runs in both Tauri and the static SPA, dynamic-import:

   ```typescript
   if (!isTauri()) return null;
   const { check } = await import('@tauri-apps/plugin-updater');
   ```

2. **Fallback — raw `invoke('plugin:foo|bar')`.** Only when the plugin ships no JS wrapper, or when you've verified the wrapper offers nothing the invoke doesn't (fire-and-forget, no event channels, no stateful object). One real example in this repo: `plugin:opener|open_url` is a one-line invoke because `@tauri-apps/plugin-opener` would add ~5 KB for a wrapper that just calls the same invoke under the hood — but even then, the trade-off was deliberate, not the default.

**Symptom of the wrong choice:** a `@tauri-apps/plugin-*` package sitting in `package.json` that nothing imports. Either start using it or remove the dep — never leave it as a "we'll get to it" stub. See the dated callout at the top of this file.

The shape of a raw plugin invoke:

```typescript
import { invoke } from '@tauri-apps/api/core';
await invoke('plugin:opener|open_url', { url: 'https://example.org' });
```

## Error-handling convention

Polyfills follow the importer pattern: catch, return a structured error object the renderer can display, never let the exception bubble to the caller's try/catch as an opaque Tauri panic:

```typescript
try {
  // ... do the work ...
  return { success: true, summary: result.summary };
} catch (e) {
  return { success: false, error: String((e as Error)?.message || e) };
}
```

The renderer's caller handles the `success: false` branch with a toast (`toast.error(t('errors.importFailed'))`).

For Specta's `Result<T, String>` envelopes, the `unwrap()` helper at the top of `tauri-window-api.ts` either returns `T` or throws an `Error` whose `.message` is the Rust-side String — so the try/catch around it Just Works.

## Reference: the `tauri-window-api.ts` layout

The file is ~1,300 lines, structured top-to-bottom:

1. Imports (`@tauri-apps/api/core`, `./bindings`, the api/ modules referenced by bindings).
2. `unwrap()` / `unwrapAs()` — Specta envelope helpers.
3. `dbInstance` global + `getDb()` — the renderer-side `Database` shim that proxies into rusqlite via `db-shim`.
4. `fireDataChanged()` — emits the Tauri event AND calls every locally-registered listener.
5. `mutating()` / `readOnly()` helpers.
6. `mountWindowApi(db)` — builds the `api` object:
   - **Inlined channel bindings** — one block per domain (persons, places, events, sources, …). Pure TS, no Specta.
   - **Domain-specific Rust-backed polyfills** — db, media, checks, undo, gedcom, import, archive, csv, export, website, chart, print, app, onboarding. Each calls `commands.*` from `bindings.ts`.
7. Helpers — `switchDbTo`, base64 codecs, `deriveDbName`.

When extending: add new TS-only bindings inside the inlined section in alphabetical order; add Rust-backed polyfills inside their domain group below.

## What this skill does NOT cover

- **rusqlite SQL patterns** — see `/rusqlite-patterns`.
- **The dev MCP HTTP bridge** (`src-tauri/src/ui_server.rs`) — see `/slaktforskning-mcp-dev` "The dev MCP HTTP bridge" section.
- **Cargo / Tauri build / packaging** — see `/tauri-dev`.

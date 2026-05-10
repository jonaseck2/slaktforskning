---
name: sqlite-wal
description: WAL journaling is unsupported by node-sqlite3-wasm by design — and silently no-ops. Use when reviewing any `PRAGMA journal_mode` code, when adding a sibling tool (rusqlite, sqlite3 CLI, native better-sqlite3) that might share an .db file with the Electron app, or when investigating "SQLite3Error: unable to open database file" with no obvious cause.
---

# SQLite WAL Mode in this Project

## The constraint

`node-sqlite3-wasm`'s build sets [`-DSQLITE_OS_OTHER=1`](https://github.com/tndrle/node-sqlite3-wasm/blob/main/Makefile)
and ships a custom VFS in [`src/vfs.c`](https://github.com/tndrle/node-sqlite3-wasm/blob/main/src/vfs.c)
whose `sqlite3_io_methods.iVersion = 1`. SQLite requires `iVersion >= 2` for the
shared-memory hooks (`xShmMap`/`xShmLock`/`xShmBarrier`/`xShmUnmap`) that WAL
journaling depends on.

Consequences for our codebase:

1. `PRAGMA journal_mode = WAL` issued from the Electron app **silently downgrades to DELETE**. SQLite returns the actual mode it ended up in (`'delete'`), no exception is thrown. Our `src/api/schema.ts:5` has been doing this on every launch and we never noticed.
2. Opening a `.db` file whose header bytes 18/19 are `2/2` (WAL-tagged by some other tool) **fails with `SQLITE_CANTOPEN`** — bare "unable to open database file" with no useful context.
3. The Electron app has therefore been running in DELETE mode on every OS the entire time. The only effect: no concurrent writer-while-reader. App still works fine.

## What to do — and what to never do

**Don't issue `PRAGMA journal_mode = WAL` blindly.** If you keep it, also assert the result and log a warning when it doesn't equal `'wal'`. Better: drop it entirely, since this build will never honor it.

**If you add a sibling tool that touches the same `.db` file** (rusqlite in the Tauri spike, the `sqlite3` CLI in a script, a Rust importer, etc.) — that tool's SQLite is probably *real* native SQLite which honors the WAL pragma. If it issues `PRAGMA journal_mode = WAL` on a database the Electron app shares, the file's header gets WAL-tagged for real and **the Electron app will refuse to open it on next launch**. This bricks the user's data path until rescued.

**Never copy a pragma string from `src/api/schema.ts` into a non-WASM SQLite caller.** They look harmless ("just turning on WAL") but they aren't symmetric — the Electron pragma is a no-op, the native pragma is a flag that breaks Electron.

## Detecting the WAL tag

```bash
node -e "
const fs = require('fs');
const buf = Buffer.alloc(20);
const fd = fs.openSync(process.argv[1], 'r');
fs.readSync(fd, buf, 0, 20, 0);
fs.closeSync(fd);
console.log('write_v:', buf.readUInt8(18), 'read_v:', buf.readUInt8(19));
" path/to/some.db
# 1 1 = DELETE (or any non-WAL) mode — Electron-compatible
# 2 2 = WAL mode — Electron will refuse to open
```

## Rescue path if a DB ends up WAL-tagged

The `walfix` tool in the Tauri spike (`tauri-spike/src-tauri/src/bin/walfix.rs`) is a one-shot rusqlite binary that checkpoints any pending WAL frames and downgrades the file back to DELETE journaling. All authored data is preserved; only the header bytes 18/19 change.

```bash
# Build (incremental — fast if cargo cache is warm)
cd tauri-spike/src-tauri
cargo build --release --bin walfix

# Run against the locked DB (back up first if you care)
./target/release/walfix path/to/slaktforskning.db
# expected output: "journal_mode now: delete"
```

After running, verify with the header inspector above — write_v / read_v should both be 1.

## If you ever need real WAL in this project

The cleanest path is the Tauri port (already evaluated; see `docs/plans/tauri-port-evaluation-recommendation.md`). rusqlite is real SQLite with full WAL. The other options — switching node-sqlite3-wasm out for `better-sqlite3` or native `sqlite` — reintroduce per-OS native-binary rebuild pain (the very thing the project moved to a WASM build to avoid).

## Why this skill exists

Discovered 2026-05-10 after the Tauri spike's startup pragma (`PRAGMA journal_mode = WAL` copied verbatim from `src/api/schema.ts`) flipped the user's production DB header to WAL and made the Electron app unable to open it. Recovery via `walfix` was clean, but the Prime Directive of "the user's data is sacred" demands we don't repeat it. This skill's `description` triggers it on any future `journal_mode` work, any new sibling tool plumbing, and any investigation of bare CANTOPEN errors.

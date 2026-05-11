---
name: sqlite-wal
description: DELETE journaling is the canonical SQLite mode for this project across both runtimes (Tauri/rusqlite and Electron/node-sqlite3-wasm). Use when reviewing any `PRAGMA journal_mode` code, when adding a sibling tool (rusqlite CLI, sqlite3 CLI, native better-sqlite3) that might share an .db file, or when investigating "SQLite3Error: unable to open database file" with no obvious cause. Pulls in the historical Electron-era WASM constraints at the bottom.
---

# SQLite Journaling Mode in this Project

## The rule

**Use DELETE journaling. Never WAL.** Across both runtimes:

- Tauri / rusqlite: `PRAGMA journal_mode = DELETE` (set explicitly in `src-tauri/src/db.rs` `open_db`).
- Electron / node-sqlite3-wasm: also DELETE (the only mode the WASM build can honor — see Historical section below).
- Any sibling tool (sqlite3 CLI, scripts using `node:sqlite`, a Rust importer): also DELETE.

This is a **deliberate choice** in the Tauri build, not a runtime constraint. rusqlite supports WAL natively; we opt out.

## Why DELETE is mandatory

**Users copy `.db` files.** They drag `family.db` to their backup drive, send it via email, restore it from Time Machine, drop it on a new computer's Desktop. WAL mode produces sidecar files: `family.db-wal` (the write-ahead log) and `family.db-shm` (the shared-memory index). If the user copies only `family.db` and the sidecars are non-empty, the destination opens to a stale snapshot — every change since the last checkpoint is silently lost.

DELETE mode keeps everything in the single `.db` file. The user's mental model ("the database is one file, it's `family.db`, I copy that file") is the truth. No sidecars, no foot-guns, no support tickets that start "I sent my tree to my brother and half of it disappeared."

Secondary benefit: DELETE mode means SQLite's header bytes 18/19 are `1/1`. Any SQLite reader (DB Browser for SQLite, the `sqlite3` CLI, an old build of our app, a future migration tool) opens the file without negotiation. WAL-tagged files (`2/2`) are interpretable only by SQLite builds that link the shared-memory hooks — which the WASM build does not.

## What to do — and what to never do

**Don't issue `PRAGMA journal_mode = WAL` from any code path that touches a user DB.** Not in importers, not in scripts, not in the Tauri/Rust side, not in the Electron worker. Every `PRAGMA journal_mode` call in this codebase should set DELETE explicitly or leave the default alone.

**If you add a sibling tool that touches the same `.db` file** (a rusqlite CLI helper, a `sqlite3` shell script, a Rust importer, a native `better-sqlite3` integration) — that tool is talking to *real* SQLite, which honors `PRAGMA journal_mode = WAL` for real. If it WAL-tags a file the app shares, the user's next backup-and-restore will silently lose data, AND (in the Electron build) the app will refuse to open the file at all (`SQLITE_CANTOPEN`).

**Never copy a pragma string from `src-tauri/src/db.rs` or `src/api/schema.ts` into a non-WASM SQLite caller.** They look harmless ("just turning on WAL") but they aren't symmetric — the WASM pragma is a no-op on Electron, the native pragma is a flag that breaks both backups *and* the Electron app.

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
# 1 1 = DELETE (or any non-WAL) mode — what we ship
# 2 2 = WAL mode — must be downgraded before the user backs up or before Electron opens it
```

## Rescue path if a DB ends up WAL-tagged

`scripts/walfix.mjs` uses Node's built-in `node:sqlite` module (Node 22.5+ — full native SQLite via libsqlite3) to checkpoint any pending WAL frames and downgrade the file back to DELETE journaling. All authored data is preserved; only the header bytes 18/19 change.

```bash
# Back up first (the script intentionally doesn't)
cp path/to/slaktforskning.db path/to/slaktforskning.db.bak

# Run
node scripts/walfix.mjs path/to/slaktforskning.db
# expected output: "journal_mode now: delete"
```

After running, verify with the header inspector above — write_v / read_v should both be 1.

---

## Historical: Electron-era constraints

This section captures the original failure mode that made DELETE mandatory in the Electron build. The user-observable rule (DELETE everywhere, never WAL) is unchanged in Tauri; the *reasons* are now belt-and-suspenders.

### node-sqlite3-wasm doesn't support WAL by design

`node-sqlite3-wasm`'s build sets [`-DSQLITE_OS_OTHER=1`](https://github.com/tndrle/node-sqlite3-wasm/blob/main/Makefile)
and ships a custom VFS in [`src/vfs.c`](https://github.com/tndrle/node-sqlite3-wasm/blob/main/src/vfs.c)
whose `sqlite3_io_methods.iVersion = 1`. SQLite requires `iVersion >= 2` for the
shared-memory hooks (`xShmMap`/`xShmLock`/`xShmBarrier`/`xShmUnmap`) that WAL
journaling depends on.

Consequences for the Electron build:

1. `PRAGMA journal_mode = WAL` issued from the Electron app **silently downgrades to DELETE**. SQLite returns the actual mode it ended up in (`'delete'`), no exception is thrown.
2. Opening a `.db` file whose header bytes 18/19 are `2/2` (WAL-tagged by some other tool) **fails with `SQLITE_CANTOPEN`** — bare "unable to open database file" with no useful context.
3. The Electron app has therefore been running in DELETE mode on every OS the entire time. The only effect: no concurrent writer-while-reader. App still works fine.

### The 2026-05-10 incident

Discovered after the Tauri spike's startup pragma (`PRAGMA journal_mode = WAL` copied verbatim from `src/api/schema.ts`) flipped the user's production DB header to WAL and made the Electron app unable to open it. Recovery via `walfix` was clean, but the Prime Directive of "the user's data is sacred" demanded a permanent fix:

- The Tauri-side rusqlite open path now sets `PRAGMA journal_mode = DELETE` explicitly.
- The Electron-side WAL pragma was deleted in v0.247.x; node-sqlite3-wasm leaves DELETE as the default and we don't poke at it.
- This skill triggers on any future `journal_mode` work, any new sibling tool plumbing, and any investigation of bare CANTOPEN errors.

### When the Tauri test backend swaps

The Vitest test pyramid still uses node-sqlite3-wasm via `createTestDb()`. When that swaps to in-memory rusqlite (post-v0.250.0 follow-up per the test-migration plan), the WASM-specific failure modes above stop being reachable from anything but production Electron builds. The DELETE-mandate guidance is unaffected.

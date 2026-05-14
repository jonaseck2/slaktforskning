---
name: sqlite-wal
description: DELETE journaling is the canonical SQLite mode for this project. Use when reviewing any `PRAGMA journal_mode` code, when adding a sibling tool (rusqlite CLI, sqlite3 CLI, native better-sqlite3) that might share an .db file, or when investigating "SQLite3Error: unable to open database file" with no obvious cause.
---

# SQLite Journaling Mode in this Project

## The rule

**Use DELETE journaling. Never WAL.**

- The Tauri/rusqlite open path sets `PRAGMA journal_mode = DELETE` explicitly in `src-tauri/src/db.rs` (`open_db`).
- Any sibling tool (sqlite3 CLI, scripts using `node:sqlite`, a Rust importer) that touches a user `.db`: also DELETE.

This is a **deliberate choice**, not a runtime constraint. rusqlite supports WAL natively; we opt out.

## Why DELETE is mandatory

**Users copy `.db` files.** They drag `family.db` to their backup drive, send it via email, restore it from Time Machine, drop it on a new computer's Desktop. WAL mode produces sidecar files: `family.db-wal` (the write-ahead log) and `family.db-shm` (the shared-memory index). If the user copies only `family.db` and the sidecars are non-empty, the destination opens to a stale snapshot — every change since the last checkpoint is silently lost.

DELETE mode keeps everything in the single `.db` file. The user's mental model ("the database is one file, it's `family.db`, I copy that file") is the truth. No sidecars, no foot-guns, no support tickets that start "I sent my tree to my brother and half of it disappeared."

Secondary benefit: DELETE mode means SQLite's header bytes 18/19 are `1/1`. Any SQLite reader (DB Browser for SQLite, the `sqlite3` CLI, a future migration tool) opens the file without negotiation.

## What to do — and what to never do

**Don't issue `PRAGMA journal_mode = WAL` from any code path that touches a user DB.** Not in importers, not in scripts, not in the Rust side, not in test helpers. Every `PRAGMA journal_mode` call in this codebase should set DELETE explicitly or leave the default alone.

**If you add a sibling tool that touches the same `.db` file** (a rusqlite CLI helper, a `sqlite3` shell script, a Rust importer, a native `better-sqlite3` integration) — that tool is talking to real SQLite, which honors `PRAGMA journal_mode = WAL` for real. If it WAL-tags a file the app shares, the user's next backup-and-restore will silently lose data.

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
# 2 2 = WAL mode — must be downgraded before the user backs up
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

## Historical note

The DELETE-everywhere rule originated in the Electron era — `node-sqlite3-wasm` couldn't honor WAL at all (`iVersion = 1` VFS, missing the shared-memory hooks WAL needs). A 2026-05-10 incident flipped a user's production DB header to WAL via a startup pragma copied into the Tauri spike, breaking the Electron app's ability to open it. Recovery via `walfix` was clean.

Electron is gone (v0.250.0). The Prime Directive reason — *the user's `.db` is one portable file* — is now the sole reason DELETE is mandatory, and it's enough.

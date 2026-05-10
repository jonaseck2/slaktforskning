#!/usr/bin/env node
// Rescue tool: convert a SQLite database from WAL journaling back to the
// default DELETE journaling. Use when the Electron app crashes at startup
// with `SQLite3Error: unable to open database file` because some other
// tool (rusqlite, sqlite3 CLI, better-sqlite3, etc.) has flipped the
// file's header bytes 18/19 to 2/2 (the WAL marker).
//
// node-sqlite3-wasm's custom VFS has sqlite3_io_methods.iVersion=1, no
// shared-memory hooks — so it cannot open WAL-tagged files. See
// .claude/skills/sqlite-wal/ for the full constraint.
//
// Uses the built-in node:sqlite module (Node 22.5+, stable in Node 24+),
// which links real native SQLite and supports WAL.
//
// Usage: node scripts/walfix.mjs <path-to.db>
//
// Back up the DB first if you care; this script doesn't.

import { DatabaseSync } from 'node:sqlite';
import { existsSync, openSync, readSync, closeSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('usage: node scripts/walfix.mjs <path-to.db>');
  process.exit(2);
}
if (!existsSync(dbPath)) {
  console.error(`not found: ${dbPath}`);
  process.exit(2);
}

function readJournalHeader(p) {
  const fd = openSync(p, 'r');
  const buf = Buffer.alloc(20);
  readSync(fd, buf, 0, 20, 0);
  closeSync(fd);
  return { write_v: buf.readUInt8(18), read_v: buf.readUInt8(19) };
}

const before = readJournalHeader(dbPath);
console.log(`before: write_v=${before.write_v} read_v=${before.read_v}`);
if (before.write_v === 1 && before.read_v === 1) {
  console.log('already in DELETE mode — nothing to do');
  process.exit(0);
}

let db;
try {
  db = new DatabaseSync(dbPath);
} catch (e) {
  console.error('open failed:', e.message);
  process.exit(1);
}

// Checkpoint any pending WAL frames into the main DB before downgrading
// the journal mode. TRUNCATE writes them and clears the -wal sidecar.
try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
} catch (e) {
  console.warn('checkpoint warning:', e.message);
}

const after = db.prepare('PRAGMA journal_mode = DELETE').get();
db.close();

const headerAfter = readJournalHeader(dbPath);
console.log(`after:  write_v=${headerAfter.write_v} read_v=${headerAfter.read_v}`);
console.log(`journal_mode now: ${after.journal_mode}`);

if (after.journal_mode !== 'delete' || headerAfter.write_v !== 1 || headerAfter.read_v !== 1) {
  console.error('downgrade did not complete cleanly');
  process.exit(1);
}

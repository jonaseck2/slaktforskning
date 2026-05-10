// Test whether node-sqlite3-wasm fails specifically on WAL-mode databases.
// On Windows + Node 26.1.0, the suspicion is that WAL mode (which needs
// shared-memory mmap of the -shm file) fails inside Emscripten's NODEFS.
//
// Three cases:
// 1. Fresh DB in default DELETE mode → expected: works.
// 2. Fresh DB, then PRAGMA journal_mode=WAL → expected: ?
// 3. Reopen the WAL-tagged file from case 2 → expected: ?

import sqlite from 'node-sqlite3-wasm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readHeader(p) {
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(100);
  fs.readSync(fd, buf, 0, 100, 0);
  fs.closeSync(fd);
  return { write_v: buf.readUInt8(18), read_v: buf.readUInt8(19) };
}

function clean(p) {
  for (const ext of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(p + ext); } catch {}
  }
}

const t = path.join(os.tmpdir(), 'wal-probe-' + Date.now() + '.db');

// 1. Fresh DB in default DELETE mode
{
  const db = new sqlite.Database(t);
  db.exec('CREATE TABLE t(x INTEGER); INSERT INTO t VALUES(1),(2),(3);');
  const c = db.all('select count(*) c from t')[0].c;
  const jm = db.all('PRAGMA journal_mode')[0];
  db.close();
  console.log('1. fresh DELETE mode:', { count: c, journal_mode: jm, header: readHeader(t) });
}

// 2. Reopen and try to switch to WAL via PRAGMA
{
  let db;
  try {
    db = new sqlite.Database(t);
    console.log('2a. reopen DELETE-mode file: OK');
  } catch (e) {
    console.log('2a. reopen DELETE-mode file FAIL:', e.message);
  }
  try {
    const r = db.all('PRAGMA journal_mode=WAL');
    console.log('2b. PRAGMA journal_mode=WAL:', r);
  } catch (e) {
    console.log('2b. PRAGMA journal_mode=WAL FAIL:', e.message);
  }
  try { db && db.close(); } catch {}
  console.log('2c. header after PRAGMA WAL attempt:', readHeader(t));
}

// 3. Reopen the (possibly) WAL-tagged file
{
  try {
    const db = new sqlite.Database(t);
    console.log('3. reopen WAL-tagged: OK', db.all('select count(*) c from t')[0]);
    db.close();
  } catch (e) {
    console.log('3. reopen WAL-tagged FAIL:', e.message);
  }
}

// 4. Manually flip the header bytes 18/19 to 2/2 and try opening
{
  clean(t);
  // recreate clean DELETE-mode DB
  const db = new sqlite.Database(t);
  db.exec('CREATE TABLE t(x INTEGER); INSERT INTO t VALUES(1),(2),(3);');
  db.close();
  console.log('4a. fresh DELETE header:', readHeader(t));
  // flip
  const fd = fs.openSync(t, 'r+');
  fs.writeSync(fd, Buffer.from([2, 2]), 0, 2, 18);
  fs.closeSync(fd);
  console.log('4b. after flip header:', readHeader(t));
  try {
    const db2 = new sqlite.Database(t);
    console.log('4c. open WAL-flipped: OK', db2.all('select count(*) c from t')[0]);
    db2.close();
  } catch (e) {
    console.log('4c. open WAL-flipped FAIL:', e.message);
  }
}

clean(t);

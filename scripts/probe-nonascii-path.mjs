// Diagnostic: when does node-sqlite3-wasm refuse to open a path?
// Tests several path forms against the same physical DB file under
// %APPDATA%\Släktforskning\ (which contains the non-ASCII 'ä').
//
// Each case reports: open OK / open FAIL / first-row count.
// Run from project root:  node scripts/probe-nonascii-path.mjs

import sqlite from 'node-sqlite3-wasm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REAL = path.join(os.homedir(), 'AppData', 'Roaming', 'Släktforskning', 'slaktforskning.db');

function shortPath(p) {
  // 8.3 short-path equivalent via cmd's `for %I in (...) do @echo %~sI`.
  // Returns the short form for paths whose Windows volume has 8.3
  // generation enabled (default on system drive).
  try {
    const out = execSync(`cmd /c for %I in ("${p}") do @echo %~sI`, { encoding: 'utf8' });
    return out.trim();
  } catch (e) {
    return null;
  }
}

function tryOpen(label, candidate) {
  console.log(`\n--- ${label} ---`);
  console.log('   path:', candidate);
  console.log('   fs.existsSync:', fs.existsSync(candidate));
  try {
    const db = new sqlite.Database(candidate);
    const r = db.all('select count(*) c from persons')[0];
    console.log('   open OK:', r);
    db.close();
  } catch (e) {
    console.log('   open FAIL:', e.message);
  }
}

if (!fs.existsSync(REAL)) {
  console.error(`Real DB not found at ${REAL} — adjust the path and rerun.`);
  process.exit(1);
}

console.log('Reference DB:', REAL);
console.log('Reference size:', fs.statSync(REAL).size, 'bytes');

// 1. Forward-slash original
tryOpen('forward-slash original (Släktforskning)', REAL.replace(/\\/g, '/'));

// 2. Backslash original (Windows native)
tryOpen('backslash original (Släktforskning)', REAL);

// 3. UNC long-path prefix (\\?\)
tryOpen('UNC long-path prefix', '\\\\?\\' + REAL);

// 4. 8.3 short path (no non-ASCII at any segment)
const sp = shortPath(REAL);
if (sp) tryOpen('8.3 short path', sp);
else console.log('\n--- 8.3 short path: not available (volume disables 8.3) ---');

// 5. ASCII-only copy as control
const tmp = path.join(os.tmpdir(), 'slf-nonascii-probe.db');
fs.copyFileSync(REAL, tmp);
try {
  tryOpen('ASCII-only copy in %TEMP%', tmp);
} finally {
  for (const ext of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(tmp + ext); } catch {}
  }
}

// 6. Junction with ASCII name pointing at the non-ASCII directory
const junctionDir = path.join(os.tmpdir(), 'slf-junction-' + Date.now());
const realDir = path.dirname(REAL);
try {
  execSync(`cmd /c mklink /J "${junctionDir}" "${realDir}"`, { encoding: 'utf8' });
  tryOpen('via ASCII junction → non-ASCII real dir', path.join(junctionDir, 'slaktforskning.db'));
} catch (e) {
  console.log('\n--- ASCII junction: skipped (', e.message, ')');
} finally {
  try { execSync(`cmd /c rmdir "${junctionDir}"`); } catch {}
}

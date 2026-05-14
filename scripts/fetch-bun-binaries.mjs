#!/usr/bin/env node
// Fetch Bun binaries for each Tauri target triple, SHA-pinned.
//
// Reads src-tauri/binaries/bun-binaries.lock (the source of truth: version +
// per-target SHA256 of the upstream zip). For each target:
//   1. Download bun-<bunName>.zip from oven-sh/bun GitHub releases (cached).
//   2. SHA-verify against the lockfile — bail on mismatch.
//   3. Unzip into the .cache/ dir.
//   4. Copy <extract>/bun-<...>/bun(.exe) → src-tauri/binaries/bun-<triple>(.exe),
//      mark executable on POSIX.
//
// Shells out only via node:child_process.spawn (project security-hook
// standard). Idempotent: re-running with cached zips is fast and re-verifies
// SHAs every time.
//
// Run via `node scripts/fetch-bun-binaries.mjs`. CI invokes this in each
// matrix runner before `tauri build`.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const binDir = join(repoRoot, 'src-tauri', 'binaries');
const cacheDir = join(binDir, '.cache');
const lock = JSON.parse(readFileSync(join(binDir, 'bun-binaries.lock'), 'utf8'));

const TARGETS = [
  { triple: 'aarch64-apple-darwin',     bunName: 'bun-darwin-aarch64', exe: '' },
  { triple: 'x86_64-apple-darwin',      bunName: 'bun-darwin-x64',     exe: '' },
  { triple: 'x86_64-unknown-linux-gnu', bunName: 'bun-linux-x64',      exe: '' },
  { triple: 'x86_64-pc-windows-msvc',   bunName: 'bun-windows-x64',    exe: '.exe' },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} → exit ${code}`))));
    p.on('error', reject);
  });
}

mkdirSync(cacheDir, { recursive: true });

let count = 0;
for (const { triple, bunName, exe } of TARGETS) {
  const expectedSha = lock.shas[triple];
  if (!expectedSha) {
    throw new Error(`No SHA pinned in bun-binaries.lock for ${triple}`);
  }
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${lock.bun_version}/${bunName}.zip`;
  const zipPath = join(cacheDir, `${bunName}.zip`);
  if (!existsSync(zipPath)) {
    console.log(`[fetch-bun-binaries] downloading ${url}`);
    await run('curl', ['-fL', '--silent', '--show-error', '-o', zipPath, url]);
  } else {
    console.log(`[fetch-bun-binaries] cached ${bunName}.zip (skip download)`);
  }
  const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  if (sha !== expectedSha) {
    throw new Error(`SHA mismatch for ${bunName}: expected ${expectedSha}, got ${sha}`);
  }
  const extractDir = join(cacheDir, bunName);
  await run('unzip', ['-oq', zipPath, '-d', extractDir]);
  const src = join(extractDir, bunName, `bun${exe}`);
  const dst = join(binDir, `bun-${triple}${exe}`);
  copyFileSync(src, dst);
  if (!exe) chmodSync(dst, 0o755);
  console.log(`[fetch-bun-binaries] installed ${dst}`);
  count++;
}

console.log(`[fetch-bun-binaries] done — ${count} binaries in ${binDir}/`);

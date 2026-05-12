#!/usr/bin/env node
// Tauri-aware MCP launcher.
//
// Asks the running Tauri app's UI server for its currently-open DB path
// before spawning the real MCP server. This keeps the MCP and the app
// looking at the same family.db even after the user picks a different
// file via Settings → Database. Falls back to the bundled default if the
// app isn't running yet.

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const port = process.env.SLAKTFORSKNING_UI_PORT || '19241';

// Read the Tauri bundle identifier once so the fallback DB path stays in sync
// with whatever `src-tauri/tauri.conf.json` declares. The next rename then
// becomes a one-place edit in tauri.conf.json instead of hunting for hardcoded
// strings across scripts.
function readIdentifier() {
  try {
    const conf = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'),
    );
    if (typeof conf?.identifier === 'string' && conf.identifier.length) {
      return conf.identifier;
    }
  } catch {
    // fall through to a sensible default
  }
  return 'com.slaktforskning.app';
}
const bundleIdentifier = readIdentifier();

// dev or prod entry, picked by argv[2]: 'dev' → devServer.ts, anything else → server.ts
const variant = process.argv[2] === 'dev' ? 'devServer' : 'server';
const entry = path.join(repoRoot, 'src', 'mcp', `${variant}.ts`);

async function fetchActiveDbPath() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 500);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/db_path`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.path === 'string' && body.path.length ? body.path : null;
  } catch {
    return null;
  }
}

const active = await fetchActiveDbPath();
const env = { ...process.env };
if (active) {
  env.SLAKTFORSKNING_DB = active;
  process.stderr.write(`[mcp-tauri] using active app DB: ${active}\n`);
} else if (env.SLAKTFORSKNING_DB) {
  process.stderr.write(`[mcp-tauri] app not reachable, using SLAKTFORSKNING_DB=${env.SLAKTFORSKNING_DB}\n`);
} else {
  // Fallback to the Tauri bundle's default DB path so we at least line up
  // when the app isn't running for the very first launch. The identifier is
  // read from src-tauri/tauri.conf.json so this stays in sync after renames.
  const fallback = path.join(
    process.env.HOME || '',
    `Library/Application Support/${bundleIdentifier}/family.db`,
  );
  if (fs.existsSync(path.dirname(fallback))) {
    env.SLAKTFORSKNING_DB = fallback;
    process.stderr.write(`[mcp-tauri] app not reachable, fallback DB: ${fallback}\n`);
  } else {
    process.stderr.write(`[mcp-tauri] app not reachable and no fallback found; MCP will use its own default.\n`);
  }
}

// Packaged vs dev split.
//
// In dev (`tauri dev` + `.mcp.json` pointing at this launcher), we spawn the
// MCP via `npx tsx src/mcp/<server|devServer>.ts` — same as before. This is
// what Claude / Cursor / etc. invoke through `.mcp.json`.
//
// In a packaged build, `scripts/build-mcp-sidecar.mjs` produces
// `target/mcp-server-<triple>(.exe)` binaries that Tauri's externalBin
// machinery copies next to the app binary. The Rust side (src-tauri/src/mcp.rs
// `spawn_bundled_mcp`) launches the bundled sidecar when the app boots — the
// MCP runs as a child of the app process, not invoked through this launcher.
//
// If both paths somehow co-exist on the same host (developer with a packaged
// build installed who also runs `tauri dev`), the dev launcher always wins
// because `.mcp.json` only sees this script.

import { existsSync } from 'node:fs';

const SIDECAR_TRIPLES = [
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
  'x86_64-pc-windows-msvc.exe',
  'x86_64-unknown-linux-gnu',
];
const sidecarBuilt = SIDECAR_TRIPLES.some((triple) =>
  existsSync(path.join(repoRoot, 'target', `mcp-server-${triple}`)),
);
if (sidecarBuilt) {
  process.stderr.write(
    '[mcp-tauri] note: bundled MCP sidecar binaries exist in target/. ' +
    'Packaged builds spawn that sidecar from Rust on app start; this launcher ' +
    'still uses `npx tsx` for the dev path.\n',
  );
}

// On Windows we have to reach `npx` through the OS shell — `npx` is `npx.cmd`,
// Node 24 refuses to spawn `.cmd`/`.bat` files directly (CVE-2024-27980), and
// bare `npx` without `.cmd` gets ENOENT. We can't use `shell: true` with the
// args array because the shell then re-parses argv and splits the entry path
// on its space (`C:\Users\Jonas Ahnstedt\...`) — same class of bug commit
// fd90051a fixed for `npm run build`. Passing the full command as a single
// pre-quoted string and `shell: true` gives the OS shell the responsibility of
// argv parsing and stays out of Node's DEP0190 path.
const child = process.platform === 'win32'
  ? spawn(`npx tsx "${entry}"`, { stdio: 'inherit', env, cwd: repoRoot, shell: true })
  : spawn('npx', ['tsx', entry], { stdio: 'inherit', env, cwd: repoRoot });
child.on('exit', (code) => process.exit(code ?? 0));

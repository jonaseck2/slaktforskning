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
  // Fallback to the Tauri spike's hardcoded default so we at least line up
  // when the app isn't running for the very first launch.
  const fallback = path.join(
    process.env.HOME || '',
    'Library/Application Support/com.slaktforskning.tauri-spike/family.db',
  );
  if (fs.existsSync(path.dirname(fallback))) {
    env.SLAKTFORSKNING_DB = fallback;
    process.stderr.write(`[mcp-tauri] app not reachable, fallback DB: ${fallback}\n`);
  } else {
    process.stderr.write(`[mcp-tauri] app not reachable and no fallback found; MCP will use its own default.\n`);
  }
}

const child = spawn('npx', ['tsx', entry], {
  stdio: 'inherit',
  env,
  cwd: repoRoot,
});
child.on('exit', (code) => process.exit(code ?? 0));

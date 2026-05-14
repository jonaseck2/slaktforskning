#!/usr/bin/env node
// Bundle the MCP server with esbuild as a single ESM file, then mirror the
// gazetteer data alongside it. The output is consumed by a shipped Bun
// runtime spawned from Rust (see src-tauri/src/mcp.rs); there is no per-
// triple binary build — Bun reads the same .mjs on every platform.
//
// Output layout:
//   dist-mcp/
//     server.bundle.mjs              the bundled MCP server
//     data/<gazetteer>.json          mirrored from src/api/place-gazetteers/data/
//
// The MCP server eagerly loads bundled gazetteers from `<bundleDir>/data/*.json`
// at module init (see src/api/place-gazetteers/loader.ts). Mirroring the
// data dir keeps the dist-mcp folder self-contained.
//
// Externals:
//   - fsevents: macOS-only native dep pulled in transitively; safe to leave
//     external since Bun's runtime doesn't use it for the MCP server.
//   - node-sqlite3-wasm: ships a .wasm sibling that esbuild can't inline.
//     The Rust side configures NODE_PATH so the package resolves from
//     node_modules/.

import { spawn } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist-mcp');
mkdirSync(distDir, { recursive: true });

const args = [
  'esbuild',
  'src/mcp/server.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${join(distDir, 'server.bundle.mjs')}`,
  '--external:fsevents',
  '--external:node-sqlite3-wasm',
];

const p = spawn('npx', args, { cwd: repoRoot, stdio: 'inherit' });
p.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  // Post-bundle: copy gazetteer JSONs into dist-mcp/data/.
  cpSync(join(repoRoot, 'src/api/place-gazetteers/data'), join(distDir, 'data'), { recursive: true });
  console.log(`[build-mcp-sidecar] gazetteer data mirrored to ${join(distDir, 'data')}`);
});

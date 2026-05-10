#!/usr/bin/env node
// Build the MCP server as a self-contained Node binary per platform.
//
// Output naming follows Tauri's externalBin convention so the bundler
// picks up the right binary per host triple:
//   - mcp-server-aarch64-apple-darwin
//   - mcp-server-x86_64-apple-darwin
//   - mcp-server-x86_64-pc-windows-msvc.exe
//   - mcp-server-x86_64-unknown-linux-gnu
//
// Pipeline:
//   1. Bundle src/mcp/server.ts → dist-mcp/server.cjs (esbuild, single CJS file)
//   2. Run @yao-pkg/pkg over the bundle for each target triple
//   3. Rename output to Tauri's expected per-triple suffix
//
// Tauri's tauri.conf.json bundle.externalBin = ["../target/mcp-server"]
// expects the binaries at <repo>/target/mcp-server-<triple>(.exe).
//
// Run via `npm run build:mcp-sidecar`. Skipped automatically by tauri:dev
// (which uses npx tsx via scripts/mcp-tauri.mjs); only invoked by the
// release workflow before `tauri build`.
//
// To build only a single target locally for smoke-testing, set
// SIDECAR_TARGETS to a comma-separated subset of the four targets below.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist-mcp');
const targetDir = path.join(repoRoot, 'target');
const bundlePath = path.join(distDir, 'server.cjs');

// (pkg target triple, output suffix matching Tauri externalBin convention,
// optional .exe suffix for Windows targets).
const ALL_TARGETS = [
  { pkg: 'node20-macos-arm64', suffix: 'aarch64-apple-darwin', ext: '' },
  { pkg: 'node20-macos-x64', suffix: 'x86_64-apple-darwin', ext: '' },
  { pkg: 'node20-win-x64', suffix: 'x86_64-pc-windows-msvc', ext: '.exe' },
  { pkg: 'node20-linux-x64', suffix: 'x86_64-unknown-linux-gnu', ext: '' },
];

const targetFilter = process.env.SIDECAR_TARGETS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
const targets = targetFilter.length
  ? ALL_TARGETS.filter((t) => targetFilter.includes(t.pkg) || targetFilter.includes(t.suffix))
  : ALL_TARGETS;

if (!targets.length) {
  console.error(`[build-mcp-sidecar] no targets matched filter: ${targetFilter.join(',')}`);
  console.error(`[build-mcp-sidecar] available: ${ALL_TARGETS.map((t) => t.pkg).join(', ')}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} → exit ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  // 1. Bundle to a single CJS file. esbuild is already a transitive dep of
  //    Vite, so no new top-level dependency required for this step.
  if (existsSync(distDir)) rmSync(distDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });

  console.log('[build-mcp-sidecar] bundling src/mcp/server.ts → dist-mcp/server.cjs');
  await run('npx', [
    'esbuild',
    'src/mcp/server.ts',
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${path.relative(repoRoot, bundlePath)}`,
    '--external:node-sqlite3-wasm',
    // node-sqlite3-wasm ships its WASM blob as a sibling file at runtime;
    // pkg can't carry it inside the binary, so we keep it external. The
    // sidecar Rust spawn must set NODE_PATH to a folder where the wasm
    // package is reachable (handled in src-tauri/src/mcp.rs).
  ], { cwd: repoRoot });

  // 2. Run pkg per target.
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  for (const t of targets) {
    const rawOut = path.join(targetDir, `mcp-server-${t.pkg}${t.ext}`);
    const finalOut = path.join(targetDir, `mcp-server-${t.suffix}${t.ext}`);
    console.log(`[build-mcp-sidecar] pkg → ${path.relative(repoRoot, finalOut)}`);
    await run('npx', [
      'pkg',
      bundlePath,
      '--targets', t.pkg,
      '--output', rawOut,
      '--public', // suppress code-protection warnings; this is OSS
    ], { cwd: repoRoot });
    if (rawOut !== finalOut) {
      if (existsSync(finalOut)) rmSync(finalOut);
      renameSync(rawOut, finalOut);
    }
  }

  console.log(`[build-mcp-sidecar] built ${targets.length} target(s) into ${path.relative(repoRoot, targetDir)}/`);
}

main().catch((e) => {
  console.error('[build-mcp-sidecar] FAILED:', e);
  process.exit(1);
});

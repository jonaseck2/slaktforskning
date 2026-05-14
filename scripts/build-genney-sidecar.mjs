#!/usr/bin/env node
// Bundle the Genney sidecar with esbuild as a single ESM file. The output is
// consumed by a shipped Bun runtime spawned from Rust (see
// src-tauri/src/lib.rs `genney_import`); there is no per-triple binary
// build — Bun reads the same .mjs on every platform.
//
// Output layout:
//   dist-genney/
//     genney-import.bundle.mjs     the bundled Genney importer + entry
//     DerbyExtractor.java           the JVM class compiled at runtime by the
//                                   importer's Docker shellouts; mirrored from
//                                   src/import/genney/ so the bundled importer
//                                   can find it via the existing
//                                   findExtractorJava() candidate path
//                                   `__dirname / 'DerbyExtractor.java'`.
//
// Externals (same shape as the MCP sidecar):
//   - fsevents: macOS-only native dep pulled in transitively; safe to leave
//     external since Bun's runtime doesn't use it for one-shot scripts.
//   - node-sqlite3-wasm: ships a .wasm sibling that esbuild can't inline.
//     The Rust spawn sets NODE_PATH so the package resolves from
//     node_modules/ in dev; in packaged builds the sibling .wasm is shipped
//     as a resource (see tauri.conf.json::bundle.resources additions).

import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist-genney');
mkdirSync(distDir, { recursive: true });

const args = [
  'esbuild',
  'src/import/genney/sidecar-entry.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${join(distDir, 'genney-import.bundle.mjs')}`,
  '--external:fsevents',
  '--external:node-sqlite3-wasm',
];

const p = spawn('npx', args, { cwd: repoRoot, stdio: 'inherit' });
p.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  // Post-bundle: copy DerbyExtractor.java next to the bundle so the
  // importer's findExtractorJava() can find it via the
  // `path.join(__dirname, 'DerbyExtractor.java')` candidate.
  copyFileSync(
    join(repoRoot, 'src/import/genney/DerbyExtractor.java'),
    join(distDir, 'DerbyExtractor.java'),
  );
  console.log(`[build-genney-sidecar] DerbyExtractor.java mirrored to ${join(distDir, 'DerbyExtractor.java')}`);
});

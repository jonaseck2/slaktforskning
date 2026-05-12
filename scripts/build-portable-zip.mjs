#!/usr/bin/env node
// Build a portable zip distribution.
//
// Pipeline:
//   1. Run `npm run build` (= `tauri build --no-bundle`) — produces the
//      raw exe in target/release/ plus the MCP sidecar in target/.
//   2. Gather the per-platform artefacts (exe + sidecar + license + README).
//   3. Zip everything into target/portable/slaktforskning-portable-vX.Y.Z-<platform>-<arch>.zip.
//
// The user unzips, double-clicks the exe, runs the app. No installer, no
// registry entries, no admin rights. The README explains the one runtime
// prerequisite (WebView2 on Windows — pre-installed on Win11 and most
// Win10s; free download from Microsoft otherwise).
//
// Run via `npm run build:portable`.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
// MCP sidecar lives in <repo>/target/ (built by scripts/build-mcp-sidecar.mjs).
// The cargo-produced binary lives in <repo>/src-tauri/target/release/ (Cargo's
// per-crate default unless CARGO_TARGET_DIR is set).
const sidecarTargetDir = path.join(repoRoot, 'target');
const releaseDir = path.join(repoRoot, 'src-tauri', 'target', 'release');
const outDir = path.join(sidecarTargetDir, 'portable');

const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;

function platformTriple() {
  const a = process.arch === 'arm64' ? 'arm64' : 'x64';
  if (process.platform === 'win32') return { os: 'windows', arch: a, exeExt: '.exe', sidecarSuffix: a === 'x64' ? 'x86_64-pc-windows-msvc.exe' : 'aarch64-pc-windows-msvc.exe' };
  if (process.platform === 'darwin') return { os: 'macos', arch: a, exeExt: '', sidecarSuffix: a === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin' };
  if (process.platform === 'linux') return { os: 'linux', arch: a, exeExt: '', sidecarSuffix: 'x86_64-unknown-linux-gnu' };
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === 'win32';
    const finalArgs = useShell
      ? args.map((a) => (/\s/.test(a) && !/^".*"$/.test(a) ? `"${a}"` : a))
      : args;
    const child = spawn(cmd, finalArgs, { stdio: 'inherit', shell: useShell, cwd: repoRoot, ...opts });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} → exit ${code}`));
    });
    child.on('error', reject);
  });
}

function readmeText(p) {
  const lines = [
    `Släktforskning — Portable Distribution v${version}`,
    '',
    'A genealogy desktop application. All data stays local on your machine.',
    '',
    '─────────────────────────────────────────────────────────────────',
    'HOW TO RUN',
    '─────────────────────────────────────────────────────────────────',
    '',
    'Unzip everything to a folder of your choice (USB stick is fine).',
    `Then double-click slaktforskning-${version}${p.exeExt}.`,
    '',
    'Your family database is stored as family.db right next to the exe,',
    'so the whole folder is portable — copy it elsewhere and pick up',
    'where you left off. If no family.db exists next to the exe yet, the',
    'app falls back to your per-user data folder.',
    '',
  ];
  if (p.os === 'windows') {
    lines.push(
      '─────────────────────────────────────────────────────────────────',
      'REQUIREMENTS (Windows)',
      '─────────────────────────────────────────────────────────────────',
      '',
      'Microsoft Edge WebView2 Runtime must be installed.',
      '',
      '  • Windows 11 — already installed.',
      '  • Windows 10 — almost always already installed (shipped via Edge',
      '    auto-update). If the app refuses to start, install the free',
      '    Evergreen Runtime from:',
      '',
      '      https://developer.microsoft.com/microsoft-edge/webview2/',
      '',
      'No other dependencies. No admin rights needed to run.',
      '',
    );
  }
  lines.push(
    '─────────────────────────────────────────────────────────────────',
    'FILES IN THIS DISTRIBUTION',
    '─────────────────────────────────────────────────────────────────',
    '',
    `  slaktforskning-${version}${p.exeExt}  — main application`,
    `  mcp-server-<triple>${p.exeExt ? p.exeExt : ''}  — built-in MCP server (used by AI agents)`,
    '  THIRD_PARTY_LICENSES.txt     — open-source license attributions',
    '  README.txt                   — this file',
    '',
    'Project: https://github.com/jonaseck2/slaktforskning',
    'License: MIT',
    '',
  );
  return lines.join('\n');
}

async function main() {
  console.log(`[build-portable-zip] building Släktforskning v${version}`);
  await run('npm', ['run', 'build']);

  const p = platformTriple();
  const exeName = `slaktforskning-${version}${p.exeExt}`;
  const exePath = path.join(releaseDir, exeName);
  const sidecarName = `mcp-server-${p.sidecarSuffix}`;
  const sidecarPath = path.join(sidecarTargetDir, sidecarName);
  const licensePath = path.join(repoRoot, 'THIRD_PARTY_LICENSES.txt');

  for (const required of [exePath, sidecarPath, licensePath]) {
    if (!existsSync(required)) {
      console.error(`[build-portable-zip] missing required file: ${required}`);
      process.exit(1);
    }
  }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const zipName = `slaktforskning-portable-v${version}-${p.os}-${p.arch}.zip`;
  const zipPath = path.join(outDir, zipName);
  if (existsSync(zipPath)) rmSync(zipPath);

  const files = {
    [exeName]: readFileSync(exePath),
    [sidecarName]: readFileSync(sidecarPath),
    'THIRD_PARTY_LICENSES.txt': readFileSync(licensePath),
    'README.txt': Buffer.from(readmeText(p), 'utf8'),
  };

  console.log(`[build-portable-zip] zipping ${Object.keys(files).length} files → ${path.relative(repoRoot, zipPath)}`);
  const zipped = zipSync(files, { level: 6 });
  writeFileSync(zipPath, zipped);

  const sizeMb = (statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(`[build-portable-zip] done — ${zipName} (${sizeMb} MB)`);
}

main().catch((e) => {
  console.error('[build-portable-zip] FAILED:', e.message ?? e);
  process.exit(1);
});

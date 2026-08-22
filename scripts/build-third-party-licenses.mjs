#!/usr/bin/env node
/**
 * Concatenates the LICENSE files of every npm production dependency, plus the
 * Tauri Rust crates linked into the native binary, into a single
 * THIRD_PARTY_LICENSES.txt at repo root.
 *
 * npm side: walks `npm ls --omit=dev --all` and reads each package's LICENSE /
 * COPYING / NOTICE file. Throws on any prod dependency that doesn't have a
 * recognizable license file — we don't silently skip (per the
 * no-silent-string-replace rule). If a package legitimately has its license
 * text in README only, add it to KNOWN_LICENSE_HINTS.
 *
 * Build-only tooling that leaks into the production tree via an OPTIONAL peer
 * dependency (e.g. vue-router 5.1+ declares `vite` as an optional peer for its
 * typed-routing plugin) is pruned via BUILD_ONLY_SUBTREES. vite / esbuild /
 * rollup and their platform-specific binary packages are the build toolchain —
 * they are never bundled into the shipped desktop app, so they don't belong in
 * a "licenses for code bundled into the app" file. This prune is EXPLICIT and
 * logged (not a silent skip): esbuild/rollup platform packages also ship no
 * LICENSE file, so without it the script would hard-fail on `@esbuild/<plat>`.
 *
 * Rust side: walks the Cargo.lock for the Tauri Rust shell (`src-tauri/`) via
 * `cargo license --json --avoid-dev-deps` and merges those crates into the
 * output as a separate section. If `cargo license` is not installed (or
 * `cargo` itself is missing — npm-only contributors won't have a Rust
 * toolchain), the script warns and emits npm-only output rather than failing.
 *
 * If `node_modules` itself is not populated (subagent worktree without `npm
 * install`, fresh clone, etc.), the script emits a self-explanatory placeholder
 * file and exits 0 rather than failing — CI always runs `npm ci` first so
 * release builds still produce the real list.
 *
 * App name in the header: "Släktforskning" (the public product name; matches
 * the `productName` in package.json and src-tauri/tauri.conf.json). "Släktforskning"
 * is Swedish for "genealogy" — the npm package keeps the ASCII-folded form
 * "slaktforskning" as its internal identifier.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'THIRD_PARTY_LICENSES.txt');
const TAURI_DIR = join(ROOT, 'src-tauri');
const NODE_MODULES = join(ROOT, 'node_modules');
const LICENSE_FILE_PATTERNS = /^(LICEN[SC]E|COPYING|NOTICE)(?:[-.].+)?$/i;

const PLACEHOLDER_CONTENT = `# Third-Party Licenses — placeholder

\`node_modules\` was not populated when scripts/build-third-party-licenses.mjs
ran, so the real license list could not be generated.

To materialise the real file:

    npm install
    npm run build:third-party-licenses

CI always runs \`npm ci\` before the bundle build, so shipped releases produce
the real \`THIRD_PARTY_LICENSES.txt\` (this placeholder is only ever written in
fresh clones or subagent worktrees that haven't installed dependencies).
`;

// Packages whose license text lives in a non-standard file rather than a
// separate LICENSE / COPYING file. Add entries as `['<pkg-name>', '<filename>']`
// when the script throws on a real case — never add speculatively.
// (e.g., some very old packages embed license text only in README.md)
const KNOWN_LICENSE_HINTS = new Map([
  // kkrpc ships no LICENSE file in its npm tarball; license text lives in README.md (MIT).
  ['kkrpc', 'README.md'],
]);

// Package names whose entire subtree is build-time tooling, pruned from the
// production license walk. These reach `npm ls --omit=dev --all` only as an
// OPTIONAL peer dependency of a real prod dep. Two such entry points exist:
// vue-router 5.1+ lists `vite` as an optional peer for its typed-routing
// plugin, and vue-router 5.2+ depends on `unplugin`, which declares every
// bundler it can host (`esbuild`, `rollup`, `vite`, `webpack`, …) as an
// optional peer. Both paths drag the bundlers and their platform binaries into
// the tree. None of it is bundled into the shipped app, and the platform-binary
// packages (`@esbuild/<plat>`, `@rollup/rollup-<plat>`) ship no LICENSE file at
// all. Each bundler is listed here by name so a new optional-peer path cannot
// route around the prune — `vite` alone stopped being sufficient when
// `unplugin` arrived. We prune the subtree explicitly and log each prune (per
// the no-silent-skip rule) rather than fabricating license resolution for
// tooling that never ships. `unplugin` itself is a real (non-optional)
// dependency of vue-router, so it stays in the license list.
const BUILD_ONLY_SUBTREES = new Set([
  'vite',
  'esbuild',
  'rollup',
  'rolldown',
  'webpack',
  'unloader',
  '@farmfe/core',
  '@rspack/core',
]);

/**
 * Run `npm ls <args> --json` and return the parsed JSON tree.
 * Forwards any stderr to our process's stderr so warnings (peer-dep advisories,
 * extraneous-package notices, lifecycle complaints) are never silently swallowed.
 * Throws with combined stderr on non-zero exit.
 */
function npmLs(args) {
  // shell: true so the Windows shim (npm.cmd) resolves; harmless on POSIX.
  // Spawning `npm.cmd` directly would EINVAL under Node ≥18.20 (CVE-2024-27980
  // tightening). All args here are static literals, so the DEP0190 escaping
  // concern doesn't apply.
  const r = spawnSync('npm', ['ls', ...args, '--json'], { cwd: ROOT, encoding: 'utf8', shell: true });
  if (r.stderr && r.stderr.trim()) {
    process.stderr.write(r.stderr);
  }
  if (r.status !== 0) {
    throw new Error(`npm ls ${args.join(' ')} exited ${r.status}\n${r.stderr ?? ''}`);
  }
  return JSON.parse(r.stdout);
}

/**
 * Walk the dep tree once, collecting production deps. Output is a flat map
 * keyed by `<name>@<version>` for stable ordering. Rust crate licenses
 * (Tauri runtime) are emitted separately by the Tauri bundler at build
 * time; this script enumerates only the npm side that ships into
 * dist-tauri/ via the Vite renderer build.
 */
function collectDependencies() {
  const out = new Map();
  const prodTree = npmLs(['--omit=dev', '--all']);
  walk(prodTree, out, ROOT);
  return out;
}

/**
 * @param {object} node - A node from `npm ls --json` output
 * @param {Map} out - Accumulator keyed by `<name>@<version>`
 * @param {string} parentPath - Filesystem path of the parent package (for
 *   resolving nested deps that `npm ls` emits without a `path` field)
 */
function walk(node, out, parentPath) {
  const deps = node.dependencies ?? {};
  for (const [name, info] of Object.entries(deps)) {
    if (!info?.version || info.extraneous) continue;
    if (BUILD_ONLY_SUBTREES.has(name)) {
      // Build tooling reached only via an optional peer dep; not bundled into
      // the app. Skip it and everything under it. Logged, not silent.
      console.warn(
        `[third-party-licenses] pruning build-only subtree '${name}@${info.version}' ` +
        `(optional peer of a prod dep — build toolchain, not bundled into the app).`,
      );
      continue;
    }
    const key = `${name}@${info.version}`;
    const pkgPath = info.path ?? findPath(name, parentPath);
    if (!out.has(key)) {
      out.set(key, { name, version: info.version, path: pkgPath });
    }
    walk(info, out, pkgPath);
  }
}

/**
 * Resolve a package directory when `npm ls` didn't supply a `path` field.
 * Tries in order:
 *   1. Flat hoisted position: <ROOT>/node_modules/<name>
 *   2. Nested under parent:   <parentPath>/node_modules/<name>
 * Throws if neither exists — surfaces the problem rather than silently dropping.
 */
function findPath(name, parentPath) {
  const flat = join(ROOT, 'node_modules', ...name.split('/'));
  if (existsSync(flat)) return flat;
  const nested = join(parentPath, 'node_modules', ...name.split('/'));
  if (existsSync(nested)) return nested;
  throw new Error(
    `Cannot locate package directory for ${name} ` +
    `(tried ${flat} and ${nested})`
  );
}

function readPackageMeta(pkgPath) {
  const pkg = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8'));
  return {
    license: pkg.license ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map(l => l.type ?? l).join(' OR ') : 'UNKNOWN'),
    repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '',
    author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? '',
  };
}

function readLicenseFile(pkgPath, name) {
  const hint = KNOWN_LICENSE_HINTS.get(name);
  if (hint) {
    const p = join(pkgPath, hint);
    if (!existsSync(p)) throw new Error(`KNOWN_LICENSE_HINTS points to missing file for ${name}: ${p}`);
    return readFileSync(p, 'utf8');
  }
  const entries = readdirSync(pkgPath);
  const candidate = entries.find(e => LICENSE_FILE_PATTERNS.test(e));
  if (!candidate) {
    throw new Error(
      `No LICENSE/COPYING/NOTICE file found for ${name} in ${pkgPath}. ` +
      `If the license text is in README, add ['${name}', '<filename>'] to KNOWN_LICENSE_HINTS.`
    );
  }
  return readFileSync(join(pkgPath, candidate), 'utf8');
}

/**
 * Run `cargo license --json --avoid-dev-deps` against `src-tauri/` and return
 * the parsed crate list. Returns null (with a warning) if cargo isn't on PATH
 * or `cargo license` isn't installed — npm-only contributors shouldn't be
 * required to install a Rust toolchain to regenerate this file. Also returns
 * null if the Tauri dir doesn't exist.
 *
 * Each returned crate has the shape:
 *   { name, version, authors, repository, license, license_file, description }
 */
function collectCargoCrates() {
  if (!existsSync(TAURI_DIR)) {
    console.warn(`[third-party-licenses] ${TAURI_DIR} not found; skipping Cargo crates.`);
    return null;
  }
  // Probe `cargo --version` first so we can distinguish "no Rust toolchain"
  // from "cargo-license not installed" in the warning.
  const cargoCheck = spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: true });
  if (cargoCheck.status !== 0) {
    console.warn('[third-party-licenses] `cargo` not on PATH; skipping Cargo crates. Install Rust to include them.');
    return null;
  }
  const r = spawnSync('cargo', ['license', '--json', '--avoid-dev-deps'], {
    cwd: TAURI_DIR,
    encoding: 'utf8',
    shell: true,
    // cargo-license can produce a lot of stdout; don't truncate.
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    if ((r.stderr ?? '').includes('no such command') || (r.stderr ?? '').includes('not found')) {
      console.warn('[third-party-licenses] `cargo-license` not installed; skipping Cargo crates.');
      console.warn('[third-party-licenses] Install with: cargo install cargo-license');
    } else {
      console.warn(`[third-party-licenses] cargo license failed (status ${r.status}); skipping Cargo crates.`);
      if (r.stderr) process.stderr.write(r.stderr);
    }
    return null;
  }
  try {
    const crates = JSON.parse(r.stdout);
    if (!Array.isArray(crates)) {
      console.warn('[third-party-licenses] cargo license JSON was not an array; skipping.');
      return null;
    }
    return crates;
  } catch (e) {
    console.warn(`[third-party-licenses] failed to parse cargo license JSON: ${e.message}`);
    return null;
  }
}

/**
 * Best-effort license text for a Rust crate. cargo-license doesn't ship the
 * license body; we rely on whatever it says in the SPDX `license` field.
 * If a crate has bundled the text in a `license_file` we surface that path
 * (cargo-license points at it but doesn't read it for us); the body itself
 * lives in the registry sources cache outside our build, so we cite the SPDX
 * identifier as the canonical statement and let the user expand via the
 * standard SPDX text + crate repository link. This keeps the file standalone
 * — no network fetch, no opaque cache lookup.
 */
function formatCargoCrate(crate) {
  const name = crate.name ?? '<unknown>';
  const version = crate.version ?? '0.0.0';
  const license = crate.license ?? crate.license_file ?? 'UNKNOWN';
  const repository = crate.repository ?? '';
  const authors = (crate.authors ?? '').toString();
  const description = (crate.description ?? '').toString().trim();

  const out = [];
  out.push(`## ${name}@${version}  (Rust crate)`);
  out.push('');
  out.push(`- License: ${license}`);
  if (repository) out.push(`- Repository: ${repository}`);
  if (authors) out.push(`- Authors: ${authors}`);
  if (description) out.push(`- Description: ${description}`);
  out.push('');
  out.push('```');
  out.push(`${name} v${version} is distributed under ${license}.`);
  out.push('See the SPDX identifier above for the full license text and the');
  out.push('crate repository for any project-specific NOTICE files.');
  out.push('```');
  out.push('');
  return out;
}

function main() {
  // Detect "fresh clone / subagent worktree without `npm install`" up front.
  // `npm ls --omit=dev --all` exits 1 with ELSPROBLEMS when production deps
  // aren't installed, which used to cascade into noisy false failures for
  // every subagent dispatch. We mirror the existing "cargo license missing"
  // pattern: detect, warn, emit a self-explanatory placeholder, exit 0.
  // CI always runs `npm ci` first, so shipped releases produce the real file.
  if (!existsSync(NODE_MODULES) || readdirSync(NODE_MODULES).length === 0) {
    console.warn(
      `[build-third-party-licenses] node_modules not populated at ${NODE_MODULES}; ` +
      `skipping (run \`npm install\` first to materialise the real list).`,
    );
    writeFileSync(OUTPUT, PLACEHOLDER_CONTENT, 'utf8');
    console.log(`Wrote placeholder ${OUTPUT}.`);
    return;
  }

  const deps = collectDependencies();
  const sortedNpm = [...deps.entries()].sort(([a], [b]) => a.localeCompare(b));
  const ourPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  const cargoCrates = collectCargoCrates();
  const sortedCargo = cargoCrates
    ? [...cargoCrates].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))
    : [];

  // Use the public-facing product name "Släktforskning" in the header
  // (Swedish for "genealogy"). The npm package keeps the ASCII-folded form
  // "slaktforskning" as its internal identifier.
  const productName = 'Släktforskning';

  const totalCount = sortedNpm.length + sortedCargo.length;
  const lines = [];
  lines.push(`# Third-Party Licenses for ${productName} ${ourPkg.version}`);
  lines.push('');
  lines.push(`This file lists every third-party package whose code is bundled into the ${productName} desktop application,`);
  lines.push(`together with its license text. ${productName} itself is licensed under MIT (see LICENSE).`);
  lines.push('');
  lines.push(`The native system WebView (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux) is provided`);
  lines.push(`by the operating system and is not bundled; consult the OS vendor for its license terms.`);
  lines.push('');
  lines.push(`Generated by scripts/build-third-party-licenses.mjs from ${totalCount} packages`);
  lines.push(`(${sortedNpm.length} npm + ${sortedCargo.length} Rust crates${cargoCrates ? '' : ' — Rust crates skipped, see warnings'}).`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## npm packages');
  lines.push('');

  for (const [key, info] of sortedNpm) {
    const meta = readPackageMeta(info.path);
    const licenseText = readLicenseFile(info.path, info.name);
    lines.push(`## ${key}`);
    lines.push('');
    lines.push(`- License: ${meta.license}`);
    if (meta.repository) lines.push(`- Repository: ${meta.repository}`);
    if (meta.author) lines.push(`- Author: ${meta.author}`);
    lines.push('');
    lines.push('```');
    lines.push(licenseText.trim());
    lines.push('```');
    lines.push('');
  }

  // Section divider between npm + Rust portions, per the cluster L spec.
  if (sortedCargo.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Rust crates (Tauri shell)');
    lines.push('');
    lines.push('The following Rust crates are linked into the Tauri-built native binary');
    lines.push('(`src-tauri/`). cargo-license reports the SPDX license identifier for each;');
    lines.push('the canonical license text for each SPDX id is available at https://spdx.org/licenses/.');
    lines.push('');
    for (const crate of sortedCargo) {
      for (const ln of formatCargoCrate(crate)) lines.push(ln);
    }
  }

  writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUTPUT} (${sortedNpm.length} npm + ${sortedCargo.length} Rust = ${totalCount} packages, ${lines.join('\n').length} bytes)`);
}

main();

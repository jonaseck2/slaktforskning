#!/usr/bin/env node
/**
 * Walks production + Electron runtime deps and concatenates their LICENSE files
 * into a single THIRD_PARTY_LICENSES.txt at repo root.
 *
 * Throws on any prod dependency that doesn't have a recognizable LICENSE file —
 * we don't silently skip (per the no-silent-string-replace rule). If a package
 * legitimately has its license text in README only, add it to KNOWN_LICENSE_HINTS.
 *
 * App name in the header: "OurLegacy" (the public product name; the package is
 * named "slaktforskning" internally).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'THIRD_PARTY_LICENSES.txt');
const LICENSE_FILE_PATTERNS = /^(LICEN[SC]E|COPYING|NOTICE)(?:[-.].+)?$/i;

// Packages whose license text lives in a non-standard file rather than a
// separate LICENSE / COPYING file. Add entries as `['<pkg-name>', '<filename>']`
// when the script throws on a real case — never add speculatively.
// (e.g., some very old packages embed license text only in README.md)
const KNOWN_LICENSE_HINTS = new Map([
  // No entries yet. Add as needed when the script throws.
]);

/**
 * Walk the dep tree once, collecting the union of: production deps + Electron
 * (which is a devDep but ships in the binary). Output is a flat map keyed by
 * `<name>@<version>` for stable ordering.
 */
function collectDependencies() {
  const out = new Map();

  const prodRaw = execFileSync(
    'npm', ['ls', '--omit=dev', '--all', '--json'],
    { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
  ).toString();
  const prodTree = JSON.parse(prodRaw);
  walk(prodTree, out, ROOT);

  // Electron + electron-* runtime packages: dev deps that physically ship in
  // the binary's resources folder. Pull them via a targeted query.
  const electronRaw = execFileSync(
    'npm', ['ls', 'electron', '--all', '--json'],
    { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
  ).toString();
  const electronTree = JSON.parse(electronRaw);
  walk(electronTree, out, ROOT);

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

function main() {
  const deps = collectDependencies();
  const sorted = [...deps.entries()].sort(([a], [b]) => a.localeCompare(b));
  const ourPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  // Use the public-facing product name "OurLegacy" in the header; the npm
  // package is named "slaktforskning" internally but the app ships as OurLegacy.
  const productName = 'OurLegacy';

  const lines = [];
  lines.push(`# Third-Party Licenses for ${productName} ${ourPkg.version}`);
  lines.push('');
  lines.push(`This file lists every third-party package whose code is bundled into the ${productName} desktop application,`);
  lines.push(`together with its license text. ${productName} itself is licensed under MIT (see LICENSE).`);
  lines.push('');
  lines.push(`Electron and Chromium ship their own license bundle inside the application resources;`);
  lines.push(`see \`LICENSES.chromium.html\` next to the application binary for those.`);
  lines.push('');
  lines.push(`Generated by scripts/build-third-party-licenses.mjs from ${sorted.length} packages.`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [key, info] of sorted) {
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

  writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUTPUT} (${sorted.length} packages, ${lines.join('\n').length} bytes)`);
}

main();

#!/usr/bin/env node
// Rename the cargo-produced binary to include the version string.
//
// Cargo always writes the same filename per crate (`slaktforskning.exe` /
// `slaktforskning`). For releases — and just for general sanity when
// multiple builds accumulate in target/release/ — having the version baked
// into the filename means side-by-side builds don't overwrite each other
// and `slaktforskning-0.256.0.exe` is obvious at a glance.
//
// Runs as the second half of `npm run build` (after `tauri build --no-bundle`).

import { existsSync, readFileSync, renameSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(repoRoot, 'src-tauri', 'target', 'release');

const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const exeExt = process.platform === 'win32' ? '.exe' : '';

const src = path.join(releaseDir, `slaktforskning${exeExt}`);
const dest = path.join(releaseDir, `slaktforskning-${version}${exeExt}`);

if (!existsSync(src)) {
  // If only the versioned file exists (e.g. user re-ran without rebuilding),
  // that's fine — nothing to do.
  if (existsSync(dest)) {
    console.log(`[post-build-rename] already renamed: ${path.relative(repoRoot, dest)}`);
    process.exit(0);
  }
  console.error(`[post-build-rename] expected binary not found: ${path.relative(repoRoot, src)}`);
  console.error('[post-build-rename] did `tauri build --no-bundle` succeed?');
  process.exit(1);
}

renameSync(src, dest);
console.log(`Built application at: ${dest}`);

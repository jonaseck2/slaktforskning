import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Release-delivery invariant (see `oss-release` / `commit` skills).
 *
 * The app's user-facing version lives in TWO files that must agree:
 *   - package.json.version  — what `.github/workflows/release.yml` reads to
 *     decide whether to publish, and the tag it publishes (`vX.Y.Z`).
 *   - tauri.conf.json.version — what gets baked into the shipped bundle and
 *     what the in-app auto-updater reports as "the running version".
 *
 * If they diverge, the release ships tagged `vX.Y.Z` but the installed app
 * reports the OTHER number, so the updater compares stale-vs-latest and shows
 * a phantom "update available" on an already-current install (and may loop).
 * This is exactly what happened across 0.268.0/0.269.0/0.269.1 when only
 * package.json was bumped.
 *
 * Cargo.toml / Cargo.lock are intentionally NOT checked here: the Rust crate
 * version is internal metadata, does not gate releases, is not the delivered
 * app version, and bumping it forces a local Rust recompile + app restart — so
 * it is stepped only when `src-tauri/` actually changes and may legitimately
 * lag the app version.
 */
function readJson(relPath: string): { version: string } {
  const abs = fileURLToPath(new URL(`../../${relPath}`, import.meta.url));
  return JSON.parse(readFileSync(abs, 'utf8'));
}

describe('release version consistency', () => {
  it('tauri.conf.json (delivered/updater version) matches package.json (release tag)', () => {
    const pkg = readJson('package.json');
    const tauri = readJson('src-tauri/tauri.conf.json');
    expect(tauri.version).toBe(pkg.version);
  });
});

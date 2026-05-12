// Regression test for the npm scripts declared in `package.json`.
//
// The Tauri full-port close-out (2026-05-12) archived with `npm start =
// electron-forge start` broken — the script pointed at deleted source.
// The Electron-retire commit fixed it, but the broken state had to be
// surfaced by the user trying to run `npm start` in real use. This test
// catches that class of regression: every script that's safe to invoke
// in a CI sandbox is exercised here, and a missing dep / removed entry
// point / wrong path fails the build before anyone runs it by hand.
//
// What this file does NOT exercise:
// - `start` / `dev` (spawn `tauri dev` — long-lived dev server, not CI-safe).
// - `build` (full Tauri release bundle — runs in a dedicated CI job; this
//   suite would otherwise take 2+ minutes).
// - `build:e2e` (same as `build`).
// - `tauri` (passthrough; invocation needs a subcommand).
// - `test` / `test:watch` (running vitest from vitest = recursion + slow).
// - `test:e2e` / `prebuild:e2e` / `pretest:e2e` (Playwright + Tauri build).
//
// The remaining ones are short, deterministic, and ship-blocking when
// broken: `lint`, `build:static`, `build:third-party-licenses`,
// `build:mcp-sidecar`. Each runs via `npm run --silent <name>` and is
// expected to exit 0.
//
// The point is the test, not coverage of every script. When a future
// script joins this list, add it explicitly + give it a brief reason
// why it's CI-safe.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

// Scripts we DO exercise here. Each has a short reason; if any of these
// is broken in a way that would be invisible until a developer runs it
// by hand, we want CI to surface it loudly.
const CI_SAFE_SCRIPTS = [
  'lint',
  'build:static',
  'build:third-party-licenses',
  'build:mcp-sidecar',
] as const;

// Scripts we INTENTIONALLY skip + the one-line reason.
const SKIPPED_WITH_REASON: Record<string, string> = {
  start: 'long-lived dev server (tauri dev) — not CI-safe',
  dev: 'alias for start',
  build: 'full Tauri release bundle — runs in dedicated CI job',
  'build:e2e': 'same as build',
  'pretest:e2e': 'chains build:e2e',
  'test:e2e': 'Playwright against packaged Tauri binary',
  test: 'running vitest from vitest = recursion + slow',
  'test:watch': 'long-lived watch mode',
  'dev:static': 'long-lived dev server (vite dev for the static SPA)',
  tauri: 'passthrough; invocation needs a subcommand',
  prebuild: 'auto-run hook for build',
  prestart: 'auto-run hook for start',
  prepackage: 'auto-run hook for package',
  premake: 'auto-run hook for make',
  prebuild_static: 'auto-run hook for build:static',
  'prebuild:e2e': 'auto-run hook for build:e2e',
  'pretauri:build:test': 'auto-run hook for tauri:build:test',
};

describe('npm scripts smoke', () => {
  it('every declared script is either CI-safe-exercised here or explicitly skipped with a reason', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const declared = Object.keys(pkg.scripts);
    const covered = new Set<string>([...CI_SAFE_SCRIPTS, ...Object.keys(SKIPPED_WITH_REASON)]);
    const uncategorized = declared.filter((s) => !covered.has(s));
    expect(uncategorized, `add each new script to CI_SAFE_SCRIPTS or SKIPPED_WITH_REASON with a one-line reason: ${uncategorized.join(', ')}`).toEqual([]);
  });

  // Each exercised script gets its own `it()` so vitest reports them
  // individually — a failure on `build:static` shouldn't mask
  // `build:third-party-licenses`.
  for (const script of CI_SAFE_SCRIPTS) {
    it(`\`npm run --silent ${script}\` exits 0`, () => {
      const result = spawnSync('npm', ['run', '--silent', script], {
        cwd: ROOT,
        encoding: 'utf8',
        // Inherit env so PATH / NODE_OPTIONS / CARGO_HOME etc. work.
        env: process.env,
      });
      if (result.status !== 0) {
        // Surface stderr in the failure so the next person reading the
        // failure message in CI knows what broke without having to dig.
        // eslint-disable-next-line no-console
        console.error(`stderr from \`npm run ${script}\`:\n${result.stderr}`);
      }
      expect(result.status, `npm run ${script} should exit 0`).toBe(0);
    }, /* timeout: */ 120_000);
  }
});

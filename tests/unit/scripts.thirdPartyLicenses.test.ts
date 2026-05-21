import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const OUTPUT = join(ROOT, 'THIRD_PARTY_LICENSES.txt');

describe('build-third-party-licenses script', async () => {
  // The license walker scans every node_modules entry; under contention with
  // ~40 other parallel test files it can exceed the default 10 s hook timeout
  // even though it finishes in ~3 s in isolation. Give it room.
  beforeAll(async () => {
    if (existsSync(OUTPUT)) rmSync(OUTPUT);
    execFileSync('node', ['scripts/build-third-party-licenses.mjs'], { cwd: ROOT, stdio: 'pipe' });
  }, 60_000);

  it('produces an output file', async () => {
    expect(existsSync(OUTPUT)).toBe(true);
  });

  it('starts with a project header naming the file purpose', async () => {
    const content = readFileSync(OUTPUT, 'utf8');
    expect(content.split('\n')[0]).toMatch(/^# Third-Party Licenses for Släktforskning/);
  });

  it('includes Vue (a known production dependency)', async () => {
    const content = readFileSync(OUTPUT, 'utf8');
    expect(content).toMatch(/^## vue@/m);
    expect(content).toMatch(/MIT/);
  });

  it('includes @modelcontextprotocol/sdk (a known production dependency that ships via the MCP sidecar)', async () => {
    const content = readFileSync(OUTPUT, 'utf8');
    expect(content).toMatch(/^## @modelcontextprotocol\/sdk@/m);
  });

  it('is byte-identical on a second run (deterministic ordering)', async () => {
    const first = readFileSync(OUTPUT, 'utf8');
    execFileSync('node', ['scripts/build-third-party-licenses.mjs'], { cwd: ROOT, stdio: 'pipe' });
    const second = readFileSync(OUTPUT, 'utf8');
    expect(second).toBe(first);
  });
});

// When the script runs in a fresh clone or a subagent worktree that hasn't run
// `npm install`, `npm ls --omit=dev --all` exits non-zero with ELSPROBLEMS.
// Before the fix, that cascaded into noisy false test failures in every
// subagent dispatch. The script now detects "node_modules not populated",
// emits a self-explanatory placeholder, and exits 0 — CI always runs `npm ci`
// first so shipped releases still produce the real list.
describe('build-third-party-licenses script — empty node_modules', () => {
  let sandbox: string;

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'build-third-party-licenses-empty-'));
    // Copy just the bits the script touches: scripts/, package.json. We
    // deliberately do NOT create a node_modules directory.
    mkdirSync(join(sandbox, 'scripts'), { recursive: true });
    cpSync(
      join(ROOT, 'scripts', 'build-third-party-licenses.mjs'),
      join(sandbox, 'scripts', 'build-third-party-licenses.mjs'),
    );
    // The script reads package.json for the version field after the
    // node_modules guard, so we still need a valid one for the happy path —
    // but the guard runs first and bails before that read.
    writeFileSync(join(sandbox, 'package.json'), JSON.stringify({ name: 'sandbox', version: '0.0.0' }));
  }, 30_000);

  it('exits 0 and writes a placeholder when node_modules is absent', () => {
    const result = spawnSync('node', ['scripts/build-third-party-licenses.mjs'], {
      cwd: sandbox,
      encoding: 'utf8',
    });
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stderr).toMatch(/node_modules not populated/);
    const out = join(sandbox, 'THIRD_PARTY_LICENSES.txt');
    expect(existsSync(out)).toBe(true);
    const content = readFileSync(out, 'utf8');
    // Placeholder must be self-explanatory (per the no-silent-string-replace
    // / be-explicit rules) — it must name the remediation.
    expect(content).toMatch(/placeholder/i);
    expect(content).toMatch(/npm install/);
    expect(content).toMatch(/npm run build:third-party-licenses/);
  });

  it('exits 0 and writes a placeholder when node_modules exists but is empty', () => {
    mkdirSync(join(sandbox, 'node_modules'), { recursive: true });
    const out = join(sandbox, 'THIRD_PARTY_LICENSES.txt');
    if (existsSync(out)) rmSync(out);
    const result = spawnSync('node', ['scripts/build-third-party-licenses.mjs'], {
      cwd: sandbox,
      encoding: 'utf8',
    });
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stderr).toMatch(/node_modules not populated/);
    expect(existsSync(out)).toBe(true);
  });
});

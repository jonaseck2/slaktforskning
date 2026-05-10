import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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
    expect(content.split('\n')[0]).toMatch(/^# Third-Party Licenses for OurLegacy/);
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

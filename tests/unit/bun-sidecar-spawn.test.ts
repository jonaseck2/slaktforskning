import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

// Task 0 of docs/plans/2026-05-14-kkrpc-sidecar.md: lock in the verified
// compatibility between Bun and @modelcontextprotocol/sdk before any further
// scope expansion. If this test fails, the kkrpc-sidecar plan is BLOCKED —
// stop and escalate; the fallback is Node SEA (see design doc Failure modes).
//
// Today (pre-Task-2) the probe target is dist-mcp-test/server.bundle.mjs,
// produced ad-hoc by Task 0's manual probe step. Once Task 2 rewrites
// build:mcp-sidecar to emit ESM at dist-mcp/server.bundle.mjs, the test
// switches to that canonical location automatically.
const BUNDLE_CANDIDATES = [
  join(repoRoot, 'dist-mcp/server.bundle.mjs'),
  join(repoRoot, 'dist-mcp-test/server.bundle.mjs'),
];

function findBundle(): string | null {
  for (const p of BUNDLE_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

function hasBun(): boolean {
  // Synchronous spawn (no shell) — project security-hook standard.
  const r = spawnSync('bun', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

describe('Bun-sidecar compatibility gate', () => {
  it('spawns the MCP server bundle under Bun and responds to initialize', async () => {
    if (!hasBun()) {
      // Bun isn't on PATH in this environment. The gate is moot for CI runs
      // that don't have Bun installed yet (added by Task 1's binary fetch).
      // We treat this as a skip rather than a fail to keep `npm test` green
      // on dev machines that haven't installed Bun yet.
      // eslint-disable-next-line no-console
      console.warn('[bun-sidecar-spawn] bun not on PATH; skipping');
      return;
    }

    const bundlePath = findBundle();
    expect(
      bundlePath,
      `Run \`npx esbuild src/mcp/server.ts --bundle --platform=node --format=esm --outfile=dist-mcp-test/server.bundle.mjs\` (or \`npm run build:mcp-sidecar\` once Task 2 is done) — none of ${BUNDLE_CANDIDATES.join(', ')} exist.`,
    ).not.toBeNull();

    // The bundle's getDefaultDbPath() does require('../../package.json'),
    // which resolves wrong from dist-mcp*/ — override with an explicit
    // tmp DB path (matches how the prod sidecar is spawned anyway).
    const tmpDir = mkdtempSync(join(tmpdir(), 'bun-sidecar-spawn-'));
    const dbPath = join(tmpDir, 'probe.db');

    // The MCP server eagerly loads bundled gazetteers from
    // `<bundleDir>/gazetteers/*.json.gz` or `<bundleDir>/data/*.json` at
    // module init. For the gate we symlink the source `data/` dir so the
    // load succeeds; Task 2's build script will arrange this for real.
    const bundleDir = dirname(bundlePath!);
    const dataLink = join(bundleDir, 'data');
    let dataLinkCreated = false;
    if (!existsSync(join(bundleDir, 'gazetteers')) && !existsSync(dataLink)) {
      symlinkSync(join(repoRoot, 'src/api/place-gazetteers/data'), dataLink);
      dataLinkCreated = true;
    }

    try {
      const bun = spawn('bun', [bundlePath!], {
        env: { ...process.env, SLAKTFORSKNING_DB: dbPath },
      });

      const responsePromise = new Promise<string>((resolve, reject) => {
        let buf = '';
        let stderr = '';
        bun.stdout.on('data', (d) => {
          buf += d.toString();
          if (buf.includes('"jsonrpc"')) resolve(buf);
        });
        bun.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        bun.on('error', reject);
        bun.on('exit', (code, sig) => {
          if (!buf.includes('"jsonrpc"')) {
            reject(new Error(`bun exited early (code=${code} sig=${sig}): ${stderr || buf}`));
          }
        });
        setTimeout(() => reject(new Error(`timeout; stderr=${stderr}; stdout=${buf}`)), 8000);
      });

      bun.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'bun-sidecar-spawn-test', version: '0.0' },
          },
        }) + '\n',
      );

      const response = await responsePromise;
      bun.kill();

      expect(response).toContain('"jsonrpc"');
      expect(response).toContain('"result"');
      // Sanity: the response is the prod server's initialize reply.
      expect(response).toContain('slaktforskning');
    } finally {
      if (dataLinkCreated) {
        try { rmSync(dataLink); } catch { /* ignore */ }
      }
      try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
    }
  }, 15000);
});

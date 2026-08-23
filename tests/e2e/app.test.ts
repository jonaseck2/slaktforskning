import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { test, expect } from '@playwright/test';
import { startApp, teardownApp, AppInstance } from './fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

function tempDbPath(): string {
  return path.join(os.tmpdir(), `slaktforskning-test-${Date.now()}.db`);
}

// Boot #1: the packaged Tauri app boots and the renderer mounts Vue.
// Proves: packaged binary, Tauri host → renderer → rusqlite chain.
//
// Tauri's ui_server.rs exposes POST /eval (not Electron-era /execute_js)
// and returns the raw JS value, not a { result } wrapper. The two-bug
// migration (wrong URL + wrong response shape) was missed during the
// Tauri port and the test silently failed on every run with
// "Unexpected end of JSON input" — repaired here as part of the
// e2e-test-repair plan (2026-05-12).
test('packaged app launches and Vue mounts', async () => {
  const UI_PORT = 19200;
  let instance: AppInstance | undefined;
  try {
    instance = await startApp(UI_PORT, 'boot');
    const res = await fetch(`http://127.0.0.1:${UI_PORT}/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: '!!window.__vue_router && !!window.api' }),
    });
    const body = (await res.json()) as boolean | { __error?: string } | { error?: string };
    expect(body).toBe(true);
  } finally {
    await teardownApp(instance);
  }
});

// Boot #1b: the eval bridge answers even when the script's result cannot be
// JSON-encoded.
//
// `ui_eval_response` serialises its payload as JSON. A cyclic result (a
// vue-router NavigationFailure carries `from`/`to` route objects that
// reference each other) makes that throw, and the renderer used to swallow the
// rejection into a console.error — so no response was ever sent and the caller
// sat out the full 15 s EVAL_TIMEOUT before reporting "renderer script timed
// out". Nothing had timed out; the reply was dropped.
//
// This cost a deterministic 15 s stall in duplicates.spec.ts and read as a
// flaky test for months. The bridge must answer with a descriptor instead.
test('eval bridge answers promptly when the result is not serializable', async () => {
  const UI_PORT = 19205;
  let instance: AppInstance | undefined;
  try {
    instance = await startApp(UI_PORT, 'boot-cyclic');
    const started = Date.now();
    const res = await fetch(`http://127.0.0.1:${UI_PORT}/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Smallest possible cyclic value: an object referencing itself.
      body: JSON.stringify({ script: '(() => { const a = {}; a.self = a; return a; })()' }),
    });
    const body = (await res.json()) as { __error?: string; error?: string };
    const elapsed = Date.now() - started;

    // Well under the 15 s EVAL_TIMEOUT in src-tauri/src/ui_server.rs.
    expect(elapsed, `bridge took ${elapsed}ms — it waited out the eval timeout`).toBeLessThan(10_000);
    expect(body?.error, 'bridge reported a timeout instead of the real reason').not.toBe(
      'renderer script timed out',
    );
    expect(
      JSON.stringify(body),
      'bridge should name the serialization failure',
    ).toMatch(/serializ/i);
  } finally {
    await teardownApp(instance);
  }
});

// Boot #2: prod MCP server stdio handshake.
// Proves: MCP entry point + api/ wiring still loads.
test('MCP server starts and responds', async () => {
  const dbPath = tempDbPath();

  const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
    let output = '';

    const isWin = process.platform === 'win32';
    const proc = spawn(
      isWin ? 'cmd' : 'npx',
      isWin ? ['/c', 'npx tsx src/mcp/server.ts'] : ['tsx', 'src/mcp/server.ts'],
      {
        cwd: projectRoot,
        env: { ...process.env, SLAKTFORSKNING_DB: dbPath },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
    proc.stdin?.write(initMsg + '\n');

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: false, output });
    }, 15000);

    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.includes('serverInfo')) {
        clearTimeout(timeout);
        proc.kill();
        resolve({ success: true, output });
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve({ success: false, output });
    });
  });

  fs.rmSync(dbPath, { force: true });

  expect(result.success).toBe(true);
  expect(result.output).toContain('slaktforskning');
});

// Boot #3: dev MCP server stdio handshake (covers UI bridge + chart tools wiring).
test('dev MCP server starts and responds', async () => {
  const dbPath = tempDbPath();

  const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
    let output = '';

    const isWin = process.platform === 'win32';
    const proc = spawn(
      isWin ? 'cmd' : 'npx',
      isWin ? ['/c', 'npx tsx src/mcp/devServer.ts'] : ['tsx', 'src/mcp/devServer.ts'],
      {
        cwd: projectRoot,
        env: { ...process.env, SLAKTFORSKNING_DB: dbPath },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
    proc.stdin?.write(initMsg + '\n');

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: false, output });
    }, 15000);

    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.includes('serverInfo')) {
        clearTimeout(timeout);
        proc.kill();
        resolve({ success: true, output });
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve({ success: false, output });
    });
  });

  fs.rmSync(dbPath, { force: true });

  expect(result.success).toBe(true);
  expect(result.output).toContain('slaktforskning');
});

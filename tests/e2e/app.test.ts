import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { test, expect } from '@playwright/test';
import { startApp, teardownApp, AppInstance } from './fixture';

const projectRoot = path.resolve(__dirname, '..', '..');

function tempDbPath(): string {
  return path.join(os.tmpdir(), `slaktforskning-test-${Date.now()}.db`);
}

// Smoke #1: the packaged Electron app boots and the renderer mounts Vue.
// Proves: packaged binary, main → preload → renderer → worker → SQLite chain.
test('packaged app launches and Vue mounts', async () => {
  const UI_PORT = 19200;
  let instance: AppInstance | undefined;
  try {
    instance = await startApp(UI_PORT, 'smoke');
    const res = await fetch(`http://127.0.0.1:${UI_PORT}/execute_js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '!!window.__vue_router && !!window.api' }),
    });
    const body = (await res.json()) as { result?: boolean };
    expect(body.result).toBe(true);
  } finally {
    await teardownApp(instance);
  }
});

// Smoke #2: prod MCP server stdio handshake.
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

// Smoke #3: dev MCP server stdio handshake (covers UI bridge + chart tools wiring).
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

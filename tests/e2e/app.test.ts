import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { test, expect } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '..', '..');

function tempDbPath(): string {
  return path.join(os.tmpdir(), `slaktforskning-test-${Date.now()}.db`);
}

test('app builds and launches via electron-forge', async () => {
  const dbPath = tempDbPath();

  const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
    let output = '';
    let launched = false;

    const isWindows = process.platform === 'win32';
    const proc = spawn(
      isWindows ? 'cmd' : 'npx',
      isWindows ? ['/c', 'npx electron-forge start'] : ['electron-forge', 'start'],
      {
        cwd: projectRoot,
        env: { ...process.env, SLAKTFORSKNING_DB: dbPath },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: launched, output });
    }, 90000);

    const onData = (data: Buffer) => {
      output += data.toString();
      if (output.includes('Launched Electron')) {
        launched = true;
        clearTimeout(timeout);
        // App launched successfully, kill it after a moment
        setTimeout(() => {
          proc.kill();
          resolve({ success: true, output });
        }, 3000);
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve({ success: false, output });
    });
  });

  fs.rmSync(dbPath, { force: true });

  expect(result.success).toBe(true);
  expect(result.output).toContain('Launched Electron');
});

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

    // Send MCP initialize request
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

    // Send MCP initialize request
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

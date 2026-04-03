import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../api/schema';
import { getDefaultDbPath } from '../shared/dbPath';
import { createMcpServer } from './createServer';

async function main() {
  const dbPath = process.env.SLAKTFORSKNING_DB || getDefaultDbPath();
  const dir = path.dirname(dbPath);
  const fs = await import('node:fs');
  fs.mkdirSync(dir, { recursive: true });
  // Clean up stale Emscripten lock directories from crashed runs
  const lockPath = dbPath + '.lock';
  if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
    fs.rmSync(lockPath, { recursive: true });
  }

  const db = new Database(dbPath);
  initializeSchema(db);

  const server = createMcpServer(db, dbPath);

  // UI tools — require the Electron app to be running
  const UI_PORT = process.env.SLAKTFORSKNING_UI_PORT
    ? parseInt(process.env.SLAKTFORSKNING_UI_PORT)
    : 19241;
  const UI_BASE = `http://127.0.0.1:${UI_PORT}`;

  async function uiPost(uiPath: string, body?: unknown): Promise<unknown> {
    try {
      const res = await fetch(`${UI_BASE}${uiPath}`, {
        method: 'POST',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return res.json();
    } catch {
      throw new Error('App UI not reachable — make sure the Electron app is running (npm start).');
    }
  }

  async function uiGet(uiPath: string): Promise<string> {
    try {
      const res = await fetch(`${UI_BASE}${uiPath}`);
      return res.text();
    } catch {
      throw new Error('App UI not reachable — make sure the Electron app is running (npm start).');
    }
  }

  server.registerTool('ui_screenshot', {
    description: 'Take a screenshot of the current app window. Returns a PNG image.',
  }, async () => {
    const result = await uiPost('/screenshot') as { data: string; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'image', data: result.data, mimeType: 'image/png' }] };
  });

  server.registerTool('ui_navigate', {
    description: 'Navigate the app to a route path (e.g. "/search?q=Erik", "/persons/123", "/relationships").',
    inputSchema: { path: z.string().describe('Vue Router path to navigate to, e.g. "/search?q=Erik"') },
  }, async (args) => {
    const result = await uiPost('/navigate', { path: args.path }) as { ok?: boolean; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Navigated to ${args.path}` }] };
  });

  server.registerTool('ui_get_dom', {
    description: 'Get the full rendered HTML of the current app view. Use this to verify what is displayed on screen.',
  }, async () => {
    const html = await uiGet('/dom');
    return { content: [{ type: 'text', text: html }] };
  });

  server.registerTool('ui_click', {
    description: 'Click an element in the app by CSS selector.',
    inputSchema: { selector: z.string().describe('CSS selector for the element to click, e.g. "button.btn-delete", "a[href=\'/relationships\']"') },
  }, async (args) => {
    const result = await uiPost('/click', { selector: args.selector }) as { ok?: boolean; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Clicked: ${args.selector}` }] };
  });

  server.registerTool('ui_execute_js', {
    description: 'Run JavaScript in the renderer process and return the result. Useful for reading state, querying the DOM, or triggering actions.',
    inputSchema: { code: z.string().describe('JavaScript expression or statement to execute in the renderer') },
  }, async (args) => {
    const result = await uiPost('/execute_js', { code: args.code }) as { result?: unknown; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

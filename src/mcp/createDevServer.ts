import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';
import { createProdServer } from './createProdServer';
import { registerUiTools } from './tools/dev/ui';
import { registerChartTools } from './tools/dev/chart';
import { registerSeedTools } from './tools/dev/seed';
import { registerInspectTools } from './tools/dev/inspect';

const DEFAULT_UI_PORT = 19241;

export function createDevServer(initialDb: Database, initialDbPath?: string): McpServer {
  const server = createProdServer(initialDb, initialDbPath);

  const uiPort = process.env.SLAKTFORSKNING_UI_PORT
    ? parseInt(process.env.SLAKTFORSKNING_UI_PORT, 10)
    : DEFAULT_UI_PORT;
  const uiBase = `http://localhost:${uiPort}`;

  // ctx for dev-only tools. Uses the initial db; switch_database operates on
  // the prod server's own closure and dev tools always see the original db.
  // Sufficient for dev/test scenarios.
  const ctx = { getDb: () => initialDb };

  registerUiTools(server, uiBase);
  registerChartTools(server, uiBase);
  registerSeedTools(server, ctx);
  registerInspectTools(server, ctx, uiBase);

  return server;
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';
import { createProdServer } from './createProdServer';
import { registerUiTools } from './tools/dev/ui';
import { registerChartTools } from './tools/dev/chart';
import { registerSeedTools } from './tools/dev/seed';
import { registerInspectTools } from './tools/dev/inspect';

const DEFAULT_UI_PORT = 19241;

export function createDevServer(initialDb: Database, initialDbPath?: string): McpServer {
  const { server, getDb, getDbPath } = createProdServer(initialDb, initialDbPath);

  const uiPort = process.env.SLAKTFORSKNING_UI_PORT
    ? parseInt(process.env.SLAKTFORSKNING_UI_PORT, 10)
    : DEFAULT_UI_PORT;
  const uiBase = `http://localhost:${uiPort}`;

  // ctx for dev-only tools — share the prod server's live db getter so
  // `db_stats` / `seed_*` / `clear_test_data` follow `switch_database` swaps.
  // Capturing `initialDb` directly here was a bug: after a switch the dev
  // tools still pointed at the closed initial connection.
  const ctx = { getDb };
  const inspectCtx = { getDb, getDbPath };

  registerUiTools(server, uiBase);
  registerChartTools(server, uiBase);
  registerSeedTools(server, ctx);
  registerInspectTools(server, inspectCtx, uiBase);

  return server;
}

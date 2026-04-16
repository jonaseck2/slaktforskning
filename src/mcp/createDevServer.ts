import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';
import { createProdServer } from './createProdServer';
import { registerUiTools } from './tools/dev/ui';

const DEFAULT_UI_PORT = 19241;

export function createDevServer(initialDb: Database, initialDbPath?: string): McpServer {
  const server = createProdServer(initialDb, initialDbPath);

  const uiPort = process.env.SLAKTFORSKNING_UI_PORT
    ? parseInt(process.env.SLAKTFORSKNING_UI_PORT, 10)
    : DEFAULT_UI_PORT;
  const uiBase = `http://localhost:${uiPort}`;

  registerUiTools(server, uiBase);

  return server;
}

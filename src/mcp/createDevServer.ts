import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';
import { createProdServer } from './createProdServer';

const DEFAULT_UI_PORT = 19241;

export function createDevServer(initialDb: Database, initialDbPath?: string): McpServer {
  const server = createProdServer(initialDb, initialDbPath);

  const uiPort = process.env.SLAKTFORSKNING_UI_PORT
    ? parseInt(process.env.SLAKTFORSKNING_UI_PORT, 10)
    : DEFAULT_UI_PORT;
  const uiBase = `http://localhost:${uiPort}`;

  // Dev-only tools will be registered here in Tasks 9-12.
  // uiBase is kept to avoid unused-variable error once tools are added.
  void uiBase;

  return server;
}

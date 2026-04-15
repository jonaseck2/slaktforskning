import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';

export function createProdServer(initialDb: Database, initialDbPath?: string): McpServer {
  let db = initialDb;
  let currentDbPath = initialDbPath ?? 'unknown';

  const server = new McpServer({
    name: 'slaktforskning',
    version: '1.0.0',
  });

  // Tool registration context — getDb() always returns the current db after switch_database
  const ctx = { getDb: () => db };

  // Extended context for utility tools that need to swap the active database
  const utilCtx = {
    ...ctx,
    getDbPath: () => currentDbPath,
    setDb: (newDb: Database) => { db = newDb; },
    setDbPath: (newPath: string) => { currentDbPath = newPath; },
  };

  // Tools will be registered here in Tasks 3-7.
  // ctx and utilCtx are kept to avoid unused-variable errors once tools are added.
  void ctx;
  void utilCtx;

  return server;
}

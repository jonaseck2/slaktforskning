import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';
import { registerPersonTools } from './tools/prod/persons';
import { registerFamilyTools } from './tools/prod/families';
import { registerEventTools } from './tools/prod/events';

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

  registerPersonTools(server, ctx);
  registerFamilyTools(server, ctx);
  registerEventTools(server, ctx);

  // utilCtx kept for future utility tools (Tasks 6-7)
  void utilCtx;

  return server;
}

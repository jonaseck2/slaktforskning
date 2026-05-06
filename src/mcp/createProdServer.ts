import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';
import { registerPersonTools } from './tools/prod/persons';
import { registerFamilyTools } from './tools/prod/families';
import { registerEventTools } from './tools/prod/events';
import { registerSourceTools } from './tools/prod/sources';
import { registerPlaceTools } from './tools/prod/places';
import { registerResearchTools } from './tools/prod/research';
import { registerMediaTools } from './tools/prod/media';
import { registerGroupTools } from './tools/prod/groups';
import { registerRepositoryTools } from './tools/prod/repositories';
import { registerDataManagementTools } from './tools/prod/data-management';

export interface ProdServer {
  server: McpServer;
  /**
   * Live getter for the active database. Always reflects the most recent
   * `switch_database` call. Dev tools must use this getter (not capture the
   * initial db) so they keep pointing at the live connection after a swap.
   */
  getDb: () => Database;
  /** Live getter for the active database path. Follows `switch_database`. */
  getDbPath: () => string;
}

export function createProdServer(initialDb: Database, initialDbPath?: string): ProdServer {
  let db = initialDb;
  let currentDbPath = initialDbPath ?? 'unknown';

  const server = new McpServer({
    name: 'slaktforskning',
    version: '1.0.0',
  });

  // Tool registration context — getDb() always returns the current db after switch_database
  const getDb = () => db;
  const getDbPath = () => currentDbPath;
  const ctx = { getDb };

  // Extended context for utility tools that need to swap the active database
  const utilCtx = {
    ...ctx,
    getDbPath,
    setDb: (newDb: Database) => { db = newDb; },
    setDbPath: (newPath: string) => { currentDbPath = newPath; },
  };

  registerPersonTools(server, ctx);
  registerFamilyTools(server, ctx);
  registerEventTools(server, ctx);
  registerSourceTools(server, ctx);
  registerPlaceTools(server, ctx);
  registerResearchTools(server, ctx);
  registerMediaTools(server, ctx);
  registerGroupTools(server, ctx);
  registerRepositoryTools(server, ctx);
  registerDataManagementTools(server, utilCtx);

  return { server, getDb, getDbPath };
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Database } from 'node-sqlite3-wasm';
import { registerPersonTools } from './tools/persons';
import { registerRelationshipTools } from './tools/relationships';
import { registerEventTools } from './tools/events';
import { registerSourceTools } from './tools/sources';
import { registerPlaceTools } from './tools/places';
import { registerMediaTools } from './tools/media';
import { registerImportExportTools } from './tools/import-export';
import { registerUtilityTools } from './tools/utility';

export function createMcpServer(initialDb: Database, initialDbPath?: string): McpServer {
  let db = initialDb;
  let currentDbPath = initialDbPath ?? 'unknown';
  const server = new McpServer({
    name: 'slaktforskning',
    version: '0.3.1',
  });

  const ctx = { getDb: () => db };

  registerPersonTools(server, ctx);
  registerRelationshipTools(server, ctx);
  registerEventTools(server, ctx);
  registerSourceTools(server, ctx);
  registerPlaceTools(server, ctx);
  registerMediaTools(server, ctx);
  registerImportExportTools(server, ctx);
  registerUtilityTools(server, {
    ...ctx,
    getDbPath: () => currentDbPath,
    setDb: (newDb: Database) => { db = newDb; },
    setDbPath: (newPath: string) => { currentDbPath = newPath; },
  });

  return server;
}

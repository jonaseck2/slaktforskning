import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../api/schema';
import { getDefaultDbPath } from '../shared/dbPath';
import { createDevServer } from './createDevServer';

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

  const server = createDevServer(db, dbPath);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

// Hardening shared by stdio MCP entry points (server.ts, devServer.ts).
//
// The MCP stdio transport uses stdout for the JSON-RPC protocol. Two failure
// modes cause the server process to die — which forces a manual reconnect in
// the client (Claude Code, etc.):
//
// 1. Stray writes to stdout from anywhere in the codebase corrupt the protocol
//    framing. Redirect console.log/info/debug to stderr defensively.
// 2. An unhandled promise rejection or uncaught exception terminates Node.
//    Log to stderr and keep going — the client will see a tool error response,
//    not a dead pipe.

import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../api/schema';

export function installStdioHardening(): void {
  console.log = console.error.bind(console);
  console.info = console.error.bind(console);
  console.debug = console.error.bind(console);

  process.on('uncaughtException', (err) => {
    process.stderr.write(`[mcp] uncaughtException: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  });
  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`[mcp] unhandledRejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`);
  });
}

// Schema init can race with the Electron app's own startup migrations on the
// same WAL. Retry briefly on SQLITE_BUSY/LOCKED before giving up.
export function initializeSchemaWithRetry(db: Database, attempts = 5, delayMs = 200): void {
  for (let i = 0; i < attempts; i++) {
    try {
      initializeSchema(db);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(msg);
      if (!transient || i === attempts - 1) throw err;
      const end = Date.now() + delayMs;
      while (Date.now() < end) { /* sync sleep — schema init is sync */ }
    }
  }
}

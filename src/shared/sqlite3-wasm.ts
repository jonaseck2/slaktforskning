// Node ESM cannot statically detect named exports from CommonJS modules whose
// exports are populated at runtime — Emscripten modules attach exports inside
// `onRuntimeInitialized`, so the ESM static analyzer sees an empty module.
// `import { Database } from 'node-sqlite3-wasm'` therefore fails under Node 22+
// ESM with "does not provide an export named 'Database'", even though
// `module.exports.Database` is a real class. `createRequire` bypasses the
// static analyzer.
//
// The packaged MCP sidecar (esbuild → pkg, single-file CJS bundle) doesn't go
// through Node's ESM loader and is unaffected. This shim only carries dev
// (`npx tsx`) and any other ESM-host code path that needs the runtime class.

import { createRequire } from 'node:module';
import type * as SqliteWasm from 'node-sqlite3-wasm';

const mod = createRequire(import.meta.url)('node-sqlite3-wasm') as typeof SqliteWasm;

export const Database = mod.Database;
export const SQLite3Error = mod.SQLite3Error;

export type Database = SqliteWasm.Database;
export type Statement = SqliteWasm.Statement;
export type SQLite3Error = SqliteWasm.SQLite3Error;

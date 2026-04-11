import { Database } from 'node-sqlite3-wasm';

/**
 * Shared context passed to each tool registration function.
 * `getDb` is a getter because `switch_database` can swap the active database.
 */
export interface ToolContext {
  getDb: () => Database;
}

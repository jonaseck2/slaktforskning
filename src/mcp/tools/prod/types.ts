import { Database } from 'node-sqlite3-wasm';

/**
 * Shared context passed to each tool registration function.
 * `getDb` is a getter because `switch_database` can swap the active database.
 */
export interface ToolContext {
  getDb: () => Database;
}

/**
 * Extended context for utility tools — includes mutable db/path setters
 * needed by `switch_database`.
 */
export interface UtilityToolContext extends ToolContext {
  getDbPath: () => string;
  setDb: (newDb: Database) => void;
  setDbPath: (newPath: string) => void;
}

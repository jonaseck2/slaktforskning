import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../../src/api/schema';

export function createTestDb(): Database {
  const db = new Database(':memory:');
  initializeSchema(db);
  return db;
}

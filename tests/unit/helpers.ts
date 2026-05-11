import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../../src/api/schema';

export async function createTestDb(): Promise<Database> {
  const db = new Database(':memory:');
  await initializeSchema(db);
  return db;
}

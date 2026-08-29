import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../../src/api/schema';

export async function createTestDb(): Promise<Database> {
  const db = new Database(':memory:');
  await initializeSchema(db);
  return db;
}

/** Read a fixture under tests/fixtures/gedcom/dialects/ by bare filename. */
export function readDialect(name: string): string {
  return readFileSync(join(__dirname, '../fixtures/gedcom/dialects', name), 'utf-8');
}

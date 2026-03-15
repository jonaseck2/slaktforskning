import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/api/schema';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  initializeSchema(db);
  return db;
}

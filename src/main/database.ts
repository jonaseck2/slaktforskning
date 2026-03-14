import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeSchema } from '../api/schema';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'slaktforskning.db');
  db = new Database(dbPath);
  initializeSchema(db);
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

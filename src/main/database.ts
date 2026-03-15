import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../api/schema';

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;
  const dbPath = process.env.SLAKTFORSKNING_DB || path.join(app.getPath('userData'), 'slaktforskning.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // node-sqlite3-wasm (Emscripten) creates .lock directories for file locking.
  // If the app crashes, stale locks block subsequent opens — remove them.
  const lockPath = dbPath + '.lock';
  if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
    fs.rmSync(lockPath, { recursive: true });
  }
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

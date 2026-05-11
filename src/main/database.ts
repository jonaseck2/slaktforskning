import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../api/schema';
import { undoManager } from '../api/undo';
import { loadSettings, saveSettings } from './settings';

let db: Database | null = null;
let currentDbPath: string | null = null;

async function openDatabase(dbPath: string): Promise<Database> {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // node-sqlite3-wasm (Emscripten) creates .lock directories for file locking.
  // If the app crashes, stale locks block subsequent opens — remove them.
  const lockPath = dbPath + '.lock';
  if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
    fs.rmSync(lockPath, { recursive: true });
  }
  const newDb = new Database(dbPath);
  await initializeSchema(newDb);
  return newDb;
}

function resolveDefaultPath(): string {
  return process.env.SLAKTFORSKNING_DB
    || loadSettings().lastDatabase
    || path.join(app.getPath('userData'), 'slaktforskning.db');
}

export async function getDatabase(): Promise<Database> {
  if (db) return db;
  currentDbPath = resolveDefaultPath();
  db = await openDatabase(currentDbPath);
  return db;
}

export function getCurrentDatabasePath(): string {
  if (!currentDbPath) currentDbPath = resolveDefaultPath();
  return currentDbPath;
}

export async function switchDatabase(newPath: string): Promise<void> {
  closeDatabase();
  undoManager.clear();
  db = await openDatabase(newPath);
  currentDbPath = newPath;

  const settings = loadSettings();
  settings.lastDatabase = newPath;
  settings.recentDatabases = [
    newPath,
    ...settings.recentDatabases.filter(p => p !== newPath),
  ].slice(0, 10);
  saveSettings(settings);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { callWorker, switchWorkerDb } from './worker-client';
import { getDatabaseOpenError } from '../database';
import type { WrapHandlerFn } from './wrap-handler';

/** Wraps a switch attempt: roll the main-thread DB over, then the worker DB.
 *  On worker failure, surface the error to the renderer instead of throwing
 *  so the user can pick another path from Settings without seeing a raw IPC
 *  rejection in the toast. */
async function trySwitchDatabase(
  newPath: string,
  switchDatabase: (dbPath: string) => void,
): Promise<{ ok: true; path: string; name: string } | { ok: false; error: string; path: string }> {
  try {
    switchDatabase(newPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), path: newPath };
  }
  try {
    await switchWorkerDb(newPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), path: newPath };
  }
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
  return { ok: true, path: newPath, name: path.basename(newPath) };
}

export function registerDatabaseHandlers(
  _getDb: unknown,
  getCurrentDatabasePath: () => string,
  switchDatabase: (dbPath: string) => void,
  loadSettings: () => { recentDatabases: string[] },
  wrapHandler: WrapHandlerFn,
) {
  // Pure path/settings — no DB connection needed
  wrapHandler('db:getCurrent', () => {
    const dbPath = getCurrentDatabasePath();
    return { path: dbPath, name: path.basename(dbPath) };
  });

  wrapHandler('db:getRecent', () => {
    const { recentDatabases } = loadSettings();
    return recentDatabases
      .filter(p => fs.existsSync(p))
      .map(p => ({ path: p, name: path.basename(p) }));
  });

  // Surfaces a startup DB open failure to the renderer so it can show a toast
  // and route the user to Settings. Returns null when the DB opened cleanly.
  wrapHandler('db:getStartupError', () => getDatabaseOpenError());

  // db:getSetting, db:setSetting, db:deleteSetting migrated to registry (src/shared/channels/database.ts)

  wrapHandler('shell:open-external', (url) => {
    const urlStr = url as string;
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
      throw new Error('Only http and https URLs are allowed');
    }
    return shell.openExternal(urlStr);
  });

  // Database switching — update both main-thread path tracker and worker DB.
  // Each handler returns one of:
  //   { canceled: true }                           — dialog was dismissed
  //   { path, name }                               — switched cleanly
  //   { error: string, path: string }              — open failed (locked / corrupt / missing)
  // The renderer toasts on `error` rather than treating it as a hard rejection.
  ipcMain.handle('db:createNew', async () => {
    const currentDir = path.dirname(getCurrentDatabasePath());
    const result = await dialog.showSaveDialog({
      title: 'Ny databas',
      defaultPath: path.join(currentDir, 'slaktforskning.db'),
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const r = await trySwitchDatabase(result.filePath, switchDatabase);
    return r.ok ? { path: r.path, name: r.name } : { error: r.error, path: r.path };
  });

  ipcMain.handle('db:switchTo', async (_e, dbPath: string) => {
    const r = await trySwitchDatabase(dbPath, switchDatabase);
    return r.ok ? { path: r.path, name: r.name } : { error: r.error, path: r.path };
  });

  ipcMain.handle('db:openExisting', async () => {
    const currentDir = path.dirname(getCurrentDatabasePath());
    const result = await dialog.showOpenDialog({
      title: 'Öppna databas',
      defaultPath: currentDir,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const r = await trySwitchDatabase(result.filePaths[0], switchDatabase);
    return r.ok ? { path: r.path, name: r.name } : { error: r.error, path: r.path };
  });

  // Backup / Restore
  wrapHandler('backup:backup', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };
    const currentPath = getCurrentDatabasePath();
    const currentDir = path.dirname(currentPath);
    const backupName = path.basename(currentPath).replace('.db', '') + '-backup-' + new Date().toISOString().slice(0, 10) + '.db';
    const result = await dialog.showSaveDialog(win, {
      title: 'Spara säkerhetskopia',
      defaultPath: path.join(currentDir, backupName),
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    fs.copyFileSync(currentPath, result.filePath);
    return { success: true, path: result.filePath };
  });

  wrapHandler('backup:restore', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };
    const currentDir = path.dirname(getCurrentDatabasePath());
    const result = await dialog.showOpenDialog(win, {
      title: 'Välj säkerhetskopia',
      defaultPath: currentDir,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, error: 'Cancelled' };
    const backupPath = result.filePaths[0];
    switchDatabase(backupPath);
    await switchWorkerDb(backupPath);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { success: true, path: backupPath };
  });

  // Undo — worker holds undoManager; undo:undo and undo:redo stay here because
  // they broadcast undo:changed to all BrowserWindows after the call.
  // undo:state, undo:beginGroup, undo:endGroup migrated to registry (src/shared/channels/undo.ts).
  wrapHandler('undo:undo', async () => {
    const label = await callWorker('undo:undo');
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('undo:changed'));
    return label;
  });
  wrapHandler('undo:redo', async () => {
    const label = await callWorker('undo:redo');
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('undo:changed'));
    return label;
  });
}

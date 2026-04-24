import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { callWorker, switchWorkerDb } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

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

  // DB settings → worker
  wrapHandler('db:getSetting', (...args) => callWorker('db:getSetting', ...args));
  wrapHandler('db:setSetting', (...args) => callWorker('db:setSetting', ...args));
  wrapHandler('db:deleteSetting', (...args) => callWorker('db:deleteSetting', ...args));

  wrapHandler('shell:open-external', (url) => {
    const urlStr = url as string;
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
      throw new Error('Only http and https URLs are allowed');
    }
    return shell.openExternal(urlStr);
  });

  // Database switching — update both main-thread path tracker and worker DB
  ipcMain.handle('db:createNew', async () => {
    const currentDir = path.dirname(getCurrentDatabasePath());
    const result = await dialog.showSaveDialog({
      title: 'Ny databas',
      defaultPath: path.join(currentDir, 'slaktforskning.db'),
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    switchDatabase(result.filePath);
    await switchWorkerDb(result.filePath);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { path: result.filePath, name: path.basename(result.filePath) };
  });

  ipcMain.handle('db:switchTo', async (_e, dbPath: string) => {
    switchDatabase(dbPath);
    await switchWorkerDb(dbPath);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { path: dbPath, name: path.basename(dbPath) };
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
    switchDatabase(result.filePaths[0]);
    await switchWorkerDb(result.filePaths[0]);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
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

  // Undo — worker holds undoManager; main thread broadcasts the change notification
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
  wrapHandler('undo:state', () => callWorker('undo:state'));
  wrapHandler('undo:beginGroup', (...args) => callWorker('undo:beginGroup', ...args));
  wrapHandler('undo:endGroup', () => callWorker('undo:endGroup'));
}

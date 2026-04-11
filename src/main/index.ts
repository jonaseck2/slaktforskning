import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getDatabase, closeDatabase } from './database';
import { registerIpcHandlers } from './ipc';
import { startUiServer, stopUiServer } from './ui-server';
import { undoManager } from '../api/undo';

// Suppress EPIPE errors (occur when stdout pipe closes, e.g. during E2E tests).
// Without this, a single console.log to a closed pipe kills the main process.
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
  throw err;
});

// Workaround for macOS 26 Tahoe cppgc crash (electron/electron#49522)
app.commandLine.appendSwitch('js-flags', '--no-incremental-marking');

if (started) {
  app.quit();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let activeWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  win.webContents.openDevTools();

  activeWindow = win;
  win.on('focus', () => { activeWindow = win; });
  win.on('closed', () => { if (activeWindow === win) activeWindow = null; });

  return win;
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            const label = undoManager.undo();
            if (label) {
              BrowserWindow.getAllWindows().forEach(w => {
                w.webContents.send('undo:changed');
                w.webContents.send('undo:performed', { type: 'undo', label });
              });
            }
          },
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            const label = undoManager.redo();
            if (label) {
              BrowserWindow.getAllWindows().forEach(w => {
                w.webContents.send('undo:changed');
                w.webContents.send('undo:performed', { type: 'redo', label });
              });
            }
          },
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('ready', () => {
  getDatabase();
  registerIpcHandlers();
  buildMenu();
  createWindow();
  startUiServer(() => activeWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopUiServer();
  closeDatabase();
});

import path from 'node:path';
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import started from 'electron-squirrel-startup';
import { getDatabase, closeDatabase } from './database';
import { registerIpcHandlers } from './ipc';
import { callWorker, terminateWorker } from './ipc/worker-client';
import { startUiServer, stopUiServer } from './ui-server';

// Suppress EPIPE errors (occur when stdout pipe closes, e.g. during E2E tests).
// Without this, a single console.log to a closed pipe kills the main process.
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
  throw err;
});

// Workaround for macOS 26 Tahoe cppgc crash (electron/electron#49522)
app.commandLine.appendSwitch('js-flags', '--no-incremental-marking');

// Enable Chrome DevTools Protocol for external debugging (Chrome DevTools MCP, etc.)
// Set SLAKTFORSKNING_CDP_PORT=9222 to enable. Each instance needs a unique port.
if (process.env.SLAKTFORSKNING_CDP_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.SLAKTFORSKNING_CDP_PORT);
}


if (started) {
  app.quit();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let activeWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const noFocus = !!process.env.SLAKTFORSKNING_NO_FOCUS;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: !noFocus,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (noFocus) win.showInactive();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Only auto-open DevTools in dev mode. Users can still toggle via View menu in production.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools();
  }

  activeWindow = win;
  win.on('focus', () => { activeWindow = win; });
  win.on('closed', () => { if (activeWindow === win) activeWindow = null; });

  // Close confirmation for last window — skip in dev mode to avoid friction
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.on('close', (e) => {
      if (BrowserWindow.getAllWindows().length > 1) return;
      const choice = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Avsluta', 'Avbryt'],
        defaultId: 1,
        cancelId: 1,
        title: 'Avsluta programmet',
        message: 'Vill du verkligen avsluta programmet?',
      });
      if (choice === 1) e.preventDefault();
    });
  }

  return win;
}

function buildMenu(): void {
  // macOS convention: the application's "About …" entry lives in the app
  // menu (the first submenu), not in Help. Wire it to the same renderer
  // signal as the cross-platform Help → About entry below so both paths
  // open the same AboutModal.
  const macAppMenu: Electron.MenuItemConstructorOptions | null = process.platform === 'darwin'
    ? {
        label: app.name,
        submenu: [
          {
            label: 'About OurLegacy',
            click: () => {
              const win = activeWindow ?? BrowserWindow.getAllWindows()[0];
              if (win) win.webContents.send('app:openAbout');
            },
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }
    : null;

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(macAppMenu ? [macAppMenu] : []),
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
          click: async () => {
            const label = await callWorker('undo:undo') as string | null;
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
          click: async () => {
            const label = await callWorker('undo:redo') as string | null;
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
    {
      label: 'Help',
      submenu: [
        {
          label: 'About OurLegacy',
          click: () => {
            const win = activeWindow ?? BrowserWindow.getAllWindows()[0];
            if (win) win.webContents.send('app:openAbout');
          },
        },
        {
          label: 'View on GitHub',
          click: () => {
            shell.openExternal('https://github.com/jonaseck2/slaktforskning');
          },
        },
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
  terminateWorker();
  closeDatabase();
});

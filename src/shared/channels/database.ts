import { getDbSetting, setDbSetting, deleteDbSetting } from '../../api/db_settings';
import { defineChannel } from './registry';

// ── DB Settings (worker) ──────────────────────────────────────────────────────
// db:getCurrent, db:getRecent, shell:open-external, backup:backup, backup:restore,
// undo:undo, undo:redo remain in ipc/database.ts because they need either:
//   - Runtime closures (getCurrentDatabasePath, loadSettings, switchDatabase)
//   - Electron APIs (shell, BrowserWindow) that cannot be imported in shared code
//   - Post-call broadcasts (undo:changed, db:switched) handled on the main thread
// db:createNew, db:switchTo, db:openExisting use ipcMain.handle directly — outside registry.

defineChannel({
  name: 'db:getSetting',
  thread: 'worker',
  handler: async (db, key: string) => await getDbSetting(db, key),
});

defineChannel({
  name: 'db:setSetting',
  thread: 'worker',
  mutating: false,  // settings changes don't need a full dataChanged broadcast
  handler: async (db, key: string, value: string) => { await setDbSetting(db, key, value); },
});

defineChannel({
  name: 'db:deleteSetting',
  thread: 'worker',
  mutating: false,  // settings changes don't need a full dataChanged broadcast
  handler: async (db, key: string) => { await deleteDbSetting(db, key); },
});

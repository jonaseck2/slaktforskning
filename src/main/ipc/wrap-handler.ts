import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export type WrapHandlerFn = (channel: string, handler: (...args: unknown[]) => unknown) => void;

let _logPath: string | null = null;
function ipcLog(msg: string) {
  if (!_logPath) _logPath = path.join(app.getPath('userData'), 'ipc-timing.log');
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(_logPath, line);
}

export function wrapHandler(channel: string, handler: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      ipcLog(`[IPC] ${channel} called`);
      const t0 = Date.now();
      const result = await handler(...args);
      const elapsed = Date.now() - t0;
      ipcLog(`[IPC] ${channel} → OK (${elapsed}ms)`);
      return result;
    } catch (err) {
      ipcLog(`[IPC] ${channel} → ERROR ${err}`);
      throw err;
    }
  });
}

import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, app } from 'electron';

export type WrapHandlerFn = (channel: string, handler: (...args: unknown[]) => unknown) => void;

// Per-IPC timing log. Off by default — enable with SLAKTFORSKNING_IPC_LOG=1.
// Synchronous appends on every IPC call serialize the entire IPC bus on the
// main thread; a multi-hour session produced a 1 GB log and caused renderer
// list queries to take minutes during concurrent imports.
const IPC_LOG_ENABLED = process.env.SLAKTFORSKNING_IPC_LOG === '1';
let _logStream: fs.WriteStream | null = null;
function ipcLog(msg: string) {
  if (!IPC_LOG_ENABLED) return;
  if (!_logStream) {
    const logPath = path.join(app.getPath('userData'), 'ipc-timing.log');
    _logStream = fs.createWriteStream(logPath, { flags: 'a' });
  }
  _logStream.write(`${new Date().toISOString()} ${msg}\n`);
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

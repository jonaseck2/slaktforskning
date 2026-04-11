import { ipcMain } from 'electron';

export type WrapHandlerFn = (channel: string, handler: (...args: unknown[]) => unknown) => void;

export function wrapHandler(channel: string, handler: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      console.log(`[IPC] ${channel}`, args);
      const result = await handler(...args);
      console.log(`[IPC] ${channel} → OK`);
      return result;
    } catch (err) {
      console.error(`[IPC] ${channel} → ERROR`, err);
      throw err;
    }
  });
}

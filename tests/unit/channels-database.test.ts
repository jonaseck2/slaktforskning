import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('database channel registry', () => {
  it('registers all db:* channels', () => {
    const dbChannels = listChannels().filter(c => c.startsWith('db:'));
    // Only db:getSetting, db:setSetting, db:deleteSetting are in the registry.
    // db:getCurrent, db:getRecent need runtime closures (getCurrentDatabasePath, loadSettings).
    // db:createNew, db:switchTo, db:openExisting use ipcMain.handle directly.
    expect(dbChannels.length).toBe(3);
  });

  it('db:getSetting is a worker channel', () => {
    const ch = getChannel('db:getSetting');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('db settings channels are not mutating (settings do not trigger dataChanged broadcast)', () => {
    expect(getChannel('db:getSetting')!.mutating).toBeFalsy();
    expect(getChannel('db:setSetting')!.mutating).toBeFalsy();
    expect(getChannel('db:deleteSetting')!.mutating).toBeFalsy();
  });
});

describe('undo channel registry', () => {
  it('registers undo:state, undo:beginGroup, undo:endGroup', () => {
    const undoChannels = listChannels().filter(c => c.startsWith('undo:'));
    // undo:undo and undo:redo remain in ipc/database.ts (they broadcast undo:changed)
    expect(undoChannels.length).toBe(3);
    expect(undoChannels).toContain('undo:state');
    expect(undoChannels).toContain('undo:beginGroup');
    expect(undoChannels).toContain('undo:endGroup');
  });

  it('all undo channels are worker channels', () => {
    expect(getChannel('undo:state')!.thread).toBe('worker');
    expect(getChannel('undo:beginGroup')!.thread).toBe('worker');
    expect(getChannel('undo:endGroup')!.thread).toBe('worker');
  });

  it('none of the undo registry channels are mutating', () => {
    // undo operations are mutations but the broadcast is handled by the legacy
    // ipc/database.ts wrapper, not the registry
    expect(getChannel('undo:state')!.mutating).toBeFalsy();
    expect(getChannel('undo:beginGroup')!.mutating).toBeFalsy();
    expect(getChannel('undo:endGroup')!.mutating).toBeFalsy();
  });
});

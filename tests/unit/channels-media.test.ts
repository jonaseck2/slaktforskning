import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('media channel registry', () => {
  it('registers all media:* channels in the registry', () => {
    const mediaChannels = listChannels().filter(c => c.startsWith('media:'));
    // 14 worker channels (media:getFilePath and media:readAsDataUrl remain in
    // legacy dispatch table since they require getDbDir() — worker-local state;
    // media:attach and media:openFile remain on main thread)
    expect(mediaChannels.length).toBe(14);
  });

  it('registers all mediaRegions:* channels', () => {
    const regionChannels = listChannels().filter(c => c.startsWith('mediaRegions:'));
    expect(regionChannels.length).toBe(5);
  });

  it('media:list is a worker channel', () => {
    const ch = getChannel('media:list');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    expect(getChannel('media:create')!.mutating).toBe(true);
    expect(getChannel('media:delete')!.mutating).toBe(true);
    expect(getChannel('media:update')!.mutating).toBe(true);
    expect(getChannel('media:addLink')!.mutating).toBe(true);
    expect(getChannel('media:removeLink')!.mutating).toBe(true);
    expect(getChannel('media:reorder')!.mutating).toBe(true);
    expect(getChannel('mediaRegions:create')!.mutating).toBe(true);
    expect(getChannel('mediaRegions:update')!.mutating).toBe(true);
    expect(getChannel('mediaRegions:delete')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('media:list')!.mutating).toBeFalsy();
    expect(getChannel('media:get')!.mutating).toBeFalsy();
    expect(getChannel('media:listPage')!.mutating).toBeFalsy();
    expect(getChannel('media:forEntity')!.mutating).toBeFalsy();
    expect(getChannel('media:linksForMedia')!.mutating).toBeFalsy();
    expect(getChannel('media:profilePicRef')!.mutating).toBeFalsy();
    expect(getChannel('media:profilePicRefs')!.mutating).toBeFalsy();
    expect(getChannel('media:getTimeline')!.mutating).toBeFalsy();
    expect(getChannel('mediaRegions:getForMedia')!.mutating).toBeFalsy();
    expect(getChannel('mediaRegions:getForPerson')!.mutating).toBeFalsy();
  });
});

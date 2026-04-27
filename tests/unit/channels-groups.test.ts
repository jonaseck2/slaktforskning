import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('groups channel registry', () => {
  it('registers all groups:* channels', () => {
    const groupChannels = listChannels().filter(c => c.startsWith('groups:'));
    expect(groupChannels.length).toBe(12);
  });

  it('groups:get is a worker channel', () => {
    const ch = getChannel('groups:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    expect(getChannel('groups:create')!.mutating).toBe(true);
    expect(getChannel('groups:update')!.mutating).toBe(true);
    expect(getChannel('groups:delete')!.mutating).toBe(true);
    expect(getChannel('groups:addLink')!.mutating).toBe(true);
    expect(getChannel('groups:removeLink')!.mutating).toBe(true);
    expect(getChannel('groups:removeLinkByEntity')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('groups:list')!.mutating).toBeFalsy();
    expect(getChannel('groups:get')!.mutating).toBeFalsy();
    expect(getChannel('groups:getLinks')!.mutating).toBeFalsy();
    expect(getChannel('groups:forPerson')!.mutating).toBeFalsy();
    expect(getChannel('groups:forPlace')!.mutating).toBeFalsy();
    expect(getChannel('groups:forMedia')!.mutating).toBeFalsy();
  });
});

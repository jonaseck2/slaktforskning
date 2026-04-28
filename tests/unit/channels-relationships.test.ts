import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('relationships channel registry', () => {
  it('registers all relationships:* channels', () => {
    const relChannels = listChannels().filter(c => c.startsWith('relationships:'));
    expect(relChannels.length).toBe(8);
  });

  it('registers all eventParticipants:* channels', () => {
    const epChannels = listChannels().filter(c => c.startsWith('eventParticipants:'));
    expect(epChannels.length).toBe(3);
  });

  it('relationships:get is a worker channel', () => {
    const ch = getChannel('relationships:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    // Write channels
    expect(getChannel('relationships:create')!.mutating).toBe(true);
    expect(getChannel('relationships:update')!.mutating).toBe(true);
    expect(getChannel('relationships:delete')!.mutating).toBe(true);
    expect(getChannel('eventParticipants:add')!.mutating).toBe(true);
    expect(getChannel('eventParticipants:remove')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('relationships:get')!.mutating).toBeFalsy();
    expect(getChannel('relationships:list')!.mutating).toBeFalsy();
    expect(getChannel('relationships:listPage')!.mutating).toBeFalsy();
    expect(getChannel('relationships:getForPerson')!.mutating).toBeFalsy();
    expect(getChannel('relationships:search')!.mutating).toBeFalsy();
    expect(getChannel('eventParticipants:getForEvent')!.mutating).toBeFalsy();
  });
});

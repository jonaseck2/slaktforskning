import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('repositories channel registry', () => {
  it('registers all repositories:* channels', () => {
    const repoChannels = listChannels().filter(c => c.startsWith('repositories:'));
    expect(repoChannels.length).toBe(8);
  });

  it('repositories:get is a worker channel', () => {
    const ch = getChannel('repositories:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    expect(getChannel('repositories:create')!.mutating).toBe(true);
    expect(getChannel('repositories:update')!.mutating).toBe(true);
    expect(getChannel('repositories:delete')!.mutating).toBe(true);
    expect(getChannel('repositories:linkSource')!.mutating).toBe(true);
    expect(getChannel('repositories:unlinkSource')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('repositories:list')!.mutating).toBeFalsy();
    expect(getChannel('repositories:get')!.mutating).toBeFalsy();
    expect(getChannel('repositories:forSource')!.mutating).toBeFalsy();
  });
});

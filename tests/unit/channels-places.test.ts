import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('places channel registry', () => {
  it('registers all places:* channels', () => {
    const placeChannels = listChannels().filter(c => c.startsWith('places:'));
    expect(placeChannels.length).toBe(13);
  });
  it('places:findOrCreateWithChain is a mutating worker channel', () => {
    const ch = getChannel('places:findOrCreateWithChain');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(true);
  });
  it('places:get is a worker channel', () => {
    const ch = getChannel('places:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });
  it('mutating channels are flagged correctly', () => {
    expect(getChannel('places:create')!.mutating).toBe(true);
    expect(getChannel('places:update')!.mutating).toBe(true);
    expect(getChannel('places:delete')!.mutating).toBe(true);
    expect(getChannel('places:findOrCreate')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('places:get')!.mutating).toBeFalsy();
    expect(getChannel('places:list')!.mutating).toBeFalsy();
    expect(getChannel('places:search')!.mutating).toBeFalsy();
  });
  it('places:listChildren and places:getAncestors are read-only worker channels', () => {
    const lc = getChannel('places:listChildren');
    const ga = getChannel('places:getAncestors');
    expect(lc).toBeDefined();
    expect(lc!.thread).toBe('worker');
    expect(lc!.mutating).toBeFalsy();
    expect(ga).toBeDefined();
    expect(ga!.thread).toBe('worker');
    expect(ga!.mutating).toBeFalsy();
  });
});

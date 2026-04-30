import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('sources channel registry', () => {
  it('registers all sources:* channels', () => {
    const sourceChannels = listChannels().filter(c => c.startsWith('sources:'));
    expect(sourceChannels.length).toBe(7);
  });

  it('registers all citations:* channels', () => {
    const citationChannels = listChannels().filter(c => c.startsWith('citations:'));
    expect(citationChannels.length).toBe(9);
  });

  it('sources:get is a worker channel', () => {
    const ch = getChannel('sources:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    // Write channels
    expect(getChannel('sources:create')!.mutating).toBe(true);
    expect(getChannel('sources:update')!.mutating).toBe(true);
    expect(getChannel('sources:delete')!.mutating).toBe(true);
    expect(getChannel('citations:create')!.mutating).toBe(true);
    expect(getChannel('citations:update')!.mutating).toBe(true);
    expect(getChannel('citations:delete')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('sources:get')!.mutating).toBeFalsy();
    expect(getChannel('sources:list')!.mutating).toBeFalsy();
    expect(getChannel('sources:search')!.mutating).toBeFalsy();
    expect(getChannel('citations:get')!.mutating).toBeFalsy();
    expect(getChannel('citations:forSource')!.mutating).toBeFalsy();
    expect(getChannel('citations:forEvent')!.mutating).toBeFalsy();
    expect(getChannel('citations:forPerson')!.mutating).toBeFalsy();
    expect(getChannel('citations:forRelationship')!.mutating).toBeFalsy();
    expect(getChannel('citations:forPlace')!.mutating).toBeFalsy();
  });
});

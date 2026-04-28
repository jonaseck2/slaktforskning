import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('events channel registry', () => {
  it('registers all events:* channels', () => {
    const eventChannels = listChannels().filter(c => c.startsWith('events:'));
    expect(eventChannels.length).toBe(7);
  });

  it('events:get is a worker channel', () => {
    const ch = getChannel('events:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    expect(getChannel('events:create')!.mutating).toBe(true);
    expect(getChannel('events:update')!.mutating).toBe(true);
    expect(getChannel('events:delete')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('events:get')!.mutating).toBeFalsy();
    expect(getChannel('events:forPerson')!.mutating).toBeFalsy();
    expect(getChannel('events:forRelationship')!.mutating).toBeFalsy();
    expect(getChannel('events:forPlace')!.mutating).toBeFalsy();
  });
});

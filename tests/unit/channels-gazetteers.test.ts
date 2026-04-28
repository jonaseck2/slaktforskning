import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('gazetteers channel registry', () => {
  it('registers all gazetteers:* channels', () => {
    const gazChannels = listChannels().filter(c => c.startsWith('gazetteers:'));
    expect(gazChannels.length).toBe(7);
  });

  it('DB-backed channels are worker channels', () => {
    expect(getChannel('gazetteers:list')!.thread).toBe('worker');
    expect(getChannel('gazetteers:import')!.thread).toBe('worker');
    expect(getChannel('gazetteers:export')!.thread).toBe('worker');
    expect(getChannel('gazetteers:delete')!.thread).toBe('worker');
    expect(getChannel('gazetteers:getImported')!.thread).toBe('worker');
  });

  it('pure function channels are main-thread channels', () => {
    expect(getChannel('gazetteers:getSchema')!.thread).toBe('main');
    expect(getChannel('gazetteers:getBundled')!.thread).toBe('main');
  });

  it('mutating channels are flagged correctly', () => {
    expect(getChannel('gazetteers:import')!.mutating).toBe(true);
    expect(getChannel('gazetteers:delete')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('gazetteers:list')!.mutating).toBeFalsy();
    expect(getChannel('gazetteers:export')!.mutating).toBeFalsy();
    expect(getChannel('gazetteers:getImported')!.mutating).toBeFalsy();
    expect(getChannel('gazetteers:getSchema')!.mutating).toBeFalsy();
    expect(getChannel('gazetteers:getBundled')!.mutating).toBeFalsy();
  });
});

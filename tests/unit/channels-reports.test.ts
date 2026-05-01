import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('reports & duplicates channel registry', () => {
  it('registers all reports:* channels', () => {
    const reportChannels = listChannels().filter(c => c.startsWith('reports:'));
    expect(reportChannels.length).toBe(7);
  });

  it('registers all duplicates:* channels', () => {
    const dupChannels = listChannels().filter(c => c.startsWith('duplicates:'));
    expect(dupChannels.length).toBe(5);
  });

  it('reports:personSummary is a worker channel', () => {
    const ch = getChannel('reports:personSummary');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    expect(getChannel('duplicates:merge')!.mutating).toBe(true);
    expect(getChannel('duplicates:ignore')!.mutating).toBe(true);
    // All report channels are read-only
    expect(getChannel('reports:personSummary')!.mutating).toBeFalsy();
    expect(getChannel('reports:familyUnit')!.mutating).toBeFalsy();
    expect(getChannel('reports:ancestorTree')!.mutating).toBeFalsy();
    expect(getChannel('reports:placeHistory')!.mutating).toBeFalsy();
    expect(getChannel('reports:researchGaps')!.mutating).toBeFalsy();
    expect(getChannel('reports:timeline')!.mutating).toBeFalsy();
    expect(getChannel('reports:aliveInYear')!.mutating).toBeFalsy();
    expect(getChannel('duplicates:find')!.mutating).toBeFalsy();
    expect(getChannel('duplicates:count')!.mutating).toBeFalsy();
  });
});

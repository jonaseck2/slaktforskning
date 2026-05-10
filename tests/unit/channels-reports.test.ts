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
    // 5 person channels (find/findPage/count/merge/ignore) + 4 places +
    // 4 sources + 3 media = 16 total. Bumped from 5 when the duplicates
    // panel was extended across places, sources, and media (v0.249.0).
    expect(dupChannels.length).toBe(16);
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

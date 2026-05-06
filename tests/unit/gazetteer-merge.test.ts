import { describe, it, expect, vi } from 'vitest';
import { mergeTree, buildNodeIndex, loadGazetteers } from '../../src/api/place-gazetteers/merge';
import type { Gazetteer, GazetteerNode } from '../../src/api/place-gazetteers/types';

function makeWorld(children: GazetteerNode[]): GazetteerNode {
  return { name: 'World', type: 'world', lat: 0, lon: 0, children };
}

describe('mergeTree (structural merge by name+type)', () => {
  it('merges two same-name+type nodes into one with unioned aliases', () => {
    const acc = makeWorld([{
      name: 'Europe', type: 'continent', lat: 50, lon: 10,
      children: [{ name: 'Sweden', type: 'country', lat: 62, lon: 15, aliases: ['SE'] }],
    }]);
    const source = makeWorld([{
      name: 'Europe', type: 'continent', lat: 50, lon: 10,
      children: [{ name: 'Sweden', type: 'country', lat: 62, lon: 15, aliases: ['Sverige'] }],
    }]);
    mergeTree(acc, source, 'gz-2');

    const sweden = acc.children![0].children![0];
    expect(sweden.aliases).toEqual(expect.arrayContaining(['SE', 'Sverige']));
  });

  it('keeps name+type collisions distinct when name differs', () => {
    const acc = makeWorld([
      { name: 'Sweden', type: 'country', lat: 62, lon: 15 },
    ]);
    const source = makeWorld([
      { name: 'Norway', type: 'country', lat: 60, lon: 10 },
    ]);
    mergeTree(acc, source, 'gz-2');
    expect(acc.children!.map(c => c.name).sort()).toEqual(['Norway', 'Sweden']);
  });

  it('keeps name+type collisions distinct when type differs (admin1 Jönköping vs admin2 Jönköping)', () => {
    const acc = makeWorld([{
      name: 'Sweden', type: 'country', lat: 62, lon: 15,
      children: [
        { name: 'Jönköping', type: 'admin1', lat: 57.7, lon: 14.2 },
      ],
    }]);
    const source = makeWorld([{
      name: 'Sweden', type: 'country', lat: 62, lon: 15,
      children: [
        { name: 'Jönköping', type: 'admin1', lat: 57.7, lon: 14.2,
          children: [{ name: 'Jönköping', type: 'admin2', lat: 57.78, lon: 14.16 }] },
      ],
    }]);
    mergeTree(acc, source, 'gz-2');
    const sweden = acc.children![0];
    const jonkoping1 = sweden.children![0];
    expect(jonkoping1.type).toBe('admin1');
    expect(jonkoping1.children![0].type).toBe('admin2');
  });

  it('records contributors on every merged node', () => {
    const acc = makeWorld([{
      name: 'Sweden', type: 'country', lat: 62, lon: 15,
      children: [{ name: 'Jönköping', type: 'admin1', lat: 57.7, lon: 14.2 }],
    }]);
    mergeTree(acc, makeWorld([
      { name: 'Sweden', type: 'country', lat: 62, lon: 15,
        children: [{ name: 'Eksjö', type: 'admin2', lat: 57.7, lon: 14.97 }] },
    ]), 'sv-orter');
    mergeTree(acc, makeWorld([
      { name: 'Sweden', type: 'country', lat: 62, lon: 15,
        children: [{ name: 'Eksjö', type: 'admin2', lat: 57.7, lon: 14.97 }] },
    ]), 'sv-socknar');
    const sweden = acc.children![0];
    const eksjo = sweden.children!.find(c => c.name === 'Eksjö')! as GazetteerNode & { __contributors?: string[] };
    expect(eksjo.__contributors).toEqual(expect.arrayContaining(['sv-orter', 'sv-socknar']));
  });

  it('first-wins on lat/lon when sources diverge', () => {
    // Note: console.warn on >0.01° divergence is opt-in via
    // SLAKTFORSKNING_GAZETTEER_DEBUG=1 (off by default — the warning
    // floods the terminal during multi-source merges, see merge.ts).
    // The user-observable contract is first-wins; the warn is a triage
    // helper and not asserted here.
    const acc = makeWorld([{ name: 'Sweden', type: 'country', lat: 62.0, lon: 15.0 }]);
    mergeTree(acc, makeWorld([{ name: 'Sweden', type: 'country', lat: 62.05, lon: 15.05 }]), 'gz-2');
    expect(acc.children![0].lat).toBe(62.0);
    expect(acc.children![0].lon).toBe(15.0);
  });

  it('throws if accumulator/source roots have different name or type', () => {
    const acc = { name: 'World', type: 'world', lat: 0, lon: 0 } as GazetteerNode & { __contributors?: string[] };
    const wrongName: GazetteerNode = { name: 'Globe', type: 'world', lat: 0, lon: 0 };
    expect(() => mergeTree(acc, wrongName, 'g')).toThrow(/root mismatch/);
  });
});

describe('buildNodeIndex', () => {
  it('indexes nodes by lowercased path; case-insensitive lookup', () => {
    const root: GazetteerNode = {
      name: 'World', type: 'world', lat: 0, lon: 0,
      children: [
        { name: 'Europe', type: 'continent', lat: 50, lon: 10, children: [
          { name: 'Sweden', type: 'country', lat: 62, lon: 15 },
        ]},
      ],
    };
    const idx = buildNodeIndex([root]);
    expect(idx.lookup(['World', 'Europe', 'Sweden'])?.name).toBe('Sweden');
    expect(idx.lookup(['world', 'europe', 'sweden'])?.name).toBe('Sweden');
    expect(idx.lookup(['World', 'Atlantis'])).toBeNull();
  });
});

describe('loadGazetteers (structural-merge engine)', () => {
  const swedenA: Gazetteer = {
    id: 'sv-a', name: 'A', locale: 'sv',
    root: { name: 'World', type: 'world', lat: 0, lon: 0, children: [
      { name: 'Europe', type: 'continent', lat: 54, lon: 15, children: [
        { name: 'Sweden', type: 'country', lat: 62, lon: 15, aliases: ['Sverige'], children: [
          { name: 'Jönköping', type: 'admin1', lat: 57.7, lon: 14.2, aliases: ['Jönköpings län'] },
        ]},
      ]},
    ]},
  };
  const swedenB: Gazetteer = {
    id: 'sv-b', name: 'B', locale: 'sv',
    root: { name: 'World', type: 'world', lat: 0, lon: 0, children: [
      { name: 'Europe', type: 'continent', lat: 54, lon: 15, children: [
        { name: 'Sweden', type: 'country', lat: 62, lon: 15, children: [
          { name: 'Jönköping', type: 'admin1', lat: 57.7, lon: 14.2, children: [
            { name: 'Eksjö', type: 'admin2', lat: 57.66, lon: 14.97, aliases: ['Eksjö kommun'] },
          ]},
        ]},
      ]},
    ]},
  };

  it('merges two enabled gazetteers into one tree with unioned aliases', () => {
    const result = loadGazetteers({ enabledGazetteers: ['sv-a', 'sv-b'] }, [swedenA, swedenB]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('__merged__');

    const sweden = result[0].root!.children![0].children![0];
    expect(sweden.name).toBe('Sweden');
    expect(sweden.aliases).toContain('Sverige');

    const jonkoping = sweden.children!.find(c => c.name === 'Jönköping' && c.type === 'admin1')!;
    expect(jonkoping.aliases).toContain('Jönköpings län');

    const eksjo = jonkoping.children!.find(c => c.name === 'Eksjö')!;
    expect(eksjo.type).toBe('admin2');
    expect(eksjo.aliases).toContain('Eksjö kommun');
  });

  it('only loads enabled gazetteers (no fixture privilege)', () => {
    const result = loadGazetteers({ enabledGazetteers: ['sv-a'] }, [swedenA, swedenB]);
    const sweden = result[0].root!.children![0].children![0];
    const jonkoping = sweden.children![0];
    // sv-b is disabled — Eksjö should not appear
    expect(jonkoping.children?.find(c => c.name === 'Eksjö')).toBeUndefined();
  });

  it('exposes multiple roots via allRoots when historical sibling tree is also present', () => {
    const historical: Gazetteer = {
      id: 'hist', name: 'Hist', locale: 'en',
      root: { name: 'World (Historical)', type: 'world', lat: 0, lon: 0, children: [
        { name: 'Holy Roman Empire', type: 'historical-state', lat: 50, lon: 10 },
      ]},
    };
    const result = loadGazetteers({ enabledGazetteers: ['sv-a', 'hist'] }, [swedenA, historical]);
    const meta = result[0] as Gazetteer & { allRoots?: GazetteerNode[] };
    expect(meta.allRoots?.map(r => r.name).sort()).toEqual(['World', 'World (Historical)']);
  });
});

import { describe, it, expect } from 'vitest';
import { attachContributions, buildScaffoldingIndex } from '../../src/api/place-gazetteers/merge';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

const worldCountries: Gazetteer = {
  id: 'world-countries', name: 'World Countries', locale: 'en',
  shape: 'scaffolding',
  root: {
    name: 'World', type: 'world', lat: 0, lon: 0,
    children: [
      { name: 'Europe', type: 'continent', lat: 50, lon: 10, children: [
        { name: 'Sweden', type: 'country', lat: 62, lon: 15 },
        { name: 'Denmark', type: 'country', lat: 56, lon: 10 },
      ]},
    ],
  },
};

describe('buildScaffoldingIndex', () => {
  it('indexes every node by canonical lowercased path', () => {
    const idx = buildScaffoldingIndex([worldCountries]);
    expect(idx.lookup(['World'])?.name).toBe('World');
    expect(idx.lookup(['World', 'Europe'])?.name).toBe('Europe');
    expect(idx.lookup(['World', 'Europe', 'Sweden'])?.name).toBe('Sweden');
    expect(idx.lookup(['World', 'Europe', 'Antarctica'])).toBeNull();
  });

  it('lookup is case-insensitive on each segment', () => {
    const idx = buildScaffoldingIndex([worldCountries]);
    expect(idx.lookup(['world', 'europe', 'sweden'])?.name).toBe('Sweden');
  });
});

describe('attachContributions', () => {
  it('attaches contribution nodes under the resolved scaffolding parent', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const g: Gazetteer = {
      id: 'sv-orter', name: 'SE places', locale: 'sv', shape: 'contributions',
      contributions: [{
        parentPath: ['World', 'Europe', 'Sweden'],
        nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.66, lon: 14.97 }],
      }],
    };
    const report = attachContributions([g], idx);
    expect(report.attached).toBe(1);
    expect(report.rejected).toEqual([]);
    const sweden = idx.lookup(['World', 'Europe', 'Sweden'])!;
    const eksjo = sweden.children!.find(c => c.name === 'Eksjö')!;
    expect((eksjo as { __gazetteer?: string }).__gazetteer).toBe('sv-orter');
  });

  it('rejects contributions whose parentPath does not resolve', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const bogus: Gazetteer = {
      id: 'eg-test', name: 'Egypt test', locale: 'ar', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Africa', 'Egypta'], nodes: [{ name: 'Cairo', type: 'locality', lat: 30, lon: 31 }] }],
    };
    const report = attachContributions([bogus], idx);
    expect(report.attached).toBe(0);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]).toMatchObject({ gazetteer: 'eg-test', parentPath: ['World', 'Africa', 'Egypta'] });
  });

  it('keeps same-name contributions from different sources as DISTINCT siblings (no merge)', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const a: Gazetteer = {
      id: 'sv-socknar', name: 'A', locale: 'sv', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'],
        nodes: [{ name: 'Eksjö', type: 'parish', lat: 57.66, lon: 14.97, aliases: ['Eksjö civil'] }] }],
    };
    const b: Gazetteer = {
      id: 'sv-forsamlingar', name: 'B', locale: 'sv', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'],
        nodes: [{ name: 'Eksjö', type: 'parish', lat: 57.67, lon: 14.98, aliases: ['Eksjö church'] }] }],
    };
    attachContributions([a, b], idx);
    const sweden = idx.lookup(['World', 'Europe', 'Sweden'])!;
    const matches = sweden.children!.filter(c => c.name === 'Eksjö' && c.type === 'parish');
    expect(matches).toHaveLength(2);
    const sources = matches.map(m => (m as { __gazetteer?: string }).__gazetteer).sort();
    expect(sources).toEqual(['sv-forsamlingar', 'sv-socknar']);
    // Each leaf keeps ITS OWN coords and aliases — no union, no overwrite.
    const fromA = matches.find(m => (m as any).__gazetteer === 'sv-socknar')!;
    const fromB = matches.find(m => (m as any).__gazetteer === 'sv-forsamlingar')!;
    expect(fromA.lat).toBeCloseTo(57.66);
    expect(fromB.lat).toBeCloseTo(57.67);
    expect(fromA.aliases).toEqual(['Eksjö civil']);
    expect(fromB.aliases).toEqual(['Eksjö church']);
  });
});

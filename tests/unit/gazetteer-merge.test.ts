import { describe, it, expect } from 'vitest';
import { buildScaffoldingIndex } from '../../src/api/place-gazetteers/merge';
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

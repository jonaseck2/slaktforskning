import { describe, it, expect } from 'vitest';
import { GAZETTEER_NODE_TYPES, isGazetteerNodeType } from '../../src/api/place-gazetteers/types';
import type { Gazetteer, Contribution } from '../../src/api/place-gazetteers/types';

describe('GazetteerNodeType', () => {
  it('exports the canonical closed vocabulary', () => {
    expect(GAZETTEER_NODE_TYPES).toEqual([
      'world', 'continent', 'country', 'admin1', 'admin2', 'admin3', 'admin4',
      'locality', 'parish', 'farm', 'church', 'city', 'landskap',
      'historical-state', 'other',
    ]);
  });

  it('isGazetteerNodeType accepts valid values', () => {
    expect(isGazetteerNodeType('country')).toBe(true);
    expect(isGazetteerNodeType('admin1')).toBe(true);
    expect(isGazetteerNodeType('parish')).toBe(true);
  });

  it('isGazetteerNodeType rejects invalid values', () => {
    expect(isGazetteerNodeType('municipality')).toBe(false);
    expect(isGazetteerNodeType('sogn')).toBe(false);
    expect(isGazetteerNodeType('')).toBe(false);
  });
});

describe('Contribution shape', () => {
  it('a scaffolding gazetteer has root and shape="scaffolding"', () => {
    const g: Gazetteer = {
      id: 'world-countries', name: 'World Countries', locale: 'en',
      shape: 'scaffolding',
      root: { name: 'World', type: 'world', lat: 0, lon: 0, children: [] },
    };
    expect(g.shape).toBe('scaffolding');
    expect(g.root).toBeDefined();
  });

  it('a contribution gazetteer has contributions and shape="contributions"', () => {
    const c: Contribution = {
      parentPath: ['World', 'Europe', 'Sweden', 'Jönköpings län', 'Eksjö kommun'],
      nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.66643, lon: 14.97205 }],
    };
    const g: Gazetteer = {
      id: 'sv-orter', name: 'Swedish Populated Places', locale: 'sv',
      shape: 'contributions',
      contributions: [c],
    };
    expect(g.shape).toBe('contributions');
    expect(g.contributions?.[0].parentPath).toHaveLength(5);
  });

  it('a language gazetteer has translations and shape="language"', () => {
    const g: Gazetteer = {
      id: 'lang-sv-geonames', name: 'Swedish translations', locale: 'sv',
      shape: 'language', kind: 'language',
      translations: { 'world-countries': { Denmark: ['Danmark'] } },
    };
    expect(g.shape).toBe('language');
  });
});

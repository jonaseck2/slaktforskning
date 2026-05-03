import { describe, it, expect } from 'vitest';
import { GAZETTEER_NODE_TYPES, isGazetteerNodeType } from '../../src/api/place-gazetteers/types';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

describe('GazetteerNodeType', () => {
  it('exports the documented fixed names (world, continent, country, admin1..admin4)', () => {
    expect(GAZETTEER_NODE_TYPES).toEqual([
      'world', 'continent', 'country', 'admin1', 'admin2', 'admin3', 'admin4',
    ]);
  });

  it('isGazetteerNodeType accepts the fixed names', () => {
    expect(isGazetteerNodeType('world')).toBe(true);
    expect(isGazetteerNodeType('continent')).toBe(true);
    expect(isGazetteerNodeType('country')).toBe(true);
    expect(isGazetteerNodeType('admin1')).toBe(true);
    expect(isGazetteerNodeType('admin4')).toBe(true);
  });

  it('isGazetteerNodeType accepts any positive admin level (admin5, admin10, …)', () => {
    expect(isGazetteerNodeType('admin5')).toBe(true);
    expect(isGazetteerNodeType('admin6')).toBe(true);
    expect(isGazetteerNodeType('admin99')).toBe(true);
  });

  it('isGazetteerNodeType rejects malformed admin levels', () => {
    expect(isGazetteerNodeType('admin')).toBe(false);
    expect(isGazetteerNodeType('admin0')).toBe(false);          // 0 is not a valid level
    expect(isGazetteerNodeType('admin01')).toBe(false);         // leading zero
    expect(isGazetteerNodeType('admin-1')).toBe(false);
    expect(isGazetteerNodeType('admin1.5')).toBe(false);
    expect(isGazetteerNodeType('Admin1')).toBe(false);          // case-sensitive
  });

  it('isGazetteerNodeType rejects non-admin types (no leaf-type vocabulary)', () => {
    expect(isGazetteerNodeType('municipality')).toBe(false);
    expect(isGazetteerNodeType('locality')).toBe(false);
    expect(isGazetteerNodeType('parish')).toBe(false);
    expect(isGazetteerNodeType('sogn')).toBe(false);
    expect(isGazetteerNodeType('')).toBe(false);
  });
});

describe('Gazetteer shape', () => {
  it('a regular gazetteer has root + shape (or omits shape)', () => {
    const g: Gazetteer = {
      id: 'world-countries', name: 'World Countries', locale: 'en',
      root: { name: 'World', type: 'world', lat: 0, lon: 0, children: [] },
    };
    expect(g.root).toBeDefined();
  });

  it('a language gazetteer has translations and shape="language"', () => {
    const g: Gazetteer = {
      id: 'lang-sv-geonames', name: 'Swedish translations', locale: 'sv',
      shape: 'language', kind: 'language',
      translations: { '__merged__': { 'World › Europe › Denmark': ['Danmark'] } },
    };
    expect(g.shape).toBe('language');
  });
});

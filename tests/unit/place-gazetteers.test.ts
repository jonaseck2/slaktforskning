import { describe, it, expect } from 'vitest';
import {
  resolvePlace,
  resolveBoundary,
  resolveHierarchical,
  tokenizePlaceString,
} from '../../src/api/place-gazetteers/resolver';
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import type { Gazetteer, GazetteerConfig } from '../../src/api/place-gazetteers/types';

const svGazetteer: Gazetteer = {
  id: 'sv-parishes',
  name: 'Swedish Parishes',
  locale: 'sv',
  root: {
    name: 'Sverige',
    type: 'country',
    lat: 62.0,
    lon: 15.0,
    children: [
      {
        name: 'Jönköpings län',
        type: 'county',
        aliases: ['Jönköping'],
        lat: 57.78,
        lon: 14.16,
        children: [
          {
            name: 'Sävsjö',
            type: 'municipality',
            lat: 57.40,
            lon: 14.66,
            children: [
              {
                name: 'Vallsjö',
                type: 'parish',
                aliases: ['Wallsjö', 'Vallsjö församling'],
                lat: 57.42,
                lon: 14.72,
              },
            ],
          },
        ],
      },
      {
        name: 'Kronobergs län',
        type: 'county',
        lat: 56.88,
        lon: 14.81,
        children: [
          {
            name: 'Växjö',
            type: 'municipality',
            lat: 56.88,
            lon: 14.81,
            children: [
              {
                name: 'Växjö',
                type: 'parish',
                lat: 56.88,
                lon: 14.81,
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('resolvePlace', () => {
  it('returns null for empty string', () => {
    expect(resolvePlace('', [svGazetteer])).toBeNull();
  });

  it('matches a full 4-level Swedish place string (exact)', () => {
    const result = resolvePlace('Vallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
    expect(result!.lat).toBe(57.42);
    expect(result!.lon).toBe(14.72);
    expect(result!.matchDepth).toBe(4);
    expect(result!.unmatchedComponents).toEqual([]);
    expect(result!.gazetteer).toBe('sv-parishes');
  });

  it('matches via alias (Wallsjö)', () => {
    const result = resolvePlace('Wallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('matches county alias (Jönköping instead of Jönköpings län)', () => {
    const result = resolvePlace('Vallsjö, Sävsjö, Jönköping, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
  });

  it('returns partial match when only county + country match', () => {
    const result = resolvePlace('Okänd socken, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('partial');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län']);
    expect(result!.lat).toBe(57.78);
    expect(result!.lon).toBe(14.16);
    expect(result!.unmatchedComponents).toEqual(['Okänd socken']);
  });

  it('returns partial match for country-only match', () => {
    const result = resolvePlace('Ingenstans, Okänt, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('partial');
    expect(result!.matchedPath).toEqual(['Sverige']);
    expect(result!.unmatchedComponents).toEqual(['Ingenstans', 'Okänt']);
  });

  it('returns null when nothing matches', () => {
    expect(resolvePlace('London, England', [svGazetteer])).toBeNull();
  });

  it('handles suffix stripping (Vallsjö församling)', () => {
    const result = resolvePlace('Vallsjö församling, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
  });

  it('strips trailing punctuation so abbreviated/typo inputs still match', () => {
    // "Vallsjö." with a stray period is otherwise the same input as "Vallsjö".
    const result = resolvePlace('Vallsjö., Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('returns null for empty gazetteers array', () => {
    expect(resolvePlace('Vallsjö, Sverige', [])).toBeNull();
  });

  it('matches when components are a subset (parish + country, skip middle)', () => {
    const result = resolvePlace('Vallsjö, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('prefers deeper hierarchy match over shallow one', () => {
    const gazetteer: Gazetteer = {
      id: 'test',
      name: 'Test',
      locale: 'sv',
      root: {
        name: 'Sverige', type: 'country', lat: 62, lon: 15,
        children: [{
          name: 'Dalarnas län', type: 'county', lat: 61, lon: 15, aliases: ['Kopparbergs län', 'Kopparbergs'],
          children: [
            {
              name: 'Smedjebackens kommun', type: 'municipality', lat: 60.14, lon: 15.39,
              children: [{
                name: 'Malingsbo', type: 'locality', lat: 59.99, lon: 15.59,
              }],
            },
            {
              name: 'Älvdalens kommun', type: 'municipality', lat: 61.23, lon: 14.04,
              children: [{
                name: 'Bruket', type: 'locality', lat: 61.22, lon: 14.07,
              }],
            },
          ],
        }],
      },
    };
    // Without genitive fuzzy, "Smedjebacken" doesn't match "Smedjebackens kommun",
    // so both Malingsbo and Bruket paths match 3 components each — result is ambiguous.
    const result = resolvePlace('Bruket, Malingsbo, Smedjebacken, Kopparbergs län, Sverige', [gazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('ambiguous');
    // But using the full municipality name resolves correctly
    const exact = resolvePlace('Malingsbo, Smedjebackens kommun, Kopparbergs län, Sverige', [gazetteer]);
    expect(exact).not.toBeNull();
    expect(exact!.matchedNode.name).toBe('Malingsbo');
    expect(exact!.matchQuality).toBe('exact');
  });

  it('reports ambiguous when same name exists in multiple branches', () => {
    const gazetteerWithDup: Gazetteer = {
      ...svGazetteer,
      root: {
        ...svGazetteer.root,
        children: [
          ...svGazetteer.root.children!,
          {
            name: 'Testläns län',
            type: 'county',
            lat: 58.0,
            lon: 15.0,
            children: [{
              name: 'Vallsjö',
              type: 'parish',
              lat: 58.1,
              lon: 15.1,
            }],
          },
        ],
      },
    };
    const result = resolvePlace('Vallsjö, Sverige', [gazetteerWithDup]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('ambiguous');
  });
});

const boundaryGazetteer: Gazetteer = {
  id: 'sv-boundaries',
  name: 'Swedish Parish Boundaries',
  locale: 'sv',
  kind: 'boundary',
  root: {
    name: 'Sverige', type: 'country', lat: 62.0, lon: 15.0,
    children: [{
      name: 'Jönköpings län', type: 'county', lat: 57.78, lon: 14.16,
      aliases: ['Jönköping'],
      children: [{
        name: 'Sävsjö', type: 'municipality', lat: 57.40, lon: 14.66,
        children: [{
          name: 'Vallsjö', type: 'parish', lat: 57.42, lon: 14.72,
          aliases: ['Wallsjö', 'Vallsjö församling'],
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[14.6, 57.3], [14.8, 57.3], [14.8, 57.5], [14.6, 57.5], [14.6, 57.3]]],
          },
        }],
      }],
    }],
  },
};

describe('resolveBoundary', () => {
  it('returns null for empty string', () => {
    expect(resolveBoundary('', [boundaryGazetteer])).toBeNull();
  });

  it('returns null when no boundary gazetteers provided', () => {
    expect(resolveBoundary('Vallsjö, Sverige', [svGazetteer])).toBeNull();
  });

  it('returns null for empty gazetteers array', () => {
    expect(resolveBoundary('Vallsjö, Sverige', [])).toBeNull();
  });

  it('resolves boundary for exact parish match', () => {
    const result = resolveBoundary('Vallsjö, Sävsjö, Jönköpings län, Sverige', [boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.nodeType).toBe('parish');
    expect(result!.geometry.type).toBe('Polygon');
  });

  it('returns null when matched node has no geometry', () => {
    const result = resolveBoundary('Jönköpings län, Sverige', [boundaryGazetteer]);
    expect(result).toBeNull();
  });

  it('resolves boundary with partial match (parish + country)', () => {
    const result = resolveBoundary('Vallsjö, Sverige', [boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe('Polygon');
  });

  it('filters out point gazetteers from mixed array', () => {
    const result = resolveBoundary('Vallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer, boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe('Polygon');
  });
});

// Minimal world gazetteer for testing language merge
const worldGazetteer: Gazetteer = {
  id: 'world-countries',
  name: 'World Countries',
  locale: 'en',
  root: {
    name: 'World',
    type: 'root',
    lat: 0,
    lon: 0,
    children: [
      { name: 'Denmark', type: 'country', aliases: ['DK', 'DNK'], lat: 56.0, lon: 10.0 },
      { name: 'Germany', type: 'country', aliases: ['DE', 'DEU'], lat: 51.0, lon: 9.0,
        children: [
          { name: 'Bavaria', type: 'admin1', lat: 48.8, lon: 11.5 },
        ],
      },
      { name: 'Brazil', type: 'country', aliases: ['BR', 'BRA'], lat: -10.0, lon: -55.0 },
    ],
  },
};

const langSvGeonames: Gazetteer = {
  id: 'lang-sv-geonames',
  name: 'Swedish place names (GeoNames)',
  locale: 'sv',
  kind: 'language',
  root: { name: 'sv', type: 'language', lat: 0, lon: 0 },
  translations: {
    'world-countries': {
      'Denmark': ['Danmark'],
      'Germany': ['Tyskland'],
      'Brazil': ['Brasilien'],
      'Germany > Bavaria': ['Bayern'],
    },
  },
};

describe('language gazetteer merge', () => {
  it('injects translations as aliases so resolver matches Swedish names', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers(), [worldGazetteer, langSvGeonames]);

    // Only point/boundary gazetteers returned, not language ones
    expect(gazetteers).toHaveLength(1);
    expect(gazetteers[0].id).toBe('world-countries');

    // "Danmark" should now resolve to Denmark
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(56.0);
    expect(result!.lon).toBe(10.0);
    expect(result!.matchedPath).toContain('Denmark');
  });

  it('resolves path-keyed translations (Germany > Bavaria -> Bayern)', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers(), [worldGazetteer, langSvGeonames]);

    const result = resolvePlace('Bayern, Tyskland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(48.8);
    expect(result!.matchQuality).toBe('exact');
  });

  it('does not duplicate aliases that already exist', () => {
    const langWithExisting: Gazetteer = {
      ...langSvGeonames,
      translations: {
        'world-countries': {
          'Denmark': ['DK'],  // DK already exists as alias
        },
      },
    };
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers(), [worldGazetteer, langWithExisting]);
    const dk = gazetteers[0].root.children!.find(c => c.name === 'Denmark')!;
    // Should not have duplicate 'DK'
    expect(dk.aliases!.filter(a => a === 'DK')).toHaveLength(1);
  });

  it('skips translations targeting a gazetteer that is not enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['lang-sv-geonames'] };
    // Only language gaz enabled, no target — should return empty
    const gazetteers = loadGazetteers(config, getAllGazetteers(), [worldGazetteer, langSvGeonames]);
    expect(gazetteers).toHaveLength(0);
  });

  it('without language gazetteer, Swedish names do not resolve', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers(), [worldGazetteer]);
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).toBeNull();
  });
});

describe('loadGazetteers', () => {
  it('returns empty array when no gazetteers enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: [] };
    const result = loadGazetteers(config, getAllGazetteers());
    expect(result).toEqual([]);
  });

  it('returns sv-socknar when enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar'] };
    const result = loadGazetteers(config, getAllGazetteers());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sv-socknar');
    expect(result[0].root.name).toBe('Sverige');
    expect(result[0].root.children!.length).toBeGreaterThan(0);
  });

  it('returns both Swedish gazetteers when both enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar', 'sv-forsamlingar'] };
    const result = loadGazetteers(config, getAllGazetteers());
    expect(result).toHaveLength(2);
    expect(result.map(g => g.id).sort()).toEqual(['sv-forsamlingar', 'sv-socknar']);
  });

  it('getAllGazetteers returns all bundled gazetteers', () => {
    const all = getAllGazetteers();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.find(g => g.id === 'sv-socknar')).toBeDefined();
    expect(all.find(g => g.id === 'sv-forsamlingar')).toBeDefined();
  });
});

describe('language gazetteer integration', () => {
  it('resolves "Danmark" when lang-sv-geonames is enabled with world-countries', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Denmark');
    expect(result!.matchQuality).not.toBe('ambiguous');
  });

  it('resolves "Brasilien" when lang-sv-geonames is enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('Brasilien', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Brazil');
  });

  it('resolves "São Paulo, Brasilien" as exact match with world-admin1', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-admin1', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('São Paulo, Brasilien', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Brazil');
    expect(result!.matchQuality).toBe('exact');
  });

  it('does not resolve "Danmark" without language gazetteer', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('Danmark', gazetteers);
    expect(result).toBeNull();
  });
});

describe('hierarchy-aware matching', () => {
  it('prefers country match over leaf match when input has hierarchical context', () => {
    // "Dirleton, East Lothian, Skottland" should match Scotland (via language alias)
    // not the Canadian locality named Dirleton, because "Skottland" anchors the hierarchy
    const config: GazetteerConfig = {
      enabledGazetteers: ['ca-provinces', 'world-admin1', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('Dirleton, East Lothian, Skottland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Scotland');
    expect(result!.matchedPath).toContain('United Kingdom');
  });

  it('still matches leaf when input has no hierarchical context', () => {
    // Plain "Dirleton" should still match the Canadian locality (exact leaf match)
    const config: GazetteerConfig = {
      enabledGazetteers: ['ca-provinces', 'world-admin1', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('Dirleton', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toContain('Dirleton');
  });

  it('prefers Scotland over US Pennington for "Tulliochie, Pennington, Skottland"', () => {
    // "Skottland" (Swedish for Scotland) as the last component should anchor to Scotland,
    // not resolve to Pennington County in the US
    const config: GazetteerConfig = {
      enabledGazetteers: ['us-all-states', 'world-admin1', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('Tulliochie, Pennington, Skottland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Scotland');
    expect(result!.matchedPath).toContain('United Kingdom');
    expect(result!.gazetteer).toBe('world-admin1');
  });

  it('prefers USA over Canadian leaf for "Hudson Bay, Long Island, USA"', () => {
    const config: GazetteerConfig = {
      enabledGazetteers: ['ca-provinces', 'us-all-states', 'world-countries', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('Hudson Bay, Long Island, USA', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('United States');
  });

  it('prefers the state stem over a same-named leaf CDP (California, USA)', () => {
    // "California, USA" should resolve to California the state, not the
    // tiny CDP "California" inside Saint Mary's County, Maryland. Both
    // are legitimate matches so the result is still flagged ambiguous,
    // but the coordinates returned must be the state, not the CDP.
    const config: GazetteerConfig = {
      enabledGazetteers: ['us-all-states'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = resolvePlace('California, USA', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toEqual(['United States', 'California']);
    expect(result!.matchedNode.name).toBe('California');
    expect(result!.matchedNode.type).toBe('state');
    expect(result!.matchDepth).toBe(2);
  });
});

describe('tokenizePlaceString', () => {
  it('splits on commas and trims', () => {
    expect(tokenizePlaceString('Hörningsholm, Mosås')).toEqual(['Hörningsholm', 'Mosås']);
  });

  it('extracts parenthesized tokens as separate components', () => {
    expect(tokenizePlaceString('Solna (B)')).toEqual(['Solna', 'B']);
  });

  it('handles mixed commas and parens — Bengt #27', () => {
    expect(tokenizePlaceString('Hörningsholm, Mosås (T)')).toEqual([
      'Hörningsholm',
      'Mosås',
      'T',
    ]);
  });

  it('returns empty for empty input', () => {
    expect(tokenizePlaceString('')).toEqual([]);
    expect(tokenizePlaceString('  ')).toEqual([]);
  });

  it('preserves multi-word tokens', () => {
    expect(tokenizePlaceString('Stockholms Matteus församling')).toEqual([
      'Stockholms Matteus församling',
    ]);
  });

  it('handles multiple parens in one part', () => {
    expect(tokenizePlaceString('Foo (A) (BD)')).toEqual(['Foo', 'A', 'BD']);
  });
});

describe('resolveHierarchical', () => {
  // Build a small Swedish gazetteer with two distinct counties to verify
  // that the right-to-left walk constrains where the next match looks.
  const svHier: Gazetteer = {
    id: 'sv-test',
    name: 'Test',
    locale: 'sv',
    root: {
      name: 'Sverige', type: 'country', lat: 62, lon: 15,
      children: [
        {
          name: 'Örebro län', type: 'county', aliases: ['T'], lat: 59.27, lon: 15.21,
          children: [{
            name: 'Örebro kommun', type: 'municipality', lat: 59.27, lon: 15.21,
            children: [{
              name: 'Mosås', type: 'parish', lat: 59.21, lon: 15.18,
            }],
          }],
        },
        {
          name: 'Norrbottens län', type: 'county', aliases: ['BD'], lat: 67.0, lon: 20.0,
          children: [{
            name: 'Boden kommun', type: 'municipality', lat: 65.83, lon: 21.7,
            children: [{
              name: 'Hörningsholm', type: 'locality', lat: 65.7, lon: 21.6,
            }],
          }],
        },
      ],
    },
  };

  it('right-to-left match: "Mosås (T)" anchors on Örebro län, not Norrbotten', () => {
    const r = resolveHierarchical('Mosås (T)', [svHier]);
    expect(r.best).not.toBeNull();
    expect(r.best!.node.name).toBe('Mosås');
    expect(r.best!.path.map(n => n.name)).toEqual([
      'Sverige', 'Örebro län', 'Örebro kommun', 'Mosås',
    ]);
    expect(r.best!.unmatchedLeftTokens).toEqual([]);
  });

  it('Bengt #27: "Hörningsholm, Mosås (T)" — leaf is unmatched farm in Örebro', () => {
    const r = resolveHierarchical('Hörningsholm, Mosås (T)', [svHier]);
    expect(r.best).not.toBeNull();
    // Hörningsholm exists in Norrbotten but the (T) anchor restricts the
    // walk to Örebro län, so it should be unmatched as a leaf token.
    expect(r.best!.node.name).toBe('Mosås');
    expect(r.best!.unmatchedLeftTokens).toEqual(['Hörningsholm']);
    // Make sure we did NOT pick the Norrbotten Hörningsholm
    expect(r.best!.path.map(n => n.name)).not.toContain('Norrbottens län');
  });

  it('returns the broadest anchor when no descendant matches', () => {
    const r = resolveHierarchical('Okänd ort, T', [svHier]);
    expect(r.best).not.toBeNull();
    expect(r.best!.node.name).toBe('Örebro län');
    expect(r.best!.unmatchedLeftTokens).toEqual(['Okänd ort']);
  });

  it('returns null best when nothing matches at all', () => {
    const r = resolveHierarchical('Helt okänt', [svHier]);
    expect(r.best).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it('returns empty result for empty input', () => {
    const r = resolveHierarchical('', [svHier]);
    expect(r.best).toBeNull();
    expect(r.tokens).toEqual([]);
  });

  it('matches county letter alias from parens — Solna (B)', () => {
    // Use the bundled enrichment to verify "B" alias works in real data
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const r = resolveHierarchical('Solna (B)', gazetteers);
    expect(r.best).not.toBeNull();
    // Stockholms län has aliases AB/A/B from LAN_LETTER_CODES
    const matchedNames = r.best!.path.map(n => n.name);
    expect(matchedNames).toContain('Stockholms län');
  });

  it('full chain "Hörningsholm, Mosås, Örebro län" — broadest token is län', () => {
    const r = resolveHierarchical('Hörningsholm, Mosås, Örebro län', [svHier]);
    expect(r.best).not.toBeNull();
    expect(r.best!.node.name).toBe('Mosås');
    expect(r.best!.unmatchedLeftTokens).toEqual(['Hörningsholm']);
  });

  it('candidates are sorted best-first by tokens consumed', () => {
    const r = resolveHierarchical('Mosås (T)', [svHier]);
    expect(r.candidates.length).toBeGreaterThan(0);
    // Best (most consumed) should be first
    for (let i = 1; i < r.candidates.length; i++) {
      expect(
        r.candidates[i - 1].consumedTokens.length,
      ).toBeGreaterThanOrEqual(r.candidates[i].consumedTokens.length);
    }
  });
});

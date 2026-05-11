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

describe('resolvePlace', async () => {
  it('returns null for empty string', async () => {
    expect(await resolvePlace('', [svGazetteer])).toBeNull();
  });

  it('matches a full 4-level Swedish place string (exact)', async () => {
    const result = await resolvePlace('Vallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
    expect(result!.lat).toBe(57.42);
    expect(result!.lon).toBe(14.72);
    expect(result!.matchDepth).toBe(4);
    expect(result!.unmatchedComponents).toEqual([]);
    expect(result!.gazetteer).toBe('sv-parishes');
  });

  it('matches via alias (Wallsjö)', async () => {
    const result = await resolvePlace('Wallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('matches county alias (Jönköping instead of Jönköpings län)', async () => {
    const result = await resolvePlace('Vallsjö, Sävsjö, Jönköping, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
  });

  it('returns partial match when only county + country match', async () => {
    const result = await resolvePlace('Okänd socken, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('partial');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län']);
    expect(result!.lat).toBe(57.78);
    expect(result!.lon).toBe(14.16);
    expect(result!.unmatchedComponents).toEqual(['Okänd socken']);
  });

  it('returns partial match for country-only match', async () => {
    const result = await resolvePlace('Ingenstans, Okänt, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('partial');
    expect(result!.matchedPath).toEqual(['Sverige']);
    expect(result!.unmatchedComponents).toEqual(['Ingenstans', 'Okänt']);
  });

  it('returns null when nothing matches', async () => {
    expect(await resolvePlace('London, England', [svGazetteer])).toBeNull();
  });

  it('handles suffix stripping (Vallsjö församling)', async () => {
    const result = await resolvePlace('Vallsjö församling, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
  });

  it('strips trailing punctuation so abbreviated/typo inputs still match', async () => {
    // "Vallsjö." with a stray period is otherwise the same input as "Vallsjö".
    const result = await resolvePlace('Vallsjö., Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('returns null for empty gazetteers array', async () => {
    expect(await resolvePlace('Vallsjö, Sverige', [])).toBeNull();
  });

  it('matches when components are a subset (parish + country, skip middle)', async () => {
    const result = await resolvePlace('Vallsjö, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('prefers deeper hierarchy match over shallow one', async () => {
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
    const result = await resolvePlace('Bruket, Malingsbo, Smedjebacken, Kopparbergs län, Sverige', [gazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('ambiguous');
    // But using the full municipality name resolves correctly
    const exact = await resolvePlace('Malingsbo, Smedjebackens kommun, Kopparbergs län, Sverige', [gazetteer]);
    expect(exact).not.toBeNull();
    expect(exact!.matchedNode.name).toBe('Malingsbo');
    expect(exact!.matchQuality).toBe('exact');
  });

  it('reports ambiguous when same name exists in multiple branches', async () => {
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
    const result = await resolvePlace('Vallsjö, Sverige', [gazetteerWithDup]);
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

describe('resolveBoundary', async () => {
  it('returns null for empty string', async () => {
    expect(resolveBoundary('', [boundaryGazetteer])).toBeNull();
  });

  it('returns null when no boundary gazetteers provided', async () => {
    expect(resolveBoundary('Vallsjö, Sverige', [svGazetteer])).toBeNull();
  });

  it('returns null for empty gazetteers array', async () => {
    expect(resolveBoundary('Vallsjö, Sverige', [])).toBeNull();
  });

  it('resolves boundary for exact parish match', async () => {
    const result = resolveBoundary('Vallsjö, Sävsjö, Jönköpings län, Sverige', [boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.nodeType).toBe('parish');
    expect(result!.geometry.type).toBe('Polygon');
  });

  it('returns null when matched node has no geometry', async () => {
    const result = resolveBoundary('Jönköpings län, Sverige', [boundaryGazetteer]);
    expect(result).toBeNull();
  });

  it('resolves boundary with partial match (parish + country)', async () => {
    const result = resolveBoundary('Vallsjö, Sverige', [boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe('Polygon');
  });

  it('filters out point gazetteers from mixed array', async () => {
    const result = resolveBoundary('Vallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer, boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe('Polygon');
  });
});

// Minimal world gazetteer for testing language merge.
// Shape matches canonical hierarchy: World > continent > country.
const worldGazetteer: Gazetteer = {
  id: 'world-countries-test',
  name: 'World Countries (test fixture)',
  locale: 'en',
  root: {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [
      {
        name: 'Europe', type: 'continent', lat: 54, lon: 15,
        children: [
          { name: 'Denmark', type: 'country', aliases: ['DK', 'DNK'], lat: 56.0, lon: 10.0 },
          {
            name: 'Germany', type: 'country', aliases: ['DE', 'DEU'], lat: 51.0, lon: 9.0,
            children: [
              { name: 'Bavaria', type: 'admin1', lat: 48.8, lon: 11.5 },
            ],
          },
        ],
      },
      {
        name: 'South America', type: 'continent', lat: -15, lon: -60,
        children: [
          { name: 'Brazil', type: 'country', aliases: ['BR', 'BRA'], lat: -10.0, lon: -55.0 },
        ],
      },
    ],
  },
};

// Translation keys are canonical paths (` › `-separated) under the `__merged__` namespace.
const langSvGeonames: Gazetteer = {
  id: 'lang-sv-geonames-test',
  name: 'Swedish place names (test fixture)',
  locale: 'sv',
  shape: 'language',
  translations: {
    __merged__: {
      'World › Europe › Denmark': ['Danmark'],
      'World › Europe › Germany': ['Tyskland'],
      'World › South America › Brazil': ['Brasilien'],
      'World › Europe › Germany › Bavaria': ['Bayern'],
    },
  },
};

describe('language gazetteer merge', async () => {
  it('injects translations as aliases so resolver matches Swedish names', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries-test', 'lang-sv-geonames-test'] };
    const gazetteers = loadGazetteers(config, [], [worldGazetteer, langSvGeonames]);

    // One merged gazetteer regardless of how many sources contributed.
    expect(gazetteers).toHaveLength(1);
    expect(gazetteers[0].id).toBe('__merged__');
    expect(gazetteers[0].root.name).toBe('World');

    // "Danmark" should now resolve to Denmark
    const result = await resolvePlace('Danmark', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(56.0);
    expect(result!.lon).toBe(10.0);
    expect(result!.matchedPath).toContain('Denmark');
  });

  it('resolves path-keyed translations (Germany > Bavaria -> Bayern)', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries-test', 'lang-sv-geonames-test'] };
    const gazetteers = loadGazetteers(config, [], [worldGazetteer, langSvGeonames]);

    const result = await resolvePlace('Bayern, Tyskland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(48.8);
    expect(result!.matchQuality).toBe('exact');
  });

  it('does not duplicate aliases that already exist', async () => {
    const langWithExisting: Gazetteer = {
      ...langSvGeonames,
      translations: {
        __merged__: {
          'World › Europe › Denmark': ['DK'],  // DK already exists as alias
        },
      },
    };
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries-test', 'lang-sv-geonames-test'] };
    const gazetteers = loadGazetteers(config, [], [worldGazetteer, langWithExisting]);
    const europe = gazetteers[0].root.children!.find(c => c.name === 'Europe')!;
    const dk = europe.children!.find(c => c.name === 'Denmark')!;
    // Should not have duplicate 'DK'
    expect(dk.aliases!.filter(a => a === 'DK')).toHaveLength(1);
  });

  it('skips translations targeting a gazetteer that is not enabled', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['lang-sv-geonames-test'] };
    // Only language gaz enabled, no target — should return empty
    const gazetteers = loadGazetteers(config, [], [worldGazetteer, langSvGeonames]);
    expect(gazetteers).toHaveLength(0);
  });

  it('without language gazetteer, Swedish names do not resolve', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries-test'] };
    const gazetteers = loadGazetteers(config, [], [worldGazetteer]);
    const result = await resolvePlace('Danmark', gazetteers);
    expect(result).toBeNull();
  });
});

describe('loadGazetteers', async () => {
  it('returns empty array when no gazetteers enabled', async () => {
    const config: GazetteerConfig = { enabledGazetteers: [] };
    const result = loadGazetteers(config, getAllGazetteers());
    expect(result).toEqual([]);
  });

  it('returns one merged gazetteer rooted at World when sv-socknar enabled', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar'] };
    const result = loadGazetteers(config, getAllGazetteers());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('__merged__');
    expect(result[0].root.name).toBe('World');
    // World > Europe > Sweden
    const europe = result[0].root.children!.find(c => c.name === 'Europe');
    expect(europe).toBeDefined();
    expect(europe!.children!.find(c => c.name === 'Sweden')).toBeDefined();
  });

  it('still returns one merged gazetteer when both Swedish gazetteers enabled', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar', 'sv-forsamlingar'] };
    const result = loadGazetteers(config, getAllGazetteers());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('__merged__');
    // Both contribute to the same Sweden subtree.
    const sweden = result[0].root.children!.find(c => c.name === 'Europe')!.children!.find(c => c.name === 'Sweden');
    expect(sweden).toBeDefined();
    const contributors = (sweden as { __contributors?: string[] }).__contributors ?? [];
    expect(contributors.sort()).toEqual(['sv-forsamlingar', 'sv-socknar']);
  });

  it('getAllGazetteers returns all bundled gazetteers', async () => {
    const all = getAllGazetteers();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.find(g => g.id === 'sv-socknar')).toBeDefined();
    expect(all.find(g => g.id === 'sv-forsamlingar')).toBeDefined();
  });
});

describe('language gazetteer integration', async () => {
  it('resolves "Danmark" when lang-sv-geonames is enabled with world-countries', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('Danmark', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Denmark');
    expect(result!.matchQuality).not.toBe('ambiguous');
  });

  it('resolves "Brasilien" when lang-sv-geonames is enabled', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('Brasilien', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Brazil');
  });

  it('resolves "São Paulo, Brasilien" as exact match with world-admin1', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-admin1', 'lang-sv-geonames'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('São Paulo, Brasilien', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Brazil');
    expect(result!.matchQuality).toBe('exact');
  });

  it('does not resolve "Danmark" without language gazetteer', async () => {
    const config: GazetteerConfig = { enabledGazetteers: ['world-countries'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('Danmark', gazetteers);
    expect(result).toBeNull();
  });
});

describe('hierarchy-aware matching', async () => {
  it('prefers country match over leaf match when input has hierarchical context', async () => {
    // "Dirleton, East Lothian, Skottland" should match Scotland (via language alias)
    // not the Canadian locality named Dirleton, because "Skottland" anchors the hierarchy
    const config: GazetteerConfig = {
      enabledGazetteers: ['ca-provinces', 'world-admin1', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('Dirleton, East Lothian, Skottland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Scotland');
    expect(result!.matchedPath).toContain('United Kingdom');
  });

  it('still matches leaf when input has no hierarchical context', async () => {
    // Plain "Dirleton" should still match the Canadian locality (exact leaf match)
    const config: GazetteerConfig = {
      enabledGazetteers: ['ca-provinces', 'world-admin1', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('Dirleton', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toContain('Dirleton');
  });

  it('prefers Scotland over US Pennington for "Tulliochie, Pennington, Skottland"', async () => {
    // "Skottland" (Swedish for Scotland) as the last component should anchor to Scotland,
    // not resolve to Pennington County in the US
    const config: GazetteerConfig = {
      enabledGazetteers: ['us-all-states', 'world-admin1', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('Tulliochie, Pennington, Skottland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Scotland');
    expect(result!.matchedPath).toContain('United Kingdom');
    // After the global-hierarchy migration every resolution flows through the
    // single merged tree; original source IDs live on each node's __contributors.
    expect(result!.gazetteer).toBe('__merged__');
  });

  it('prefers USA over Canadian leaf for "Hudson Bay, Long Island, USA"', async () => {
    const config: GazetteerConfig = {
      enabledGazetteers: ['ca-provinces', 'us-all-states', 'world-countries', 'lang-sv-geonames'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('Hudson Bay, Long Island, USA', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('United States');
  });

  it('prefers the state stem over a same-named leaf CDP (California, USA)', async () => {
    // "California, USA" should resolve to California the state, not the
    // tiny CDP "California" inside Saint Mary's County, Maryland. Both
    // are legitimate matches so the result is still flagged ambiguous,
    // but the coordinates returned must be the state, not the CDP.
    const config: GazetteerConfig = {
      enabledGazetteers: ['us-all-states'],
    };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const result = await resolvePlace('California, USA', gazetteers);
    expect(result).not.toBeNull();
    // The merged tree puts every country under a continent, so the path is
    // World > North America > United States > California.
    expect(result!.matchedPath).toEqual(['World', 'North America', 'United States', 'California']);
    expect(result!.matchedNode.name).toBe('California');
    // Closed admin vocab — countries' first-level subdivisions are admin1.
    expect(result!.matchedNode.type).toBe('admin1');
    // Depth follows the canonical path (World > North America > United States > California).
    expect(result!.matchDepth).toBe(4);
  });
});

describe('tokenizePlaceString', async () => {
  it('splits on commas and trims', async () => {
    expect(tokenizePlaceString('Hörningsholm, Mosås')).toEqual(['Hörningsholm', 'Mosås']);
  });

  it('extracts parenthesized tokens as separate components', async () => {
    expect(tokenizePlaceString('Solna (B)')).toEqual(['Solna', 'B']);
  });

  it('handles mixed commas and parens — Bengt #27', async () => {
    expect(tokenizePlaceString('Hörningsholm, Mosås (T)')).toEqual([
      'Hörningsholm',
      'Mosås',
      'T',
    ]);
  });

  it('returns empty for empty input', async () => {
    expect(tokenizePlaceString('')).toEqual([]);
    expect(tokenizePlaceString('  ')).toEqual([]);
  });

  it('preserves multi-word tokens', async () => {
    expect(tokenizePlaceString('Stockholms Matteus församling')).toEqual([
      'Stockholms Matteus församling',
    ]);
  });

  it('handles multiple parens in one part', async () => {
    expect(tokenizePlaceString('Foo (A) (BD)')).toEqual(['Foo', 'A', 'BD']);
  });
});

describe('resolveHierarchical', async () => {
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

  it('right-to-left match: "Mosås (T)" anchors on Örebro län, not Norrbotten', async () => {
    const r = resolveHierarchical('Mosås (T)', [svHier]);
    expect(r.best).not.toBeNull();
    expect(r.best!.node.name).toBe('Mosås');
    expect(r.best!.path.map(n => n.name)).toEqual([
      'Sverige', 'Örebro län', 'Örebro kommun', 'Mosås',
    ]);
    expect(r.best!.unmatchedLeftTokens).toEqual([]);
  });

  it('Bengt #27: "Hörningsholm, Mosås (T)" — leaf is unmatched farm in Örebro', async () => {
    const r = resolveHierarchical('Hörningsholm, Mosås (T)', [svHier]);
    expect(r.best).not.toBeNull();
    // Hörningsholm exists in Norrbotten but the (T) anchor restricts the
    // walk to Örebro län, so it should be unmatched as a leaf token.
    expect(r.best!.node.name).toBe('Mosås');
    expect(r.best!.unmatchedLeftTokens).toEqual(['Hörningsholm']);
    // Make sure we did NOT pick the Norrbotten Hörningsholm
    expect(r.best!.path.map(n => n.name)).not.toContain('Norrbottens län');
  });

  it('returns the broadest anchor when no descendant matches', async () => {
    const r = resolveHierarchical('Okänd ort, T', [svHier]);
    expect(r.best).not.toBeNull();
    expect(r.best!.node.name).toBe('Örebro län');
    expect(r.best!.unmatchedLeftTokens).toEqual(['Okänd ort']);
  });

  it('returns null best when nothing matches at all', async () => {
    const r = resolveHierarchical('Helt okänt', [svHier]);
    expect(r.best).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it('returns empty result for empty input', async () => {
    const r = resolveHierarchical('', [svHier]);
    expect(r.best).toBeNull();
    expect(r.tokens).toEqual([]);
  });

  it('matches county letter alias from parens — Solna (B)', async () => {
    // Use the bundled enrichment to verify "B" alias works in real data
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar'] };
    const gazetteers = loadGazetteers(config, getAllGazetteers());
    const r = resolveHierarchical('Solna (B)', gazetteers);
    expect(r.best).not.toBeNull();
    // After the global-hierarchy migration the Stockholm node's `name` is the
    // bare form and "Stockholms län" is an alias, so the path includes
    // "Stockholm" rather than "Stockholms län".
    const matchedNames = r.best!.path.map(n => n.name);
    expect(matchedNames).toContain('Stockholm');
    const sthlm = r.best!.path.find(n => n.name === 'Stockholm');
    expect(sthlm?.aliases).toContain('Stockholms län');
    expect(sthlm?.aliases).toContain('B');
  });

  it('full chain "Hörningsholm, Mosås, Örebro län" — broadest token is län', async () => {
    const r = resolveHierarchical('Hörningsholm, Mosås, Örebro län', [svHier]);
    expect(r.best).not.toBeNull();
    expect(r.best!.node.name).toBe('Mosås');
    expect(r.best!.unmatchedLeftTokens).toEqual(['Hörningsholm']);
  });

  it('candidates are sorted best-first by tokens consumed', async () => {
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

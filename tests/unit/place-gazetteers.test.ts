import { describe, it, expect } from 'vitest';
import { resolvePlace, resolveBoundary } from '../../src/api/place-gazetteers/resolver';
import { loadGazetteers, getAllGazetteers } from '../../src/api/place-gazetteers/index';
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
    expect(result!.treeDepth).toBe(4);
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

  it('returns null for empty gazetteers array', () => {
    expect(resolvePlace('Vallsjö, Sverige', [])).toBeNull();
  });

  it('matches when components are a subset (parish + country, skip middle)', () => {
    const result = resolvePlace('Vallsjö, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
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

describe('loadGazetteers', () => {
  it('returns empty array when no gazetteers enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: [] };
    const result = loadGazetteers(config);
    expect(result).toEqual([]);
  });

  it('returns sv-socknar when enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar'] };
    const result = loadGazetteers(config);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sv-socknar');
    expect(result[0].root.name).toBe('Sverige');
    expect(result[0].root.children!.length).toBeGreaterThan(0);
  });

  it('returns both Swedish gazetteers when both enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['sv-socknar', 'sv-forsamlingar'] };
    const result = loadGazetteers(config);
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

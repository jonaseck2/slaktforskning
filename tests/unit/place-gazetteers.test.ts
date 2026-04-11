import { describe, it, expect } from 'vitest';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

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

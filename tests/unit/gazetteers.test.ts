import { describe, it, expect } from 'vitest';
import { loadGazetteers } from '../../src/api/place-gazetteers';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';
import type { GazetteerConfig } from '../../src/api/place-gazetteers/types';

describe('bundled gazetteers', () => {
  const gazetteers = getAllGazetteers();

  it('loads all 27 bundled gazetteers', () => {
    expect(gazetteers.length).toBe(27);
  });

  const dataIds = [
    'sv-socknar', 'sv-forsamlingar', 'sv-orter', 'sv-gardar', 'sv-kyrkor', 'sv-sockenstad-boundaries',
    'dk-sogne', 'dk-sogne-dawa',
    'no-kommuner', 'fi-kunnat', 'is-sveitarfelog',
    'us-immigration-states', 'us-all-states', 'ca-provinces',
    'world-countries', 'world-admin1',
    'world-historical',
    'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
    'is-sveitarfelog-boundaries', 'us-counties-boundaries', 'ca-divisions-boundaries',
    'world-boundaries',
  ];

  for (const id of dataIds) {
    it(`includes ${id}`, () => {
      const gaz = gazetteers.find(g => g.id === id);
      expect(gaz).toBeDefined();
      expect(gaz!.root).toBeDefined();
      expect(gaz!.root.name).toBeTruthy();
      expect(gaz!.root.children).toBeDefined();
      expect(gaz!.root.children!.length).toBeGreaterThan(0);
    });
  }

  const langIds = ['lang-sv-geonames', 'lang-sv-wikidata', 'lang-world-historical'];

  for (const id of langIds) {
    it(`includes language gazetteer ${id}`, () => {
      const gaz = gazetteers.find(g => g.id === id);
      expect(gaz).toBeDefined();
      expect(gaz!.kind).toBe('language');
      expect(gaz!.translations).toBeDefined();
      expect(Object.keys(gaz!.translations!).length).toBeGreaterThan(0);
    });
  }

  it('world-countries has ~250 countries', () => {
    const wc = gazetteers.find(g => g.id === 'world-countries')!;
    expect(wc.root.children!.length).toBeGreaterThan(180);
    expect(wc.root.children!.length).toBeLessThan(300);
  });

  it('us-immigration-states has 9 states', () => {
    const us = gazetteers.find(g => g.id === 'us-immigration-states')!;
    expect(us.root.children!.length).toBe(9);
  });

  it('us-all-states has 51 states', () => {
    const us = gazetteers.find(g => g.id === 'us-all-states')!;
    expect(us.root.children!.length).toBe(51);
  });

  it('ca-provinces has 13 provinces and territories', () => {
    const ca = gazetteers.find(g => g.id === 'ca-provinces')!;
    expect(ca.root.children!.length).toBe(13);
  });

  it('world-historical has > 200 dissolved entities', () => {
    const wh = gazetteers.find(g => g.id === 'world-historical')!;
    expect(wh.root.children!.length).toBeGreaterThan(200);
  });

  it('world-historical resolves Soviet Union', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['world-historical'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Soviet Union', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedNode.name).toBe('Soviet Union');
  });

  it('world-historical resolves "Sovjetunionen" via lang-world-historical', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['world-historical', 'lang-world-historical'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Sovjetunionen', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedNode.name).toBe('Soviet Union');
  });

  it('lang-world-historical has > 1000 entities with translations', () => {
    const langGaz = gazetteers.find(g => g.id === 'lang-world-historical')!;
    const whTranslations = langGaz.translations!['world-historical'];
    expect(Object.keys(whTranslations).length).toBeGreaterThan(1000);
  });
});

describe('boundary gazetteers', () => {
  const gazetteers = getAllGazetteers();
  const boundaryIds = [
    'sv-sockenstad-boundaries',
    'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
    'is-sveitarfelog-boundaries', 'us-counties-boundaries', 'ca-divisions-boundaries',
    'world-boundaries',
  ];

  for (const id of boundaryIds) {
    it(`${id} has kind=boundary and nodes with geometry`, () => {
      const gaz = gazetteers.find(g => g.id === id);
      expect(gaz).toBeDefined();
      expect((gaz as any).kind).toBe('boundary');
      // Walk to the first leaf node with geometry (may be nested under state nodes)
      let node = gaz!.root.children![0];
      while (node.children?.length && !node.geometry) {
        node = node.children[0];
      }
      expect(node.geometry).toBeDefined();
      expect(['Polygon', 'MultiPolygon']).toContain(node.geometry!.type);
    });
  }
});

describe('cross-country place resolution', () => {
  const allEnabled: GazetteerConfig = {
    enabledGazetteers: getAllGazetteers().map(g => g.id),
  };
  const gazetteers = loadGazetteers(allEnabled, getAllGazetteers());

  it('resolves a Danish parish', () => {
    const result = resolvePlace('Roskilde, Danmark', gazetteers);
    expect(result).not.toBeNull();
  });

  it('resolves a Norwegian place', () => {
    const result = resolvePlace('Oslo, Norge', gazetteers);
    expect(result).not.toBeNull();
  });

  it('resolves a US state', () => {
    const result = resolvePlace('Minnesota, United States', gazetteers);
    expect(result).not.toBeNull();
  });

  it('resolves a country by ISO code alias', () => {
    const result = resolvePlace('SE', gazetteers);
    expect(result).not.toBeNull();
  });

  it('resolves "Ontario, Kanada" via Swedish language gazetteer', () => {
    const result = resolvePlace('Ontario, Kanada', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Canada');
    expect(result!.matchedPath).toContain('Ontario');
  });

  it('resolves "Canada" by its English name', () => {
    const result = resolvePlace('Canada', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Canada');
  });

  it('resolves "USA" via Swedish language gazetteer alias for United States', () => {
    const result = resolvePlace('USA', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('United States');
  });
});

import { describe, it, expect } from 'vitest';
import { getAllGazetteers } from '../../src/api/place-gazetteers';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';

describe('bundled gazetteers', () => {
  const gazetteers = getAllGazetteers();

  it('loads all 15 bundled gazetteers', () => {
    expect(gazetteers.length).toBe(15);
  });

  const expectedIds = [
    'sv-socknar', 'sv-forsamlingar', 'sv-orter', 'sv-gardar', 'sv-kyrkor', 'sv-sockenstad-boundaries',
    'dk-sogne', 'dk-sogne-dawa',
    'no-kommuner', 'fi-kunnat', 'is-sveitarfelog',
    'us-immigration-states', 'ca-provinces',
    'world-countries', 'world-admin1',
  ];

  for (const id of expectedIds) {
    it(`includes ${id}`, () => {
      const gaz = gazetteers.find(g => g.id === id);
      expect(gaz).toBeDefined();
      expect(gaz!.root).toBeDefined();
      expect(gaz!.root.name).toBeTruthy();
      expect(gaz!.root.children).toBeDefined();
      expect(gaz!.root.children!.length).toBeGreaterThan(0);
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

  it('ca-provinces has 13 provinces and territories', () => {
    const ca = gazetteers.find(g => g.id === 'ca-provinces')!;
    expect(ca.root.children!.length).toBe(13);
  });
});

describe('cross-country place resolution', () => {
  const gazetteers = getAllGazetteers();

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
});

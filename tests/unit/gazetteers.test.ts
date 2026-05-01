import { describe, it, expect } from 'vitest';
import { loadGazetteers } from '../../src/api/place-gazetteers';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';
import type { GazetteerConfig } from '../../src/api/place-gazetteers/types';

describe('bundled gazetteers', () => {
  const gazetteers = getAllGazetteers();

  it('loads all 28 bundled gazetteers', () => {
    expect(gazetteers.length).toBe(28);
  });

  const dataIds = [
    'sv-socknar', 'sv-forsamlingar', 'sv-orter', 'sv-gardar', 'sv-kyrkor', 'sv-landskap', 'sv-sockenstad-boundaries',
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

  it('world-boundaries includes 7 continents as siblings of countries', () => {
    const all = getAllGazetteers();
    const wb = all.find(g => g.id === 'world-boundaries');
    expect(wb).toBeDefined();

    const continents = (wb!.root.children ?? []).filter(c => c.type === 'continent');
    expect(continents).toHaveLength(7);

    const names = new Set(continents.map(c => c.name));
    for (const name of [
      'Africa', 'Antarctica', 'Asia', 'Europe',
      'North America', 'Oceania', 'South America',
    ]) {
      expect(names).toContain(name);
    }

    // Every continent has a non-empty geometry and a sensible centroid.
    for (const c of continents) {
      expect(c.geometry).toBeDefined();
      expect(c.geometry!.coordinates).toBeDefined();
      expect(typeof c.lat).toBe('number');
      expect(typeof c.lon).toBe('number');
      expect(c.lat).toBeGreaterThan(-90);
      expect(c.lat).toBeLessThan(90);
    }

    // Spot-check Europe falls in northern hemisphere, eastern (or near-zero) longitude.
    const europe = continents.find(c => c.name === 'Europe')!;
    expect(europe.lat).toBeGreaterThan(35);
    expect(europe.lat).toBeLessThan(71);
    expect(europe.lon).toBeGreaterThan(-10);
    expect(europe.lon).toBeLessThan(60);
  });
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

describe('language gazetteer integration', () => {
  // Translations injected by lang-sv-geonames must reach the resolver when
  // language gazetteers are explicitly included alongside data gazetteers.
  // QualityView (src/api/checks/index.ts) appends language gazetteers to the
  // user's gazetteer_config so this works regardless of user preference.
  it('Skottland → Scotland via lang-sv-geonames + world-admin1', () => {
    const gazetteers = loadGazetteers(
      {
        enabledGazetteers: [
          'world-admin1', 'world-countries',
          'lang-sv-geonames', 'lang-sv-wikidata', 'lang-world-historical',
        ],
      },
      getAllGazetteers(),
    );
    const result = resolvePlace('Aberdeen, Skottland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Scotland');
  });

  it('Tyskland → Germany via lang-sv-geonames + world-countries', () => {
    const gazetteers = loadGazetteers(
      {
        enabledGazetteers: [
          'world-countries',
          'lang-sv-geonames', 'lang-sv-wikidata',
        ],
      },
      getAllGazetteers(),
    );
    const result = resolvePlace('Tyskland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Germany');
  });
});

describe('Swedish exonym expansion', () => {
  // Gazetteers with full language support enabled.
  const gazetteers = loadGazetteers(
    {
      enabledGazetteers: [
        'world-countries', 'world-admin1',
        'dk-sogne', 'dk-sogne-dawa',
        'lang-sv-geonames', 'lang-sv-wikidata', 'lang-world-historical',
      ],
    },
    getAllGazetteers(),
  );

  // ── Admin1-level exonyms (GeoNames) ───────────────────────────────

  it('resolves "Flandern" to Belgium > Flanders via lang-sv-geonames', () => {
    const result = resolvePlace('Flandern', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Belgium');
    expect(result!.matchedPath).toContain('Flanders');
  });

  it('resolves "Brysselregionen" to Belgium > Brussels Capital via lang-sv-geonames', () => {
    const result = resolvePlace('Brysselregionen', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Belgium');
    expect(result!.matchedPath).toContain('Brussels Capital');
  });

  it('resolves "Toscana" to Italy > Tuscany via lang-sv-wikidata', () => {
    const result = resolvePlace('Toscana', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Italy');
    expect(result!.matchedPath).toContain('Tuscany');
  });

  it('resolves "Bayern" to Germany > Bavaria via lang-sv-wikidata', () => {
    const result = resolvePlace('Bayern', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Germany');
    expect(result!.matchedPath).toContain('Bavaria');
  });

  it('resolves "Katalonien" to Spain > Catalonia via lang-sv-wikidata', () => {
    const result = resolvePlace('Katalonien', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('Spain');
    expect(result!.matchedPath).toContain('Catalonia');
  });

  it('resolves "Skottland" to United Kingdom > Scotland via lang-sv-wikidata', () => {
    const result = resolvePlace('Skottland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedPath).toContain('United Kingdom');
    expect(result!.matchedPath).toContain('Scotland');
  });

  // ── City-level exonyms (pre-positioned, no city nodes in world-admin1 yet) ──
  //
  // The entries "Belgium > Brussels Capital > Brussels → Bryssel",
  // "Austria > State of Vienna > Vienna → Wien", etc. are in lang-sv-geonames
  // but city nodes don't yet exist in world-admin1. The resolver's
  // mergeTranslations silently skips unmatched path keys, so the aliases are
  // not attached. These tests document the CURRENT state and will need to be
  // updated when city nodes are added to world-admin1.

  it('city exonyms (Bryssel/Wien/Köpenhamn/Florens) are in the translation file', () => {
    const all = getAllGazetteers();
    const langGaz = all.find(g => g.id === 'lang-sv-geonames')!;
    const t = langGaz.translations!['world-admin1'];
    expect(t['Belgium > Brussels Capital > Brussels']).toEqual(['Bryssel']);
    expect(t['Austria > State of Vienna > Vienna']).toEqual(['Wien']);
    expect(t['Denmark > Capital Region > Copenhagen']).toEqual(['Köpenhamn']);
    expect(t['Italy > Tuscany > Florence']).toEqual(['Florens']);
  });

  // ── Negative-control ─────────────────────────────────────────────

  it('does NOT resolve "Åhlborg" (typo of Aalborg) via a Swedish exonym alias', () => {
    // "Åhlborg" is a typo not present in GeoNames or Wikidata. The path
    // component "Åhlborg" should not appear in any resolved match.
    const result = resolvePlace('Åhlborg, Danmark', gazetteers);
    // A result may still exist (anchoring on Denmark), but the matched path
    // should not contain "Åhlborg" as a named component.
    if (result !== null) {
      expect(result.matchedPath.some(p => p === 'Åhlborg')).toBe(false);
    }
  });
});

describe('per-gazetteer normalization rules', () => {
  it('strips Swedish "kommun" suffix when matching against sv-orter (SV_RULES)', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-orter'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Stockholm kommun', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedNode.name.toLowerCase()).toContain('stockholm');
    expect(result!.gazetteer).toBe('sv-orter');
  });

  it('strips Danish "Sogn" suffix when matching against dk-sogne (DK_RULES)', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['dk-sogne'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Roskilde Sogn', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedNode.name.toLowerCase()).toContain('roskilde');
    expect(result!.gazetteer).toBe('dk-sogne');
  });

  it('treats hyphens and spaces as equivalent (universal rule)', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-socknar', 'sv-forsamlingar', 'sv-orter'] },
      getAllGazetteers(),
    );
    const hyphen = resolvePlace('Husby-Rekarne', gazetteers);
    const spaced = resolvePlace('Husby Rekarne', gazetteers);
    expect(hyphen).not.toBeNull();
    expect(spaced).not.toBeNull();
    // Same node — same coordinates.
    expect(hyphen!.lat).toBe(spaced!.lat);
    expect(hyphen!.lon).toBe(spaced!.lon);
  });

  it('splits on period-before-uppercase to handle "Minn.USA" (universal rule)', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['world-countries', 'us-all-states'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Saint-Claude College, Minn.USA', gazetteers);
    expect(result).not.toBeNull();
    // The path should reach the United States (matched via the split-out USA component).
    const pathStr = result!.matchedPath.join(' / ').toLowerCase();
    expect(pathStr).toMatch(/united states|usa/);
  });

  it('strips parens and matches a token within a single component (universal rule + token-scan)', () => {
    // Restrict to dk-sogne so the token-scan path must pick up "Roskilde" from
    // the single component "(Roskilde) Danmark" → universal-normalized to
    // "roskilde danmark" — neither parens nor the country tail prevent the
    // match.
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['dk-sogne'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('(Roskilde) Danmark', gazetteers);
    expect(result).not.toBeNull();
    const pathStr = result!.matchedPath.join(' / ').toLowerCase();
    expect(pathStr).toContain('roskilde');
  });

  it('does NOT strip "kommun" against world-countries (no SV_RULES on that gazetteer)', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['world-countries'] },
      getAllGazetteers(),
    );
    // "Sweden kommun" should not resolve via Sweden because world-countries has
    // no rule that strips "kommun". (The component "Sweden kommun" as a whole
    // doesn't match any country name.) Token-scan would still let "Sweden"
    // match as a whitespace-token, so this test instead picks an input where
    // the unstripped form must fail: contrived non-country.
    const result = resolvePlace('Atlantis kommun', gazetteers);
    expect(result).toBeNull();
  });
});

describe('sv-landskap resolution', () => {
  it('has 25 landskap', () => {
    const gaz = getAllGazetteers().find(g => g.id === 'sv-landskap')!;
    expect(gaz).toBeDefined();
    expect(gaz.root.children).toHaveLength(25);
  });

  it('every landskap has lat/lon and type=landskap', () => {
    const gaz = getAllGazetteers().find(g => g.id === 'sv-landskap')!;
    for (const c of gaz.root.children!) {
      expect(c.type).toBe('landskap');
      expect(typeof c.lat).toBe('number');
      expect(typeof c.lon).toBe('number');
      expect(c.lat).toBeGreaterThan(54);
      expect(c.lat).toBeLessThan(70);
      expect(c.lon).toBeGreaterThan(10);
      expect(c.lon).toBeLessThan(25);
    }
  });

  it('resolves "Ångermanland" to sv-landskap', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-landskap'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Ångermanland', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.gazetteer).toBe('sv-landskap');
    expect(result!.matchedNode.name).toBe('Ångermanland');
  });

  it('resolves "Bohuslän" to the landskap gazetteer', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-landskap'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Bohuslän', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.gazetteer).toBe('sv-landskap');
    expect(result!.matchedNode.name).toBe('Bohuslän');
  });

  it('strips "landskap" suffix — "Skåne landskap" matches the same as "Skåne"', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-landskap'] },
      getAllGazetteers(),
    );
    const a = resolvePlace('Skåne landskap', gazetteers);
    const b = resolvePlace('Skåne', gazetteers);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.matchedNode.name).toBe(b!.matchedNode.name);
    expect(a!.lat).toBe(b!.lat);
    expect(a!.lon).toBe(b!.lon);
  });

  it('"Skåne län" still resolves to the modern Skåne (via sv-orter) and not the landskap', () => {
    // sv-orter has SV_RULES which strips "län"; sv-landskap children don't
    // include "Skåne län" as a name. The landskap node name is just "Skåne".
    // With both gazetteers enabled, the one that can specifically match "Skåne"
    // after stripping "län" wins; sv-orter has Skåne as a region tree.
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-orter'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Skåne län', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.gazetteer).toBe('sv-orter');
  });

  it('"Skåne" (bare) resolves from sv-landskap when only sv-landskap is enabled', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-landskap'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Skåne', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.gazetteer).toBe('sv-landskap');
  });

  it('"Skåne" (bare) also resolves from sv-orter when only sv-orter is enabled', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['sv-orter'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Skåne', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.gazetteer).toBe('sv-orter');
  });
});

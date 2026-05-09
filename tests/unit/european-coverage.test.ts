/**
 * European country coverage — roadmap-level smoke probes.
 *
 * Each country plan in docs/plans/2026-05-09-european-gazetteers-design.md
 * extends EUROPEAN_PROBES with its smoke list. The probes assert that
 * resolvePlace() returns the expected (admin1, admin2, leaf) tuple.
 *
 * This test guards regressions; the *gate* for shipping any country plan is
 * the user smoke-check in the running app. See the per-country plan's
 * Verification section.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

interface CoverageProbe {
  query: string;
  expectAdmin1?: string;
  expectAdmin2?: string;
  expectLeaf?: string;
  expectLeafType?: string;
  expectCountry: string;
}

interface CountryProbeSet {
  countryCode: string;
  countryName: string;
  probes: CoverageProbe[];
}

/**
 * Probe values reflect the actual gazetteer data shape, not aspirational targets.
 * `de-gemeinden`'s admin2 carries the full Kreis label (`Kreisfreie Stadt Lübeck`,
 * `Landkreis Garmisch-Partenkirchen`); the bare town name is the admin3 leaf. The
 * München leaf is stored as `Munich` (English form). The country qualifier in each
 * query disambiguates from `world-historical` (which carries `Kingdom of Bavaria`
 * with `Bayern` as alias).
 *
 * The hierarchy assertion below requires expected names to appear in `matchedPath`
 * at strictly increasing indices (country → admin1 → admin2 → leaf), so a probe
 * cannot pass "for the wrong reason" by matching the bare leaf when an admin2 was
 * expected.
 */
const EUROPEAN_PROBES: CountryProbeSet[] = [
  {
    countryCode: 'de',
    countryName: 'Germany',
    probes: [
      // After de-gemeinden-boundaries lands, the resolver merges its bare-name
      // admin2 (`Lübeck`) with de-gemeinden's prefixed form (`Kreisfreie Stadt
      // Lübeck`); the bare form wins because the user typed "Lübeck". We probe
      // the bare form, which is the user-observable behaviour.
      { query: 'Lübeck, Schleswig-Holstein, Germany', expectAdmin1: 'Schleswig-Holstein', expectLeaf: 'Lübeck', expectCountry: 'Germany' },
      { query: 'Munich, Bayern, Germany', expectAdmin1: 'Bayern', expectLeaf: 'Munich', expectCountry: 'Germany' },
      { query: 'Garmisch-Partenkirchen, Bayern, Germany', expectAdmin1: 'Bayern', expectLeaf: 'Garmisch-Partenkirchen', expectCountry: 'Germany' },
      { query: 'Brandenburg, Germany', expectAdmin1: 'Brandenburg', expectCountry: 'Germany' },
      // Parish probes — picked from de-kirchgemeinden.json (Wikidata, sparse first cut).
      // The plan's aspirational probes (St. Petri Lübeck, St. Maria München) are
      // *not* in the Wikidata dataset and are deferred to a future per-Bundesland
      // church-portal extension plan.
      { query: 'Adelby, Schleswig-Holstein, Germany', expectAdmin1: 'Schleswig-Holstein', expectLeaf: 'Adelby', expectLeafType: 'admin3', expectCountry: 'Germany' },
      { query: 'Pfarrei St. Anna, Bayern, Germany', expectAdmin1: 'Bayern', expectLeaf: 'Pfarrei St. Anna', expectLeafType: 'admin3', expectCountry: 'Germany' },
      { query: 'Ev.-Luth. Kirchengemeinde Borby, Schleswig-Holstein, Germany', expectAdmin1: 'Schleswig-Holstein', expectLeaf: 'Ev.-Luth. Kirchengemeinde Borby', expectLeafType: 'admin3', expectCountry: 'Germany' },
    ],
  },
  {
    countryCode: 'gb',
    countryName: 'United Kingdom',
    probes: [
      // ONS Local Authority Districts at admin2: bare district name (e.g. "East Lothian"
      // for Scotland's council areas, "Suffolk" — wait, Suffolk is a non-metropolitan
      // county not a LAD; the LADs are the districts inside it). Pick LADs that exist
      // in the BUC source: City of Edinburgh, Cardiff, Belfast, Westminster.
      { query: 'City of Edinburgh, Scotland, United Kingdom', expectAdmin1: 'Scotland', expectLeaf: 'City of Edinburgh', expectCountry: 'United Kingdom' },
      { query: 'Cardiff, Wales, United Kingdom', expectAdmin1: 'Wales', expectLeaf: 'Cardiff', expectCountry: 'United Kingdom' },
      { query: 'Belfast, Northern Ireland, United Kingdom', expectAdmin1: 'Northern Ireland', expectLeaf: 'Belfast', expectCountry: 'United Kingdom' },
      { query: 'Westminster, England, United Kingdom', expectAdmin1: 'England', expectLeaf: 'Westminster', expectCountry: 'United Kingdom' },
    ],
  },
  {
    countryCode: 'ie',
    countryName: 'Ireland',
    probes: [
      // GeoNames IE: 4 historical provinces (admin1) + 26 RoI counties (admin2)
      // + populated places ≥1000 pop. NI counties live in gb-civil-divisions.
      { query: 'Wicklow, Leinster, Ireland', expectAdmin1: 'Leinster', expectAdmin2: 'Wicklow', expectCountry: 'Ireland' },
      { query: 'Cork, Munster, Ireland', expectAdmin1: 'Munster', expectAdmin2: 'Cork', expectCountry: 'Ireland' },
      { query: 'Dublin City, Leinster, Ireland', expectAdmin1: 'Leinster', expectAdmin2: 'Dublin City', expectCountry: 'Ireland' },
      { query: 'Sligo, Connacht, Ireland', expectAdmin1: 'Connacht', expectAdmin2: 'Sligo', expectCountry: 'Ireland' },
    ],
  },
  {
    countryCode: 'nl',
    countryName: 'Netherlands',
    probes: [
      // GeoNames NL: 12 provinces (admin1) + 342 gemeenten (admin2) + populated
      // places ≥1000 pop. "Provincie X" / "Gemeente X" prefixes stripped from
      // canonical name and kept as aliases.
      { query: 'Leiden, Zuid-Holland, Netherlands', expectAdmin1: 'Zuid-Holland', expectAdmin2: 'Leiden', expectCountry: 'Netherlands' },
      { query: 'Hoorn, Noord-Holland, Netherlands', expectAdmin1: 'Noord-Holland', expectAdmin2: 'Hoorn', expectCountry: 'Netherlands' },
      { query: 'Maastricht, Limburg, Netherlands', expectAdmin1: 'Limburg', expectAdmin2: 'Maastricht', expectCountry: 'Netherlands' },
      { query: 'Groningen, Groningen, Netherlands', expectAdmin1: 'Groningen', expectAdmin2: 'Groningen', expectCountry: 'Netherlands' },
    ],
  },
];

function assertHierarchyOrder(path: string[], expected: Array<string | undefined>, query: string): void {
  let lastIdx = -1;
  for (const name of expected) {
    if (!name) continue;
    const idx = path.findIndex((p, i) => i > lastIdx && p === name);
    expect(idx, `"${name}" not found after index ${lastIdx} in path ${JSON.stringify(path)} for query "${query}"`).toBeGreaterThan(lastIdx);
    lastIdx = idx;
  }
}

describe('European country coverage probes', () => {
  let gazetteers: Gazetteer[];

  beforeAll(() => {
    const all = getAllGazetteers();
    const enabledIds = all.filter(g => g.root && g.shape !== 'language').map(g => g.id);
    gazetteers = loadGazetteers({ enabledGazetteers: enabledIds }, all);
  });

  for (const country of EUROPEAN_PROBES) {
    describe(`${country.countryName} (${country.countryCode})`, () => {
      for (const probe of country.probes) {
        it(`resolves "${probe.query}"`, () => {
          const result = resolvePlace(probe.query, gazetteers);
          expect(result, `no resolution for "${probe.query}"`).toBeTruthy();
          if (!result) return;
          assertHierarchyOrder(result.matchedPath, [probe.expectCountry, probe.expectAdmin1, probe.expectAdmin2, probe.expectLeaf], probe.query);
          if (probe.expectLeafType) {
            const leaf = result.matchedNodes[result.matchedNodes.length - 1];
            expect(leaf.type, `leaf type mismatch for "${probe.query}"`).toBe(probe.expectLeafType);
          }
        });
      }
    });
  }

  describe('Germany — boundary geometry coverage (de-gemeinden-boundaries)', () => {
    it('Bundesland Brandenburg resolves with a polygon attached', () => {
      const result = resolvePlace('Brandenburg, Germany', gazetteers);
      expect(result).toBeTruthy();
      if (!result) return;
      const brandenburg = result.matchedNodes.find(n => n.name === 'Brandenburg' && n.type === 'admin1');
      expect(brandenburg, 'Brandenburg admin1 node not in matched path').toBeTruthy();
      expect(brandenburg!.geometry, 'Brandenburg admin1 must have polygon from de-gemeinden-boundaries').toBeTruthy();
    });
  });
});

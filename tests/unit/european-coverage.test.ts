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
      { query: 'Lübeck, Schleswig-Holstein, Germany', expectAdmin1: 'Schleswig-Holstein', expectAdmin2: 'Kreisfreie Stadt Lübeck', expectLeaf: 'Lübeck', expectCountry: 'Germany' },
      { query: 'Munich, Bayern, Germany', expectAdmin1: 'Bayern', expectLeaf: 'Munich', expectCountry: 'Germany' },
      { query: 'Garmisch-Partenkirchen, Bayern, Germany', expectAdmin1: 'Bayern', expectAdmin2: 'Landkreis Garmisch-Partenkirchen', expectLeaf: 'Garmisch-Partenkirchen', expectCountry: 'Germany' },
      { query: 'Brandenburg, Germany', expectAdmin1: 'Brandenburg', expectCountry: 'Germany' },
      // Parish probes — picked from de-kirchgemeinden.json (Wikidata, sparse first cut).
      // The plan's aspirational probes (St. Petri Lübeck, St. Maria München) are
      // *not* in the Wikidata dataset and are deferred to a future per-Bundesland
      // church-portal extension plan.
      { query: 'Adelby, Schleswig-Holstein, Germany', expectAdmin1: 'Schleswig-Holstein', expectLeaf: 'Adelby', expectLeafType: 'parish', expectCountry: 'Germany' },
      { query: 'Pfarrei St. Anna, Bayern, Germany', expectAdmin1: 'Bayern', expectLeaf: 'Pfarrei St. Anna', expectLeafType: 'parish', expectCountry: 'Germany' },
      { query: 'Ev.-Luth. Kirchengemeinde Borby, Schleswig-Holstein, Germany', expectAdmin1: 'Schleswig-Holstein', expectLeaf: 'Ev.-Luth. Kirchengemeinde Borby', expectLeafType: 'parish', expectCountry: 'Germany' },
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
});

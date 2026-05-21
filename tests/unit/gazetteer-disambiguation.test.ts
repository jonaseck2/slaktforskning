import { describe, it, expect } from 'vitest';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';

/**
 * User-goal disambiguation tests for the place resolver.
 *
 * User goal: when a genealogist writes a famous city name — using the Swedish
 * exonym ("Köpenhamn"), the English form ("Copenhagen"), or the city plus a
 * country qualifier ("Köpenhamn, Danmark") — the resolver picks the
 * world-prominent city the user actually meant, not:
 *
 *   - a tiny Swedish farm called Köpenhamn near Gnesta (sv-gardar)
 *   - the village of Copenhagen, NY (us-all-states)
 *   - Denmark's country centroid (dk-sogne root) when the user typed the city
 *
 * Canonical Copenhagen city coordinates (via dk-sogne-dawa): ~55.685°N,
 * 12.553°E. The assertions use a tolerant lat/lon box around that point so
 * any node inside the actual city of Copenhagen passes, but Swedish farms,
 * US villages, and country-center points do not.
 *
 * Baseline (2026-05-21, before T03–T06 fixes):
 *   - 'Köpenhamn'                          → sv-gardar farm, lat≈59.083 (FAIL)
 *   - 'Copenhagen'                         → us-all-states NY village (FAIL)
 *   - 'Köpenhamn, Danmark'                 → dk-sogne country root (FAIL)
 *   - 'Charlottenborgs slott, Köpenhamn'   → sv-gardar farm (FAIL)
 *   - 'Richmond, Kalifornien USA'          → California, USA (PASS — guard)
 */
describe('gazetteer resolver — famous-city disambiguation', () => {
  // Use the same merged-tree shape that the running app uses (see
  // src/renderer/composables/usePlaceResolver.ts:47). Raw getAllGazetteers()
  // bypasses applyTranslations, so language-overlay aliases never attach.
  const bundled = getAllGazetteers();
  const gazetteers = loadGazetteers(
    { enabledGazetteers: bundled.map(g => g.id) },
    bundled,
    [],
  );

  // Canonical Copenhagen city tolerance box. Wide enough to accept any node
  // in the city of Copenhagen (e.g. district-level parishes), narrow enough
  // to exclude the Denmark country-center (~56.0, 10.0), Swedish Köpenhamn
  // farm (~59.083, 16.983), and Copenhagen NY (~43.893, −75.674).
  const COPENHAGEN_LAT_MIN = 55.6;
  const COPENHAGEN_LAT_MAX = 55.8;
  const COPENHAGEN_LON_MIN = 12.4;
  const COPENHAGEN_LON_MAX = 12.7;

  function describeResult(name: string, result: ReturnType<typeof resolvePlace>) {
    if (!result) return `${name} → null`;
    return `${name} → lat=${result.lat.toFixed(3)} lon=${result.lon.toFixed(3)} gaz=${result.gazetteer} matched=${result.matchedNode.name}`;
  }

  it('resolves "Köpenhamn" to the city of Copenhagen, Denmark (not a Swedish farm)', () => {
    const result = resolvePlace('Köpenhamn', gazetteers);
    expect(result, 'resolver should return a match for "Köpenhamn"').not.toBeNull();
    expect(result!.lat, describeResult('Köpenhamn', result)).toBeGreaterThanOrEqual(COPENHAGEN_LAT_MIN);
    expect(result!.lat, describeResult('Köpenhamn', result)).toBeLessThanOrEqual(COPENHAGEN_LAT_MAX);
    expect(result!.lon, describeResult('Köpenhamn', result)).toBeGreaterThanOrEqual(COPENHAGEN_LON_MIN);
    expect(result!.lon, describeResult('Köpenhamn', result)).toBeLessThanOrEqual(COPENHAGEN_LON_MAX);
  });

  it('resolves "Copenhagen" to the city of Copenhagen, Denmark (not Copenhagen, NY)', () => {
    const result = resolvePlace('Copenhagen', gazetteers);
    expect(result, 'resolver should return a match for "Copenhagen"').not.toBeNull();
    expect(result!.lat, describeResult('Copenhagen', result)).toBeGreaterThanOrEqual(COPENHAGEN_LAT_MIN);
    expect(result!.lat, describeResult('Copenhagen', result)).toBeLessThanOrEqual(COPENHAGEN_LAT_MAX);
    expect(result!.lon, describeResult('Copenhagen', result)).toBeGreaterThanOrEqual(COPENHAGEN_LON_MIN);
    expect(result!.lon, describeResult('Copenhagen', result)).toBeLessThanOrEqual(COPENHAGEN_LON_MAX);
  });

  it('resolves "Köpenhamn, Danmark" to the city of Copenhagen (not the Denmark country centroid)', () => {
    const result = resolvePlace('Köpenhamn, Danmark', gazetteers);
    expect(result, 'resolver should return a match for "Köpenhamn, Danmark"').not.toBeNull();
    // Must be the city, not the country root (lat≈56.0, lon≈10.0).
    expect(result!.lat, describeResult('Köpenhamn, Danmark', result)).toBeGreaterThanOrEqual(COPENHAGEN_LAT_MIN);
    expect(result!.lat, describeResult('Köpenhamn, Danmark', result)).toBeLessThanOrEqual(COPENHAGEN_LAT_MAX);
    expect(result!.lon, describeResult('Köpenhamn, Danmark', result)).toBeGreaterThanOrEqual(COPENHAGEN_LON_MIN);
    expect(result!.lon, describeResult('Köpenhamn, Danmark', result)).toBeLessThanOrEqual(COPENHAGEN_LON_MAX);
  });

  it('resolves "Charlottenborgs slott, Köpenhamn" to Copenhagen with partial match and the unmatched landmark surfaced', () => {
    const result = resolvePlace('Charlottenborgs slott, Köpenhamn', gazetteers);
    expect(result, 'resolver should return a match for the landmark+city string').not.toBeNull();
    expect(result!.lat, describeResult('Charlottenborgs slott, Köpenhamn', result)).toBeGreaterThanOrEqual(COPENHAGEN_LAT_MIN);
    expect(result!.lat, describeResult('Charlottenborgs slott, Köpenhamn', result)).toBeLessThanOrEqual(COPENHAGEN_LAT_MAX);
    expect(result!.lon, describeResult('Charlottenborgs slott, Köpenhamn', result)).toBeGreaterThanOrEqual(COPENHAGEN_LON_MIN);
    expect(result!.lon, describeResult('Charlottenborgs slott, Köpenhamn', result)).toBeLessThanOrEqual(COPENHAGEN_LON_MAX);
    // 'ambiguous' is honest here — the resolver ties Capital Region (DK) against the
    // sv-gardar Köpenhamn farm on contradictions/unmatched. Both 'partial' and
    // 'ambiguous' are acceptable: the user-observable lat/lon (asserted above) is
    // what matters. Promoting to 'exact' would require a famous-anchor tiebreaker
    // in pickBest — explicitly out of scope per the plan's Scope Deviations.
    expect(['partial', 'ambiguous']).toContain(result!.matchQuality);
    expect(result!.unmatchedComponents).toContain('Charlottenborgs slott');
  });

  it('regression: "Richmond, Kalifornien USA" still resolves into California, USA (must not regress per saved memory)', () => {
    const result = resolvePlace('Richmond, Kalifornien USA', gazetteers);
    expect(result, 'resolver should return a match for "Richmond, Kalifornien USA"').not.toBeNull();
    // California lat ≈ 32–42°N, lon ≈ −124 to −114°E. Crucially this must
    // NOT be the Richmond in British Columbia, Canada (lat ≈ 49.17°N).
    expect(result!.lat, describeResult('Richmond, Kalifornien USA', result)).toBeGreaterThanOrEqual(32);
    expect(result!.lat, describeResult('Richmond, Kalifornien USA', result)).toBeLessThanOrEqual(42);
    expect(result!.lon, describeResult('Richmond, Kalifornien USA', result)).toBeGreaterThanOrEqual(-124);
    expect(result!.lon, describeResult('Richmond, Kalifornien USA', result)).toBeLessThanOrEqual(-114);
    // Path should land under United States, not Canada.
    expect(result!.matchedPath.join(' > ')).toMatch(/United States|USA/);
    expect(result!.matchedPath.join(' > ')).not.toMatch(/Canada/);
  });
});

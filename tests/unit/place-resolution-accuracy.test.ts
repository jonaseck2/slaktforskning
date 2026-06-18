import { describe, it, expect } from 'vitest';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';

/**
 * User-goal regression corpus: the 15 strings the user reported as wrong/odd
 * place pins (2026-06-18). Each asserts the correct country/region root and a
 * non-"ambiguous" quality where the resolver should be confident.
 * Design: docs/plans/2026-06-18-place-resolution-accuracy-design.md
 */
describe('place resolution accuracy — reported corpus', () => {
  const bundled = getAllGazetteers();
  const gazetteers = loadGazetteers(
    { enabledGazetteers: bundled.map(g => g.id) },
    bundled,
    [],
  );

  // matchedPath[0] is always "World" or "World (Historical)"; [1] is the
  // continent for modern, or the historical polity name for historical.
  const resolve = (name: string) => resolvePlace(name, gazetteers);
  const path = (name: string) => resolve(name)?.matchedPath ?? [];
  const quality = (name: string) => resolve(name)?.matchQuality ?? 'null';

  it('Swedish places do not land in Africa/Belarus/Faroe (RC3/RC4)', () => {
    expect(path('Västra Vingåkers sn')).toContain('Sweden');
    expect(path('Västra Vingåkers sn')).not.toContain('Senegal');
    expect(path('Torsvi by, Torsvi (C)')).toContain('Sweden');
    expect(path('Torsvi by, Torsvi (C)')).not.toContain('Belarus');
    expect(path('Tun, Lidköpings kn (R)')).toContain('Sweden');
    expect(path('Tun, Lidköpings kn (R)')).not.toContain('Tunisia');
    expect(path('Tun, Lindköpings kn (R)')).toContain('Sweden');
    expect(path('Kärret, Hov')).not.toContain('Faroe Islands');
  });

  it('modern places do not land in historical empires (RC1)', () => {
    expect(path('New York')).not.toContain('Estado Novo');
    expect(path('New York')).toContain('United States');
    expect(path('Rasht, Iran')).not.toContain('Qajar Iran');
    expect(path('Rasht, Iran')).toContain('Iran');
    expect(path('Spanien')).not.toContain('Spanish Empire');
    expect(path('Spanien')).toContain('Spain');
    expect(path('Mellangården, Edum')).not.toContain('Edom');
    expect(path('Mellangården, Edum')).toContain('Sweden');
  });

  it('confident single-location matches are not flagged ambiguous (RC2)', () => {
    expect(quality('Turkiet')).not.toBe('ambiguous');
    expect(quality('Voss, Norge')).not.toBe('ambiguous');
    expect(quality('Ytre Arna, Hordaland, Norge')).not.toBe('ambiguous');
    expect(quality('Barcelona, Spanien')).not.toBe('ambiguous');
    expect(quality('Genève, Schweiz')).not.toBe('ambiguous');
    expect(quality('Warszawa, Polen')).not.toBe('ambiguous');
  });

  it('correct places still resolve to the right country (RC2 guard)', () => {
    expect(path('Turkiet')).toContain('Turkey');
    expect(path('Voss, Norge')).toContain('Norway');
    expect(path('Barcelona, Spanien')).toContain('Spain');
    expect(path('Genève, Schweiz')).toContain('Switzerland');
    expect(path('Warszawa, Polen')).toContain('Poland');
  });
});

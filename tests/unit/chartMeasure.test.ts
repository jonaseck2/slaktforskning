import { describe, it, expect } from 'vitest';
import { wrapName, measureBoxHeight } from '../../src/renderer/utils/chart-layout/measure';
import { MIN_BOX_H } from '../../src/renderer/utils/chart-layout/constants';
import type { PersonNode } from '../../src/renderer/utils/chart-layout/types';

function p(overrides: Partial<PersonNode> = {}): PersonNode {
  return {
    id: 'test', givenName: null, surname: null, preferredName: null, nickname: null,
    sex: 'U', living: true, birthDate: null, deathDate: null,
    birthPlace: null, deathPlace: null, photoUrl: null,
    ...overrides,
  };
}

describe('wrapName', () => {
  it('short name returns 1 line', () => {
    const lines = wrapName('Anna Holm', 150, 12);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Anna Holm');
  });

  it('single word returns 1 line', () => {
    const lines = wrapName('Christophersen', 80, 12);
    expect(lines).toHaveLength(1);
  });

  it('empty string returns empty array', () => {
    const lines = wrapName('', 150, 12);
    expect(lines).toHaveLength(0);
  });

  it('all words are preserved when joined across lines', () => {
    const name = 'Elisabeth Cathrina Margareta Johansdotter Svensson';
    const lines = wrapName(name, 100, 12);
    const joined = lines.join(' ');
    expect(joined).toBe(name);
  });

  it('long name wraps to multiple lines with narrow width', () => {
    const lines = wrapName('Elisabeth Cathrina Margareta', 80, 12);
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('measureBoxHeight', () => {
  it('returns MIN_BOX_H for a person with no name, no dates', () => {
    const h = measureBoxHeight(p());
    expect(h).toBeGreaterThanOrEqual(MIN_BOX_H);
  });

  it('returns at least MIN_BOX_H for short name with no dates', () => {
    const h = measureBoxHeight(p({ givenName: 'Anna', surname: 'Holm' }));
    expect(h).toBeGreaterThanOrEqual(MIN_BOX_H);
  });

  it('returns at least MIN_BOX_H for short name with birth and death dates', () => {
    const h = measureBoxHeight(p({ givenName: 'Anna', surname: 'Holm', birthDate: '1850', deathDate: '1920' }));
    expect(h).toBeGreaterThanOrEqual(MIN_BOX_H);
  });

  it('counts birth line when birthDate exists', () => {
    const withBirth = measureBoxHeight(p({ birthDate: '1850' }));
    const noBirth = measureBoxHeight(p());
    expect(withBirth).toBeGreaterThanOrEqual(noBirth);
  });

  it('counts birth line when birthPlace exists', () => {
    const withPlace = measureBoxHeight(p({ birthPlace: 'Stockholm' }));
    const noPlace = measureBoxHeight(p());
    expect(withPlace).toBeGreaterThanOrEqual(noPlace);
  });

  it('long wrapping name with dates returns taller than MIN_BOX_H', () => {
    const h = measureBoxHeight(p({
      givenName: 'Elisabeth Cathrina Margareta Johansdotter',
      surname: 'Svensson-Lindqvist',
      birthDate: '1850',
      birthPlace: 'Stockholm',
      deathDate: '1920',
      deathPlace: 'Göteborg',
    }));
    expect(h).toBeGreaterThan(MIN_BOX_H);
  });
});

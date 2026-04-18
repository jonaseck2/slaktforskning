import { describe, it, expect } from 'vitest';
import { fullNameParts, givenNameParts, parseAsteriskNotation, getDisplayName, chartNameParts, formatChartName } from '../../src/renderer/utils/nameUtils';

describe('givenNameParts', () => {
  it('marks preferred name token for underline', () => {
    const parts = givenNameParts('Eva Linda Marie', 'Linda');
    expect(parts.find(p => p.text === 'Linda')?.underline).toBe(true);
    expect(parts.find(p => p.text === 'Eva')?.underline).toBe(false);
  });
});

describe('fullNameParts', () => {
  it('renders surname without nickname', () => {
    const parts = fullNameParts('Anna', 'Johansson', null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Johansson');
  });

  it('inserts nickname right after the preferred name token', () => {
    // Elisabeth* Cathrina with nickname Lisa → Elisabeth "Lisa" Cathrina
    const parts = fullNameParts('Elisabeth Cathrina', null, 'Elisabeth', 'Lisa');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Elisabeth "Lisa" Cathrina');
    expect(parts.find(p => p.text === 'Elisabeth')?.underline).toBe(true);
  });

  it('inserts nickname after preferred token with surname', () => {
    const parts = fullNameParts('Elisabeth Cathrina', 'Svensson', 'Elisabeth', 'Lisa');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Elisabeth "Lisa" Cathrina Svensson');
  });

  it('inserts nickname after preferred token mid-name', () => {
    const parts = fullNameParts('Anna Susanna Kristina', 'Johansson', 'Susanna', 'Sanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Susanna "Sanna" Kristina Johansson');
    expect(parts.find(p => p.text === 'Susanna')?.underline).toBe(true);
  });

  it('falls back to nickname after all given names when no preferred name', () => {
    const parts = fullNameParts('Anna', null, null, 'Nanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna "Nanna"');
  });

  it('falls back to nickname before surname when no preferred name', () => {
    const parts = fullNameParts('Susanna', 'Johansson', null, 'Sanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Susanna "Sanna" Johansson');
  });

  it('omits nickname when null', () => {
    const parts = fullNameParts('Anna', 'Johansson', null, null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Johansson');
  });
});

describe('getDisplayName', () => {
  it('returns null for empty array', () => {
    expect(getDisplayName([])).toBeNull();
  });

  it('returns the only element when array has one item', () => {
    const names = [{ sort_order: 0, given_name: 'Anna' }];
    expect(getDisplayName(names)).toBe(names[0]);
  });

  it('returns the name with the highest sort_order (most recent)', () => {
    const birth = { sort_order: 0, given_name: 'Anna', surname: 'Lindqvist' };
    const married = { sort_order: 1, given_name: 'Anna', surname: 'Persson' };
    expect(getDisplayName([birth, married])).toBe(married);
  });

  it('does not mutate the input array', () => {
    const names = [
      { sort_order: 2, given_name: 'C' },
      { sort_order: 0, given_name: 'A' },
      { sort_order: 1, given_name: 'B' },
    ];
    const copy = [...names];
    getDisplayName(names);
    expect(names).toEqual(copy);
  });
});

describe('chartNameParts', () => {
  it('shows preferred_name + surname with underline on preferred token', () => {
    const parts = chartNameParts('Bengt Gunnar', 'Persson', 'Gunnar');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Gunnar Persson');
    expect(parts.find(p => p.text === 'Gunnar')?.underline).toBe(true);
    expect(parts.find(p => p.text === 'Persson')?.underline).toBe(false);
  });

  it('falls back to first given name token when no preferred_name', () => {
    const parts = chartNameParts('Anna Maria', 'Holm', null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Holm');
    expect(parts.find(p => p.text === 'Anna')?.underline).toBe(false);
  });

  it('handles null given name', () => {
    const parts = chartNameParts(null, 'Svensson', null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Svensson');
  });

  it('handles null surname', () => {
    const parts = chartNameParts('Lars Erik', null, 'Erik');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Erik');
    expect(parts.find(p => p.text === 'Erik')?.underline).toBe(true);
  });

  it('returns empty array for all-null inputs', () => {
    expect(chartNameParts(null, null, null)).toEqual([]);
  });
});

describe('formatChartName', () => {
  it('uses preferred_name over first given name token', () => {
    expect(formatChartName({ given_name: 'Bengt Gunnar', surname: 'Persson', preferred_name: 'Gunnar' }))
      .toBe('Gunnar Persson');
  });

  it('falls back to first given name token when no preferred_name', () => {
    expect(formatChartName({ given_name: 'Anna Maria', surname: 'Holm', preferred_name: null }))
      .toBe('Anna Holm');
  });

  it('handles missing surname', () => {
    expect(formatChartName({ given_name: 'Lars', surname: null, preferred_name: null }))
      .toBe('Lars');
  });

  it('handles missing given name', () => {
    expect(formatChartName({ given_name: null, surname: 'Eriksson', preferred_name: null }))
      .toBe('Eriksson');
  });
});

describe('parseAsteriskNotation', () => {
  it('extracts preferred name from asterisk notation', () => {
    const result = parseAsteriskNotation('Elisabeth* Cathrina');
    expect(result.given_name).toBe('Elisabeth Cathrina');
    expect(result.preferred_name).toBe('Elisabeth');
  });

  it('extracts middle-name asterisk', () => {
    const result = parseAsteriskNotation('Eva Linda* Marie');
    expect(result.given_name).toBe('Eva Linda Marie');
    expect(result.preferred_name).toBe('Linda');
  });

  it('extracts first-token asterisk', () => {
    const result = parseAsteriskNotation('Lars* Erik');
    expect(result.given_name).toBe('Lars Erik');
    expect(result.preferred_name).toBe('Lars');
  });

  it('returns null preferred_name when no asterisk', () => {
    const result = parseAsteriskNotation('Anna Maria');
    expect(result.given_name).toBe('Anna Maria');
    expect(result.preferred_name).toBeNull();
  });

  it('trims whitespace', () => {
    const result = parseAsteriskNotation('  Anna*  Maria  ');
    expect(result.given_name).toBe('Anna Maria');
    expect(result.preferred_name).toBe('Anna');
  });

  it('extracts preferred name from exclamation mark notation', () => {
    const result = parseAsteriskNotation('Elisabeth! Cathrina');
    expect(result.given_name).toBe('Elisabeth Cathrina');
    expect(result.preferred_name).toBe('Elisabeth');
  });

  it('extracts middle-name exclamation mark', () => {
    const result = parseAsteriskNotation('Eva Linda! Marie');
    expect(result.given_name).toBe('Eva Linda Marie');
    expect(result.preferred_name).toBe('Linda');
  });
});

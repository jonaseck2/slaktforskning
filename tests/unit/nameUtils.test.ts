import { describe, it, expect } from 'vitest';
import { fullNameParts, givenNameParts, parseAsteriskNotation } from '../../src/renderer/utils/nameUtils';

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
});

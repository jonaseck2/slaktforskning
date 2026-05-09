import { describe, it, expect } from 'vitest';
import { DE_RULES } from '../../src/gazetteer-build/normalize-rules';

function stripSuffix(input: string, rules: { stripSuffixes: string[] }): string {
  // Mirrors the resolver's case-insensitive longest-first strip.
  const sorted = [...rules.stripSuffixes].sort((a, b) => b.length - a.length);
  let s = input.trim();
  for (const suffix of sorted) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reTrailing = new RegExp(`\\s+${escaped}\\s*$`, 'i');
    if (reTrailing.test(s)) s = s.replace(reTrailing, '').trim();
    const reLeading = new RegExp(`^${escaped}\\s+`, 'i');
    if (reLeading.test(s)) s = s.replace(reLeading, '').trim();
  }
  return s;
}

describe('DE_RULES — ecclesiastical suffixes', () => {
  it('strips Kirchgemeinde', () => {
    expect(stripSuffix('Kirchgemeinde St. Petri', DE_RULES)).toBe('St. Petri');
  });
  it('strips Pfarrei', () => {
    expect(stripSuffix('Pfarrei St. Maria', DE_RULES)).toBe('St. Maria');
  });
  it('strips Pfarrei-Verband before Pfarrei (longest-first)', () => {
    expect(stripSuffix('Pfarrei-Verband Nord', DE_RULES)).toBe('Nord');
  });
  it('strips Kirchengemeinde trailing', () => {
    expect(stripSuffix('Hamburg-Altona Kirchengemeinde', DE_RULES)).toBe('Hamburg-Altona');
  });
});

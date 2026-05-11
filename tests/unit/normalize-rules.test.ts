import { describe, it, expect } from 'vitest';
import { DE_RULES, GB_RULES } from '../../src/gazetteer-build/normalize-rules';

function stripSuffix(input: string, rules: { stripSuffixes: string[]; stripPrefixes?: string[] }): string {
  // Mirrors the resolver's case-insensitive longest-first strip for both
  // leading and trailing affixes. `stripSuffixes` are matched at either end
  // (suffixes that also appear as one-word prefixes still strip); explicit
  // multi-word prefixes go into `stripPrefixes` (e.g. "County of", "Royal Burgh of").
  const allTerms = [...rules.stripSuffixes, ...(rules.stripPrefixes ?? [])];
  const sorted = [...allTerms].sort((a, b) => b.length - a.length);
  let s = input.trim();
  for (const term of sorted) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reTrailing = new RegExp(`\\s+${escaped}\\s*$`, 'i');
    if (reTrailing.test(s)) s = s.replace(reTrailing, '').trim();
    const reLeading = new RegExp(`^${escaped}\\s+`, 'i');
    if (reLeading.test(s)) s = s.replace(reLeading, '').trim();
  }
  return s;
}

describe('DE_RULES — ecclesiastical suffixes', async () => {
  it('strips Kirchgemeinde', async () => {
    expect(stripSuffix('Kirchgemeinde St. Petri', DE_RULES)).toBe('St. Petri');
  });
  it('strips Pfarrei', async () => {
    expect(stripSuffix('Pfarrei St. Maria', DE_RULES)).toBe('St. Maria');
  });
  it('strips Pfarrei-Verband before Pfarrei (longest-first)', async () => {
    expect(stripSuffix('Pfarrei-Verband Nord', DE_RULES)).toBe('Nord');
  });
  it('strips Kirchengemeinde trailing', async () => {
    expect(stripSuffix('Hamburg-Altona Kirchengemeinde', DE_RULES)).toBe('Hamburg-Altona');
  });
});

describe('GB_RULES — British-isles civil + ecclesiastical suffixes', async () => {
  it('strips Council Area', async () => {
    expect(stripSuffix('East Lothian Council Area', GB_RULES)).toBe('East Lothian');
  });
  it('strips Civil Parish (longest-first; matched before bare "parish")', async () => {
    expect(stripSuffix('Civil Parish of Woodbridge', GB_RULES)).toBe('Woodbridge');
  });
  it('strips County of prefix', async () => {
    expect(stripSuffix('County of Suffolk', GB_RULES)).toBe('Suffolk');
  });
  it('strips Community trailing (Wales)', async () => {
    expect(stripSuffix('Llanrwst Community', GB_RULES)).toBe('Llanrwst');
  });
  it('strips Royal Burgh prefix', async () => {
    expect(stripSuffix('Royal Burgh of Stirling', GB_RULES)).toBe('Stirling');
  });
});

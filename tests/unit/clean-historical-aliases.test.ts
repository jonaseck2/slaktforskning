import { describe, it, expect } from 'vitest';
import { cleanHistoricalAliases, cleanTranslations } from '../../scripts/clean-historical-aliases';
import type { GazetteerNode } from '../../src/api/place-gazetteers/types';

describe('cleanHistoricalAliases', () => {
  it('drops aliases that collide with a modern place name or are junk fragments', () => {
    const root: GazetteerNode = {
      name: 'World (Historical)', type: 'world', lat: 0, lon: 0,
      children: [
        { name: 'Qajar Iran', type: 'country', lat: 35.7, lon: 51.4,
          aliases: ['Persia', 'Iran', 'Qajar'] },
        { name: 'Estado Novo', type: 'country', lat: 38.7, lon: -9.1,
          aliases: ['New State', 'New'] },
      ],
    };
    // 'iran' is a modern country name; 'persia' is not modern → kept.
    const modern = new Set(['iran']);
    const removed = cleanHistoricalAliases(root, modern);

    const qajar = root.children![0];
    const estado = root.children![1];
    expect(qajar.aliases).not.toContain('Iran');   // collided with a modern name
    expect(qajar.aliases).toContain('Persia');     // genuinely historical, kept
    expect(qajar.aliases).toContain('Qajar');      // kept
    expect(estado.aliases).not.toContain('New');   // junk fragment deny-list
    expect(estado.aliases).toContain('New State'); // real (if odd) name, kept
    expect(removed).toBe(2);
  });

  it('filters modern-name exonyms out of the language-gazetteer translations map', () => {
    // lang-world-historical stores exonyms as translations.__merged__[pathKey] = [...].
    const translations = {
      __merged__: {
        'World (Historical) › Edom': ['Idumæa', 'Edum'],          // Edum collides w/ modern Swedish village
        'World (Historical) › Spanish Empire': ['Imperio español', 'Spanien'],
        'World (Historical) › Brittany': ['Breizh', 'Bretagne'],  // no modern collision → untouched
      },
    };
    const modern = new Set(['edum', 'spanien']);
    const removed = cleanTranslations(translations, modern);
    expect(translations.__merged__['World (Historical) › Edom']).toEqual(['Idumæa']);
    expect(translations.__merged__['World (Historical) › Spanish Empire']).toEqual(['Imperio español']);
    expect(translations.__merged__['World (Historical) › Brittany']).toEqual(['Breizh', 'Bretagne']);
    expect(removed).toBe(2);
  });

  it('removes the aliases key entirely when every alias is dropped', () => {
    const root: GazetteerNode = {
      name: 'World (Historical)', type: 'world', lat: 0, lon: 0,
      children: [{ name: 'Foo', type: 'country', lat: 0, lon: 0, aliases: ['Sweden'] }],
    };
    cleanHistoricalAliases(root, new Set(['sweden']));
    expect(root.children![0].aliases).toBeUndefined();
  });
});

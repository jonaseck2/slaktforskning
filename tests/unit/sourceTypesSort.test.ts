import { describe, it, expect } from 'vitest';
import { SOURCE_TYPE_VALUES } from '../../src/renderer/constants/eventTypes';
import sv from '../../src/renderer/i18n/sv';
import en from '../../src/renderer/i18n/en';

// Mirrors the locale-aware sort used at render time in
// src/renderer/components/modals/SourceModal.vue and
// src/renderer/components/SourcePanel.vue. Asserting against the i18n
// messages directly (rather than mounting the component) keeps the test
// focused on the property the user observes: dropdown order in their
// locale.
function sortedFor(locale: 'sv' | 'en'): string[] {
  const messages = locale === 'sv' ? sv : en;
  const labels = (messages as { sourceTypes: Record<string, string> }).sourceTypes;
  const collator = new Intl.Collator(locale);
  return [...SOURCE_TYPE_VALUES].sort((a, b) => collator.compare(labels[a], labels[b]));
}

describe('Source type dropdown — locale-aware sort', () => {
  it('every value has a Swedish label', () => {
    const labels = sv.sourceTypes as Record<string, string>;
    for (const v of SOURCE_TYPE_VALUES) {
      expect(labels[v], `missing sv label for ${v}`).toBeTruthy();
    }
  });

  it('every value has an English label', () => {
    const labels = en.sourceTypes as Record<string, string>;
    for (const v of SOURCE_TYPE_VALUES) {
      expect(labels[v], `missing en label for ${v}`).toBeTruthy();
    }
  });

  it('Swedish: Adelskalender (peerage_register) sorts before Bok (book)', () => {
    const order = sortedFor('sv');
    expect(order.indexOf('peerage_register')).toBeLessThan(order.indexOf('book'));
  });

  it('Swedish: Bouppteckning (probate_inventory) sorts before Brev (letter)', () => {
    const order = sortedFor('sv');
    expect(order.indexOf('probate_inventory')).toBeLessThan(order.indexOf('letter'));
  });

  it('Swedish: Övrigt (other) sorts last — å/ä/ö come after z', () => {
    const order = sortedFor('sv');
    expect(order[order.length - 1]).toBe('other');
  });

  it('Swedish: Uppslagsverk (encyclopedia) and Utvandringshandling (passenger_list) sort near the end before Övrigt', () => {
    const order = sortedFor('sv');
    expect(order.indexOf('encyclopedia')).toBeLessThan(order.indexOf('other'));
    expect(order.indexOf('passenger_list')).toBeLessThan(order.indexOf('other'));
    // U comes before Ö in Swedish — both before 'other'
    expect(order.indexOf('encyclopedia')).toBeLessThan(order.indexOf('passenger_list'));
  });

  it("English: Encyclopedia sorts before Genealogist's work", () => {
    const order = sortedFor('en');
    expect(order.indexOf('encyclopedia')).toBeLessThan(order.indexOf('genealogist'));
  });

  it('English: Book sorts before Census', () => {
    const order = sortedFor('en');
    expect(order.indexOf('book')).toBeLessThan(order.indexOf('census'));
  });

  it('dropdown shows all 18 entries (13 original + 5 new)', () => {
    expect(SOURCE_TYPE_VALUES.length).toBe(18);
  });
});

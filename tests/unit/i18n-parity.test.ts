import { describe, it, expect } from 'vitest';
import sv from '../../src/renderer/i18n/sv';
import en from '../../src/renderer/i18n/en';
import {
  EVENT_TYPE_VALUES,
  PERSON_EVENT_TYPE_VALUES,
  RELATIONSHIP_EVENT_TYPE_VALUES,
} from '../../src/renderer/constants/eventTypes';

/**
 * Asserts the sv ↔ en message trees have the same set of leaf keys.
 *
 * This is structural parity (key presence), NOT value parity — sv and en
 * intentionally hold different strings, and some sections (e.g.
 * researchTasks.title) are deliberately worded differently per locale. What
 * must never diverge is the key *set*: a key present in one locale but missing
 * in the other means a hardcoded fallback or a missing translation at runtime.
 *
 * Guards the keys added by the Ben-feedback polish batch
 * (events.dateLabels.*, events.participantsLabels.*, events.participantSaveFirst*,
 * events.saveAndContinue) and every other key going forward.
 */
function collectKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...collectKeys(v, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

describe('i18n parity (sv ↔ en)', () => {
  const svKeys = new Set(collectKeys(sv));
  const enKeys = new Set(collectKeys(en));

  it('every key in sv.ts exists in en.ts', () => {
    const missing = [...svKeys].filter((k) => !enKeys.has(k)).sort();
    expect(missing, `keys in sv missing from en:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every key in en.ts exists in sv.ts', () => {
    const missing = [...enKeys].filter((k) => !svKeys.has(k)).sort();
    expect(missing, `keys in en missing from sv:\n${missing.join('\n')}`).toEqual([]);
  });
});

/**
 * The sv ↔ en check above catches a key added to one locale and not the other.
 * It cannot catch a type added to the constants and to neither locale, which
 * renders in the picker as the raw key `eventTypes.cohabitation`. This pair
 * closes that hole in both directions.
 */
describe('event types have a label in every locale', () => {
  for (const [name, table] of [['sv', sv], ['en', en]] as const) {
    it(`${name}.ts labels every EVENT_TYPE_VALUES member`, () => {
      const labels = (table as { eventTypes: Record<string, string> }).eventTypes;
      const missing = EVENT_TYPE_VALUES.filter((t) => !labels[t]?.trim());
      expect(missing, `event types with no ${name} label: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${name}.ts has no eventTypes label without a matching constant`, () => {
      const labels = (table as { eventTypes: Record<string, string> }).eventTypes;
      const orphans = Object.keys(labels).filter(
        (k) => !(EVENT_TYPE_VALUES as readonly string[]).includes(k),
      );
      expect(orphans, `${name} labels a type nothing can select: ${orphans.join(', ')}`).toEqual([]);
    });
  }

  // ArkivDigital's sambohändelse is a fact about a couple, so it belongs in the
  // relationship event picker and nowhere in the person one.
  it('cohabitation is offered in the relationship picker, not the person picker', () => {
    expect(RELATIONSHIP_EVENT_TYPE_VALUES).toContain('cohabitation');
    expect(PERSON_EVENT_TYPE_VALUES).not.toContain('cohabitation');
    expect(sv.eventTypes.cohabitation).toBe('Sammanboende');
    expect(en.eventTypes.cohabitation).toBe('Cohabitation');
  });
});

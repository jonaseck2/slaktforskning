import { describe, it, expect } from 'vitest';
import sv from '../../src/renderer/i18n/sv';
import en from '../../src/renderer/i18n/en';

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

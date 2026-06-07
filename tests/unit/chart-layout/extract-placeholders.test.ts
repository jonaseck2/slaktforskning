import { describe, it, expect } from 'vitest';
import { extractPlaceholders } from '../../../src/renderer/utils/chart-layout/extract-placeholders';
import { PLACEHOLDER_PREFIX } from '../../../src/renderer/utils/chart-layout/hourglass-tree';
import type { BoxLayout } from '../../../src/renderer/utils/chart-layout/types';

function box(id: string, x = 0, y = 0): BoxLayout {
  return {
    person: { id, givenName: null, surname: null, preferredName: null, nickname: null, sex: 'U', living: true, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null },
    isFocal: false, x, y, w: 100, h: 40,
  };
}

describe('extractPlaceholders', () => {
  it('splits placeholder boxes out into typed PlaceholderBox entries, leaving real boxes', () => {
    const real = box('real-1', 10, 20);
    const father = box(`${PLACEHOLDER_PREFIX}father_real-1`, 30, 5);
    const daughter = box(`${PLACEHOLDER_PREFIX}daughter_real-1`, 30, 90);
    const { boxes, placeholders } = extractPlaceholders([real, father, daughter]);

    expect(boxes.map(b => b.person.id)).toEqual(['real-1']);
    expect(placeholders).toEqual([
      { type: 'placeholder', role: 'daughter', childPersonId: 'real-1', x: 30, y: 90 },
      { type: 'placeholder', role: 'father', childPersonId: 'real-1', x: 30, y: 5 },
    ]);
  });

  it('parses all five roles', () => {
    const ids = ['father', 'mother', 'spouse', 'son', 'daughter'].map(
      r => box(`${PLACEHOLDER_PREFIX}${r}_owner`),
    );
    const { boxes, placeholders } = extractPlaceholders(ids);
    expect(boxes).toHaveLength(0);
    expect(placeholders.map(p => p.role).sort()).toEqual(['daughter', 'father', 'mother', 'son', 'spouse']);
    expect(placeholders.every(p => p.childPersonId === 'owner')).toBe(true);
  });

  it('returns the input boxes unchanged when there are no placeholders', () => {
    const a = box('a'); const b = box('b');
    const { boxes, placeholders } = extractPlaceholders([a, b]);
    expect(boxes).toEqual([a, b]);
    expect(placeholders).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  sortEventTypes,
  isEventTypeSortMode,
  type EventTypeSortMode,
} from '../../src/renderer/utils/eventTypeSort';
import { EVENT_TYPE_VALUES, SPAN_EVENT_TYPES, isSpanEventType } from '../../src/renderer/constants/eventTypes';

describe('isEventTypeSortMode', () => {
  it('accepts the two known modes', () => {
    expect(isEventTypeSortMode('alphabetical')).toBe(true);
    expect(isEventTypeSortMode('canonical')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isEventTypeSortMode(null)).toBe(false);
    expect(isEventTypeSortMode(undefined)).toBe(false);
    expect(isEventTypeSortMode('')).toBe(false);
    expect(isEventTypeSortMode('alpha')).toBe(false);
    expect(isEventTypeSortMode(42)).toBe(false);
  });
});

describe('sortEventTypes', () => {
  // Use a tiny fixture so the test is independent of the i18n table
  const types = ['birth', 'death', 'marriage'] as const;
  const labels: Record<string, string> = {
    birth: 'Födelse',     // F
    death: 'Död',         // D
    marriage: 'Vigsel',   // V
  };
  const labelFor = (t: string) => labels[t] ?? t;

  it('returns input order when mode is canonical', () => {
    const out: EventTypeSortMode = 'canonical';
    expect(sortEventTypes(types, out, labelFor)).toEqual(['birth', 'death', 'marriage']);
  });

  it('returns label-sorted order when mode is alphabetical', () => {
    expect(sortEventTypes(types, 'alphabetical', labelFor))
      .toEqual(['death', 'birth', 'marriage']); // Död, Födelse, Vigsel
  });

  it('does not mutate the input array', () => {
    const input: readonly string[] = ['marriage', 'birth', 'death'];
    const before = [...input];
    sortEventTypes(input, 'alphabetical', labelFor);
    expect(input).toEqual(before);
  });

  it('uses base sensitivity so case does not flip the order', () => {
    expect(sortEventTypes(['a', 'B', 'c'] as const, 'alphabetical', (x) => x))
      .toEqual(['a', 'B', 'c']);
  });
});

describe('SPAN_EVENT_TYPES + isSpanEventType', () => {
  it('lists exactly the five span types', () => {
    expect([...SPAN_EVENT_TYPES]).toEqual([
      'residence', 'education', 'occupation', 'military', 'travel',
    ]);
  });

  it('every span type is a known event type', () => {
    for (const t of SPAN_EVENT_TYPES) {
      expect(EVENT_TYPE_VALUES).toContain(t);
    }
  });

  it('isSpanEventType returns true only for span types', () => {
    expect(isSpanEventType('residence')).toBe(true);
    expect(isSpanEventType('travel')).toBe(true);
    expect(isSpanEventType('birth')).toBe(false);
    expect(isSpanEventType('death')).toBe(false);
    expect(isSpanEventType('marriage')).toBe(false);
    expect(isSpanEventType('unknown')).toBe(false);
  });

  it('travel is in EVENT_TYPE_VALUES', () => {
    expect(EVENT_TYPE_VALUES).toContain('travel');
  });
});

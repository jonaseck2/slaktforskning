import { describe, it, expect } from 'vitest';
import { suggestNextEventType, DEFAULT_EVENT_LADDER } from '../../src/renderer/utils/eventDefaults';

describe('suggestNextEventType', () => {
  it('returns birth when no events and smart defaults enabled', () => {
    expect(suggestNextEventType([], true)).toBe('birth');
  });

  it('returns empty string when smart defaults disabled, regardless of existing events', () => {
    expect(suggestNextEventType([], false)).toBe('');
    expect(suggestNextEventType(['birth'], false)).toBe('');
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence'], false)).toBe('');
  });

  it('walks the ladder birth → death → occupation → residence', () => {
    expect(suggestNextEventType(['birth'], true)).toBe('death');
    expect(suggestNextEventType(['birth', 'death'], true)).toBe('occupation');
    expect(suggestNextEventType(['birth', 'death', 'occupation'], true)).toBe('residence');
  });

  it('returns empty string when all ladder types exist (no preselection)', () => {
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence'], true)).toBe('');
  });

  it('ignores off-ladder events and returns first missing ladder type', () => {
    expect(suggestNextEventType(['occupation', 'christening'], true)).toBe('birth');
  });

  it('returns empty string when all ladder types present even with extras', () => {
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence', 'christening'], true))
      .toBe('');
  });

  it('exports the ladder as a readonly array', () => {
    expect(DEFAULT_EVENT_LADDER).toEqual(['birth', 'death', 'occupation', 'residence']);
  });
});

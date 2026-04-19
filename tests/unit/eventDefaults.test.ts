import { describe, it, expect } from 'vitest';
import { suggestNextEventType, DEFAULT_EVENT_LADDER } from '../../src/renderer/utils/eventDefaults';

describe('suggestNextEventType', () => {
  it('returns birth when no events and smart defaults enabled', () => {
    expect(suggestNextEventType([], true)).toBe('birth');
  });

  it('returns birth when smart defaults disabled, regardless of existing events', () => {
    expect(suggestNextEventType([], false)).toBe('birth');
    expect(suggestNextEventType(['birth'], false)).toBe('birth');
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence'], false)).toBe('birth');
  });

  it('walks the ladder birth → death → occupation → residence', () => {
    expect(suggestNextEventType(['birth'], true)).toBe('death');
    expect(suggestNextEventType(['birth', 'death'], true)).toBe('occupation');
    expect(suggestNextEventType(['birth', 'death', 'occupation'], true)).toBe('residence');
  });

  it('residence is terminal — stays at residence when all ladder types exist', () => {
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence'], true)).toBe('residence');
  });

  it('ignores off-ladder events and returns first missing ladder type', () => {
    expect(suggestNextEventType(['occupation', 'baptism'], true)).toBe('birth');
  });

  it('returns residence when all ladder types present even with extras', () => {
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence', 'baptism'], true))
      .toBe('residence');
  });

  it('exports the ladder as a readonly array', () => {
    expect(DEFAULT_EVENT_LADDER).toEqual(['birth', 'death', 'occupation', 'residence']);
  });
});

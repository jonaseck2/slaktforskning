import { describe, it, expect } from 'vitest';
import { redactPerson } from '../../src/renderer/utils/reportPrivacy';

describe('redactPerson', () => {
  it('hides identifiers for living persons regardless of toggle', () => {
    const r = redactPerson(
      { id: 'p1', living: true, identifiers: [{ type: 'personnummer', value: '19800101-0000' }] },
      { redactLiving: false },
    );
    expect(r.identifiers).toEqual([]);
  });

  it('keeps identifiers for deceased persons', () => {
    const r = redactPerson(
      { id: 'p1', living: false, identifiers: [{ type: 'riksarkivet', value: 'X' }] },
      { redactLiving: false },
    );
    expect(r.identifiers).toEqual([{ type: 'riksarkivet', value: 'X' }]);
  });

  it('replaces birth year with decade when redactLiving is on', () => {
    const r = redactPerson({ id: 'p1', living: true, birthYear: 1985 }, { redactLiving: true });
    expect(r.birthYear).toBe(1980);
  });

  it('hides notes and portrait when redactLiving is on', () => {
    const r = redactPerson(
      { id: 'p1', living: true, notes: 'Private', portraitUrl: 'data:image/png;base64,...' },
      { redactLiving: true },
    );
    expect(r.notes).toBeNull();
    expect(r.portraitUrl).toBeNull();
  });

  it('does nothing for deceased persons when redactLiving is on', () => {
    const r = redactPerson(
      { id: 'p1', living: false, notes: 'Public', birthYear: 1850 },
      { redactLiving: true },
    );
    expect(r.notes).toBe('Public');
    expect(r.birthYear).toBe(1850);
  });
});

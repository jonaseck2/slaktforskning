import { describe, it, expect } from 'vitest';
import { redactPerson, decadeFloor } from '../../src/api/html_site/redact';

describe('decadeFloor', () => {
  it('floors year to decade', () => {
    expect(decadeFloor(1985)).toBe(1980);
    expect(decadeFloor(1980)).toBe(1980);
    expect(decadeFloor(2003)).toBe(2000);
  });
});

describe('redactPerson', () => {
  const livingPerson = {
    id: 'p1',
    sex: 'F' as const,
    living: true,
    notes: 'private notes',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    given_name: 'Anna',
    surname: 'Andersson',
    birth_year: 1985,
    death_year: null,
  };

  it('redacts a living person, keeping name + sex + decade-floored birth', () => {
    const r = redactPerson(livingPerson);
    expect(r.id).toBe('p1');
    expect(r.sex).toBe('F');
    expect(r.living).toBe(true);
    expect(r.given_name).toBe('Anna');
    expect(r.surname).toBe('Andersson');
    expect(r.birth_year).toBe(1980);
    expect(r.notes).toBe('');
    expect(r.redacted).toBe(true);
  });

  it('returns the input unchanged when not living', () => {
    const p = { ...livingPerson, living: false };
    const r = redactPerson(p);
    expect(r.notes).toBe('private notes');
    expect(r.birth_year).toBe(1985);
    expect(r.redacted).toBe(false);
  });

  it('handles missing birth_year gracefully', () => {
    const p = { ...livingPerson, birth_year: null };
    const r = redactPerson(p);
    expect(r.birth_year).toBeNull();
  });
});

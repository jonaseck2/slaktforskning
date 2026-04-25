export interface RedactablePerson {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  given_name?: string;
  surname?: string;
  birth_year?: number | null;
  death_year?: number | null;
}

export interface RedactedPerson extends RedactablePerson {
  redacted: boolean;
}

export function decadeFloor(year: number): number {
  return Math.floor(year / 10) * 10;
}

export function redactPerson(p: RedactablePerson): RedactedPerson {
  if (!p.living) return { ...p, redacted: false };
  return {
    ...p,
    notes: '',
    birth_year: p.birth_year != null ? decadeFloor(p.birth_year) : null,
    death_year: null,
    redacted: true,
  };
}

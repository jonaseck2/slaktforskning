export interface PersonRedactionInput {
  id: string;
  living?: boolean;
  birthYear?: number | null;
  deathYear?: number | null;
  givenName?: string | null;
  surname?: string | null;
  notes?: string | null;
  portraitUrl?: string | null;
  identifiers?: Array<{ type: string; value: string }>;
}

export interface RedactionOptions {
  redactLiving: boolean;
}

export function redactPerson<T extends PersonRedactionInput>(p: T, opts: RedactionOptions): T {
  // Identifiers always hidden for living, regardless of toggle.
  const identifiers = p.living ? [] : (p.identifiers || []);

  if (!p.living || !opts.redactLiving) {
    return { ...p, identifiers };
  }

  const decade = p.birthYear != null ? Math.floor(p.birthYear / 10) * 10 : null;
  return {
    ...p,
    identifiers,
    birthYear: decade,
    notes: null,
    portraitUrl: null,
  };
}

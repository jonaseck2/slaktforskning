// Shared utilities for rendering person names with preferred-name underline.

export interface NamePart {
  text: string;
  underline: boolean;
}

/** Splits given name into tokens; marks the one matching preferredName for underlining. */
export function givenNameParts(givenName: string | null, preferredName: string | null): NamePart[] {
  const parts: NamePart[] = [];
  const tokens = (givenName ?? '').split(' ').filter(t => t.length > 0);
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) parts.push({ text: ' ', underline: false });
    parts.push({ text: tokens[i], underline: tokens[i] === preferredName });
  }
  return parts;
}

/**
 * Full name parts: given name tokens (with underline on preferred token),
 * nickname in quotes inserted right after the preferred name token (or after
 * all given names when no preferred name), then surname.
 *
 * Example: givenName="Elisabeth Cathrina", preferredName="Elisabeth", nickname="Lisa"
 *   → Elisabeth[u] "Lisa" Cathrina
 */
export function fullNameParts(
  givenName: string | null,
  surname: string | null,
  preferredName: string | null,
  nickname?: string | null,
): NamePart[] {
  const parts: NamePart[] = [];
  const tokens = (givenName ?? '').split(' ').filter(t => t.length > 0);
  let nicknameInserted = false;

  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) parts.push({ text: ' ', underline: false });
    const isPreferred = !!preferredName && tokens[i] === preferredName;
    parts.push({ text: tokens[i], underline: isPreferred });
    if (isPreferred && nickname) {
      parts.push({ text: ' ', underline: false });
      parts.push({ text: `"${nickname}"`, underline: false });
      nicknameInserted = true;
    }
  }

  if (nickname && !nicknameInserted) {
    if (parts.length > 0) parts.push({ text: ' ', underline: false });
    parts.push({ text: `"${nickname}"`, underline: false });
  }

  if (surname) {
    if (parts.length > 0) parts.push({ text: ' ', underline: false });
    parts.push({ text: surname, underline: false });
  }
  return parts;
}

/**
 * Parses asterisk notation from a raw given-name string.
 * "Elisabeth* Cathrina" → { given_name: "Elisabeth Cathrina", preferred_name: "Elisabeth" }
 * "Elisabeth Cathrina"  → { given_name: "Elisabeth Cathrina", preferred_name: null }
 */
export function parseAsteriskNotation(raw: string): { given_name: string; preferred_name: string | null } {
  const idx = raw.indexOf('*');
  if (idx === -1) return { given_name: raw.trim(), preferred_name: null };
  const beforeStar = raw.slice(0, idx).trimEnd();
  const afterStar = raw.slice(idx + 1).trimStart();
  const tokens = beforeStar.split(/\s+/).filter(Boolean);
  const preferred_name = tokens[tokens.length - 1] ?? null;
  const given_name = (beforeStar + (afterStar ? ' ' + afterStar : '')).replace(/\s+/g, ' ').trim();
  return { given_name: given_name || raw.trim(), preferred_name };
}

/**
 * Plain-string display name for non-component contexts (reports, dropdowns, audit strings).
 * Uses preferred_name if set, otherwise the first token of given_name, then appends surname.
 */
export function formatPersonName(name: {
  given_name?: string | null;
  surname?: string | null;
  preferred_name?: string | null;
}): string {
  const first = name.preferred_name ?? name.given_name?.split(' ')[0] ?? '';
  return [first, name.surname].filter(Boolean).join(' ');
}

/** Truncates a parts array to at most maxLen visible characters, appending '…' if cut. */
export function truncateNameParts(parts: NamePart[], maxLen: number): NamePart[] {
  const full = parts.map(p => p.text).join('');
  if (full.length <= maxLen) return parts;

  let used = 0;
  const result: NamePart[] = [];
  for (const part of parts) {
    const room = maxLen - 1 - used; // leave one char for '…'
    if (used + part.text.length > maxLen - 1) {
      if (room > 0) result.push({ text: part.text.slice(0, room) + '…', underline: part.underline });
      else if (result.length > 0) {
        const last = result[result.length - 1];
        result[result.length - 1] = { text: last.text.slice(0, -1) + '…', underline: last.underline };
      }
      break;
    }
    result.push({ ...part });
    used += part.text.length;
  }
  return result;
}

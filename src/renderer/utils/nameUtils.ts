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
 * Parses preferred-name marker notation from a raw given-name string.
 * Supports both * (asterisk, used by Genney) and ! (exclamation mark, used by Holger/OurKind)
 * as markers placed directly after the preferred name token.
 *
 * "Elisabeth* Cathrina" → { given_name: "Elisabeth Cathrina", preferred_name: "Elisabeth" }
 * "Elisabeth! Cathrina" → { given_name: "Elisabeth Cathrina", preferred_name: "Elisabeth" }
 * "Elisabeth Cathrina"  → { given_name: "Elisabeth Cathrina", preferred_name: null }
 */
export function parseAsteriskNotation(raw: string): { given_name: string; preferred_name: string | null } {
  const match = raw.match(/[*!]/);
  if (!match) return { given_name: raw.trim(), preferred_name: null };
  const idx = match.index!;
  const beforeMarker = raw.slice(0, idx).trimEnd();
  const afterMarker = raw.slice(idx + 1).trimStart();
  const tokens = beforeMarker.split(/\s+/).filter(Boolean);
  const preferred_name = tokens[tokens.length - 1] ?? null;
  const given_name = (beforeMarker + (afterMarker ? ' ' + afterMarker : '')).replace(/\s+/g, ' ').trim();
  return { given_name: given_name || raw.trim(), preferred_name };
}

/**
 * Plain-string display name for non-component contexts (reports, dropdowns, audit strings).
 * Uses preferred_name if set, otherwise the first token of given_name, then appends surname.
 * @deprecated Use formatFullName() instead — this function only shows one given name token.
 */
export function formatPersonName(name: {
  given_name?: string | null;
  surname?: string | null;
  preferred_name?: string | null;
}): string {
  const first = name.preferred_name ?? name.given_name?.split(' ')[0] ?? '';
  return [first, name.surname].filter(Boolean).join(' ');
}

/**
 * Canonical plain-string full name for reports, headings, and any non-component context.
 * Shows ALL given names (not just the first token), nickname in quotes after the preferred
 * name token, optional prefix before given names, and optional suffix after surname.
 *
 * Format: [prefix] [all given names + "nickname"] [surname] [suffix]
 *
 * Example: given_name="Lena Maja", preferred_name="Lena", nickname="Lenny", surname="Holm"
 *   → 'Lena "Lenny" Maja Holm'
 *
 * This is the ONLY approved function for rendering a full person name as a string.
 * Do NOT use formatPersonName(), primaryName(), displayName(), or inline string logic.
 */
export function formatFullName(name: {
  name_prefix?: string | null;
  given_name?: string | null;
  preferred_name?: string | null;
  nickname?: string | null;
  surname?: string | null;
  name_suffix?: string | null;
}): string {
  const parts: string[] = [];
  if (name.name_prefix) parts.push(name.name_prefix);
  const inner = fullNameParts(
    name.given_name ?? null,
    name.surname ?? null,
    name.preferred_name ?? null,
    name.nickname ?? null,
  ).map(p => p.text).join('');
  if (inner) parts.push(inner);
  if (name.name_suffix) parts.push(name.name_suffix);
  return parts.join(' ');
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

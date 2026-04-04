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

/** Full name parts: given name tokens (with underline) + optional nickname in quotes + optional surname. */
export function fullNameParts(
  givenName: string | null,
  surname: string | null,
  preferredName: string | null,
  nickname?: string | null,
): NamePart[] {
  const parts = givenNameParts(givenName, preferredName);
  if (nickname) {
    if (parts.length > 0) parts.push({ text: ' ', underline: false });
    parts.push({ text: `"${nickname}"`, underline: false });
  }
  if (surname) {
    if (parts.length > 0) parts.push({ text: ' ', underline: false });
    parts.push({ text: surname, underline: false });
  }
  return parts;
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

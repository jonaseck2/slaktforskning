// Shared utilities for rendering person names with preferred-name underline.

export interface NamePart {
  text: string;
  underline: boolean;
}

/**
 * Person-name record shape used by `pickDisplayedName` / `sortNamesBySortOrder`
 * and by the panel's Name table. Mirrors `person_names` row plus the optional
 * fields rendered in the panel.
 */
export interface NameData {
  id: string;
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  sort_order: number;
  name_type: string;
  date_from?: string | null;
  date_to?: string | null;
  name_prefix?: string | null;
  name_suffix?: string | null;
  name_qualifier?: string | null;
  patronymic_base?: string | null;
}

/**
 * Earliest birth event `date_value` for the person, or null if none.
 */
export function birthDateValue(events: Array<{ event_type: string; date_value: string | null }>): string | null {
  const dated = events.filter(e => e.event_type === 'birth' && e.date_value && e.date_value.length > 0);
  if (dated.length === 0) return null;
  dated.sort((a, b) => (a.date_value ?? '').localeCompare(b.date_value ?? ''));
  return dated[0].date_value;
}

/**
 * Sort names ascending by sort_order — used for the panel's "Names" table
 * presentation order.
 */
export function sortNamesBySortOrder<T extends { sort_order: number }>(names: T[]): T[] {
  return [...names].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Pick the displayed name. Mirrors `displayedNameIdSql` in src/api/persons.ts:
 *   1. Latest non-null effective `date_from` wins.
 *   2. For `birth` names the effective date is the birth event's date_value
 *      if any, otherwise the stored date_from.
 *   3. Tie-break by highest sort_order, then by id for stability.
 */
export function pickDisplayedName<T extends NameData>(
  names: T[],
  events: Array<{ event_type: string; date_value: string | null }>,
): T | null {
  if (names.length === 0) return null;
  const birthDate = birthDateValue(events);
  function effective(n: T): string | null {
    if (n.name_type === 'birth') return birthDate ?? n.date_from ?? null;
    return n.date_from ?? null;
  }
  const ranked = [...names].sort((a, b) => {
    const ea = effective(a);
    const eb = effective(b);
    if (ea && eb) {
      if (ea !== eb) return eb.localeCompare(ea); // DESC
    } else if (ea && !eb) {
      return -1;
    } else if (!ea && eb) {
      return 1;
    }
    if (a.sort_order !== b.sort_order) return b.sort_order - a.sort_order;
    return a.id.localeCompare(b.id);
  });
  return ranked[0];
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

/**
 * Plain-string full name plus a trailing birth-surname parenthetical when the
 * displayed record is not the birth record AND the person has a separate
 * `birth`-type name record with a non-empty surname that differs from the
 * displayed surname.
 *
 * Example (sv): "Anna Andersson (f. Svensson)"
 * Example (en): "Anna Andersson (b. Svensson)"
 *
 * The `bornAbbrev` is provided by the caller (resolved from the i18n key
 * `common.bornAbbrev`) so this util stays a pure function with no store /
 * i18n / DOM dependencies.
 *
 * Returns the bare `formatFullName(displayed)` when:
 *   - `options.showBirthNameParenthetical` is false
 *   - no separate `birth`-type record exists
 *   - the only `birth` record IS the displayed record
 *   - the birth record's surname is empty or equal to displayed.surname
 */
export function formatFullNameWithBirthName(
  displayed: NameData,
  allNames: NameData[],
  options: { showBirthNameParenthetical: boolean; bornAbbrev: string },
): string {
  const base = formatFullName(displayed);
  if (!options.showBirthNameParenthetical) return base;

  // Pick the birth record with the lowest sort_order (deterministic).
  const births = allNames
    .filter(n => n.name_type === 'birth')
    .sort((a, b) => a.sort_order - b.sort_order);
  const birth = births[0];
  if (!birth) return base;
  if (birth.id === displayed.id) return base;

  const birthSurname = (birth.surname ?? '').trim();
  if (!birthSurname) return base;
  if (birthSurname === (displayed.surname ?? '').trim()) return base;

  return `${base} (${options.bornAbbrev} ${birthSurname})`;
}

/**
 * Select the display name from a list of PersonName records.
 * Returns the record with the highest sort_order (most recent name — typically the
 * married/changed name). Falls back to the record with the lowest sort_order (primary)
 * if the array has only one element.
 *
 * This is the canonical way to pick which name record to show in lists and charts.
 */
export function getDisplayName<T extends { sort_order: number }>(names: T[]): T | null {
  if (names.length === 0) return null;
  return [...names].sort((a, b) => b.sort_order - a.sort_order)[0];
}

/**
 * Abbreviated name parts for space-constrained contexts (chart boxes, circle segments).
 * Shows preferred_name (tilltalsnamn) if set, otherwise the first token of given_name.
 * Appends surname. The selected given-name token is marked underline: true.
 *
 * Examples:
 *   givenName="Bengt Gunnar", preferredName="Gunnar", surname="Persson"
 *     → [{ text:"Gunnar", underline:true }, { text:" ", underline:false }, { text:"Persson", underline:false }]
 *   givenName="Anna Maria", preferredName=null, surname="Holm"
 *     → [{ text:"Anna", underline:false }, { text:" ", underline:false }, { text:"Holm", underline:false }]
 */
export function chartNameParts(
  givenName: string | null,
  surname: string | null,
  preferredName: string | null,
): NamePart[] {
  const parts: NamePart[] = [];
  const tokens = (givenName ?? '').split(' ').filter(t => t.length > 0);
  const displayGiven = preferredName ?? tokens[0] ?? null;
  if (displayGiven) {
    parts.push({ text: displayGiven, underline: !!preferredName });
  }
  if (surname) {
    if (parts.length > 0) parts.push({ text: ' ', underline: false });
    parts.push({ text: surname, underline: false });
  }
  return parts;
}

/**
 * Plain-string abbreviated name for chart boxes and space-constrained non-component contexts.
 * Uses preferred_name (tilltalsnamn) if set, otherwise the first token of given_name, then surname.
 */
export function formatChartName(name: {
  given_name?: string | null;
  surname?: string | null;
  preferred_name?: string | null;
}): string {
  const tokens = (name.given_name ?? '').split(' ').filter(Boolean);
  const first = name.preferred_name ?? tokens[0] ?? '';
  return [first, name.surname].filter(Boolean).join(' ');
}

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

/**
 * Fetch the primary display name for a person by ID.
 * Returns the formatted full name, or the fallback if no names exist.
 */
export async function resolvePersonDisplayName(personId: string, fallback = '—'): Promise<string> {
  try {
    const names = (await window.api.persons.getNames(personId)) as Array<{
      given_name: string | null;
      surname: string | null;
      preferred_name: string | null;
      nickname: string | null;
      name_prefix: string | null;
      name_suffix: string | null;
      sort_order: number;
    }>;
    if (names.length > 0) {
      const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0];
      return formatFullName(primary) || fallback;
    }
  } catch {
    // person may have been deleted
  }
  return fallback;
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

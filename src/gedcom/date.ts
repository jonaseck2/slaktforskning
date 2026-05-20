const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function parseDate(s: string): string | null {
  s = s.trim().toUpperCase();
  // DD MON YYYY
  const dmy = s.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (dmy) return `${dmy[3]}-${MONTHS[dmy[2]] ?? '01'}-${dmy[1].padStart(2, '0')}`;
  // MON YYYY
  const my = s.match(/^([A-Z]{3})\s+(\d{4})$/);
  if (my) return `${my[2]}-${MONTHS[my[1]] ?? '01'}`;
  // YYYY
  const y = s.match(/^(\d{4})$/);
  if (y) return y[1];
  return null;
}

export interface ParsedDate {
  date_type: 'exact' | 'about' | 'before' | 'after' | 'between' | 'from_to' | 'interpreted' | 'calculated' | 'unknown';
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
}

export function parseGedcomDate(raw: string): ParsedDate {
  const s = raw.trim().toUpperCase();
  const orig = raw.trim();

  // T09: GEDCOM INT — interpreted date with a user-authored phrase preserved
  // in parentheses. Shape: `INT <date> (<phrase>)`. The parsed date goes to
  // date_value; the phrase is the date_original so the user sees their own
  // wording back. Lossless on both 5.5.1 and 7.0 (INT is in both specs).
  const intMatch = raw.trim().match(/^INT\s+(.+?)\s*\(([^)]*)\)\s*$/i);
  if (intMatch) {
    return {
      date_type: 'interpreted',
      date_value: parseDate(intMatch[1].toUpperCase()),
      date_value_end: null,
      date_original: intMatch[2].trim(),
    };
  }

  // Standard GEDCOM: BET ... AND ...  (range — direction-agnostic)
  const bet = s.match(/^BET\s+(.+)\s+AND\s+(.+)$/);
  if (bet) return { date_type: 'between', date_value: parseDate(bet[1]), date_value_end: parseDate(bet[2]), date_original: orig };

  // T09: Standard GEDCOM FROM ... TO ... is a *directional* range distinct
  // from BET..AND. Pre-T09 the importer collapsed both onto `between` which
  // lost the FROM/TO vs BET/AND distinction on export. Now: FROM..TO →
  // 'from_to'; BET..AND → 'between'. Both versions support both keywords.
  const from = s.match(/^FROM\s+(.+)\s+TO\s+(.+)$/);
  if (from) return { date_type: 'from_to', date_value: parseDate(from[1]), date_value_end: parseDate(from[2]), date_original: orig };

  if (s.startsWith('BEF ')) return { date_type: 'before', date_value: parseDate(s.slice(4)), date_value_end: null, date_original: orig };
  if (s.startsWith('AFT ')) return { date_type: 'after', date_value: parseDate(s.slice(4)), date_value_end: null, date_original: orig };
  if (s.startsWith('ABT ') || s.startsWith('CAL ') || s.startsWith('EST '))
    return { date_type: 'about', date_value: parseDate(s.slice(4)), date_value_end: null, date_original: orig };

  // Non-standard abbreviations: "abt.", "abt", "ca", "ca.", "circa", "c.", "approx"
  const abtMatch = s.match(/^(?:ABT\.?|CA\.?|CIRCA|C\.|APPROX\.?)\s+(.+)$/);
  if (abtMatch) return { date_type: 'about', date_value: parseDate(abtMatch[1]), date_value_end: null, date_original: orig };

  // Non-standard range: "1850/1860" or "1850-1860" (year/year)
  const slashRange = s.match(/^(\d{4})[/-](\d{4})$/);
  if (slashRange) return { date_type: 'between', date_value: slashRange[1], date_value_end: slashRange[2], date_original: orig };

  // Non-standard: "between YYYY and YYYY" (lowercase, no BET prefix)
  const betweenWord = s.match(/^BETWEEN\s+(.+)\s+AND\s+(.+)$/);
  if (betweenWord) return { date_type: 'between', date_value: parseDate(betweenWord[1]), date_value_end: parseDate(betweenWord[2]), date_original: orig };

  // Non-standard: "before YYYY" / "after YYYY" (full word, no BEF/AFT prefix)
  const beforeWord = s.match(/^BEFORE\s+(.+)$/);
  if (beforeWord) return { date_type: 'before', date_value: parseDate(beforeWord[1]), date_value_end: null, date_original: orig };
  const afterWord = s.match(/^AFTER\s+(.+)$/);
  if (afterWord) return { date_type: 'after', date_value: parseDate(afterWord[1]), date_value_end: null, date_original: orig };

  const exact = parseDate(s);
  if (exact) return { date_type: 'exact', date_value: exact, date_value_end: null, date_original: orig };

  // Lone "?" → unknown
  if (s === '?') return { date_type: 'unknown', date_value: null, date_value_end: null, date_original: orig };

  return { date_type: 'unknown', date_value: null, date_value_end: null, date_original: orig };
}

function isoToGedcom(date_value: string): string {
  // Convert ISO date back to GEDCOM format (YYYY-MM-DD → DD MON YYYY)
  const parts = date_value.split('-');
  if (parts.length === 3) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const mon = months[parseInt(parts[1], 10) - 1] ?? parts[1];
    return `${parseInt(parts[2], 10)} ${mon} ${parts[0]}`;
  }
  if (parts.length === 2) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const mon = months[parseInt(parts[1], 10) - 1] ?? parts[1];
    return `${mon} ${parts[0]}`;
  }
  return date_value;
}

export function formatGedcomDate(date_type: string, date_value: string | null, date_value_end: string | null, date_original: string): string {
  // T09: 'interpreted' emits the GEDCOM INT form regardless of whether
  // date_original is set — date_original IS the user phrase, not a verbatim
  // GEDCOM string. Must run before the early-return below so the INT keyword
  // and the (phrase) suffix are both emitted.
  if (date_type === 'interpreted' && date_value) {
    const v = isoToGedcom(date_value);
    const phrase = date_original ? date_original : '';
    return `INT ${v} (${phrase})`;
  }
  // T09: 'from_to' emits a directional FROM..TO range. Distinct from
  // 'between' (BET..AND) so the round-trip preserves the authored keyword
  // choice on export.
  if (date_type === 'from_to' && date_value && date_value_end) {
    return `FROM ${isoToGedcom(date_value)} TO ${isoToGedcom(date_value_end)}`;
  }
  if (date_original) return date_original;
  if (!date_value) return '';
  // Always emit dates in DD MON YYYY GEDCOM format so parseGedcomDate can read
  // them back. Storing as ISO in the DB but emitting raw ISO in BET..AND broke
  // round-trip for date_value_end — see gedcom-fidelity-per-field test.
  const v = isoToGedcom(date_value);
  if (date_type === 'about') return `ABT ${v}`;
  if (date_type === 'before') return `BEF ${v}`;
  if (date_type === 'after') return `AFT ${v}`;
  if (date_type === 'between' && date_value_end) return `BET ${v} AND ${isoToGedcom(date_value_end)}`;
  return v;
}

export function isStandardGedcomDate(s: string): boolean {
  if (!s || !s.trim()) return false;
  return parseGedcomDate(s).date_type !== 'unknown';
}

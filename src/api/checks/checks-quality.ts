import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { isInvalidDate } from './check-utils';

/**
 * Flags persons with no usable name: either no `person_names` row at all, OR
 * every row's given_name + surname is blank/whitespace. The two cases are
 * surfaced under one code so the user sees one row per nameless person in
 * QualityView regardless of which path produced the empty state. Bound by the
 * Surface contract: row click navigates to the person panel, where the user
 * decides whether to fill in or remove. We never fabricate a "Unknown"
 * surname here — Prime Directive.
 */
export async function checkPersonNoName(db: Database): Promise<CheckResult[]> {
  // Pull all rows and decide blankness in JS — SQLite's default TRIM only
  // strips ASCII space, not tab/CR/LF, and getting the WHERE clause to handle
  // every whitespace variant is harder to read than a JS .trim() per row.
  const nameRows = await queryAll<{ person_id: string; given_name: string | null; surname: string | null }>(db, `
    SELECT person_id, given_name, surname FROM person_names
  `);
  const personsWithUsableName = new Set<string>();
  for (const r of nameRows) {
    if ((r.given_name && r.given_name.trim() !== '') || (r.surname && r.surname.trim() !== '')) {
      personsWithUsableName.add(r.person_id);
    }
  }
  const allPersonIds = await queryAll<{ id: string }>(db, `SELECT id FROM persons`);
  return allPersonIds
    .filter(r => !personsWithUsableName.has(r.id))
    .map(r => ({
      code: 'PERSON_NO_NAME',
      severity: 'notice' as CheckSeverity,
      message: `Personen saknar namn — kontrollera och fyll i, eller ta bort.`,
      messageParams: {},
      personIds: [r.id],
    }));
}

export async function checkUnsourcedLifeEvent(db: Database, eventType: 'birth' | 'death'): Promise<CheckResult[]> {
  const code = eventType === 'birth' ? 'UNSOURCED_BIRTH' : 'UNSOURCED_DEATH';
  const messageLabel = eventType === 'birth' ? 'Födelsehändelsen' : 'Dödshändelsen';

  const rows = await queryAll<{ person_id: string; event_id: string }>(db, `
    SELECT ep.person_id, e.id AS event_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id AND e.event_type = ?
    WHERE NOT EXISTS (
      SELECT 1 FROM citations c WHERE c.event_id = e.id
    )
  `, [eventType]);

  return rows.map(r => ({
    code,
    severity: 'notice' as CheckSeverity,
    message: `${messageLabel} saknar källhänvisning`,
    messageParams: {},
    personIds: [r.person_id],
    eventIds: [r.event_id],
  }));
}

export async function checkInvalidDates(db: Database): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check events.date_value and events.date_value_end
  const eventRows = await queryAll<{ id: string; date_value: string | null; date_value_end: string | null }>(db, `
    SELECT id, date_value, date_value_end FROM events
    WHERE date_value IS NOT NULL OR date_value_end IS NOT NULL
  `);

  // Build event→person map for personIds
  const eventPersonMap = new Map<string, string[]>();
  const epRows = await queryAll<{ event_id: string; person_id: string }>(db, `
    SELECT event_id, person_id FROM event_participants
  `);
  for (const ep of epRows) {
    if (!eventPersonMap.has(ep.event_id)) eventPersonMap.set(ep.event_id, []);
    eventPersonMap.get(ep.event_id)!.push(ep.person_id);
  }

  for (const row of eventRows) {
    const personIds = eventPersonMap.get(row.id) ?? [];
    if (row.date_value) {
      const reason = isInvalidDate(row.date_value);
      if (reason) {
        results.push({
          code: 'INVALID_DATE',
          severity: 'error',
          message: `Ogiltigt datum: ${row.date_value} — ${reason}`,
          messageParams: { date: row.date_value, reason },
          personIds,
          eventIds: [row.id],
        });
      }
    }
    if (row.date_value_end) {
      const reason = isInvalidDate(row.date_value_end);
      if (reason) {
        results.push({
          code: 'INVALID_DATE',
          severity: 'error',
          message: `Ogiltigt slutdatum: ${row.date_value_end} — ${reason}`,
          messageParams: { date: row.date_value_end, reason },
          personIds,
          eventIds: [row.id],
        });
      }
    }
  }

  return results;
}

export async function checkUnrelatedPerson(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ id: string }>(db, `
    SELECT p.id
    FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM relationships r WHERE r.person1_id = p.id OR r.person2_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM event_participants ep
      JOIN events e ON e.id = ep.event_id AND e.relationship_id IS NOT NULL
      WHERE ep.person_id = p.id
    )
  `);

  return rows.map(r => ({
    code: 'UNRELATED_PERSON',
    severity: 'notice' as CheckSeverity,
    message: 'Person har inga registrerade relationer',
    messageParams: {},
    personIds: [r.id],
  }));
}

export async function checkTextControlChars(db: Database): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // Regex: control chars U+0000–U+001F except tab (09), newline (0A), CR (0D)
  const controlCharRe = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

  // Person names
  const nameRows = await queryAll<{ person_id: string; given_name: string | null; surname: string | null }>(db, `
    SELECT person_id, given_name, surname FROM person_names
  `);
  for (const r of nameRows) {
    const fields = [r.given_name, r.surname].filter(Boolean);
    for (const field of fields) {
      if (controlCharRe.test(field!)) {
        results.push({
          code: 'TEXT_CONTROL_CHARS',
          severity: 'warning',
          message: `Namn innehåller kontrolltecken`,
          messageParams: {},
          personIds: [r.person_id],
        });
        break; // one result per person name row
      }
    }
  }

  // Person notes
  const noteRows = await queryAll<{ id: string; notes: string }>(db, `
    SELECT id, notes FROM persons WHERE notes IS NOT NULL AND notes != ''
  `);
  for (const r of noteRows) {
    if (controlCharRe.test(r.notes)) {
      results.push({
        code: 'TEXT_CONTROL_CHARS',
        severity: 'warning',
        message: `Personanteckning innehåller kontrolltecken`,
        messageParams: {},
        personIds: [r.id],
      });
    }
  }

  // Event notes
  const eventRows = await queryAll<{ id: string; notes: string }>(db, `
    SELECT id, notes FROM events WHERE notes IS NOT NULL AND notes != ''
  `);
  const epMap = new Map<string, string[]>();
  const allEps = await queryAll<{ event_id: string; person_id: string }>(db, `SELECT event_id, person_id FROM event_participants`);
  for (const ep of allEps) {
    if (!epMap.has(ep.event_id)) epMap.set(ep.event_id, []);
    epMap.get(ep.event_id)!.push(ep.person_id);
  }
  for (const r of eventRows) {
    if (controlCharRe.test(r.notes)) {
      results.push({
        code: 'TEXT_CONTROL_CHARS',
        severity: 'warning',
        message: `Händelsebeskrivning innehåller kontrolltecken`,
        messageParams: {},
        personIds: epMap.get(r.id) ?? [],
        eventIds: [r.id],
      });
    }
  }

  // Source titles
  const sourceRows = await queryAll<{ id: string; title: string }>(db, `
    SELECT id, title FROM sources WHERE title IS NOT NULL AND title != ''
  `);
  for (const r of sourceRows) {
    if (controlCharRe.test(r.title)) {
      results.push({
        code: 'TEXT_CONTROL_CHARS',
        severity: 'warning',
        message: `Källtitel "${r.title}" innehåller kontrolltecken`,
        messageParams: { title: r.title },
        personIds: [],
        sourceIds: [r.id],
      });
    }
  }

  return results;
}

export async function checkMultipleBirthNames(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ person_id: string; cnt: number }>(db, `
    SELECT person_id, COUNT(*) AS cnt
    FROM person_names
    WHERE name_type = 'birth'
    GROUP BY person_id
    HAVING COUNT(*) > 1
  `);
  return rows.map(r => ({
    code: 'MULTIPLE_BIRTH_NAMES',
    severity: 'warning' as CheckSeverity,
    message: `Person har ${r.cnt} födelsenamn registrerade (högst ett förväntas)`,
    messageParams: { count: r.cnt },
    personIds: [r.person_id],
  }));
}

export async function checkLikelyInlineBirthName(db: Database): Promise<CheckResult[]> {
  // Detects user-typed strings like "Anna Andersson (f. Svensson)" packed into
  // a single given_name or surname field. Returns one row per matching
  // person_names record so the user can fix each by hand via the name-edit
  // modal.
  //
  // PRIME DIRECTIVE: this check FLAGS, never TRANSFORMS. Do not split the
  // detected string back into person_names rows from any code path —
  // the user authored the inline form and the user must split it.
  const rows = await queryAll<{ id: string; person_id: string; given_name: string | null; surname: string | null }>(db, `
    SELECT id, person_id, given_name, surname FROM person_names
  `);
  // Require whitespace before the open-paren — a parenthetical at the start
  // of the string has no preceding name token to "annotate" with a birth-name
  // marker, so cases like "(f. Svensson) Andersson" are intentionally NOT
  // flagged. The user goal is to detect inline annotations that follow a
  // current name (e.g. "Anna Andersson (f. Svensson)").
  const re = /\s\(\s*(?:born|b\.|född|f\.)\s+\S+/i;
  const results: CheckResult[] = [];
  for (const r of rows) {
    const fields = [r.given_name, r.surname].filter(Boolean) as string[];
    if (fields.some(f => re.test(f))) {
      results.push({
        code: 'LIKELY_INLINE_BIRTH_NAME',
        severity: 'notice' as CheckSeverity,
        message: 'Namnet verkar innehålla ett födelsenamn i parentes — överväg att dela upp i separata namnposter.',
        messageParams: {},
        personIds: [r.person_id],
      });
    }
  }
  return results;
}

/**
 * Flags events whose `date_original` is non-empty but contains no digit. The
 * UI persists `date_original` as the verbatim authored date string (e.g.
 * "kring midsommar 1900") and `listPersonsPage` ranks rows by COALESCE on
 * date_original first — so a free-form non-date string like a street address
 * accidentally typed into the field will sort before real dates and break
 * the person list. This check surfaces existing misuse so the user can fix
 * it; the matching label/help text in EventModal prevents new occurrences.
 *
 * PRIME DIRECTIVE: this check FLAGS, never TRANSFORMS. We do not auto-clear
 * the value — the user authored it and the user must remove it.
 */
export async function checkEventDateOriginalNonDate(db: Database): Promise<CheckResult[]> {
  // SQLite's GLOB '*[0-9]*' matches any character in the digit class — fast
  // and index-free since we only filter non-empty rows. The trim guards
  // against rows that are pure whitespace (treated the same as empty).
  const rows = await queryAll<{ event_id: string; person_id: string | null; date_original: string }>(db, `
    SELECT e.id AS event_id, ep.person_id, e.date_original
    FROM events e
    LEFT JOIN event_participants ep
      ON ep.event_id = e.id AND ep.role = 'primary'
    WHERE e.date_original IS NOT NULL
      AND TRIM(e.date_original) <> ''
      AND e.date_original NOT GLOB '*[0-9]*'
  `);
  // De-dupe by event_id — an event with no primary participant still shows
  // up once (person_id will be null), and an event with multiple primary
  // participants would otherwise produce N rows.
  const seen = new Map<string, { person_ids: string[]; date_original: string }>();
  for (const r of rows) {
    if (!seen.has(r.event_id)) {
      seen.set(r.event_id, { person_ids: [], date_original: r.date_original });
    }
    if (r.person_id) seen.get(r.event_id)!.person_ids.push(r.person_id);
  }
  const results: CheckResult[] = [];
  for (const [eventId, { person_ids, date_original }] of seen.entries()) {
    results.push({
      code: 'EVENT_DATE_ORIGINAL_NON_DATE',
      severity: 'warning',
      message: `Originaltext på datumfält saknar siffra: "${date_original}"`,
      messageParams: { value: date_original },
      personIds: person_ids,
      eventIds: [eventId],
    });
  }
  return results;
}

export async function checkPartialName(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ person_id: string; given_name: string | null; surname: string | null }>(db, `
    SELECT person_id, given_name, surname FROM person_names
  `);
  const results: CheckResult[] = [];
  for (const r of rows) {
    const hasGiven = !!r.given_name && r.given_name.trim() !== '';
    const hasSurname = !!r.surname && r.surname.trim() !== '';
    if (hasGiven !== hasSurname) {
      results.push({
        code: 'PARTIAL_NAME',
        severity: 'notice' as CheckSeverity,
        message: hasGiven
          ? 'Person saknar efternamn'
          : 'Person saknar förnamn',
        messageParams: {},
        personIds: [r.person_id],
      });
    }
  }
  return results;
}

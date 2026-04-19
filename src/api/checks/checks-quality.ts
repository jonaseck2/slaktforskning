import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { personIdsWithEvent, isInvalidDate } from './check-utils';

export function checkNoName(db: Database): CheckResult[] {
  const hasName = new Set(
    queryAll<{ person_id: string }>(db, `SELECT DISTINCT person_id FROM person_names`).map(r => r.person_id)
  );
  const allPersonIds = queryAll<{ id: string }>(db, `SELECT id FROM persons`);
  return allPersonIds
    .filter(r => !hasName.has(r.id))
    .map(r => ({
      code: 'NO_NAME',
      severity: 'notice' as CheckSeverity,
      message: `Person saknar namnuppgifter`,
      messageParams: {},
      personIds: [r.id],
    }));
}

export function checkLivingWithDeathEvent(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; death_id: string }>(db, `
    SELECT p.id AS person_id, e.id AS death_id
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
    WHERE p.living = 1
  `);

  return rows.map(r => ({
    code: 'LIVING_WITH_DEATH_EVENT',
    severity: 'warning' as CheckSeverity,
    message: `Person är markerad som levande men har en registrerad dödshändelse`,
    messageParams: {},
    personIds: [r.person_id],
    eventIds: [r.death_id],
  }));
}

export function checkNotLivingWithoutDeathEvent(db: Database): CheckResult[] {
  const hasDeath = personIdsWithEvent(db, 'death');
  const notLiving = queryAll<{ id: string }>(db, `SELECT id FROM persons WHERE living = 0`);
  return notLiving
    .filter(r => !hasDeath.has(r.id))
    .map(r => ({
      code: 'NOT_LIVING_WITHOUT_DEATH',
      severity: 'notice' as CheckSeverity,
      message: `Person är markerad som ej levande men saknar dödshändelse`,
      messageParams: {},
      personIds: [r.id],
    }));
}

export function checkUnsourcedLifeEvent(db: Database, eventType: 'birth' | 'death'): CheckResult[] {
  const code = eventType === 'birth' ? 'UNSOURCED_BIRTH' : 'UNSOURCED_DEATH';
  const messageLabel = eventType === 'birth' ? 'Födelsehändelsen' : 'Dödshändelsen';

  const rows = queryAll<{ person_id: string; event_id: string }>(db, `
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

export function checkInvalidDates(db: Database): CheckResult[] {
  const results: CheckResult[] = [];

  // Check events.date_value and events.date_value_end
  const eventRows = queryAll<{ id: string; date_value: string | null; date_value_end: string | null }>(db, `
    SELECT id, date_value, date_value_end FROM events
    WHERE date_value IS NOT NULL OR date_value_end IS NOT NULL
  `);

  // Build event→person map for personIds
  const eventPersonMap = new Map<string, string[]>();
  const epRows = queryAll<{ event_id: string; person_id: string }>(db, `
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

export function checkUnrelatedPerson(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string }>(db, `
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

export function checkOrphanedSource(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; title: string }>(db, `
    SELECT s.id, s.title
    FROM sources s
    WHERE NOT EXISTS (
      SELECT 1 FROM citations c WHERE c.source_id = s.id
    )
  `);

  return rows.map(r => ({
    code: 'ORPHANED_SOURCE',
    severity: 'notice' as CheckSeverity,
    message: `Källa "${r.title || '(utan titel)'}" har inga källhänvisningar`,
    messageParams: { title: r.title || '' },
    personIds: [],
    sourceIds: [r.id],
  }));
}

export function checkTextControlChars(db: Database): CheckResult[] {
  const results: CheckResult[] = [];
  // Regex: control chars U+0000–U+001F except tab (09), newline (0A), CR (0D)
  const controlCharRe = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

  // Person names
  const nameRows = queryAll<{ person_id: string; given_name: string | null; surname: string | null }>(db, `
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
  const noteRows = queryAll<{ id: string; notes: string }>(db, `
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

  // Event descriptions
  const eventRows = queryAll<{ id: string; description: string }>(db, `
    SELECT id, description FROM events WHERE description IS NOT NULL AND description != ''
  `);
  const epMap = new Map<string, string[]>();
  const allEps = queryAll<{ event_id: string; person_id: string }>(db, `SELECT event_id, person_id FROM event_participants`);
  for (const ep of allEps) {
    if (!epMap.has(ep.event_id)) epMap.set(ep.event_id, []);
    epMap.get(ep.event_id)!.push(ep.person_id);
  }
  for (const r of eventRows) {
    if (controlCharRe.test(r.description)) {
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
  const sourceRows = queryAll<{ id: string; title: string }>(db, `
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

export function checkMultipleBirthNames(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; cnt: number }>(db, `
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

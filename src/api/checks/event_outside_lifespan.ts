import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { dateDefinitelyAfter, parseLooseDate } from './check-utils';

/**
 * EVENT_OUTSIDE_LIFESPAN — informational warning when a participant's event
 * date sits outside their lifespan.
 *
 * Two subkinds, single module:
 *   - EVENT_BEFORE_BIRTH: event date is definitively earlier than the
 *     person's earliest birth event date.
 *   - EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH: event date is definitively later
 *     than the person's latest death event date. This is the warning-severity
 *     sibling of `EVENT_AFTER_DEATH` (which fires error-severity for the
 *     primary participant only). This module covers ALL participants
 *     (witnesses, godparents, etc.).
 *
 * PRIME DIRECTIVE: this check is *informational*. It never modifies the
 * saved event. It does not "fix" the date or re-classify the event_type.
 * The user authored the date; the app's job is to make the inconsistency
 * visible, not to second-guess the author.
 *
 * Granularity rules (false positives over false negatives — non-blocking):
 *   - Comparison uses `dateDefinitelyAfter`, which compares at the lower of
 *     the two precisions and only flags when the relationship is unambiguous
 *     at that shared precision.
 *   - "1944" vs "1944-06-15": treated as same year — no flag (we cannot say
 *     1944 is strictly before 1944-06-15).
 *   - "1943" vs "1944-06-15": flagged (1943 < 1944 at year precision).
 *   - "1944-05-01" vs "1944-06-15": flagged.
 *
 * Multi-event resolution: if a person has multiple birth events, the
 * earliest is used. If multiple death events, the latest. We do not
 * fabricate a birth/death date when none exists — the check skips silently.
 */

interface EventRow {
  event_id: string;
  date_value: string;
  event_type: string;
}

interface PersonEventRow {
  person_id: string;
  event_id: string;
  event_type: string;
  date_value: string;
}

/**
 * Pick the earliest parseable date from a list. Year-precision dates with
 * the smallest year win; ties resolved by month/day if available, otherwise
 * arbitrary (the caller treats the result as "the conservative bound").
 */
function earliestDate(rows: EventRow[]): EventRow | null {
  let best: EventRow | null = null;
  for (const r of rows) {
    if (!best) { best = r; continue; }
    // dateDefinitelyAfter(best, r) → r is earlier
    if (dateDefinitelyAfter(best.date_value, r.date_value)) best = r;
  }
  return best;
}

function latestDate(rows: EventRow[]): EventRow | null {
  let best: EventRow | null = null;
  for (const r of rows) {
    if (!best) { best = r; continue; }
    // dateDefinitelyAfter(r, best) → r is later
    if (dateDefinitelyAfter(r.date_value, best.date_value)) best = r;
  }
  return best;
}

/**
 * Returns Map<person_id, earliest birth event> and Map<person_id, latest
 * death event>. Year-only dates are accepted (they parse via parseLooseDate);
 * comparison granularity is handled at flagging time.
 */
function loadLifespanBounds(db: Database): {
  earliestBirth: Map<string, EventRow>;
  latestDeath: Map<string, EventRow>;
} {
  // Pull all birth and death events with non-null date_value, regardless of
  // date_type. The plan deliberately includes 'about', 'before', 'after',
  // 'between', 'calculated' — the warning fires at the same threshold as
  // exact dates because a contradictory math result is itself worth flagging.
  // 'unknown' is excluded (date_value will normally be null anyway).
  const rows = queryAll<{ person_id: string; event_id: string; event_type: string; date_value: string }>(
    db,
    `SELECT ep.person_id, e.id AS event_id, e.event_type, e.date_value
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     WHERE e.event_type IN ('birth', 'death')
       AND ep.role = 'primary'
       AND e.date_type != 'unknown'
       AND e.date_value IS NOT NULL`,
  );

  const birthByPerson = new Map<string, EventRow[]>();
  const deathByPerson = new Map<string, EventRow[]>();
  for (const r of rows) {
    // Skip rows whose date_value can't be parsed at all (defensive — the
    // resolver bails out cleanly and we don't fabricate bounds).
    if (!parseLooseDate(r.date_value)) continue;
    const ev = { event_id: r.event_id, date_value: r.date_value, event_type: r.event_type };
    if (r.event_type === 'birth') {
      const arr = birthByPerson.get(r.person_id) ?? [];
      arr.push(ev);
      birthByPerson.set(r.person_id, arr);
    } else {
      const arr = deathByPerson.get(r.person_id) ?? [];
      arr.push(ev);
      deathByPerson.set(r.person_id, arr);
    }
  }

  const earliestBirth = new Map<string, EventRow>();
  for (const [pid, list] of birthByPerson) {
    const e = earliestDate(list);
    if (e) earliestBirth.set(pid, e);
  }
  const latestDeath = new Map<string, EventRow>();
  for (const [pid, list] of deathByPerson) {
    const e = latestDate(list);
    if (e) latestDeath.set(pid, e);
  }
  return { earliestBirth, latestDeath };
}

/**
 * Loads every (person, event) pair that has a date_value, EXCLUDING the
 * person's own birth/death events (those are checked elsewhere by
 * checkBirthAfterDeath / checkBurialBeforeDeath / etc.). Includes ALL
 * roles — witnesses, godparents, officiants — not just the primary
 * participant.
 */
function loadParticipantEvents(db: Database): PersonEventRow[] {
  return queryAll<PersonEventRow>(
    db,
    `SELECT ep.person_id, e.id AS event_id, e.event_type, e.date_value
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     WHERE e.date_value IS NOT NULL
       AND e.date_type != 'unknown'`,
  );
}

/**
 * Run the check across the whole DB. Used by the registry-driven runAll.
 */
export function checkEventOutsideLifespan(db: Database): CheckResult[] {
  const { earliestBirth, latestDeath } = loadLifespanBounds(db);
  const events = loadParticipantEvents(db);
  const results: CheckResult[] = [];

  for (const ev of events) {
    if (!parseLooseDate(ev.date_value)) continue;

    const birth = earliestBirth.get(ev.person_id);
    if (birth) {
      // Don't flag the birth event itself against itself.
      if (ev.event_id !== birth.event_id) {
        if (dateDefinitelyAfter(birth.date_value, ev.date_value)) {
          results.push({
            code: 'EVENT_BEFORE_BIRTH',
            severity: 'warning' as CheckSeverity,
            message: `${ev.event_type} (${ev.date_value}) sker före personens födelse (${birth.date_value})`,
            messageParams: {
              eventType: ev.event_type,
              eventDate: ev.date_value,
              birthDate: birth.date_value,
            },
            personIds: [ev.person_id],
            eventIds: [ev.event_id, birth.event_id],
          });
        }
      }
    }

    const death = latestDeath.get(ev.person_id);
    if (death) {
      if (ev.event_id !== death.event_id) {
        if (dateDefinitelyAfter(ev.date_value, death.date_value)) {
          // Avoid a warning duplicate for the existing error-severity
          // EVENT_AFTER_DEATH check: that one is primary-role-only and
          // excludes burial/will/probate. This warning covers the gaps:
          //   - non-primary roles (witness, godparent),
          //   - burial/will/probate (which legitimately follow death but
          //     should still be flagged when far after — separate concern),
          // For simplicity and informational consistency, fire on every
          // role + event_type. The error-severity sibling already fires
          // for primary-role events; users see two rows for the same
          // primary-role overlap, which is fine — they describe the same
          // fact at different severities and the message text differs.
          results.push({
            code: 'EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH',
            severity: 'warning' as CheckSeverity,
            message: `${ev.event_type} (${ev.date_value}) sker efter personens död (${death.date_value})`,
            messageParams: {
              eventType: ev.event_type,
              eventDate: ev.date_value,
              deathDate: death.date_value,
            },
            personIds: [ev.person_id],
            eventIds: [ev.event_id, death.event_id],
          });
        }
      }
    }
  }

  return results;
}

/**
 * Run the check just for a single event id — used by the save-time hook.
 * Returns one row per (participant × subkind) where the inconsistency
 * fires.
 */
export function checkEventOutsideLifespanForEvent(db: Database, eventId: string): CheckResult[] {
  const eventRow = queryAll<{ id: string; event_type: string; date_value: string | null; date_type: string }>(
    db,
    `SELECT id, event_type, date_value, date_type FROM events WHERE id = ?`,
    [eventId],
  )[0];
  if (!eventRow || !eventRow.date_value || eventRow.date_type === 'unknown') return [];
  if (!parseLooseDate(eventRow.date_value)) return [];

  const participants = queryAll<{ person_id: string }>(
    db,
    `SELECT person_id FROM event_participants WHERE event_id = ?`,
    [eventId],
  );
  if (participants.length === 0) return [];

  const { earliestBirth, latestDeath } = loadLifespanBounds(db);
  const results: CheckResult[] = [];

  for (const p of participants) {
    const birth = earliestBirth.get(p.person_id);
    if (birth && eventId !== birth.event_id
      && dateDefinitelyAfter(birth.date_value, eventRow.date_value)) {
      results.push({
        code: 'EVENT_BEFORE_BIRTH',
        severity: 'warning' as CheckSeverity,
        message: `${eventRow.event_type} (${eventRow.date_value}) sker före personens födelse (${birth.date_value})`,
        messageParams: {
          eventType: eventRow.event_type,
          eventDate: eventRow.date_value,
          birthDate: birth.date_value,
        },
        personIds: [p.person_id],
        eventIds: [eventId, birth.event_id],
      });
    }
    const death = latestDeath.get(p.person_id);
    if (death && eventId !== death.event_id
      && dateDefinitelyAfter(eventRow.date_value, death.date_value)) {
      results.push({
        code: 'EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH',
        severity: 'warning' as CheckSeverity,
        message: `${eventRow.event_type} (${eventRow.date_value}) sker efter personens död (${death.date_value})`,
        messageParams: {
          eventType: eventRow.event_type,
          eventDate: eventRow.date_value,
          deathDate: death.date_value,
        },
        personIds: [p.person_id],
        eventIds: [eventId, death.event_id],
      });
    }
  }

  return results;
}

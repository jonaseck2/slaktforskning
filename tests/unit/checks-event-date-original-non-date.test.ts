import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { checkEventDateOriginalNonDate } from '../../src/api/checks/checks-quality';
import { runSql } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

/**
 * The check exists because `events.date_original` is the verbatim authored
 * date string and `listPersonsPage` ranks rows by it ahead of `date_value`.
 * A non-digit value (e.g. an address typed by mistake) sorts before real
 * year strings and breaks the person list. The check flags only the bug
 * shape: non-empty + no digit. Empty rows and rows that contain at least
 * one digit (any plausible date authoring) must NOT fire.
 */
describe('checkEventDateOriginalNonDate', () => {
  it('flags only events whose date_original is non-empty and contains no digit', () => {
    const personA = createPerson(db, { given_name: 'Anna', surname: 'A' });
    const personB = createPerson(db, { given_name: 'Bertil', surname: 'B' });
    const personC = createPerson(db, { given_name: 'Cecilia', surname: 'C' });

    // (a) digit-bearing date_original — "kring 1845" — must NOT be flagged
    const eventDigit = createEvent(db, {
      event_type: 'birth',
      date_type: 'about',
      date_original: 'kring 1845',
    });
    addEventParticipant(db, { event_id: eventDigit.id, person_id: personA.id, role: 'primary' });

    // (b) digit-free date_original — "Hemma, Storgatan" — must be flagged
    const eventBad = createEvent(db, {
      event_type: 'birth',
      date_type: 'unknown',
      date_original: 'Hemma, Storgatan',
    });
    addEventParticipant(db, { event_id: eventBad.id, person_id: personB.id, role: 'primary' });

    // (c) empty date_original — must NOT be flagged
    const eventEmpty = createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1900-01-01',
      date_original: '',
    });
    addEventParticipant(db, { event_id: eventEmpty.id, person_id: personC.id, role: 'primary' });

    // (d) whitespace-only date_original — also must NOT be flagged
    //     (TRIM in SQL collapses to empty)
    const eventWs = createEvent(db, {
      event_type: 'birth',
      date_type: 'unknown',
    });
    runSql(db, `UPDATE events SET date_original = ? WHERE id = ?`, ['   ', eventWs.id]);

    const results = checkEventDateOriginalNonDate(db);

    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('EVENT_DATE_ORIGINAL_NON_DATE');
    expect(results[0].severity).toBe('warning');
    expect(results[0].eventIds).toEqual([eventBad.id]);
    expect(results[0].personIds).toEqual([personB.id]);
    expect(results[0].messageParams?.value).toBe('Hemma, Storgatan');
  });

  it('still flags the event when no primary participant exists (eventIds set, personIds empty)', () => {
    const ev = createEvent(db, {
      event_type: 'residence',
      date_type: 'unknown',
      date_original: 'Hos farbror Erik',
    });

    const results = checkEventDateOriginalNonDate(db);
    expect(results).toHaveLength(1);
    expect(results[0].eventIds).toEqual([ev.id]);
    expect(results[0].personIds).toEqual([]);
  });

  it('does not double-flag an event with multiple primary participants', () => {
    const p1 = createPerson(db, { given_name: 'A', surname: 'A' });
    const p2 = createPerson(db, { given_name: 'B', surname: 'B' });
    const ev = createEvent(db, {
      event_type: 'marriage',
      date_type: 'unknown',
      date_original: 'någon gång före kriget',
    });
    // No digit in "någon gång före kriget" — should flag once with both persons
    addEventParticipant(db, { event_id: ev.id, person_id: p1.id, role: 'primary' });
    addEventParticipant(db, { event_id: ev.id, person_id: p2.id, role: 'primary' });

    const results = checkEventDateOriginalNonDate(db);
    expect(results).toHaveLength(1);
    expect(results[0].personIds.sort()).toEqual([p1.id, p2.id].sort());
  });
});

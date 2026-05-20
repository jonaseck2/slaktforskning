// T06: Negation events CRUD — the is_negation + negation_event_type columns
// must persist through createEvent, updateEvent, and getEventsForPerson.
//
// User goal: an authored negation row ("did not marry between 1850 and
// 1900") survives the api/ layer cleanly so the downstream GEDCOM 7.0 NO X
// emitter has something to read.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import {
  createEvent,
  updateEvent,
  getEventsForPerson,
} from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('events.is_negation + events.negation_event_type — CRUD', () => {
  it('createEvent persists is_negation=1 + negation_event_type', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Alice', surname: 'X' });
    const ev = await createEvent(db, {
      event_type: 'marriage',
      date_type: 'between',
      date_value: '1850',
      date_value_end: '1900',
      notes: 'No marriage record found',
      is_negation: true,
      negation_event_type: 'marriage',
    });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });

    const events = await getEventsForPerson(db, p.id);
    expect(events).toHaveLength(1);
    expect(Boolean(events[0].is_negation)).toBe(true);
    expect(events[0].negation_event_type).toBe('marriage');
    expect(events[0].date_value).toBe('1850');
    expect(events[0].date_value_end).toBe('1900');
    expect(events[0].notes).toBe('No marriage record found');
  });

  it('updateEvent sets is_negation on an existing row', async () => {
    const p = await createPerson(db, { sex: 'F', given_name: 'Bea', surname: 'Y' });
    const ev = await createEvent(db, { event_type: 'death' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });

    await updateEvent(db, ev.id, {
      is_negation: true,
      negation_event_type: 'death',
    });
    const events = await getEventsForPerson(db, p.id);
    expect(Boolean(events[0].is_negation)).toBe(true);
    expect(events[0].negation_event_type).toBe('death');
  });

  it('non-negation events remain is_negation=0 and distinguishable', async () => {
    const p = await createPerson(db, { sex: 'U', given_name: 'Carl', surname: 'Z' });
    const evA = await createEvent(db, { event_type: 'birth', date_value: '1880' });
    const evB = await createEvent(db, {
      event_type: 'marriage',
      is_negation: true,
      negation_event_type: 'marriage',
      date_value: '1900',
      date_value_end: '1920',
    });
    await addEventParticipant(db, { event_id: evA.id, person_id: p.id, role: 'primary' });
    await addEventParticipant(db, { event_id: evB.id, person_id: p.id, role: 'primary' });

    const events = await getEventsForPerson(db, p.id);
    const negation = events.filter(e => Boolean(e.is_negation));
    const real = events.filter(e => !e.is_negation);
    expect(negation).toHaveLength(1);
    expect(real).toHaveLength(1);
    expect(negation[0].negation_event_type).toBe('marriage');
    expect(real[0].event_type).toBe('birth');
  });
});

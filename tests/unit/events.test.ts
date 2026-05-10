import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { addEventParticipant } from '../../src/api/relationships';
import { createSource, createCitation } from '../../src/api/sources';
import { createPlace } from '../../src/api/places';
import {
  createEvent,
  getEvent,
  getEventsForPerson,
  getEventsForRelationship,
  getEventsForPlace,
  updateEvent,
  deleteEvent,
} from '../../src/api/events';
import { createTestDb } from './helpers';

let db: Database.Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe('events', async () => {
  it('gets an event by id', async () => {
    const event = await createEvent(db, { event_type: 'birth', date_value: '1800-01-01' });
    const fetched = await getEvent(db, event.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(event.id);
    expect(fetched!.event_type).toBe('birth');
  });

  it('returns null for nonexistent event', async () => {
    expect(await getEvent(db, 'nonexistent')).toBeNull();
  });

  it('deleteEvent returns false for nonexistent id', async () => {
    expect(await deleteEvent(db, 'nonexistent')).toBe(false);
  });

  it('creates a birth event', async () => {
    const event = await createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1845-06-12',
      date_original: '12 JUN 1845',
      notes: 'Born in Stockholm',
    });
    expect(event.id).toBeDefined();
    expect(event.event_type).toBe('birth');
    expect(event.date_value).toBe('1845-06-12');
    expect(event.date_original).toBe('12 JUN 1845');
  });

  it('creates an event linked to a relationship', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'B', sex: 'F' });
    const rel = await createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id, subtype: 'marriage' });
    const event = await createEvent(db, {
      event_type: 'marriage',
      relationship_id: rel.id,
      date_type: 'about',
      date_value: '1870-01-01',
      date_original: 'ABT 1870',
    });
    expect(event.relationship_id).toBe(rel.id);
    expect(event.date_type).toBe('about');
  });

  it('gets events for a person via event_participants', async () => {
    const person = await createPerson(db, { given_name: 'Test', surname: 'T' });
    const e1 = await createEvent(db, { event_type: 'birth', date_value: '1800-01-01' });
    const e2 = await createEvent(db, { event_type: 'death', date_value: '1870-05-10' });
    await addEventParticipant(db, { event_id: e1.id, person_id: person.id, role: 'primary' });
    await addEventParticipant(db, { event_id: e2.id, person_id: person.id, role: 'primary' });

    const events = await getEventsForPerson(db, person.id);
    expect(events).toHaveLength(2);
    expect(events[0].event_type).toBe('birth');
    expect(events[1].event_type).toBe('death');
  });

  it('gets events for a relationship', async () => {
    const rel = await createRelationship(db, { type: 'couple' });
    await createEvent(db, { event_type: 'marriage', relationship_id: rel.id });
    const events = await getEventsForRelationship(db, rel.id);
    expect(events).toHaveLength(1);
  });

  it('updates an event', async () => {
    const event = await createEvent(db, { event_type: 'birth' });
    const updated = await updateEvent(db, event.id, { notes: 'Updated notes', date_value: '1850-03-15' });
    expect(updated!.notes).toBe('Updated notes');
    expect(updated!.date_value).toBe('1850-03-15');
  });

  it('deletes an event', async () => {
    const event = await createEvent(db, { event_type: 'birth' });
    expect(await deleteEvent(db, event.id)).toBe(true);
    expect(await getEvent(db, event.id)).toBeNull();
  });

  it('includes citation_count in getEventsForPerson', async () => {
    const person = await createPerson(db, { given_name: 'Cite', surname: 'Test' });
    const event = await createEvent(db, { event_type: 'birth', date_value: '1900-01-01' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    let events = await getEventsForPerson(db, person.id);
    expect(events).toHaveLength(1);
    expect(events[0].citation_count).toBe(0);

    const source = await createSource(db, { title: 'Test Source' });
    await createCitation(db, { source_id: source.id, event_id: event.id });

    events = await getEventsForPerson(db, person.id);
    expect(events[0].citation_count).toBe(1);

    await createCitation(db, { source_id: source.id, event_id: event.id, page: 'p.2' });

    events = await getEventsForPerson(db, person.id);
    expect(events[0].citation_count).toBe(2);
  });

  it('includes citation_count in getEventsForRelationship', async () => {
    const rel = await createRelationship(db, { type: 'couple' });
    const event = await createEvent(db, { event_type: 'marriage', relationship_id: rel.id });

    let events = await getEventsForRelationship(db, rel.id);
    expect(events).toHaveLength(1);
    expect(events[0].citation_count).toBe(0);

    const source = await createSource(db, { title: 'Test Source' });
    await createCitation(db, { source_id: source.id, event_id: event.id });

    events = await getEventsForRelationship(db, rel.id);
    expect(events[0].citation_count).toBe(1);
  });

  it('creates a mention event', async () => {
    const ev = await createEvent(db, { event_type: 'mention', date_type: 'unknown' });
    expect(ev.event_type).toBe('mention');
    expect((await getEvent(db, ev.id))?.event_type).toBe('mention');
  });

  it('gets events for a place with participant names', async () => {
    const place = await createPlace(db, { name: 'Stockholm' });
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const e1 = await createEvent(db, { event_type: 'birth', date_value: '1800-01-01', place_id: place.id });
    await addEventParticipant(db, { event_id: e1.id, person_id: person.id, role: 'primary' });

    const events = await getEventsForPlace(db, place.id);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('birth');
    expect(events[0].participant_names).toContain('Erik');
    expect(events[0].participant_names).toContain('Svensson');
  });

  it('getEventsForPlace returns empty for place with no events', async () => {
    const place = await createPlace(db, { name: 'Empty Town' });
    const events = await getEventsForPlace(db, place.id);
    expect(events).toHaveLength(0);
  });

  it('creates an occupation event with fact value', async () => {
    const event = await createEvent(db, {
      event_type: 'occupation',
      date_value: '1885',
      value: 'Carpenter',
      notes: 'Worked at the Stockholm shipyard',
    });
    const fetched = await getEvent(db, event.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.value).toBe('Carpenter');
    expect(fetched!.notes).toBe('Worked at the Stockholm shipyard');
  });

  it('value defaults to null when omitted', async () => {
    const event = await createEvent(db, { event_type: 'birth', date_value: '1800-01-01' });
    expect(event.value).toBeNull();
  });

  it('updateEvent can set and clear value', async () => {
    const event = await createEvent(db, { event_type: 'occupation', value: 'Smith' });
    await updateEvent(db, event.id, { value: 'Master Smith' });
    expect((await getEvent(db, event.id))!.value).toBe('Master Smith');
    await updateEvent(db, event.id, { value: null });
    expect((await getEvent(db, event.id))!.value).toBeNull();
  });
});

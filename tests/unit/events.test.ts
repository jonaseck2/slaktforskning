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

beforeEach(() => {
  db = createTestDb();
});

describe('events', () => {
  it('gets an event by id', () => {
    const event = createEvent(db, { event_type: 'birth', date_value: '1800-01-01' });
    const fetched = getEvent(db, event.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(event.id);
    expect(fetched!.event_type).toBe('birth');
  });

  it('returns null for nonexistent event', () => {
    expect(getEvent(db, 'nonexistent')).toBeNull();
  });

  it('deleteEvent returns false for nonexistent id', () => {
    expect(deleteEvent(db, 'nonexistent')).toBe(false);
  });

  it('creates a birth event', () => {
    const event = createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1845-06-12',
      date_original: '12 JUN 1845',
      description: 'Born in Stockholm',
    });
    expect(event.id).toBeDefined();
    expect(event.event_type).toBe('birth');
    expect(event.date_value).toBe('1845-06-12');
    expect(event.date_original).toBe('12 JUN 1845');
  });

  it('creates an event linked to a relationship', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M' });
    const b = createPerson(db, { given_name: 'Anna', surname: 'B', sex: 'F' });
    const rel = createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id, subtype: 'marriage' });
    const event = createEvent(db, {
      event_type: 'marriage',
      relationship_id: rel.id,
      date_type: 'about',
      date_value: '1870-01-01',
      date_original: 'ABT 1870',
    });
    expect(event.relationship_id).toBe(rel.id);
    expect(event.date_type).toBe('about');
  });

  it('gets events for a person via event_participants', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const e1 = createEvent(db, { event_type: 'birth', date_value: '1800-01-01' });
    const e2 = createEvent(db, { event_type: 'death', date_value: '1870-05-10' });
    addEventParticipant(db, { event_id: e1.id, person_id: person.id, role: 'primary' });
    addEventParticipant(db, { event_id: e2.id, person_id: person.id, role: 'primary' });

    const events = getEventsForPerson(db, person.id);
    expect(events).toHaveLength(2);
    expect(events[0].event_type).toBe('birth');
    expect(events[1].event_type).toBe('death');
  });

  it('gets events for a relationship', () => {
    const rel = createRelationship(db, { type: 'couple' });
    createEvent(db, { event_type: 'marriage', relationship_id: rel.id });
    const events = getEventsForRelationship(db, rel.id);
    expect(events).toHaveLength(1);
  });

  it('updates an event', () => {
    const event = createEvent(db, { event_type: 'birth' });
    const updated = updateEvent(db, event.id, { description: 'Updated description', date_value: '1850-03-15' });
    expect(updated!.description).toBe('Updated description');
    expect(updated!.date_value).toBe('1850-03-15');
  });

  it('deletes an event', () => {
    const event = createEvent(db, { event_type: 'birth' });
    expect(deleteEvent(db, event.id)).toBe(true);
    expect(getEvent(db, event.id)).toBeNull();
  });

  it('includes citation_count in getEventsForPerson', () => {
    const person = createPerson(db, { given_name: 'Cite', surname: 'Test' });
    const event = createEvent(db, { event_type: 'birth', date_value: '1900-01-01' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    let events = getEventsForPerson(db, person.id);
    expect(events).toHaveLength(1);
    expect(events[0].citation_count).toBe(0);

    const source = createSource(db, { title: 'Test Source' });
    createCitation(db, { source_id: source.id, event_id: event.id });

    events = getEventsForPerson(db, person.id);
    expect(events[0].citation_count).toBe(1);

    createCitation(db, { source_id: source.id, event_id: event.id, page: 'p.2' });

    events = getEventsForPerson(db, person.id);
    expect(events[0].citation_count).toBe(2);
  });

  it('includes citation_count in getEventsForRelationship', () => {
    const rel = createRelationship(db, { type: 'couple' });
    const event = createEvent(db, { event_type: 'marriage', relationship_id: rel.id });

    let events = getEventsForRelationship(db, rel.id);
    expect(events).toHaveLength(1);
    expect(events[0].citation_count).toBe(0);

    const source = createSource(db, { title: 'Test Source' });
    createCitation(db, { source_id: source.id, event_id: event.id });

    events = getEventsForRelationship(db, rel.id);
    expect(events[0].citation_count).toBe(1);
  });

  it('creates a mention event', () => {
    const ev = createEvent(db, { event_type: 'mention', date_type: 'unknown' });
    expect(ev.event_type).toBe('mention');
    expect(getEvent(db, ev.id)?.event_type).toBe('mention');
  });

  it('gets events for a place with participant names', () => {
    const place = createPlace(db, { name: 'Stockholm' });
    const person = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const e1 = createEvent(db, { event_type: 'birth', date_value: '1800-01-01', place_id: place.id });
    addEventParticipant(db, { event_id: e1.id, person_id: person.id, role: 'primary' });

    const events = getEventsForPlace(db, place.id);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('birth');
    expect(events[0].participant_names).toContain('Erik');
    expect(events[0].participant_names).toContain('Svensson');
  });

  it('getEventsForPlace returns empty for place with no events', () => {
    const place = createPlace(db, { name: 'Empty Town' });
    const events = getEventsForPlace(db, place.id);
    expect(events).toHaveLength(0);
  });
});

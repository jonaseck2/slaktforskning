import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createFamily } from '../../src/api/families';
import {
  createEvent,
  getEvent,
  getEventsForPerson,
  getEventsForFamily,
  updateEvent,
  deleteEvent,
} from '../../src/api/events';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('events', () => {
  it('creates a birth event for a person', () => {
    const person = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const event = createEvent(db, {
      event_type: 'birth',
      person_id: person.id,
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

  it('creates a marriage event for a family', () => {
    const family = createFamily(db, { union_type: 'marriage' });
    const event = createEvent(db, {
      event_type: 'marriage',
      family_id: family.id,
      date_type: 'about',
      date_value: '1870-01-01',
      date_original: 'ABT 1870',
    });
    expect(event.family_id).toBe(family.id);
    expect(event.date_type).toBe('about');
  });

  it('gets events for a person', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    createEvent(db, { event_type: 'birth', person_id: person.id, date_value: '1800-01-01' });
    createEvent(db, { event_type: 'death', person_id: person.id, date_value: '1870-05-10' });
    const events = getEventsForPerson(db, person.id);
    expect(events).toHaveLength(2);
    expect(events[0].event_type).toBe('birth');
    expect(events[1].event_type).toBe('death');
  });

  it('gets events for a family', () => {
    const family = createFamily(db, {});
    createEvent(db, { event_type: 'marriage', family_id: family.id });
    const events = getEventsForFamily(db, family.id);
    expect(events).toHaveLength(1);
  });

  it('updates an event', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth', person_id: person.id });
    const updated = updateEvent(db, event.id, { description: 'Updated description', date_value: '1850-03-15' });
    expect(updated!.description).toBe('Updated description');
    expect(updated!.date_value).toBe('1850-03-15');
  });

  it('deletes an event', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth', person_id: person.id });
    expect(deleteEvent(db, event.id)).toBe(true);
    expect(getEvent(db, event.id)).toBeNull();
  });
});

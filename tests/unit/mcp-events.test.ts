import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { recordEventWorkflow } from '../../src/mcp/tools/prod/events';
import * as persons from '../../src/api/persons';
import * as events from '../../src/api/events';
import * as relationships from '../../src/api/relationships';
import * as places from '../../src/api/places';
import * as sources from '../../src/api/sources';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

describe('recordEventWorkflow', () => {
  it('creates event with primary participant via person_id', () => {
    const person = persons.createPerson(db, { given_name: 'Anna', surname: 'Lindström' });
    const result = recordEventWorkflow(db, {
      event_type: 'birth',
      person_id: person.id,
      date_value: '1850',
    });

    expect(result.event.id).toBeTruthy();
    expect(result.event.event_type).toBe('birth');
    expect(result.event.date_value).toBe('1850');
    expect(result.citation).toBeNull();

    const participants = relationships.getEventParticipants(db, result.event.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].person_id).toBe(person.id);
    expect(participants[0].role).toBe('primary');

    const personEvents = events.getEventsForPerson(db, person.id);
    expect(personEvents).toHaveLength(1);
    expect(personEvents[0].id).toBe(result.event.id);
  });

  it('creates event with multiple participants via person_ids', () => {
    const person1 = persons.createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const person2 = persons.createPerson(db, { given_name: 'Maria', surname: 'Olsson' });

    const result = recordEventWorkflow(db, {
      event_type: 'marriage',
      person_ids: [
        { id: person1.id, role: 'primary' },
        { id: person2.id, role: 'spouse' },
      ],
    });

    expect(result.event.event_type).toBe('marriage');

    const participants = relationships.getEventParticipants(db, result.event.id);
    expect(participants).toHaveLength(2);

    const roles = participants.map(p => p.role);
    expect(roles).toContain('primary');
    expect(roles).toContain('spouse');

    const ids = participants.map(p => p.person_id);
    expect(ids).toContain(person1.id);
    expect(ids).toContain(person2.id);
  });

  it('creates citation when source_title provided', () => {
    const person = persons.createPerson(db, { given_name: 'Lars', surname: 'Karlsson' });

    const result = recordEventWorkflow(db, {
      event_type: 'death',
      person_id: person.id,
      date_value: '1900',
      source_title: 'Dödboken 1900',
      source_page: '12',
      confidence: 3,
    });

    expect(result.citation).not.toBeNull();
    expect(result.citation!.event_id).toBe(result.event.id);
    expect(result.citation!.page).toBe('12');
    expect(result.citation!.confidence).toBe(3);

    const allSources = sources.listSources(db);
    expect(allSources).toHaveLength(1);
    expect(allSources[0].title).toBe('Dödboken 1900');
  });

  it('reuses existing source when source_title matches', () => {
    const existingSource = sources.createSource(db, { title: 'Kyrkböcker' });
    const person = persons.createPerson(db, { given_name: 'Nils', surname: 'Berg' });

    const result = recordEventWorkflow(db, {
      event_type: 'baptism',
      person_id: person.id,
      source_title: 'Kyrkböcker',
    });

    expect(result.citation).not.toBeNull();
    expect(result.citation!.source_id).toBe(existingSource.id);
    expect(sources.listSources(db)).toHaveLength(1);
  });

  it('creates place when place string provided', () => {
    const person = persons.createPerson(db, { given_name: 'Britta', surname: 'Holm' });

    const result = recordEventWorkflow(db, {
      event_type: 'birth',
      person_id: person.id,
      place: 'Göteborg',
    });

    expect(result.event.place_id).toBeTruthy();

    const place = places.getPlace(db, result.event.place_id!);
    expect(place).not.toBeNull();
    expect(place!.name).toBe('Göteborg');
  });

  it('reuses existing place when place string matches', () => {
    const existingPlace = places.createPlace(db, { name: 'Stockholm' });
    const person = persons.createPerson(db, { given_name: 'Sven', surname: 'Ek' });

    const result = recordEventWorkflow(db, {
      event_type: 'census',
      person_id: person.id,
      place: 'Stockholm',
    });

    expect(result.event.place_id).toBe(existingPlace.id);
    expect(places.listPlaces(db)).toHaveLength(1);
  });
});

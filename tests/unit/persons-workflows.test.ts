import type { Database } from 'node-sqlite3-wasm';
import { describe, it, expect, beforeEach } from 'vitest';
import { createPersonWithEventWorkflow } from '../../src/api/persons_workflows';
import * as persons from '../../src/api/persons';
import * as events from '../../src/api/events';
import * as places from '../../src/api/places';
import * as sources from '../../src/api/sources';
import { createTestDb } from './helpers';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('createPersonWithEventWorkflow', () => {
  it('creates a person-only record when no event fields are provided', () => {
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Anna',
      surname: 'Lindström',
      sex: 'F',
    });
    expect(result.person.id).toBeTruthy();
    expect(result.event).toBeNull();
    expect(result.citation).toBeNull();
    expect(events.getEventsForPerson(db, result.person.id)).toHaveLength(0);
  });

  it('creates person + birth event + event_participant + place', () => {
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Erik',
      surname: 'Svensson',
      sex: 'M',
      event: {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1850-03-12',
        date_original: '12 Mar 1850',
        place_id: null,
        place_name: 'Stockholm',
        description: '',
        cause: null,
      },
    });
    expect(result.event).not.toBeNull();
    expect(result.event!.event_type).toBe('birth');
    expect(result.event!.place_id).toBeTruthy();

    const personEvents = events.getEventsForPerson(db, result.person.id);
    expect(personEvents).toHaveLength(1);
    expect(personEvents[0].id).toBe(result.event!.id);

    const place = places.getPlace(db, result.event!.place_id!);
    expect(place?.name).toBe('Stockholm');
  });

  it('uses an existing place_id instead of creating one', () => {
    const stockholm = places.createPlace(db, { name: 'Stockholm' });
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Erik',
      surname: 'Svensson',
      event: {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1850',
        date_original: '1850',
        place_id: stockholm.id,
        place_name: null,
        description: '',
        cause: null,
      },
    });
    expect(result.event!.place_id).toBe(stockholm.id);
  });

  it('creates a citation when source is provided', () => {
    const src = sources.createSource(db, { title: 'Husförhörslängd 1850' });
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Erik',
      surname: 'Svensson',
      event: {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1850',
        date_original: '1850',
        place_id: null,
        place_name: null,
        description: '',
        cause: null,
      },
      citation: { source_id: src.id, page: '42' },
    });
    expect(result.citation).not.toBeNull();
    expect(result.citation!.source_id).toBe(src.id);
    expect(result.citation!.event_id).toBe(result.event!.id);
    expect(result.citation!.page).toBe('42');
  });

  it('rolls back on failure — person is not created when event creation throws', () => {
    // Provide an invalid event_type through a type-cast to force a DB constraint failure.
    // If the event insert fails, the transaction must roll back — no person should exist.
    const beforeCount = persons.listPersons(db).length;
    expect(() => {
      createPersonWithEventWorkflow(db, {
        given_name: 'Erik',
        surname: 'Svensson',
        event: {
          // cause an FK violation by pointing to a non-existent place_id
          event_type: 'birth',
          date_type: 'exact',
          date_value: '1850',
          date_original: '1850',
          place_id: 'nonexistent-place-id',
          place_name: null,
          description: '',
          cause: null,
        },
      });
    }).toThrow();
    const afterCount = persons.listPersons(db).length;
    expect(afterCount).toBe(beforeCount);
  });

  it('creates a person with only event_type (no date, no place)', () => {
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Maria',
      surname: 'Olsson',
      event: {
        event_type: 'residence',
        date_type: 'unknown',
        date_value: null,
        date_original: '',
        place_id: null,
        place_name: null,
        description: '',
        cause: null,
      },
    });
    expect(result.event).not.toBeNull();
    expect(result.event!.event_type).toBe('residence');
    expect(result.event!.place_id).toBeNull();
  });
});

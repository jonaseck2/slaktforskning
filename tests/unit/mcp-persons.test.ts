import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPersonWorkflow, findOrCreateSource } from '../../src/mcp/tools/prod/persons';
import * as persons from '../../src/api/persons';
import * as events from '../../src/api/events';
import * as sources from '../../src/api/sources';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

describe('createPersonWorkflow', () => {
  it('creates person with name only', async () => {
    const result = await createPersonWorkflow(db, {
      given_name: 'Anna',
      surname: 'Lindström',
    });

    expect(result.person.id).toBeTruthy();
    const names = persons.getPersonNames(db, result.person.id);
    expect(names).toHaveLength(1);
    expect(names[0].given_name).toBe('Anna');
    expect(names[0].surname).toBe('Lindström');
    expect(result.birth_event).toBeNull();
    expect(result.citation).toBeNull();
  });

  it('creates person with birth_date and birth_place', async () => {
    const result = await createPersonWorkflow(db, {
      given_name: 'Erik',
      surname: 'Svensson',
      birth_date: '1850',
      birth_place: 'Stockholm',
    });

    expect(result.person.id).toBeTruthy();
    expect(result.birth_event).not.toBeNull();
    expect(result.birth_event!.event_type).toBe('birth');
    expect(result.birth_event!.date_original).toBe('1850');
    expect(result.birth_event!.place_id).toBeTruthy();

    // Verify event_participant was created
    const personEvents = events.getEventsForPerson(db, result.person.id);
    expect(personEvents).toHaveLength(1);
    expect(personEvents[0].id).toBe(result.birth_event!.id);
  });

  it('creates person with source_title and creates citation', async () => {
    const result = await createPersonWorkflow(db, {
      given_name: 'Lars',
      surname: 'Karlsson',
      birth_date: '1820',
      birth_place: 'Göteborg',
      source_title: 'Husförhörslängd 1820',
      source_page: '42',
    });

    expect(result.citation).not.toBeNull();
    expect(result.citation!.event_id).toBe(result.birth_event!.id);
    expect(result.citation!.page).toBe('42');

    const allSources = sources.listSources(db);
    expect(allSources).toHaveLength(1);
    expect(allSources[0].title).toBe('Husförhörslängd 1820');
  });

  it('reuses existing source when title matches', async () => {
    // Pre-create a source
    const existingSource = sources.createSource(db, { title: 'Kyrkböcker' });

    const result = await createPersonWorkflow(db, {
      given_name: 'Maria',
      surname: 'Olsson',
      birth_date: '1875',
      source_title: 'Kyrkböcker',
    });

    expect(result.citation).not.toBeNull();
    expect(result.citation!.source_id).toBe(existingSource.id);

    // Should still only be one source
    const allSources = sources.listSources(db);
    expect(allSources).toHaveLength(1);
  });
});

describe('findOrCreateSource', () => {
  it('creates source when none exists', () => {
    const source = findOrCreateSource(db, 'New Source');
    expect(source.title).toBe('New Source');
    expect(source.id).toBeTruthy();
  });

  it('finds existing source by exact title', () => {
    const original = sources.createSource(db, { title: 'Existing Source' });
    const found = findOrCreateSource(db, 'Existing Source');
    expect(found.id).toBe(original.id);
  });
});

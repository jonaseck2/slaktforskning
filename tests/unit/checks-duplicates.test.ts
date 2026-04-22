import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { runAllChecks } from '../../src/api/checks';
import { queryRun } from '../../src/api/db';
import { createEvent } from '../../src/api/events';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createPerson } from '../../src/api/persons';
import { createPlace } from '../../src/api/places';
import { addEventParticipant } from '../../src/api/relationships';
import { createSource } from '../../src/api/sources';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('POSSIBLE_DUPLICATE_PERSON', () => {
  it('fires for two persons with the same name and matching birth year', () => {
    const p1 = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    const p2 = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    for (const p of [p1, p2]) {
      const e = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1900-01-01' });
      addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    }
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'POSSIBLE_DUPLICATE_PERSON');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    // Both persons must appear across the results for this pair
    const ids = new Set(hit.flatMap(h => h.personIds));
    expect(ids.has(p1.id)).toBe(true);
    expect(ids.has(p2.id)).toBe(true);
    expect(hit[0].severity).toBe('notice');
  });
});

describe('DUPLICATE_IDENTIFIER', () => {
  it('fires when two persons share the same identifier', () => {
    const p1 = createPerson(db, {});
    const p2 = createPerson(db, {});
    queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p1.id, 'familysearch', 'ABC-1234']);
    queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p2.id, 'familysearch', 'ABC-1234']);
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_IDENTIFIER');
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(new Set(hit[0].personIds)).toEqual(new Set([p1.id, p2.id]));
  });

  it('does not fire for unique identifiers', () => {
    const p1 = createPerson(db, {});
    const p2 = createPerson(db, {});
    queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p1.id, 'familysearch', 'A']);
    queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p2.id, 'familysearch', 'B']);
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_IDENTIFIER')).toHaveLength(0);
  });
});

describe('DUPLICATE_PLACE', () => {
  it('fires for two places with the same normalized_name and same parent', () => {
    const country = createPlace(db, { name: 'Sverige' });
    const a = createPlace(db, { name: 'Stockholm', parent_place_id: country.id });
    const b = createPlace(db, { name: 'Stockholm', parent_place_id: country.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_PLACE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].placeIds)).toEqual(new Set([a.id, b.id]));
  });

  it('does not fire for same name under different parents', () => {
    const p1 = createPlace(db, { name: 'Sverige' });
    const p2 = createPlace(db, { name: 'Norge' });
    createPlace(db, { name: 'Strömstad', parent_place_id: p1.id });
    createPlace(db, { name: 'Strömstad', parent_place_id: p2.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_PLACE')).toHaveLength(0);
  });
});

describe('DUPLICATE_MEDIA', () => {
  it('fires for two media rows with the same file_ref', () => {
    const p = createPerson(db, {});
    const a = createMedia(db, { title: 'Foo', file_ref: '/photos/p.jpg' });
    const b = createMedia(db, { title: 'Bar', file_ref: '/photos/p.jpg' });
    addMediaLink(db, { media_id: a.id, entity_type: 'person', entity_id: p.id });
    addMediaLink(db, { media_id: b.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_MEDIA');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].mediaIds)).toEqual(new Set([a.id, b.id]));
  });

  it('does not fire for empty file_ref', () => {
    const p = createPerson(db, {});
    const a = createMedia(db, { title: 'Foo' });
    const b = createMedia(db, { title: 'Bar' });
    addMediaLink(db, { media_id: a.id, entity_type: 'person', entity_id: p.id });
    addMediaLink(db, { media_id: b.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_MEDIA')).toHaveLength(0);
  });
});

describe('DUPLICATE_SOURCE', () => {
  it('fires for two sources with the same URL', () => {
    const a = createSource(db, { title: 'A', url: 'https://example.org/book' });
    const b = createSource(db, { title: 'B', url: 'https://example.org/book' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });

  it('fires for two sources with the same (title, author, publication_info)', () => {
    const a = createSource(db, { title: 'Bygdebok', author: 'Svensson', publication_info: '1932' });
    const b = createSource(db, { title: 'Bygdebok', author: 'Svensson', publication_info: '1932' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });

  it('deduplicates when a group matches both url and metadata', () => {
    const a = createSource(db, { title: 'Same', author: 'Same', publication_info: 'Same', url: 'https://x.org' });
    const b = createSource(db, { title: 'Same', author: 'Same', publication_info: 'Same', url: 'https://x.org' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });
});

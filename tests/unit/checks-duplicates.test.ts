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
beforeEach(async () => { db = await createTestDb(); });

describe('POSSIBLE_DUPLICATE_PERSON', async () => {
  it('fires for two persons with the same name and matching birth year', async () => {
    const p1 = await createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    const p2 = await createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    for (const p of [p1, p2]) {
      const e = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1900-01-01' });
      await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    }
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'POSSIBLE_DUPLICATE_PERSON');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    // Both persons must appear across the results for this pair
    const ids = new Set(hit.flatMap(h => h.personIds));
    expect(ids.has(p1.id)).toBe(true);
    expect(ids.has(p2.id)).toBe(true);
    expect(hit[0].severity).toBe('notice');
    // Quality-check landing — see Task 8 of duplicates-panel plan.
    expect(hit[0].landingPath).toBeDefined();
    expect(hit[0].landingPath!.startsWith('/duplicates?tab=persons&pair=')).toBe(true);
    const [id1, id2] = hit[0].landingPath!.split('pair=')[1].split(':');
    expect(new Set([id1, id2])).toEqual(new Set([p1.id, p2.id]));
  });
});

describe('DUPLICATE_IDENTIFIER', async () => {
  it('fires when two persons share the same identifier', async () => {
    const p1 = await createPerson(db, {}, { allowNameless: true });
    const p2 = await createPerson(db, {}, { allowNameless: true });
    await queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p1.id, 'familysearch', 'ABC-1234']);
    await queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p2.id, 'familysearch', 'ABC-1234']);
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_IDENTIFIER');
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(new Set(hit[0].personIds)).toEqual(new Set([p1.id, p2.id]));
  });

  it('does not fire for unique identifiers', async () => {
    const p1 = await createPerson(db, {}, { allowNameless: true });
    const p2 = await createPerson(db, {}, { allowNameless: true });
    await queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p1.id, 'familysearch', 'A']);
    await queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p2.id, 'familysearch', 'B']);
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_IDENTIFIER')).toHaveLength(0);
  });
});

describe('DUPLICATE_PLACE', async () => {
  it('fires for two places with the same normalized_name and same parent', async () => {
    const country = await createPlace(db, { name: 'Sverige' });
    const a = await createPlace(db, { name: 'Stockholm', parent_place_id: country.id });
    const b = await createPlace(db, { name: 'Stockholm', parent_place_id: country.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_PLACE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].placeIds)).toEqual(new Set([a.id, b.id]));
    // Quality-check landing — see Task 8 of duplicates-panel plan.
    expect(hit[0].landingPath).toBeDefined();
    const lp = hit[0].landingPath!;
    expect(lp.startsWith('/duplicates?tab=places&pair=')).toBe(true);
    const [id1, id2] = lp.split('pair=')[1].split(':');
    expect(new Set([id1, id2])).toEqual(new Set([a.id, b.id]));
  });

  it('does not fire for same name under different parents', async () => {
    const p1 = await createPlace(db, { name: 'Sverige' });
    const p2 = await createPlace(db, { name: 'Norge' });
    await createPlace(db, { name: 'Strömstad', parent_place_id: p1.id });
    await createPlace(db, { name: 'Strömstad', parent_place_id: p2.id });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_PLACE')).toHaveLength(0);
  });
});

describe('DUPLICATE_MEDIA', async () => {
  it('fires for two media rows with the same file_ref', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const a = await createMedia(db, { title: 'Foo', file_ref: '/photos/p.jpg' });
    const b = await createMedia(db, { title: 'Bar', file_ref: '/photos/p.jpg' });
    await addMediaLink(db, { media_id: a.id, entity_type: 'person', entity_id: p.id });
    await addMediaLink(db, { media_id: b.id, entity_type: 'person', entity_id: p.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_MEDIA');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].mediaIds)).toEqual(new Set([a.id, b.id]));
    expect(hit[0].landingPath).toBeDefined();
    expect(hit[0].landingPath!.startsWith('/duplicates?tab=media&pair=')).toBe(true);
    const [id1, id2] = hit[0].landingPath!.split('pair=')[1].split(':');
    expect(new Set([id1, id2])).toEqual(new Set([a.id, b.id]));
  });

  it('does not fire for empty file_ref', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const a = await createMedia(db, { title: 'Foo' });
    const b = await createMedia(db, { title: 'Bar' });
    await addMediaLink(db, { media_id: a.id, entity_type: 'person', entity_id: p.id });
    await addMediaLink(db, { media_id: b.id, entity_type: 'person', entity_id: p.id });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_MEDIA')).toHaveLength(0);
  });
});

describe('DUPLICATE_SOURCE', async () => {
  it('fires for two sources with the same URL', async () => {
    const a = await createSource(db, { title: 'A', url: 'https://example.org/book' });
    const b = await createSource(db, { title: 'B', url: 'https://example.org/book' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
    expect(hit[0].landingPath).toBeDefined();
    expect(hit[0].landingPath!.startsWith('/duplicates?tab=sources&pair=')).toBe(true);
    const [id1, id2] = hit[0].landingPath!.split('pair=')[1].split(':');
    expect(new Set([id1, id2])).toEqual(new Set([a.id, b.id]));
  });

  it('fires for two sources with the same (title, author, publication_info)', async () => {
    const a = await createSource(db, { title: 'Bygdebok', author: 'Svensson', publication_info: '1932' });
    const b = await createSource(db, { title: 'Bygdebok', author: 'Svensson', publication_info: '1932' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });

  it('deduplicates when a group matches both url and metadata', async () => {
    const a = await createSource(db, { title: 'Same', author: 'Same', publication_info: 'Same', url: 'https://x.org' });
    const b = await createSource(db, { title: 'Same', author: 'Same', publication_info: 'Same', url: 'https://x.org' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });
});

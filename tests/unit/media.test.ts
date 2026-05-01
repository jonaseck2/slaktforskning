import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import {
  createMedia,
  getMedia,
  listMedia,
  listMediaPage,
  countMedia,
  countMissingMedia,
  deleteMedia,
  addMediaLink,
  getMediaForEntity,
  removeMediaLink,
  reorderMediaLinks,
  getPersonProfilePicRef,
  getPersonProfilePicRefs,
} from '../../src/api/media';
import { createMediaRegion } from '../../src/api/media_regions';
import { createTestDb } from './helpers';

let db: any;

beforeEach(() => {
  db = createTestDb();
});

describe('media', () => {
  it('creates and retrieves a media item', () => {
    const item = createMedia(db, { title: 'Wedding photo 1892' });
    expect(item.id).toBeDefined();
    expect(item.title).toBe('Wedding photo 1892');
    expect(item.file_ref).toBeNull();
    expect(item.is_printable).toBeFalsy();

    const fetched = getMedia(db, item.id);
    expect(fetched?.title).toBe('Wedding photo 1892');
  });

  it('creates a media item with all fields', () => {
    const item = createMedia(db, {
      title: 'Portrait of Erik',
      file_ref: '/photos/erik_1885.jpg',
      format: 'image/jpeg',
      notes: 'From family album',
      is_printable: true,
    });
    expect(item.file_ref).toBe('/photos/erik_1885.jpg');
    expect(item.format).toBe('image/jpeg');
    expect(item.is_printable).toBeTruthy();
  });

  it('creates a media item with is_missing flag', () => {
    const item = createMedia(db, {
      title: 'Missing file reference',
      file_ref: 'media/missing.jpg',
      is_missing: true,
    });
    expect(item.is_missing).toBe(1);
    const fetched = getMedia(db, item.id);
    expect(fetched?.is_missing).toBe(1);
  });

  it('defaults is_missing to 0', () => {
    const item = createMedia(db, { title: 'Normal item' });
    expect(item.is_missing).toBe(0);
  });

  it('lists media ordered by title', () => {
    createMedia(db, { title: 'Zumba class photo' });
    createMedia(db, { title: 'Anna baptism' });
    const items = listMedia(db);
    expect(items[0].title).toBe('Anna baptism');
    expect(items[1].title).toBe('Zumba class photo');
  });

  it('deletes a media item', () => {
    const item = createMedia(db, { title: 'To delete' });
    expect(deleteMedia(db, item.id)).toBe(true);
    expect(getMedia(db, item.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', () => {
    expect(deleteMedia(db, 'nonexistent')).toBe(false);
  });

  it('get returns null for nonexistent id', () => {
    expect(getMedia(db, 'nonexistent')).toBeNull();
  });
});

describe('media links', () => {
  it('links media to a person and retrieves it', () => {
    const item = createMedia(db, { title: 'Portrait' });
    const person = createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });

    const link = addMediaLink(db, {
      media_id: item.id,
      entity_type: 'person',
      entity_id: person.id,
    });
    expect(link.id).toBeDefined();
    expect(link.entity_type).toBe('person');
    expect(link.entity_id).toBe(person.id);

    const results = getMediaForEntity(db, 'person', person.id);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Portrait');
    expect(results[0].link_id).toBe(link.id);
  });

  it('links media to an event', () => {
    const item = createMedia(db, { title: 'Baptism certificate scan' });
    const event = createEvent(db, { event_type: 'baptism' });

    addMediaLink(db, { media_id: item.id, entity_type: 'event', entity_id: event.id });
    const results = getMediaForEntity(db, 'event', event.id);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Baptism certificate scan');
  });

  it('links same media to multiple entities', () => {
    const item = createMedia(db, { title: 'Family photo' });
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });
    const p2 = createPerson(db, { given_name: 'Anna', surname: 'Nilsson' });

    addMediaLink(db, { media_id: item.id, entity_type: 'person', entity_id: p1.id });
    addMediaLink(db, { media_id: item.id, entity_type: 'person', entity_id: p2.id });

    expect(getMediaForEntity(db, 'person', p1.id)).toHaveLength(1);
    expect(getMediaForEntity(db, 'person', p2.id)).toHaveLength(1);
  });

  it('removes a media link', () => {
    const item = createMedia(db, { title: 'Photo' });
    const person = createPerson(db, { given_name: 'Lars', surname: 'Berg' });
    const link = addMediaLink(db, { media_id: item.id, entity_type: 'person', entity_id: person.id });

    expect(removeMediaLink(db, link.id)).toBe(true);
    expect(getMediaForEntity(db, 'person', person.id)).toHaveLength(0);
    // Media item itself survives
    expect(getMedia(db, item.id)).not.toBeNull();
  });

  it('removeMediaLink returns false for nonexistent id', () => {
    expect(removeMediaLink(db, 'nonexistent')).toBe(false);
  });

  it('returns empty array when entity has no media', () => {
    const person = createPerson(db, { given_name: 'Solo', surname: 'Person' });
    expect(getMediaForEntity(db, 'person', person.id)).toHaveLength(0);
  });

  it('cascades delete: removing media removes its links', () => {
    const item = createMedia(db, { title: 'Cascade test' });
    const person = createPerson(db, { given_name: 'Test', surname: 'Person' });
    addMediaLink(db, { media_id: item.id, entity_type: 'person', entity_id: person.id });

    deleteMedia(db, item.id);
    expect(getMediaForEntity(db, 'person', person.id)).toHaveLength(0);
  });

  it('getMediaForEntity returns items ordered by sort_order', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'Order' });
    const m1 = createMedia(db, { title: 'Photo C' });
    const m2 = createMedia(db, { title: 'Photo A' });
    const m3 = createMedia(db, { title: 'Photo B' });

    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id, sort_order: 2 });
    addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id, sort_order: 0 });
    addMediaLink(db, { media_id: m3.id, entity_type: 'person', entity_id: person.id, sort_order: 1 });

    const results = getMediaForEntity(db, 'person', person.id);
    expect(results.map(r => r.title)).toEqual(['Photo A', 'Photo B', 'Photo C']);
  });

  it('addMediaLink auto-assigns sort_order as next in sequence', () => {
    const person = createPerson(db, { given_name: 'Auto', surname: 'Order' });
    const m1 = createMedia(db, { title: 'First' });
    const m2 = createMedia(db, { title: 'Second' });
    const m3 = createMedia(db, { title: 'Third' });

    const l1 = addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    const l2 = addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });
    const l3 = addMediaLink(db, { media_id: m3.id, entity_type: 'person', entity_id: person.id });

    expect(l1.sort_order).toBe(0);
    expect(l2.sort_order).toBe(1);
    expect(l3.sort_order).toBe(2);
  });

  it('reorderMediaLinks updates sort_order for all links of an entity', () => {
    const person = createPerson(db, { given_name: 'Reorder', surname: 'Test' });
    const m1 = createMedia(db, { title: 'First' });
    const m2 = createMedia(db, { title: 'Second' });
    const m3 = createMedia(db, { title: 'Third' });

    const l1 = addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    const l2 = addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });
    const l3 = addMediaLink(db, { media_id: m3.id, entity_type: 'person', entity_id: person.id });

    // Reverse the order: Third, Second, First
    reorderMediaLinks(db, [l3.id, l2.id, l1.id]);

    const results = getMediaForEntity(db, 'person', person.id);
    expect(results.map(r => r.title)).toEqual(['Third', 'Second', 'First']);
  });

  it('stores and retrieves link_type', () => {
    const item = createMedia(db, { title: 'Primary photo' });
    const person = createPerson(db, { given_name: 'Main', surname: 'Person' });
    const link = addMediaLink(db, {
      media_id: item.id,
      entity_type: 'person',
      entity_id: person.id,
      link_type: 1,
    });
    expect(link.link_type).toBe(1);

    const results = getMediaForEntity(db, 'person', person.id);
    expect(results[0].link_type).toBe(1);
  });

  it('listMediaPage returns paginated items with link_count', () => {
    const m1 = createMedia(db, { title: 'Alpha' });
    const m2 = createMedia(db, { title: 'Beta' });
    createMedia(db, { title: 'Gamma' });
    const person = createPerson(db, { given_name: 'Test', surname: 'Person' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });

    const page1 = listMediaPage(db, 2, 0);
    expect(page1).toHaveLength(2);
    expect(page1[0].title).toBe('Alpha');
    expect(page1[0].link_count).toBe(1);
    expect(page1[1].title).toBe('Beta');
    expect(page1[1].link_count).toBe(1);

    const page2 = listMediaPage(db, 2, 2);
    expect(page2).toHaveLength(1);
    expect(page2[0].title).toBe('Gamma');
    expect(page2[0].link_count).toBe(0);
  });

  it('countMedia returns total count', () => {
    expect(countMedia(db)).toBe(0);
    createMedia(db, { title: 'A' });
    createMedia(db, { title: 'B' });
    expect(countMedia(db)).toBe(2);
  });

  it('countMissingMedia counts only is_missing rows across the entire table', () => {
    expect(countMissingMedia(db)).toBe(0);
    createMedia(db, { title: 'Present A' });
    createMedia(db, { title: 'Present B' });
    createMedia(db, { title: 'Lost wedding photo', is_missing: true });
    createMedia(db, { title: 'Lost letter', is_missing: true });
    expect(countMissingMedia(db)).toBe(2);
    expect(countMissingMedia(db, 'wedding')).toBe(1);
    expect(countMissingMedia(db, 'present')).toBe(0);
  });

  it('filters by query across title, notes, format, file_ref', () => {
    createMedia(db, { title: 'Wedding photo', notes: 'Karl and Anna', format: 'jpg' });
    createMedia(db, { title: 'Death certificate', format: 'pdf' });
    createMedia(db, { title: 'Letter', file_ref: 'letters/1850.txt' });

    expect(countMedia(db, 'wedding')).toBe(1);
    expect(countMedia(db, 'karl')).toBe(1);
    expect(countMedia(db, 'pdf')).toBe(1);
    expect(countMedia(db, '1850')).toBe(1);
    expect(listMediaPage(db, 100, 0, 'title', 'asc', 'wedding').map(m => m.title)).toEqual(['Wedding photo']);
  });

  it('sorts by format and created_at', () => {
    createMedia(db, { title: 'A', format: 'pdf' });
    createMedia(db, { title: 'B', format: 'jpg' });
    const byFormatAsc = listMediaPage(db, 100, 0, 'format', 'asc');
    expect(byFormatAsc[0].format).toBe('jpg');
    const byFormatDesc = listMediaPage(db, 100, 0, 'format', 'desc');
    expect(byFormatDesc[0].format).toBe('pdf');
  });
});

describe('getPersonProfilePicRef', () => {
  it('returns null when person has no media', () => {
    const person = createPerson(db, { given_name: 'A', surname: 'B' });
    const ref = getPersonProfilePicRef(db, person.id);
    expect(ref).toBeNull();
  });

  it('returns { mediaId, region: null } when media has no region for this person', () => {
    const person = createPerson(db, { given_name: 'A', surname: 'B' });
    const m = createMedia(db, { title: 'Pic' });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: person.id });
    const ref = getPersonProfilePicRef(db, person.id);
    expect(ref).toEqual({ mediaId: m.id, region: null });
  });

  it('returns { mediaId, region } when media has a region tagged to this person', () => {
    const person = createPerson(db, { given_name: 'A', surname: 'B' });
    const m = createMedia(db, { title: 'Pic' });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: person.id });
    createMediaRegion(db, { media_id: m.id, person_id: person.id, x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const ref = getPersonProfilePicRef(db, person.id);
    expect(ref).not.toBeNull();
    expect(ref!.mediaId).toBe(m.id);
    expect(ref!.region).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('picks the FIRST media by sort_order', () => {
    const person = createPerson(db, { given_name: 'A', surname: 'B' });
    const m1 = createMedia(db, { title: 'First' });
    const m2 = createMedia(db, { title: 'Second' });
    addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id, sort_order: 1 });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id, sort_order: 0 });
    const ref = getPersonProfilePicRef(db, person.id);
    expect(ref!.mediaId).toBe(m1.id);
  });

  it('ignores regions on that media tagged to OTHER persons', () => {
    const p1 = createPerson(db, { given_name: 'A', surname: 'B' });
    const p2 = createPerson(db, { given_name: 'C', surname: 'D' });
    const m = createMedia(db, { title: 'Group' });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p1.id });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p2.id });
    createMediaRegion(db, { media_id: m.id, person_id: p2.id, x: 0.5, y: 0.5, width: 0.1, height: 0.1 });
    const ref = getPersonProfilePicRef(db, p1.id);
    expect(ref).toEqual({ mediaId: m.id, region: null });
  });
});

describe('getPersonProfilePicRefs (batch)', () => {
  it('returns a map keyed by personId, including nulls for missing', () => {
    const p1 = createPerson(db, { given_name: 'A', surname: 'B' });
    const p2 = createPerson(db, { given_name: 'C', surname: 'D' });
    const p3 = createPerson(db, { given_name: 'E', surname: 'F' });
    const m = createMedia(db, { title: 'Pic' });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p1.id });
    createMediaRegion(db, { media_id: m.id, person_id: p1.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p2.id });
    const map = getPersonProfilePicRefs(db, [p1.id, p2.id, p3.id]);
    expect(map[p1.id]).toEqual({ mediaId: m.id, region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } });
    expect(map[p2.id]).toEqual({ mediaId: m.id, region: null });
    expect(map[p3.id]).toBeNull();
  });

  it('returns empty object for empty input', () => {
    const map = getPersonProfilePicRefs(db, []);
    expect(map).toEqual({});
  });
});

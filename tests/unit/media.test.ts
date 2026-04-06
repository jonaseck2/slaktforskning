import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import {
  createMedia,
  getMedia,
  listMedia,
  deleteMedia,
  addMediaLink,
  getMediaForEntity,
  removeMediaLink,
} from '../../src/api/media';

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
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createPlace } from '../../src/api/places';
import { getMediaTimeline } from '../../src/api/media_timeline';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

describe('getMediaTimeline', () => {
  describe('person timeline', () => {
    it('returns empty array when no media exists', () => {
      const person = createPerson(db, { sex: 'M' });
      const result = getMediaTimeline(db, 'person', person.id);
      expect(result).toEqual([]);
    });

    it('returns directly linked media as undated', () => {
      const person = createPerson(db, { sex: 'M' });
      const media = createMedia(db, { title: 'Photo 1', format: 'jpg' });
      addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });

      const result = getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(1);
      expect(result[0].media.id).toBe(media.id);
      expect(result[0].date).toBeUndefined();
    });

    it('returns event-linked media with date info', () => {
      const person = createPerson(db, { sex: 'F' });
      const place = createPlace(db, { name: 'Stockholm' });
      const event = createEvent(db, {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1920-03-15',
        place_id: place.id,
        description: 'Born in Stockholm',
      });
      addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
      const media = createMedia(db, { title: 'Birth cert', format: 'jpg' });
      addMediaLink(db, { media_id: media.id, entity_type: 'event', entity_id: event.id });

      const result = getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(1);
      expect(result[0].media.id).toBe(media.id);
      expect(result[0].date).toBe('1920-03-15');
      expect(result[0].eventType).toBe('birth');
      expect(result[0].placeName).toBe('Stockholm');
    });

    it('deduplicates same media linked to person and event (prefers dated)', () => {
      const person = createPerson(db, { sex: 'M' });
      const event = createEvent(db, {
        event_type: 'baptism',
        date_type: 'exact',
        date_value: '1920-04-01',
      });
      addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

      const media = createMedia(db, { title: 'Church record', format: 'png' });
      // Link same media to both person and event
      addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });
      addMediaLink(db, { media_id: media.id, entity_type: 'event', entity_id: event.id });

      const result = getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(1);
      // Should have the dated version
      expect(result[0].date).toBe('1920-04-01');
      expect(result[0].eventType).toBe('baptism');
    });

    it('sorts dated items before undated', () => {
      const person = createPerson(db, { sex: 'F' });
      const event = createEvent(db, {
        event_type: 'death',
        date_type: 'exact',
        date_value: '1990-12-01',
      });
      addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

      const undatedMedia = createMedia(db, { title: 'Undated photo', format: 'jpg' });
      addMediaLink(db, { media_id: undatedMedia.id, entity_type: 'person', entity_id: person.id });

      const datedMedia = createMedia(db, { title: 'Death cert', format: 'jpg' });
      addMediaLink(db, { media_id: datedMedia.id, entity_type: 'event', entity_id: event.id });

      const result = getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(2);
      expect(result[0].media.title).toBe('Death cert');
      expect(result[0].date).toBe('1990-12-01');
      expect(result[1].media.title).toBe('Undated photo');
      expect(result[1].date).toBeUndefined();
    });

    it('sorts dated items chronologically', () => {
      const person = createPerson(db, { sex: 'M' });

      const birthEvent = createEvent(db, {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1920-01-01',
      });
      addEventParticipant(db, { event_id: birthEvent.id, person_id: person.id, role: 'primary' });

      const deathEvent = createEvent(db, {
        event_type: 'death',
        date_type: 'exact',
        date_value: '1990-06-15',
      });
      addEventParticipant(db, { event_id: deathEvent.id, person_id: person.id, role: 'primary' });

      const birthMedia = createMedia(db, { title: 'Birth', format: 'jpg' });
      addMediaLink(db, { media_id: birthMedia.id, entity_type: 'event', entity_id: birthEvent.id });

      const deathMedia = createMedia(db, { title: 'Death', format: 'jpg' });
      addMediaLink(db, { media_id: deathMedia.id, entity_type: 'event', entity_id: deathEvent.id });

      const result = getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(2);
      expect(result[0].media.title).toBe('Birth');
      expect(result[1].media.title).toBe('Death');
    });
  });

  describe('place timeline', () => {
    it('returns empty array when no media exists for place', () => {
      const place = createPlace(db, { name: 'Test Place' });
      const result = getMediaTimeline(db, 'place', place.id);
      expect(result).toEqual([]);
    });

    it('returns directly linked place media', () => {
      const place = createPlace(db, { name: 'Church' });
      const media = createMedia(db, { title: 'Church photo', format: 'jpg' });
      addMediaLink(db, { media_id: media.id, entity_type: 'place', entity_id: place.id });

      const result = getMediaTimeline(db, 'place', place.id);
      expect(result).toHaveLength(1);
      expect(result[0].media.id).toBe(media.id);
    });

    it('returns media from events at the place', () => {
      const place = createPlace(db, { name: 'Parish' });
      const event = createEvent(db, {
        event_type: 'baptism',
        date_type: 'exact',
        date_value: '1850-07-20',
        place_id: place.id,
      });
      const media = createMedia(db, { title: 'Record', format: 'jpg' });
      addMediaLink(db, { media_id: media.id, entity_type: 'event', entity_id: event.id });

      const result = getMediaTimeline(db, 'place', place.id);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('1850-07-20');
      expect(result[0].eventType).toBe('baptism');
      expect(result[0].placeName).toBe('Parish');
    });
  });
});

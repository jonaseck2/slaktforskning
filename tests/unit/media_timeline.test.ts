import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createPlace } from '../../src/api/places';
import { getMediaTimeline } from '../../src/api/media_timeline';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  db = await createTestDb();
});

describe('getMediaTimeline', async () => {
  describe('person timeline', async () => {
    it('returns empty array when no media exists', async () => {
      const person = await createPerson(db, { sex: 'M' }, { allowNameless: true });
      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toEqual([]);
    });

    it('returns directly linked media as undated', async () => {
      const person = await createPerson(db, { sex: 'M' }, { allowNameless: true });
      const media = await createMedia(db, { title: 'Photo 1', format: 'jpg' });
      await addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });

      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(1);
      expect(result[0].media.id).toBe(media.id);
      expect(result[0].date).toBeUndefined();
    });

    it('returns event-linked media with date info', async () => {
      const person = await createPerson(db, { sex: 'F' }, { allowNameless: true });
      const place = await createPlace(db, { name: 'Stockholm' });
      const event = await createEvent(db, {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1920-03-15',
        place_id: place.id,
        description: 'Born in Stockholm',
      });
      await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
      const media = await createMedia(db, { title: 'Birth cert', format: 'jpg' });
      await addMediaLink(db, { media_id: media.id, entity_type: 'event', entity_id: event.id });

      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(1);
      expect(result[0].media.id).toBe(media.id);
      expect(result[0].date).toBe('1920-03-15');
      expect(result[0].eventType).toBe('birth');
      expect(result[0].placeName).toBe('Stockholm');
    });

    it('deduplicates same media linked to person and event (prefers dated)', async () => {
      const person = await createPerson(db, { sex: 'M' }, { allowNameless: true });
      const event = await createEvent(db, {
        event_type: 'baptism',
        date_type: 'exact',
        date_value: '1920-04-01',
      });
      await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

      const media = await createMedia(db, { title: 'Church record', format: 'png' });
      // Link same media to both person and event
      await addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });
      await addMediaLink(db, { media_id: media.id, entity_type: 'event', entity_id: event.id });

      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(1);
      // Should have the dated version
      expect(result[0].date).toBe('1920-04-01');
      expect(result[0].eventType).toBe('baptism');
    });

    it('sorts dated items before undated', async () => {
      const person = await createPerson(db, { sex: 'F' }, { allowNameless: true });
      const event = await createEvent(db, {
        event_type: 'death',
        date_type: 'exact',
        date_value: '1990-12-01',
      });
      await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

      const undatedMedia = await createMedia(db, { title: 'Undated photo', format: 'jpg' });
      await addMediaLink(db, { media_id: undatedMedia.id, entity_type: 'person', entity_id: person.id });

      const datedMedia = await createMedia(db, { title: 'Death cert', format: 'jpg' });
      await addMediaLink(db, { media_id: datedMedia.id, entity_type: 'event', entity_id: event.id });

      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(2);
      expect(result[0].media.title).toBe('Death cert');
      expect(result[0].date).toBe('1990-12-01');
      expect(result[1].media.title).toBe('Undated photo');
      expect(result[1].date).toBeUndefined();
    });

    it('sorts dated items chronologically', async () => {
      const person = await createPerson(db, { sex: 'M' }, { allowNameless: true });

      const birthEvent = await createEvent(db, {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1920-01-01',
      });
      await addEventParticipant(db, { event_id: birthEvent.id, person_id: person.id, role: 'primary' });

      const deathEvent = await createEvent(db, {
        event_type: 'death',
        date_type: 'exact',
        date_value: '1990-06-15',
      });
      await addEventParticipant(db, { event_id: deathEvent.id, person_id: person.id, role: 'primary' });

      const birthMedia = await createMedia(db, { title: 'Birth', format: 'jpg' });
      await addMediaLink(db, { media_id: birthMedia.id, entity_type: 'event', entity_id: birthEvent.id });

      const deathMedia = await createMedia(db, { title: 'Death', format: 'jpg' });
      await addMediaLink(db, { media_id: deathMedia.id, entity_type: 'event', entity_id: deathEvent.id });

      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(2);
      expect(result[0].media.title).toBe('Birth');
      expect(result[1].media.title).toBe('Death');
    });
  });

  describe('sort edge cases', async () => {
    it('maintains stable order for multiple undated items', async () => {
      const person = await createPerson(db, { sex: 'M' }, { allowNameless: true });
      const m1 = await createMedia(db, { title: 'Undated 1', format: 'jpg' });
      const m2 = await createMedia(db, { title: 'Undated 2', format: 'jpg' });
      await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
      await addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });

      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(2);
      // Both should be undated
      expect(result[0].date).toBeUndefined();
      expect(result[1].date).toBeUndefined();
    });

    it('sorts undated item after dated item', async () => {
      const person = await createPerson(db, { sex: 'F' }, { allowNameless: true });
      // Create undated media first
      const undated = await createMedia(db, { title: 'Undated', format: 'jpg' });
      await addMediaLink(db, { media_id: undated.id, entity_type: 'person', entity_id: person.id });

      // Then create dated via event
      const event = await createEvent(db, {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1900-01-01',
      });
      await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
      const dated = await createMedia(db, { title: 'Dated', format: 'jpg' });
      await addMediaLink(db, { media_id: dated.id, entity_type: 'event', entity_id: event.id });

      const result = await getMediaTimeline(db, 'person', person.id);
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('1900-01-01');
      expect(result[1].date).toBeUndefined();
    });
  });

  describe('place timeline', async () => {
    it('returns empty array when no media exists for place', async () => {
      const place = await createPlace(db, { name: 'Test Place' });
      const result = await getMediaTimeline(db, 'place', place.id);
      expect(result).toEqual([]);
    });

    it('returns directly linked place media', async () => {
      const place = await createPlace(db, { name: 'Church' });
      const media = await createMedia(db, { title: 'Church photo', format: 'jpg' });
      await addMediaLink(db, { media_id: media.id, entity_type: 'place', entity_id: place.id });

      const result = await getMediaTimeline(db, 'place', place.id);
      expect(result).toHaveLength(1);
      expect(result[0].media.id).toBe(media.id);
    });

    it('returns media from events at the place', async () => {
      const place = await createPlace(db, { name: 'Parish' });
      const event = await createEvent(db, {
        event_type: 'baptism',
        date_type: 'exact',
        date_value: '1850-07-20',
        place_id: place.id,
      });
      const media = await createMedia(db, { title: 'Record', format: 'jpg' });
      await addMediaLink(db, { media_id: media.id, entity_type: 'event', entity_id: event.id });

      const result = await getMediaTimeline(db, 'place', place.id);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('1850-07-20');
      expect(result[0].eventType).toBe('baptism');
      expect(result[0].placeName).toBe('Parish');
    });
  });
});

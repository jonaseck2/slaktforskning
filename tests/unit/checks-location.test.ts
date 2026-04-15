import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { checkGazetteerMatchQuality } from '../../src/api/checks/checks-location';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

const testGazetteer: Gazetteer = {
  id: 'test-gaz', name: 'Test', locale: 'sv', kind: 'point',
  root: {
    name: 'Sverige', type: 'country', lat: 62.0, lon: 15.0,
    children: [{
      name: 'Dalarnas län', type: 'county', lat: 60.6, lon: 15.6,
      aliases: ['Kopparbergs län'],
      children: [
        { name: 'Smedjebacken', type: 'parish', lat: 60.15, lon: 15.41 },
        { name: 'Amerika', type: 'parish', lat: 60.5, lon: 15.3 },
      ],
    }],
  },
};

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

describe('checkGazetteerMatchQuality', () => {
  it('returns no results for places with manual coordinates', () => {
    const place = createPlace(db, { name: 'Okänd plats', latitude: 59.0, longitude: 18.0 });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results).toHaveLength(0);
  });

  it('returns PLACE_MATCH_NONE for an unresolvable place linked to an event', () => {
    const place = createPlace(db, { name: 'Xyzzy, Fjärran Ort' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_NONE' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('returns PLACE_MATCH_WRONG_LEVEL when a single-word name matches a deep leaf', () => {
    // "Amerika" is a single component that matches a leaf parish at depth 3
    const place = createPlace(db, { name: 'Amerika' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'emigration', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_WRONG_LEVEL' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(hit[0].resolvedLat).toBeDefined();
    expect(hit[0].resolvedLon).toBeDefined();
    expect(hit[0].matchedPath).toBeDefined();
  });

  it('returns no issue for an exact match', () => {
    const place = createPlace(db, { name: 'Smedjebacken, Dalarnas län, Sverige' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    // Should not produce any quality issue for this place
    const hit = results.filter(r => r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(0);
  });

  it('returns PLACE_MATCH_PARTIAL when there are unmatched components', () => {
    // "Smedjebacken, Okänd Del, Sverige" — "Okänd Del" won't match
    const place = createPlace(db, { name: 'Smedjebacken, Okänd Del, Sverige' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_PARTIAL' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
    expect(hit[0].resolvedLat).toBeDefined();
    expect(hit[0].resolvedLon).toBeDefined();
    expect(hit[0].matchedPath).toBeDefined();
  });

  it('populates personIds from event_participants', () => {
    const place = createPlace(db, { name: 'Xyzzy, Nowhere' });
    const person1 = createPerson(db, {});
    const person2 = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person1.id });
    addEventParticipant(db, { event_id: event.id, person_id: person2.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].personIds).toContain(person1.id);
    expect(hit[0].personIds).toContain(person2.id);
  });

  it('skips places not linked to any event', () => {
    createPlace(db, { name: 'Xyzzy, Nowhere' }); // no event
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results).toHaveLength(0);
  });

  it('skips places not linked to any event participant', () => {
    const place = createPlace(db, { name: 'Xyzzy, Nowhere' });
    // event uses the place but has no participants
    createEvent(db, { event_type: 'birth', place_id: place.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    // place is linked to an event, but no person => skipped
    const hit = results.filter(r => r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(0);
  });

  it('populates placeIds and resolvedLat/Lon for PLACE_MATCH_NONE results', () => {
    const place = createPlace(db, { name: 'Xyzzy, Nowhere' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.find(r => r.code === 'PLACE_MATCH_NONE');
    expect(hit).toBeDefined();
    expect(hit!.placeIds).toContain(place.id);
    // No coords for unresolved place
    expect(hit!.resolvedLat).toBeUndefined();
    expect(hit!.resolvedLon).toBeUndefined();
  });

  it('single-word place matching a leaf at depth > 2 triggers PLACE_MATCH_WRONG_LEVEL', () => {
    // "Smedjebacken" is a single component, matches a leaf at depth 3 (Sverige > Dalarnas > Smedjebacken)
    const place = createPlace(db, { name: 'Smedjebacken' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_WRONG_LEVEL' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
  });

  it('returns empty array when no gazetteers are provided', () => {
    const place = createPlace(db, { name: 'Smedjebacken' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = checkGazetteerMatchQuality(db, []);
    expect(results).toHaveLength(0);
  });
});

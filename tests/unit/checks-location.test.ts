import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkGazetteerMatchQuality,
  checkPlaceMissingComma,
  checkPlaceNameNoRegion,
} from '../../src/api/checks/checks-location';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';
import { createTestDb } from './helpers';

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
  it('returns no results for places with manual coordinates', async () => {
    const place = createPlace(db, { name: 'Okänd plats', latitude: 59.0, longitude: 18.0 });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results).toHaveLength(0);
  });

  it('returns PLACE_MATCH_NONE for an unresolvable place linked to an event', async () => {
    const place = createPlace(db, { name: 'Xyzzy, Fjärran Ort' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_NONE' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('returns PLACE_MATCH_WRONG_LEVEL when a single-word name matches a deep leaf', async () => {
    // "Amerika" is a single component that matches a leaf parish at depth 3
    const place = createPlace(db, { name: 'Amerika' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'emigration', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_WRONG_LEVEL' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(hit[0].resolvedLat).toBeDefined();
    expect(hit[0].resolvedLon).toBeDefined();
    expect(hit[0].matchedPath).toBeDefined();
  });

  it('returns no issue for an exact match', async () => {
    const place = createPlace(db, { name: 'Smedjebacken, Dalarnas län, Sverige' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    // Should not produce any quality issue for this place
    const hit = results.filter(r => r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(0);
  });

  it('returns PLACE_MATCH_PARTIAL when there are unmatched components', async () => {
    // "Smedjebacken, Okänd Del, Sverige" — "Okänd Del" won't match
    const place = createPlace(db, { name: 'Smedjebacken, Okänd Del, Sverige' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_PARTIAL' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
    expect(hit[0].resolvedLat).toBeDefined();
    expect(hit[0].resolvedLon).toBeDefined();
    expect(hit[0].matchedPath).toBeDefined();
  });

  it('does not populate personIds — place-match issues are place-scoped', async () => {
    const place = createPlace(db, { name: 'Xyzzy, Nowhere' });
    const person1 = createPerson(db, {});
    const person2 = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person1.id });
    addEventParticipant(db, { event_id: event.id, person_id: person2.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].personIds).toEqual([]);
  });

  it('skips places not linked to any event', async () => {
    createPlace(db, { name: 'Xyzzy, Nowhere' }); // no event
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results).toHaveLength(0);
  });

  it('checks places referenced by an event even if the event has no participants', async () => {
    const place = createPlace(db, { name: 'Xyzzy, Nowhere' });
    // event uses the place but has no participants — still a used place
    createEvent(db, { event_type: 'birth', place_id: place.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
  });

  it('populates placeIds and resolvedLat/Lon for PLACE_MATCH_NONE results', async () => {
    const place = createPlace(db, { name: 'Xyzzy, Nowhere' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.find(r => r.code === 'PLACE_MATCH_NONE');
    expect(hit).toBeDefined();
    expect(hit!.placeIds).toContain(place.id);
    // No coords for unresolved place
    expect(hit!.resolvedLat).toBeUndefined();
    expect(hit!.resolvedLon).toBeUndefined();
  });

  it('single-word place matching a leaf at depth > 2 triggers PLACE_MATCH_WRONG_LEVEL', async () => {
    // "Smedjebacken" is a single component, matches a leaf at depth 3 (Sverige > Dalarnas > Smedjebacken)
    const place = createPlace(db, { name: 'Smedjebacken' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, [testGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MATCH_WRONG_LEVEL' && r.placeIds?.includes(place.id));
    expect(hit).toHaveLength(1);
  });

  it('returns empty array when no gazetteers are provided', async () => {
    const place = createPlace(db, { name: 'Smedjebacken' });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const results = await checkGazetteerMatchQuality(db, []);
    expect(results).toHaveLength(0);
  });
});

// Gazetteer with countries + admin1 regions + a city, used to exercise
// the PLACE_MISSING_COMMA token-scan logic. Includes:
//   - USA (depth 1) with Kalifornien alias for Sweden (depth 2 admin1)
//   - Richmond as a US city at depth 3
//   - Sverige as another country (depth 1)
const usGazetteer: Gazetteer = {
  id: 'us-test', name: 'US Test', locale: 'en', kind: 'point',
  root: {
    name: 'USA', type: 'country', lat: 39.0, lon: -98.0,
    children: [{
      name: 'Kalifornien', type: 'state', lat: 36.7, lon: -119.4,
      aliases: ['California'],
      children: [
        { name: 'Richmond', type: 'city', lat: 37.93, lon: -122.34 },
      ],
    }],
  },
};

const svGazetteer: Gazetteer = {
  id: 'sv-test', name: 'SV Test', locale: 'sv', kind: 'point',
  root: {
    name: 'Sverige', type: 'country', lat: 62.0, lon: 15.0,
    children: [{
      name: 'Stockholms län', type: 'county', lat: 59.3, lon: 18.0,
      children: [
        { name: 'Stockholm', type: 'city', lat: 59.33, lon: 18.06 },
      ],
    }],
  },
};

describe('checkPlaceMissingComma', () => {
  it('returns empty array when no gazetteers are provided', async () => {
    const pl = createPlace(db, { name: 'Richmond Kalifornien USA' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceMissingComma(db, []);
    expect(results).toHaveLength(0);
  });

  it('fires when two known names sit in one comma-component (country + state)', async () => {
    // Resolver matches "Richmond" → leaf, "Kalifornien USA" lands in unmatched.
    // Token-scan finds Kalifornien (depth 2) + USA (depth 1) → flag.
    const pl = createPlace(db, { name: 'Richmond, Kalifornien USA' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceMissingComma(db, [usGazetteer, svGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MISSING_COMMA' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(hit[0].messageParams?.suggestion).toContain('Kalifornien');
    expect(hit[0].messageParams?.suggestion).toContain('USA');
    // Suggestion should include a comma between recognized names
    expect((hit[0].messageParams?.suggestion as string)).toMatch(/,/);
  });

  it('does not fire when the place resolves cleanly with commas already', async () => {
    const pl = createPlace(db, { name: 'Richmond, Kalifornien, USA' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceMissingComma(db, [usGazetteer, svGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_MISSING_COMMA' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(0);
  });

  it('does not fire on legit multi-word leaf names (no shallow anchor)', async () => {
    // A two-word name where neither token matches a country/admin1 anchor.
    // Build a gazetteer with only a deep leaf "Saint Mary" (depth 3).
    const leafGaz: Gazetteer = {
      id: 'leaf-test', name: 'Leaf', locale: 'en', kind: 'point',
      root: {
        name: 'Atlantis', type: 'country', lat: 0, lon: 0,
        children: [{
          name: 'Region', type: 'state', lat: 0, lon: 0,
          children: [
            { name: 'Saint', type: 'parish', lat: 0, lon: 0 },
            { name: 'Mary', type: 'parish', lat: 0, lon: 0 },
          ],
        }],
      },
    };
    // Place name has both tokens recognized — but at depth 3 (parish), not ≤2.
    const pl = createPlace(db, { name: 'Saint Mary' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceMissingComma(db, [leafGaz]);
    const hit = results.filter(r => r.code === 'PLACE_MISSING_COMMA' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(0);
  });

  it('skips places not referenced by any event', async () => {
    createPlace(db, { name: 'Richmond Kalifornien USA' });
    const results = await checkPlaceMissingComma(db, [usGazetteer, svGazetteer]);
    expect(results).toHaveLength(0);
  });

  it('does not flag a place with manual coordinates', async () => {
    const pl = createPlace(db, { name: 'Richmond Kalifornien USA', latitude: 37.93, longitude: -122.34 });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceMissingComma(db, [usGazetteer, svGazetteer]);
    expect(results.filter(r => r.placeIds?.includes(pl.id))).toHaveLength(0);
  });
});

describe('checkPlaceNameNoRegion', () => {
  it('returns empty array when no gazetteers are provided', async () => {
    const pl = createPlace(db, { name: 'Stockhom' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceNameNoRegion(db, []);
    expect(results).toHaveLength(0);
  });

  it('fires for a typo with no parent place (Stockhom)', async () => {
    const pl = createPlace(db, { name: 'Stockhom' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceNameNoRegion(db, [svGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_NAME_NO_REGION' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('fires for a street address with no parent place', async () => {
    const pl = createPlace(db, { name: 'Fredsgatan 16' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceNameNoRegion(db, [svGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_NAME_NO_REGION' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a name that resolves cleanly', async () => {
    const pl = createPlace(db, { name: 'Stockholm' });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceNameNoRegion(db, [svGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_NAME_NO_REGION' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(0);
  });

  it('does not fire when the place has a parent_place_id', async () => {
    const parent = createPlace(db, { name: 'Sverige' });
    const pl = createPlace(db, { name: 'Hus', parent_place_id: parent.id });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceNameNoRegion(db, [svGazetteer]);
    const hit = results.filter(r => r.code === 'PLACE_NAME_NO_REGION' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(0);
  });

  it('skips places not referenced by any event', async () => {
    createPlace(db, { name: 'Stockhom' });
    const results = await checkPlaceNameNoRegion(db, [svGazetteer]);
    expect(results).toHaveLength(0);
  });

  it('does not fire for a place with manual coordinates', async () => {
    const pl = createPlace(db, { name: 'Stockhom', latitude: 59.0, longitude: 18.0 });
    createEvent(db, { event_type: 'birth', place_id: pl.id });
    const results = await checkPlaceNameNoRegion(db, [svGazetteer]);
    expect(results.filter(r => r.placeIds?.includes(pl.id))).toHaveLength(0);
  });
});

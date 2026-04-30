import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPlace, getPlace, listPlaces, searchPlaces,
  updatePlace, deletePlace, findOrCreatePlace, findOrCreatePlaceWithChain,
  getPersonsForPlace,
} from '../../src/api/places';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('createPlace', () => {
  it('creates a place with name', () => {
    const p = createPlace(db, { name: 'Björkvik' });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe('Björkvik');
    expect(p.normalized_name).toBe('björkvik');
  });

  it('stores place_type and parent_place_id', () => {
    const country = createPlace(db, { name: 'Sverige', place_type: 'country' });
    const parish = createPlace(db, { name: 'Björkvik', place_type: 'parish', parent_place_id: country.id });
    expect(parish.parent_place_id).toBe(country.id);
    expect(parish.place_type).toBe('parish');
  });

  it('stores address fields', () => {
    const p = createPlace(db, { name: 'Tvärgatan 5', street: 'Tvärgatan 5', postal_code: '35243', city: 'Växjö', country: 'Sverige' });
    expect(p.street).toBe('Tvärgatan 5');
    expect(p.postal_code).toBe('35243');
    expect(p.city).toBe('Växjö');
    expect(p.country).toBe('Sverige');
  });

  it('defaults address fields to null when not provided', () => {
    const p = createPlace(db, { name: 'Björkvik' });
    expect(p.street).toBeNull();
    expect(p.postal_code).toBeNull();
    expect(p.city).toBeNull();
    expect(p.country).toBeNull();
  });
});

describe('getPlace', () => {
  it('returns the place by id', () => {
    const p = createPlace(db, { name: 'Björkvik' });
    expect(getPlace(db, p.id)?.name).toBe('Björkvik');
  });
  it('returns null for unknown id', () => {
    expect(getPlace(db, 'nonexistent')).toBeNull();
  });
});

describe('listPlaces', () => {
  it('returns all places sorted by name', () => {
    createPlace(db, { name: 'Örebro' });
    createPlace(db, { name: 'Arboga' });
    const list = listPlaces(db);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Arboga');
  });
});

describe('searchPlaces', () => {
  it('finds places by name substring', () => {
    createPlace(db, { name: 'Björkvik' });
    createPlace(db, { name: 'Björkviks gård' });
    createPlace(db, { name: 'Stensäter' });
    const results = searchPlaces(db, 'björk');
    expect(results).toHaveLength(2);
  });
});

describe('findOrCreatePlace', () => {
  it('creates a new place if not found', () => {
    const p = findOrCreatePlace(db, 'Nyköping');
    expect(p.name).toBe('Nyköping');
  });

  it('returns existing place if found by normalized name', () => {
    createPlace(db, { name: 'Nyköping' });
    const p = findOrCreatePlace(db, 'NYKÖPING');
    const all = listPlaces(db);
    expect(all).toHaveLength(1);
    expect(p.name).toBe('Nyköping');
  });
});

describe('findOrCreatePlaceWithChain', () => {
  it('creates the full ancestor chain when none of it exists', () => {
    const leaf = findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige', place_type: 'country' },
      { name: 'Örebro län', place_type: 'county' },
      { name: 'Mosås', place_type: 'parish', latitude: 59.2, longitude: 15.18 },
    ]);
    expect(leaf.name).toBe('Hörningsholm');
    expect(listPlaces(db)).toHaveLength(4); // Sverige + Örebro + Mosås + Hörningsholm

    const parent = getPlace(db, leaf.parent_place_id!);
    expect(parent?.name).toBe('Mosås');
    expect(parent?.place_type).toBe('parish');

    const grandparent = getPlace(db, parent!.parent_place_id!);
    expect(grandparent?.name).toBe('Örebro län');
  });

  it('reuses an existing parent chain instead of duplicating', () => {
    findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige', place_type: 'country' },
      { name: 'Örebro län', place_type: 'county' },
      { name: 'Mosås', place_type: 'parish' },
    ]);
    findOrCreatePlaceWithChain(db, 'Skogsberga', [
      { name: 'Sverige', place_type: 'country' },
      { name: 'Örebro län', place_type: 'county' },
      { name: 'Mosås', place_type: 'parish' },
    ]);
    // Should have 5 places: shared chain (3) + 2 leaves
    const all = listPlaces(db);
    expect(all).toHaveLength(5);
    const moses = all.filter((p) => p.name === 'Mosås');
    expect(moses).toHaveLength(1);
  });

  it('returns existing leaf without re-creating it on second call', () => {
    const a = findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige' },
      { name: 'Mosås' },
    ]);
    const b = findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige' },
      { name: 'Mosås' },
    ]);
    expect(a.id).toBe(b.id);
    expect(listPlaces(db)).toHaveLength(3);
  });

  it('matches case-insensitively when reusing parents', () => {
    findOrCreatePlaceWithChain(db, 'Foo', [{ name: 'Mosås' }]);
    findOrCreatePlaceWithChain(db, 'Bar', [{ name: 'MOSÅS' }]);
    const all = listPlaces(db);
    const moses = all.filter((p) => p.normalized_name === 'mosås');
    expect(moses).toHaveLength(1);
  });
});

describe('updatePlace', () => {
  it('updates name and notes', () => {
    const p = createPlace(db, { name: 'Björkvik' });
    const updated = updatePlace(db, p.id, { notes: 'Parish in Södermanland' });
    expect(updated?.notes).toBe('Parish in Södermanland');
  });

  it('updates address fields', () => {
    const p = createPlace(db, { name: 'Tvärgatan 5' });
    const updated = updatePlace(db, p.id, { street: 'Tvärgatan 5', postal_code: '35243', city: 'Växjö', country: 'Sverige' });
    expect(updated?.street).toBe('Tvärgatan 5');
    expect(updated?.postal_code).toBe('35243');
    expect(updated?.city).toBe('Växjö');
    expect(updated?.country).toBe('Sverige');
  });

  it('searchPlaces still finds by name after address update', () => {
    const p = createPlace(db, { name: 'Tvärgatan 5' });
    updatePlace(db, p.id, { city: 'Växjö' });
    const results = searchPlaces(db, 'tvärgatan');
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('Växjö');
  });
});

describe('deletePlace', () => {
  it('deletes a place', () => {
    const p = createPlace(db, { name: 'Björkvik' });
    expect(deletePlace(db, p.id)).toBe(true);
    expect(getPlace(db, p.id)).toBeNull();
  });
});

describe('getPersonsForPlace', () => {
  it('returns persons linked to events at a place', () => {
    const place = createPlace(db, { name: 'Stockholm' });
    const person = createPerson(db, { sex: 'M' });
    addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const result = getPersonsForPlace(db, place.id);
    expect(result).toHaveLength(1);
    expect(result[0].given_name).toBe('Erik');
    expect(result[0].surname).toBe('Svensson');
    expect(result[0].event_count).toBe(1);
  });

  it('returns empty array for place with no events', () => {
    const place = createPlace(db, { name: 'Nowhere' });
    const result = getPersonsForPlace(db, place.id);
    expect(result).toEqual([]);
  });

  it('deduplicates persons with multiple events at same place', () => {
    const place = createPlace(db, { name: 'Uppsala' });
    const person = createPerson(db, { sex: 'F' });
    addPersonName(db, person.id, { given_name: 'Anna', surname: 'Nilsson' });
    const e1 = createEvent(db, { event_type: 'birth', place_id: place.id });
    const e2 = createEvent(db, { event_type: 'christening', place_id: place.id });
    addEventParticipant(db, { event_id: e1.id, person_id: person.id, role: 'primary' });
    addEventParticipant(db, { event_id: e2.id, person_id: person.id, role: 'primary' });

    const result = getPersonsForPlace(db, place.id);
    expect(result).toHaveLength(1);
    expect(result[0].event_count).toBe(2);
  });
});

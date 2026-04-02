import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import {
  createPlace, getPlace, listPlaces, searchPlaces,
  updatePlace, deletePlace, findOrCreatePlace,
} from '../../src/api/places';

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

describe('updatePlace', () => {
  it('updates name and notes', () => {
    const p = createPlace(db, { name: 'Björkvik' });
    const updated = updatePlace(db, p.id, { notes: 'Parish in Södermanland' });
    expect(updated?.notes).toBe('Parish in Södermanland');
  });
});

describe('deletePlace', () => {
  it('deletes a place', () => {
    const p = createPlace(db, { name: 'Björkvik' });
    expect(deletePlace(db, p.id)).toBe(true);
    expect(getPlace(db, p.id)).toBeNull();
  });
});

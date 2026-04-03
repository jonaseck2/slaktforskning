import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { findOrCreateSwedishPlace } from '../../src/gedcom/swedishPlace';
import { listPlaces } from '../../src/api/places';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('findOrCreateSwedishPlace', () => {
  it('creates a 4-level hierarchy from a Genney place string', () => {
    const place = findOrCreateSwedishPlace(db, 'Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige');
    const all = listPlaces(db);
    expect(all).toHaveLength(4);
    expect(place.name).toBe('Fässberg');
    const parent = all.find(p => p.id === place.parent_place_id);
    expect(parent?.name).toBe('Mölndals landsförsamling');
    const grandparent = all.find(p => p.id === parent?.parent_place_id);
    expect(grandparent?.name).toBe('Göteborgs och Bohus');
    const root = all.find(p => p.id === grandparent?.parent_place_id);
    expect(root?.name).toBe('Sverige');
    expect(root?.parent_place_id).toBeNull();
  });

  it('returns a flat place for a single-part string', () => {
    const place = findOrCreateSwedishPlace(db, 'Stockholm');
    const all = listPlaces(db);
    expect(all).toHaveLength(1);
    expect(place.name).toBe('Stockholm');
    expect(place.parent_place_id).toBeNull();
  });

  it('reuses existing places when called again with the same string', () => {
    findOrCreateSwedishPlace(db, 'Örby, Marks härad, Älvsborgs, Sverige');
    findOrCreateSwedishPlace(db, 'Örby, Marks härad, Älvsborgs, Sverige');
    const all = listPlaces(db);
    expect(all).toHaveLength(4); // no duplicates
  });

  it('shares outer nodes when two inner places share a region', () => {
    findOrCreateSwedishPlace(db, 'Örby, Marks härad, Älvsborgs, Sverige');
    findOrCreateSwedishPlace(db, 'Kinnahult, Marks härad, Älvsborgs, Sverige');
    const all = listPlaces(db);
    // Sverige, Älvsborgs, Marks härad, Örby, Kinnahult = 5 places
    expect(all).toHaveLength(5);
    const marks = all.filter(p => p.name === 'Marks härad');
    expect(marks).toHaveLength(1); // shared
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { findOrCreateSwedishPlace } from '../../src/gedcom/swedishPlace';
import { listPlaces } from '../../src/api/places';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('findOrCreateSwedishPlace', async () => {
  it('creates a 4-level hierarchy from a Genney place string', async () => {
    const place = await findOrCreateSwedishPlace(db, 'Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige');
    const all = await listPlaces(db);
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

  it('returns a flat place for a single-part string', async () => {
    const place = await findOrCreateSwedishPlace(db, 'Stockholm');
    const all = await listPlaces(db);
    expect(all).toHaveLength(1);
    expect(place.name).toBe('Stockholm');
    expect(place.parent_place_id).toBeNull();
  });

  it('reuses existing places when called again with the same string', async () => {
    await findOrCreateSwedishPlace(db, 'Örby, Marks härad, Älvsborgs, Sverige');
    await findOrCreateSwedishPlace(db, 'Örby, Marks härad, Älvsborgs, Sverige');
    const all = await listPlaces(db);
    expect(all).toHaveLength(4); // no duplicates
  });

  it('shares outer nodes when two inner places share a region', async () => {
    await findOrCreateSwedishPlace(db, 'Örby, Marks härad, Älvsborgs, Sverige');
    await findOrCreateSwedishPlace(db, 'Kinnahult, Marks härad, Älvsborgs, Sverige');
    const all = await listPlaces(db);
    // Sverige, Älvsborgs, Marks härad, Örby, Kinnahult = 5 places
    expect(all).toHaveLength(5);
    const marks = all.filter(p => p.name === 'Marks härad');
    expect(marks).toHaveLength(1); // shared
  });
});

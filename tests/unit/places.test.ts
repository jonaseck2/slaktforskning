import { describe, it, test, expect, beforeEach } from 'vitest';
import {
  createPlace, getPlace, listPlaces, searchPlaces,
  updatePlace, deletePlace, findOrCreatePlace, findOrCreatePlaceWithChain,
  getPersonsForPlace,
  listPlacesPage, countPlaces,
  listPlaceChildren,
  getPlaceAncestors,
  assertLeafPlaceName,
} from '../../src/api/places';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('createPlace', async () => {
  it('creates a place with name', async () => {
    const p = await createPlace(db, { name: 'Björkvik' });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe('Björkvik');
    expect(p.normalized_name).toBe('björkvik');
  });

  it('stores place_type and parent_place_id', async () => {
    const country = await createPlace(db, { name: 'Sverige', place_type: 'country' });
    const parish = await createPlace(db, { name: 'Björkvik', place_type: 'parish', parent_place_id: country.id });
    expect(parish.parent_place_id).toBe(country.id);
    expect(parish.place_type).toBe('parish');
  });

  it('stores address fields', async () => {
    const p = await createPlace(db, { name: 'Tvärgatan 5', street: 'Tvärgatan 5', postal_code: '35243', city: 'Växjö', country: 'Sverige' });
    expect(p.street).toBe('Tvärgatan 5');
    expect(p.postal_code).toBe('35243');
    expect(p.city).toBe('Växjö');
    expect(p.country).toBe('Sverige');
  });

  it('defaults address fields to null when not provided', async () => {
    const p = await createPlace(db, { name: 'Björkvik' });
    expect(p.street).toBeNull();
    expect(p.postal_code).toBeNull();
    expect(p.city).toBeNull();
    expect(p.country).toBeNull();
  });
});

describe('getPlace', async () => {
  it('returns the place by id', async () => {
    const p = await createPlace(db, { name: 'Björkvik' });
    expect((await getPlace(db, p.id))?.name).toBe('Björkvik');
  });
  it('returns null for unknown id', async () => {
    expect(await getPlace(db, 'nonexistent')).toBeNull();
  });
});

describe('listPlaces', async () => {
  it('returns all places sorted by name', async () => {
    await createPlace(db, { name: 'Örebro' });
    await createPlace(db, { name: 'Arboga' });
    const list = await listPlaces(db);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Arboga');
  });
});

describe('listPlacesPage / countPlaces', async () => {
  it('paginates and sorts by name', async () => {
    for (let i = 0; i < 5; i++) await createPlace(db, { name: `Place${i}` });
    const page1 = await listPlacesPage(db, 3, 0, 'name', 'asc');
    const page2 = await listPlacesPage(db, 3, 3, 'name', 'asc');
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
    expect(await countPlaces(db)).toBe(5);
  });

  it('filters by name across the full table, not just the loaded page', async () => {
    await createPlace(db, { name: 'Björkvik' });
    await createPlace(db, { name: 'Stockholm' });
    await createPlace(db, { name: 'Göteborg' });
    const filtered = await listPlacesPage(db, 100, 0, 'name', 'asc', 'björk');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Björkvik');
    expect(await countPlaces(db, 'björk')).toBe(1);
  });

  it('also matches city and country fields', async () => {
    await createPlace(db, { name: 'Tvärgatan 5', city: 'Växjö', country: 'Sverige' });
    await createPlace(db, { name: 'Björkvik' });
    expect(await countPlaces(db, 'växjö')).toBe(1);
    expect(await countPlaces(db, 'sverige')).toBe(1);
  });

  it('sorts desc when requested', async () => {
    await createPlace(db, { name: 'Arboga' });
    await createPlace(db, { name: 'Borås' });
    const desc = await listPlacesPage(db, 100, 0, 'name', 'desc');
    expect(desc[0].name).toBe('Borås');
    expect(desc[1].name).toBe('Arboga');
  });
});

describe('searchPlaces', async () => {
  it('finds places by name substring', async () => {
    await createPlace(db, { name: 'Björkvik' });
    await createPlace(db, { name: 'Björkviks gård' });
    await createPlace(db, { name: 'Stensäter' });
    const results = await searchPlaces(db, 'björk');
    expect(results).toHaveLength(2);
  });
});

describe('findOrCreatePlace', async () => {
  it('creates a new place if not found', async () => {
    const p = await findOrCreatePlace(db, 'Nyköping');
    expect(p.name).toBe('Nyköping');
  });

  it('returns existing place if found by normalized name', async () => {
    await createPlace(db, { name: 'Nyköping' });
    const p = await findOrCreatePlace(db, 'NYKÖPING');
    const all = await listPlaces(db);
    expect(all).toHaveLength(1);
    expect(p.name).toBe('Nyköping');
  });
});

describe('findOrCreatePlaceWithChain', async () => {
  it('creates the full ancestor chain when none of it exists', async () => {
    const leaf = await findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige', place_type: 'country' },
      { name: 'Örebro län', place_type: 'county' },
      { name: 'Mosås', place_type: 'parish', latitude: 59.2, longitude: 15.18 },
    ]);
    expect(leaf.name).toBe('Hörningsholm');
    expect(await listPlaces(db)).toHaveLength(4); // Sverige + Örebro + Mosås + Hörningsholm

    const parent = await getPlace(db, leaf.parent_place_id!);
    expect(parent?.name).toBe('Mosås');
    expect(parent?.place_type).toBe('parish');

    const grandparent = await getPlace(db, parent!.parent_place_id!);
    expect(grandparent?.name).toBe('Örebro län');
  });

  it('reuses an existing parent chain instead of duplicating', async () => {
    await findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige', place_type: 'country' },
      { name: 'Örebro län', place_type: 'county' },
      { name: 'Mosås', place_type: 'parish' },
    ]);
    await findOrCreatePlaceWithChain(db, 'Skogsberga', [
      { name: 'Sverige', place_type: 'country' },
      { name: 'Örebro län', place_type: 'county' },
      { name: 'Mosås', place_type: 'parish' },
    ]);
    // Should have 5 places: shared chain (3) + 2 leaves
    const all = await listPlaces(db);
    expect(all).toHaveLength(5);
    const moses = all.filter((p) => p.name === 'Mosås');
    expect(moses).toHaveLength(1);
  });

  it('returns existing leaf without re-creating it on second call', async () => {
    const a = await findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige' },
      { name: 'Mosås' },
    ]);
    const b = await findOrCreatePlaceWithChain(db, 'Hörningsholm', [
      { name: 'Sverige' },
      { name: 'Mosås' },
    ]);
    expect(a.id).toBe(b.id);
    expect(await listPlaces(db)).toHaveLength(3);
  });

  it('matches case-insensitively when reusing parents', async () => {
    await findOrCreatePlaceWithChain(db, 'Foo', [{ name: 'Mosås' }]);
    await findOrCreatePlaceWithChain(db, 'Bar', [{ name: 'MOSÅS' }]);
    const all = await listPlaces(db);
    const moses = all.filter((p) => p.normalized_name === 'mosås');
    expect(moses).toHaveLength(1);
  });
});

describe('updatePlace', async () => {
  it('updates name and notes', async () => {
    const p = await createPlace(db, { name: 'Björkvik' });
    const updated = await updatePlace(db, p.id, { notes: 'Parish in Södermanland' });
    expect(updated?.notes).toBe('Parish in Södermanland');
  });

  it('updates address fields', async () => {
    const p = await createPlace(db, { name: 'Tvärgatan 5' });
    const updated = await updatePlace(db, p.id, { street: 'Tvärgatan 5', postal_code: '35243', city: 'Växjö', country: 'Sverige' });
    expect(updated?.street).toBe('Tvärgatan 5');
    expect(updated?.postal_code).toBe('35243');
    expect(updated?.city).toBe('Växjö');
    expect(updated?.country).toBe('Sverige');
  });

  it('searchPlaces still finds by name after address update', async () => {
    const p = await createPlace(db, { name: 'Tvärgatan 5' });
    await updatePlace(db, p.id, { city: 'Växjö' });
    const results = await searchPlaces(db, 'tvärgatan');
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('Växjö');
  });
});

describe('deletePlace', async () => {
  it('deletes a place', async () => {
    const p = await createPlace(db, { name: 'Björkvik' });
    expect(await deletePlace(db, p.id)).toBe(true);
    expect(await getPlace(db, p.id)).toBeNull();
  });
});

describe('getPersonsForPlace', async () => {
  it('returns persons linked to events at a place', async () => {
    const place = await createPlace(db, { name: 'Stockholm' });
    const person = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson' });
    const event = await createEvent(db, { event_type: 'birth', place_id: place.id });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const result = await getPersonsForPlace(db, place.id);
    expect(result).toHaveLength(1);
    expect(result[0].given_name).toBe('Erik');
    expect(result[0].surname).toBe('Svensson');
    expect(result[0].event_count).toBe(1);
  });

  it('returns empty array for place with no events', async () => {
    const place = await createPlace(db, { name: 'Nowhere' });
    const result = await getPersonsForPlace(db, place.id);
    expect(result).toEqual([]);
  });

  it('deduplicates persons with multiple events at same place', async () => {
    const place = await createPlace(db, { name: 'Uppsala' });
    const person = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, person.id, { given_name: 'Anna', surname: 'Nilsson' });
    const e1 = await createEvent(db, { event_type: 'birth', place_id: place.id });
    const e2 = await createEvent(db, { event_type: 'christening', place_id: place.id });
    await addEventParticipant(db, { event_id: e1.id, person_id: person.id, role: 'primary' });
    await addEventParticipant(db, { event_id: e2.id, person_id: person.id, role: 'primary' });

    const result = await getPersonsForPlace(db, place.id);
    expect(result).toHaveLength(1);
    expect(result[0].event_count).toBe(2);
  });
});

describe('listPlaceChildren', async () => {
  it('returns root places when parentId is null', async () => {
    const sweden = await createPlace(db, { name: 'Sverige' });
    const denmark = await createPlace(db, { name: 'Danmark' });
    await createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });

    const roots = await listPlaceChildren(db, null);

    expect(roots.map(r => r.name).sort()).toEqual(['Danmark', 'Sverige']);
  });

  it('returns direct children only when parentId is set', async () => {
    const sweden = await createPlace(db, { name: 'Sverige' });
    const stockholm = await createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    await createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });
    await createPlace(db, { name: 'Skåne', parent_place_id: sweden.id });

    const children = await listPlaceChildren(db, sweden.id);

    expect(children.map(c => c.name).sort()).toEqual(['Skåne', 'Stockholm']);
  });

  it('flags hasChildren correctly', async () => {
    const sweden = await createPlace(db, { name: 'Sverige' });
    const stockholm = await createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    await createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });

    const roots = await listPlaceChildren(db, null);
    const sw = roots.find(r => r.name === 'Sverige')!;
    expect(sw.hasChildren).toBeTruthy();

    const children = await listPlaceChildren(db, sweden.id);
    const sthlm = children.find(c => c.name === 'Stockholm')!;
    expect(sthlm.hasChildren).toBeTruthy();

    const leaves = await listPlaceChildren(db, stockholm.id);
    const solna = leaves.find(c => c.name === 'Solna')!;
    expect(solna.hasChildren).toBeFalsy();
  });

  it('returns empty array when parent has no children', async () => {
    const p = await createPlace(db, { name: 'Solo' });
    expect(await listPlaceChildren(db, p.id)).toEqual([]);
  });
});

describe('getPlaceAncestors', async () => {
  it('returns the chain from root to the given place inclusive', async () => {
    const sweden = await createPlace(db, { name: 'Sverige' });
    const stockholm = await createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    const solna = await createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });

    const chain = await getPlaceAncestors(db, solna.id);

    expect(chain.map(p => p.name)).toEqual(['Sverige', 'Stockholm', 'Solna']);
  });

  it('returns single-element array for a root place', async () => {
    const sweden = await createPlace(db, { name: 'Sverige' });
    expect((await getPlaceAncestors(db, sweden.id)).map(p => p.name)).toEqual(['Sverige']);
  });

  it('returns empty array for unknown id', async () => {
    expect(await getPlaceAncestors(db, 'nonexistent')).toEqual([]);
  });

  it('caps depth at 32 to defend against cycles', async () => {
    let parentId: string | null = null;
    let lastId = '';
    for (let i = 0; i < 40; i++) {
      const p = await createPlace(db, { name: `L${i}`, parent_place_id: parentId });
      parentId = p.id;
      lastId = p.id;
    }
    const chain = await getPlaceAncestors(db, lastId);
    expect(chain.length).toBeLessThanOrEqual(32);
  });
});

describe('getPersonsForPlace - biography fields', async () => {
  test('returns first_year and last_year per person from primary-role events', async () => {
    const db = await createTestDb();
    const place = await createPlace(db, { name: 'Vienna' });
    const alice = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const birth = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1842-03-01', date_original: '1842-03-01', place_id: place.id });
    await addEventParticipant(db, { event_id: birth.id, person_id: alice.id, role: 'primary' });
    const death = await createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1879-11-04', date_original: '1879-11-04', place_id: place.id });
    await addEventParticipant(db, { event_id: death.id, person_id: alice.id, role: 'primary' });
    const rows = await getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_year).toBe('1842');
    expect(rows[0].last_year).toBe('1879');
    expect(rows[0].event_count).toBe(2);
  });

  test('excludes persons whose only role at the place is non-primary', async () => {
    const db = await createTestDb();
    const place = await createPlace(db, { name: 'Vienna' });
    const alice = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const bob = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, bob.id, { given_name: 'Bob', surname: 'B', name_type: 'birth' });
    const wedding = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1860-06-01', date_original: '1860-06-01', place_id: place.id });
    await addEventParticipant(db, { event_id: wedding.id, person_id: alice.id, role: 'primary' });
    await addEventParticipant(db, { event_id: wedding.id, person_id: bob.id, role: 'witness' });
    const rows = await getPersonsForPlace(db, place.id);
    expect(rows.map(r => r.id)).toEqual([alice.id]);
  });

  test('includes person with primary AND witness roles (counts only primary events)', async () => {
    const db = await createTestDb();
    const place = await createPlace(db, { name: 'Vienna' });
    const alice = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const ownBirth = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1842-03-01', date_original: '1842-03-01', place_id: place.id });
    await addEventParticipant(db, { event_id: ownBirth.id, person_id: alice.id, role: 'primary' });
    const witnessed = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1900-01-01', date_original: '1900-01-01', place_id: place.id });
    await addEventParticipant(db, { event_id: witnessed.id, person_id: alice.id, role: 'witness' });
    const rows = await getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_count).toBe(1);
    expect(rows[0].first_year).toBe('1842');
    expect(rows[0].last_year).toBe('1842');
  });

  test('returns null first_year/last_year for primary-role events without dates', async () => {
    const db = await createTestDb();
    const place = await createPlace(db, { name: 'Vienna' });
    const alice = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const undated = await createEvent(db, { event_type: 'residence', date_type: 'unknown', date_value: null, date_original: '', place_id: place.id });
    await addEventParticipant(db, { event_id: undated.id, person_id: alice.id, role: 'primary' });
    const rows = await getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_year).toBeNull();
    expect(rows[0].last_year).toBeNull();
  });

  test('sorts by first_year ascending, undated last, then by surname/given_name', async () => {
    const db = await createTestDb();
    const place = await createPlace(db, { name: 'Vienna' });
    const carl = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    await addPersonName(db, carl.id, { given_name: 'Carl', surname: 'C', name_type: 'birth' });
    const carlBirth = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1830-01-01', date_original: '1830-01-01', place_id: place.id });
    await addEventParticipant(db, { event_id: carlBirth.id, person_id: carl.id, role: 'primary' });
    const alice = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const aliceBirth = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1850-01-01', date_original: '1850-01-01', place_id: place.id });
    await addEventParticipant(db, { event_id: aliceBirth.id, person_id: alice.id, role: 'primary' });
    const zoe = await createPerson(db, { sex: 'F' }, { allowNameless: true });
    await addPersonName(db, zoe.id, { given_name: 'Zoe', surname: 'Z', name_type: 'birth' });
    const zoeUndated = await createEvent(db, { event_type: 'residence', date_type: 'unknown', date_value: null, date_original: '', place_id: place.id });
    await addEventParticipant(db, { event_id: zoeUndated.id, person_id: zoe.id, role: 'primary' });
    const rows = await getPersonsForPlace(db, place.id);
    expect(rows.map(r => r.given_name)).toEqual(['Carl', 'Alice', 'Zoe']);
  });
});

describe('assertLeafPlaceName', async () => {
  it('accepts a single component name', async () => {
    expect(() => assertLeafPlaceName('Chennai')).not.toThrow();
  });

  it('accepts names with spaces, special characters, and parentheses', async () => {
    expect(() => assertLeafPlaceName('Mosås')).not.toThrow();
    expect(() => assertLeafPlaceName('Hörningsholm (T)')).not.toThrow();
    expect(() => assertLeafPlaceName('São Paulo')).not.toThrow();
  });

  it('rejects a comma-separated path', async () => {
    expect(() => assertLeafPlaceName('Chennai, India')).toThrow(/comma/i);
  });

  it('rejects even a trailing comma', async () => {
    expect(() => assertLeafPlaceName('Chennai,')).toThrow();
  });

  it('error message names parent_chain to guide the agent', async () => {
    expect(() => assertLeafPlaceName('Chennai, India, World'))
      .toThrow(/parent_chain|place_chain/);
  });
});

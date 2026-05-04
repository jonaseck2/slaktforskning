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

describe('listPlacesPage / countPlaces', () => {
  it('paginates and sorts by name', () => {
    for (let i = 0; i < 5; i++) createPlace(db, { name: `Place${i}` });
    const page1 = listPlacesPage(db, 3, 0, 'name', 'asc');
    const page2 = listPlacesPage(db, 3, 3, 'name', 'asc');
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
    expect(countPlaces(db)).toBe(5);
  });

  it('filters by name across the full table, not just the loaded page', () => {
    createPlace(db, { name: 'Björkvik' });
    createPlace(db, { name: 'Stockholm' });
    createPlace(db, { name: 'Göteborg' });
    const filtered = listPlacesPage(db, 100, 0, 'name', 'asc', 'björk');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Björkvik');
    expect(countPlaces(db, 'björk')).toBe(1);
  });

  it('also matches city and country fields', () => {
    createPlace(db, { name: 'Tvärgatan 5', city: 'Växjö', country: 'Sverige' });
    createPlace(db, { name: 'Björkvik' });
    expect(countPlaces(db, 'växjö')).toBe(1);
    expect(countPlaces(db, 'sverige')).toBe(1);
  });

  it('sorts desc when requested', () => {
    createPlace(db, { name: 'Arboga' });
    createPlace(db, { name: 'Borås' });
    const desc = listPlacesPage(db, 100, 0, 'name', 'desc');
    expect(desc[0].name).toBe('Borås');
    expect(desc[1].name).toBe('Arboga');
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
    const person = createPerson(db, { sex: 'M' }, { allowNameless: true });
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
    const person = createPerson(db, { sex: 'F' }, { allowNameless: true });
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

describe('listPlaceChildren', () => {
  it('returns root places when parentId is null', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const denmark = createPlace(db, { name: 'Danmark' });
    createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });

    const roots = listPlaceChildren(db, null);

    expect(roots.map(r => r.name).sort()).toEqual(['Danmark', 'Sverige']);
  });

  it('returns direct children only when parentId is set', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const stockholm = createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });
    createPlace(db, { name: 'Skåne', parent_place_id: sweden.id });

    const children = listPlaceChildren(db, sweden.id);

    expect(children.map(c => c.name).sort()).toEqual(['Skåne', 'Stockholm']);
  });

  it('flags hasChildren correctly', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const stockholm = createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });

    const roots = listPlaceChildren(db, null);
    const sw = roots.find(r => r.name === 'Sverige')!;
    expect(sw.hasChildren).toBeTruthy();

    const children = listPlaceChildren(db, sweden.id);
    const sthlm = children.find(c => c.name === 'Stockholm')!;
    expect(sthlm.hasChildren).toBeTruthy();

    const leaves = listPlaceChildren(db, stockholm.id);
    const solna = leaves.find(c => c.name === 'Solna')!;
    expect(solna.hasChildren).toBeFalsy();
  });

  it('returns empty array when parent has no children', () => {
    const p = createPlace(db, { name: 'Solo' });
    expect(listPlaceChildren(db, p.id)).toEqual([]);
  });
});

describe('getPlaceAncestors', () => {
  it('returns the chain from root to the given place inclusive', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    const stockholm = createPlace(db, { name: 'Stockholm', parent_place_id: sweden.id });
    const solna = createPlace(db, { name: 'Solna', parent_place_id: stockholm.id });

    const chain = getPlaceAncestors(db, solna.id);

    expect(chain.map(p => p.name)).toEqual(['Sverige', 'Stockholm', 'Solna']);
  });

  it('returns single-element array for a root place', () => {
    const sweden = createPlace(db, { name: 'Sverige' });
    expect(getPlaceAncestors(db, sweden.id).map(p => p.name)).toEqual(['Sverige']);
  });

  it('returns empty array for unknown id', () => {
    expect(getPlaceAncestors(db, 'nonexistent')).toEqual([]);
  });

  it('caps depth at 32 to defend against cycles', () => {
    let parentId: string | null = null;
    let lastId = '';
    for (let i = 0; i < 40; i++) {
      const p = createPlace(db, { name: `L${i}`, parent_place_id: parentId });
      parentId = p.id;
      lastId = p.id;
    }
    const chain = getPlaceAncestors(db, lastId);
    expect(chain.length).toBeLessThanOrEqual(32);
  });
});

describe('getPersonsForPlace - biography fields', () => {
  test('returns first_year and last_year per person from primary-role events', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const birth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1842-03-01', date_original: '1842-03-01', place_id: place.id });
    addEventParticipant(db, { event_id: birth.id, person_id: alice.id, role: 'primary' });
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1879-11-04', date_original: '1879-11-04', place_id: place.id });
    addEventParticipant(db, { event_id: death.id, person_id: alice.id, role: 'primary' });
    const rows = getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_year).toBe('1842');
    expect(rows[0].last_year).toBe('1879');
    expect(rows[0].event_count).toBe(2);
  });

  test('excludes persons whose only role at the place is non-primary', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const bob = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, bob.id, { given_name: 'Bob', surname: 'B', name_type: 'birth' });
    const wedding = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1860-06-01', date_original: '1860-06-01', place_id: place.id });
    addEventParticipant(db, { event_id: wedding.id, person_id: alice.id, role: 'primary' });
    addEventParticipant(db, { event_id: wedding.id, person_id: bob.id, role: 'witness' });
    const rows = getPersonsForPlace(db, place.id);
    expect(rows.map(r => r.id)).toEqual([alice.id]);
  });

  test('includes person with primary AND witness roles (counts only primary events)', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const ownBirth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1842-03-01', date_original: '1842-03-01', place_id: place.id });
    addEventParticipant(db, { event_id: ownBirth.id, person_id: alice.id, role: 'primary' });
    const witnessed = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1900-01-01', date_original: '1900-01-01', place_id: place.id });
    addEventParticipant(db, { event_id: witnessed.id, person_id: alice.id, role: 'witness' });
    const rows = getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_count).toBe(1);
    expect(rows[0].first_year).toBe('1842');
    expect(rows[0].last_year).toBe('1842');
  });

  test('returns null first_year/last_year for primary-role events without dates', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const undated = createEvent(db, { event_type: 'residence', date_type: 'unknown', date_value: null, date_original: '', place_id: place.id });
    addEventParticipant(db, { event_id: undated.id, person_id: alice.id, role: 'primary' });
    const rows = getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_year).toBeNull();
    expect(rows[0].last_year).toBeNull();
  });

  test('sorts by first_year ascending, undated last, then by surname/given_name', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const carl = createPerson(db, { sex: 'M' }, { allowNameless: true });
    addPersonName(db, carl.id, { given_name: 'Carl', surname: 'C', name_type: 'birth' });
    const carlBirth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1830-01-01', date_original: '1830-01-01', place_id: place.id });
    addEventParticipant(db, { event_id: carlBirth.id, person_id: carl.id, role: 'primary' });
    const alice = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, alice.id, { given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const aliceBirth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1850-01-01', date_original: '1850-01-01', place_id: place.id });
    addEventParticipant(db, { event_id: aliceBirth.id, person_id: alice.id, role: 'primary' });
    const zoe = createPerson(db, { sex: 'F' }, { allowNameless: true });
    addPersonName(db, zoe.id, { given_name: 'Zoe', surname: 'Z', name_type: 'birth' });
    const zoeUndated = createEvent(db, { event_type: 'residence', date_type: 'unknown', date_value: null, date_original: '', place_id: place.id });
    addEventParticipant(db, { event_id: zoeUndated.id, person_id: zoe.id, role: 'primary' });
    const rows = getPersonsForPlace(db, place.id);
    expect(rows.map(r => r.given_name)).toEqual(['Carl', 'Alice', 'Zoe']);
  });
});

describe('assertLeafPlaceName', () => {
  it('accepts a single component name', () => {
    expect(() => assertLeafPlaceName('Chennai')).not.toThrow();
  });

  it('accepts names with spaces, special characters, and parentheses', () => {
    expect(() => assertLeafPlaceName('Mosås')).not.toThrow();
    expect(() => assertLeafPlaceName('Hörningsholm (T)')).not.toThrow();
    expect(() => assertLeafPlaceName('São Paulo')).not.toThrow();
  });

  it('rejects a comma-separated path', () => {
    expect(() => assertLeafPlaceName('Chennai, India')).toThrow(/comma/i);
  });

  it('rejects even a trailing comma', () => {
    expect(() => assertLeafPlaceName('Chennai,')).toThrow();
  });

  it('error message names parent_chain to guide the agent', () => {
    expect(() => assertLeafPlaceName('Chennai, India, World'))
      .toThrow(/parent_chain|place_chain/);
  });
});

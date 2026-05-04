import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import {
  checkPlaceNameLooksLikeDate,
  checkPlaceNameBrokenLansbokstav,
} from '../../src/api/checks/checks-place';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { queryRun } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('ORPHANED_PLACE', () => {
  it('fires for a place with no references', async () => {
    const pl = createPlace(db, { name: 'Ingenstans' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('does not fire when place is used by an event', async () => {
    const pl = createPlace(db, { name: 'Använd plats' });
    const p = createPerson(db, {}, { allowNameless: true });
    const e = createEvent(db, { event_type: 'birth', place_id: pl.id });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });

  it('does not fire when place is a parent of another place', async () => {
    const parent = createPlace(db, { name: 'Sverige' });
    createPlace(db, { name: 'Stockholm', parent_place_id: parent.id });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(parent.id))).toHaveLength(0);
  });
});

describe('CIRCULAR_PLACE_HIERARCHY', () => {
  it('fires when three places form a cycle via parent_place_id', async () => {
    const a = createPlace(db, { name: 'A' });
    const b = createPlace(db, { name: 'B', parent_place_id: a.id });
    const c = createPlace(db, { name: 'C', parent_place_id: b.id });
    // Force cycle: set A.parent = C. createPlace does not let us set parent to an
    // id that doesn't exist yet, but update directly is fine.
    queryRun(db, 'UPDATE places SET parent_place_id = ? WHERE id = ?', [c.id, a.id]);
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'CIRCULAR_PLACE_HIERARCHY');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit[0].severity).toBe('error');
    // Cycle nodes should all appear
    const ids = new Set(hit.flatMap(h => h.placeIds ?? []));
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
    expect(ids.has(c.id)).toBe(true);
  });

  it('does not fire for a straight chain', async () => {
    const a = createPlace(db, { name: 'Country' });
    const b = createPlace(db, { name: 'Region', parent_place_id: a.id });
    createPlace(db, { name: 'Parish', parent_place_id: b.id });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'CIRCULAR_PLACE_HIERARCHY')).toHaveLength(0);
  });
});

describe('PLACE_COORDINATES_INVALID', () => {
  it('fires when latitude is out of range', async () => {
    const pl = createPlace(db, { name: 'Mars', latitude: 200, longitude: 10 });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('fires for null-island (0, 0)', async () => {
    const pl = createPlace(db, { name: 'NullIsland', latitude: 0, longitude: 0 });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id))).toHaveLength(1);
  });

  it('does not fire for valid coordinates', async () => {
    const pl = createPlace(db, { name: 'Stockholm', latitude: 59.3, longitude: 18.1 });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });

  it('does not fire for missing coordinates', async () => {
    const pl = createPlace(db, { name: 'NoCoords' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });
});

describe('PLACE_NAME_LOOKS_LIKE_DATE', () => {
  it('fires for a bare year', async () => {
    const pl = createPlace(db, { name: '1736' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].code).toBe('PLACE_NAME_LOOKS_LIKE_DATE');
  });

  it('fires for YYYY-MM-DD', async () => {
    const pl = createPlace(db, { name: '1736-11-11' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
  });

  it('fires for YYYY-MM', async () => {
    const pl = createPlace(db, { name: '1736-11' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
  });

  it('fires for YYYY/MM/DD', async () => {
    const pl = createPlace(db, { name: '1736/11/11' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
  });

  it('fires for YYYY MM DD (space-separated)', async () => {
    const pl = createPlace(db, { name: '1736 11 11' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
  });

  it('does not fire for a place name starting with a year', async () => {
    const pl = createPlace(db, { name: '1736 Frederiksberg' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(0);
  });

  it('does not fire for a normal place name', async () => {
    const pl = createPlace(db, { name: 'Stockholm' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(0);
  });

  it('does not fire for a 3-digit number (not a year)', async () => {
    const pl = createPlace(db, { name: '123' });
    const hits = checkPlaceNameLooksLikeDate(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(0);
  });
});

describe('PLACE_NAME_BROKEN_LANSBOKSTAV', () => {
  it('fires for "Borås (PI" (broken trailing I)', async () => {
    const pl = createPlace(db, { name: 'Borås (PI' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].messageParams?.suggestion).toBe('Borås (P)');
  });

  it('fires for "Hed (UI" (broken trailing I)', async () => {
    const pl = createPlace(db, { name: 'Hed (UI' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
    expect(hits[0].messageParams?.suggestion).toBe('Hed (U)');
  });

  it('fires for "Byske (ACI" (broken two-letter ACI)', async () => {
    const pl = createPlace(db, { name: 'Byske (ACI' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
    expect(hits[0].messageParams?.suggestion).toBe('Byske (AC)');
  });

  it('fires for "Borås (P|" (broken pipe instead of paren)', async () => {
    const pl = createPlace(db, { name: 'Borås (P|' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(1);
    expect(hits[0].messageParams?.suggestion).toBe('Borås (P)');
  });

  it('does not fire for "Stockholm (A)" (clean parens)', async () => {
    const pl = createPlace(db, { name: 'Stockholm (A)' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(0);
  });

  it('does not fire for "Gotland (I)" (single I is a valid länsbokstav)', async () => {
    const pl = createPlace(db, { name: 'Gotland (I)' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(0);
  });

  it('does not fire for "(Approximate" (not a real länsbokstav)', async () => {
    // 'AP' is not a valid länsbokstav code, so even though the regex would
    // structurally match, the validation step rejects it.
    const pl = createPlace(db, { name: 'Foo (XYI' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(0);
  });

  it('does not fire for a normal place name without parens', async () => {
    const pl = createPlace(db, { name: 'Stockholm' });
    const hits = checkPlaceNameBrokenLansbokstav(db).filter(r => r.placeIds?.includes(pl.id));
    expect(hits).toHaveLength(0);
  });
});

describe('PLACE_DATES_INVERTED', () => {
  it('fires when date_from is after date_to', async () => {
    const pl = createPlace(db, { name: 'Bakvänd', date_from: '1900-01-01', date_to: '1850-01-01' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PLACE_DATES_INVERTED' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('error');
  });

  it('does not fire when only one date is set', async () => {
    const pl = createPlace(db, { name: 'Bara från', date_from: '1900-01-01' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_DATES_INVERTED' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });

  it('does not fire when dates are in order', async () => {
    const pl = createPlace(db, { name: 'OK', date_from: '1850-01-01', date_to: '1900-01-01' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_DATES_INVERTED' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });
});

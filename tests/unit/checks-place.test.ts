import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { queryRun } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('ORPHANED_PLACE', () => {
  it('fires for a place with no references', () => {
    const pl = createPlace(db, { name: 'Ingenstans' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('does not fire when place is used by an event', () => {
    const pl = createPlace(db, { name: 'Använd plats' });
    const p = createPerson(db, {});
    const e = createEvent(db, { event_type: 'birth', place_id: pl.id });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });

  it('does not fire when place is a parent of another place', () => {
    const parent = createPlace(db, { name: 'Sverige' });
    createPlace(db, { name: 'Stockholm', parent_place_id: parent.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(parent.id))).toHaveLength(0);
  });
});

describe('CIRCULAR_PLACE_HIERARCHY', () => {
  it('fires when three places form a cycle via parent_place_id', () => {
    const a = createPlace(db, { name: 'A' });
    const b = createPlace(db, { name: 'B', parent_place_id: a.id });
    const c = createPlace(db, { name: 'C', parent_place_id: b.id });
    // Force cycle: set A.parent = C. createPlace does not let us set parent to an
    // id that doesn't exist yet, but update directly is fine.
    queryRun(db, 'UPDATE places SET parent_place_id = ? WHERE id = ?', [c.id, a.id]);
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'CIRCULAR_PLACE_HIERARCHY');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit[0].severity).toBe('error');
    // Cycle nodes should all appear
    const ids = new Set(hit.flatMap(h => h.placeIds ?? []));
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
    expect(ids.has(c.id)).toBe(true);
  });

  it('does not fire for a straight chain', () => {
    const a = createPlace(db, { name: 'Country' });
    const b = createPlace(db, { name: 'Region', parent_place_id: a.id });
    createPlace(db, { name: 'Parish', parent_place_id: b.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'CIRCULAR_PLACE_HIERARCHY')).toHaveLength(0);
  });
});

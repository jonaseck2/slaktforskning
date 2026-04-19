import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
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

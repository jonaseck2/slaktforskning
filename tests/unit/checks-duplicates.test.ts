import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('POSSIBLE_DUPLICATE_PERSON', () => {
  it('fires for two persons with the same name and matching birth year', () => {
    const p1 = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    const p2 = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    for (const p of [p1, p2]) {
      const e = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1900-01-01' });
      addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    }
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'POSSIBLE_DUPLICATE_PERSON');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    // Both persons must appear across the results for this pair
    const ids = new Set(hit.flatMap(h => h.personIds));
    expect(ids.has(p1.id)).toBe(true);
    expect(ids.has(p2.id)).toBe(true);
    expect(hit[0].severity).toBe('notice');
  });
});

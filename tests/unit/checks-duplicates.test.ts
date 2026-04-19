import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';
import { queryRun } from '../../src/api/db';
import { v4 as uuidv4 } from 'uuid';

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

describe('DUPLICATE_IDENTIFIER', () => {
  it('fires when two persons share the same identifier', () => {
    const p1 = createPerson(db, {});
    const p2 = createPerson(db, {});
    queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p1.id, 'familysearch', 'ABC-1234']);
    queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p2.id, 'familysearch', 'ABC-1234']);
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_IDENTIFIER');
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(new Set(hit[0].personIds)).toEqual(new Set([p1.id, p2.id]));
  });

  it('does not fire for unique identifiers', () => {
    const p1 = createPerson(db, {});
    const p2 = createPerson(db, {});
    queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p1.id, 'familysearch', 'A']);
    queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p2.id, 'familysearch', 'B']);
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_IDENTIFIER')).toHaveLength(0);
  });
});

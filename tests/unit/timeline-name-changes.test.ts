import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createPerson, addPersonName } from '../../src/api/persons';
import { getTimeline } from '../../src/api/report_data';
import { createTestDb } from './helpers';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('getTimeline — name change derivation', () => {
  it('emits a name_change entry for a non-birth name with date_from', () => {
    const p = createPerson(db, { sex: 'F', notes: '' });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Andersson', name_type: 'birth', sort_order: 0,
    });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Lindberg', name_type: 'married',
      date_from: '1962-03-15', sort_order: 1,
    });

    const entries = getTimeline(db, p.id)!;
    const nameChange = entries.find(e => e.event.event_type === 'name_change');
    expect(nameChange).toBeDefined();
    expect(nameChange!.event.date_value).toBe('1962-03-15');
    expect(nameChange!.relationship_label).toBe('self');
    expect(nameChange!.event.description).toContain('Anna Lindberg');
  });

  it('emits NO name_change entry for a name with NULL date_from', () => {
    const p = createPerson(db, { sex: 'F', notes: '' });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Lindberg', name_type: 'married', sort_order: 1,
    });
    const entries = getTimeline(db, p.id)!;
    expect(entries.find(e => e.event.event_type === 'name_change')).toBeUndefined();
  });

  it('emits NO name_change entry for the birth name even with date_from set', () => {
    const p = createPerson(db, { sex: 'F', notes: '' });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Andersson', name_type: 'birth',
      date_from: '1940-06-01', sort_order: 0,
    });
    const entries = getTimeline(db, p.id)!;
    expect(entries.find(e => e.event.event_type === 'name_change')).toBeUndefined();
  });
});

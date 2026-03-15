import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import {
  createFamily,
  getFamily,
  listFamilies,
  updateFamily,
  deleteFamily,
  addChildToFamily,
  getChildrenOfFamily,
  getFamiliesOfPerson,
} from '../../src/api/families';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('families', () => {
  it('creates a family with partners', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M' });
    const b = createPerson(db, { given_name: 'Anna', surname: 'B', sex: 'F' });
    const family = createFamily(db, { partner_a_id: a.id, partner_b_id: b.id, union_type: 'marriage' });
    expect(family.id).toBeDefined();
    expect(family.partner_a_id).toBe(a.id);
    expect(family.union_type).toBe('marriage');
  });

  it('creates a family with unknown partners', () => {
    const family = createFamily(db, {});
    expect(family.partner_a_id).toBeNull();
    expect(family.partner_b_id).toBeNull();
    expect(family.union_type).toBe('unknown');
  });

  it('gets and lists families', () => {
    createFamily(db, { union_type: 'marriage' });
    createFamily(db, { union_type: 'cohabitation' });
    const list = listFamilies(db);
    expect(list).toHaveLength(2);
    expect(getFamily(db, list[0].id)).not.toBeNull();
  });

  it('updates a family', () => {
    const family = createFamily(db, {});
    const updated = updateFamily(db, family.id, { union_type: 'civil_union', notes: 'test' });
    expect(updated!.union_type).toBe('civil_union');
    expect(updated!.notes).toBe('test');
  });

  it('deletes a family', () => {
    const family = createFamily(db, {});
    expect(deleteFamily(db, family.id)).toBe(true);
    expect(getFamily(db, family.id)).toBeNull();
  });

  it('adds children to a family', () => {
    const parent = createPerson(db, { given_name: 'Parent', surname: 'P' });
    const child1 = createPerson(db, { given_name: 'Child', surname: 'P' });
    const child2 = createPerson(db, { given_name: 'Child2', surname: 'P' });
    const family = createFamily(db, { partner_a_id: parent.id });

    addChildToFamily(db, family.id, child1.id, 'biological');
    addChildToFamily(db, family.id, child2.id, 'adopted');

    const children = getChildrenOfFamily(db, family.id);
    expect(children).toHaveLength(2);
    expect(children[0].relationship_type).toBe('biological');
    expect(children[1].relationship_type).toBe('adopted');
  });

  it('gets families for a person (as partner and child)', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const familyAsPartner = createFamily(db, { partner_a_id: person.id });
    const familyAsChild = createFamily(db, {});
    addChildToFamily(db, familyAsChild.id, person.id);

    const families = getFamiliesOfPerson(db, person.id);
    expect(families).toHaveLength(2);
    const ids = families.map(f => f.id);
    expect(ids).toContain(familyAsPartner.id);
    expect(ids).toContain(familyAsChild.id);
  });
});

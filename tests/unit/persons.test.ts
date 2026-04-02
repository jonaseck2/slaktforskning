import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import {
  createPerson,
  getPerson,
  listPersons,
  updatePerson,
  deletePerson,
  searchPersons,
  addPersonName,
  getPersonNames,
  updatePersonName,
} from '../../src/api/persons';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('persons', () => {
  it('creates a person with a name', () => {
    const person = createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    expect(person.id).toBeDefined();
    expect(person.sex).toBe('M');

    const names = getPersonNames(db, person.id);
    expect(names).toHaveLength(1);
    expect(names[0].given_name).toBe('Erik');
    expect(names[0].surname).toBe('Andersson');
  });

  it('creates a person without a name', () => {
    const person = createPerson(db, { sex: 'U' });
    expect(person.id).toBeDefined();
    const names = getPersonNames(db, person.id);
    expect(names).toHaveLength(0);
  });

  it('gets a person by id', () => {
    const created = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    const fetched = getPerson(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('returns null for nonexistent person', () => {
    expect(getPerson(db, 'nonexistent')).toBeNull();
  });

  it('lists persons with names', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    createPerson(db, { given_name: 'Anna', surname: 'Bergström' });
    const list = listPersons(db);
    expect(list).toHaveLength(2);
    expect(list[0].surname).toBe('Andersson');
    expect(list[1].surname).toBe('Bergström');
  });

  it('updates a person', () => {
    const person = createPerson(db, { sex: 'U' });
    const updated = updatePerson(db, person.id, { sex: 'F', notes: 'updated' });
    expect(updated!.sex).toBe('F');
    expect(updated!.notes).toBe('updated');
  });

  it('deletes a person', () => {
    const person = createPerson(db, { given_name: 'Temp', surname: 'Person' });
    expect(deletePerson(db, person.id)).toBe(true);
    expect(getPerson(db, person.id)).toBeNull();
    expect(deletePerson(db, person.id)).toBe(false);
  });

  it('searches persons by name', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    createPerson(db, { given_name: 'Anna', surname: 'Bergström' });
    const results = searchPersons(db, 'Erik');
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Erik');
  });

  it('adds multiple names to a person', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    addPersonName(db, person.id, { given_name: 'Anna', surname: 'Bergström', name_type: 'married' });
    const names = getPersonNames(db, person.id);
    expect(names).toHaveLength(2);
    expect(names[0].name_type).toBe('birth');
    expect(names[1].name_type).toBe('married');
    expect(names[1].sort_order).toBe(1);
  });

  it('updates a person name', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    const nameId = getPersonNames(db, person.id)[0].id;
    const updated = updatePersonName(db, nameId, { given_name: 'Anne', surname: 'Johansson', name_type: 'alias' });
    expect(updated).not.toBeNull();
    expect(updated!.given_name).toBe('Anne');
    expect(updated!.surname).toBe('Johansson');
    expect(updated!.name_type).toBe('alias');
  });

  it('updatePersonName with no fields returns existing name unchanged', () => {
    const person = createPerson(db, { given_name: 'Erik', surname: 'Karlsson' });
    const nameId = getPersonNames(db, person.id)[0].id;
    const result = updatePersonName(db, nameId, {});
    expect(result!.given_name).toBe('Erik');
    expect(result!.surname).toBe('Karlsson');
  });

  it('updatePersonName returns null for nonexistent id', () => {
    expect(updatePersonName(db, 'nonexistent', { given_name: 'X' })).toBeNull();
  });
});

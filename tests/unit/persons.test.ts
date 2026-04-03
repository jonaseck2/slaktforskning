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
  deletePersonName,
  addPersonIdentifier,
  getPersonIdentifiers,
  deletePersonIdentifier,
  getDisplayGivenName,
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

  it('finds person by married surname', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    addPersonName(db, person.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });
    const results = searchPersons(db, 'Ahnstedt');
    expect(results).toHaveLength(1);
    expect(results[0].surname).toBe('Nord'); // display uses primary name
  });

  it('finds person by preferred_name on a non-primary name record', () => {
    const person = createPerson(db, { given_name: 'Eva Anna-Greta', surname: 'Nord' });
    addPersonName(db, person.id, { given_name: 'Eva Anna-Greta', surname: 'Ahnstedt', name_type: 'married', preferred_name: 'Anna-Greta' });
    const results = searchPersons(db, 'Anna-Greta');
    expect(results.some(p => p.id === person.id)).toBe(true);
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

  it('deletes a non-primary name', () => {
    const person = createPerson(db, {});
    const name = addPersonName(db, person.id, { given_name: 'Alias', name_type: 'alias' });
    expect(deletePersonName(db, name.id)).toBe(true);
    const names = getPersonNames(db, person.id);
    expect(names.find(n => n.id === name.id)).toBeUndefined();
  });

  describe('addPersonName with extended fields', () => {
    it('stores name_prefix and name_suffix', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Carl', surname: 'Linné', name_prefix: 'von' });
      expect(name.name_prefix).toBe('von');
      expect(name.name_suffix).toBeNull();
    });

    it('stores patronymic_base and name_qualifier', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Lars', surname: 'Eriksson', patronymic_base: 'Erik', name_qualifier: 'patronymic' });
      expect(name.patronymic_base).toBe('Erik');
      expect(name.name_qualifier).toBe('patronymic');
    });

    it('stores and retrieves preferred_name', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Eva Linda Marie', surname: 'Karlsson', preferred_name: 'Linda' });
      expect(name.preferred_name).toBe('Linda');
    });

    it('preferred_name defaults to null when not provided', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson' });
      expect(name.preferred_name).toBeNull();
    });
  });

  describe('updatePersonName with preferred_name', () => {
    it('sets preferred_name', () => {
      const person = createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Karlsson' });
      const nameId = getPersonNames(db, person.id)[0].id;
      const updated = updatePersonName(db, nameId, { preferred_name: 'Linda' });
      expect(updated!.preferred_name).toBe('Linda');
    });

    it('clears preferred_name with null', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Eva Linda Marie', surname: 'Test', preferred_name: 'Linda' });
      const updated = updatePersonName(db, name.id, { preferred_name: null });
      expect(updated!.preferred_name).toBeNull();
    });
  });

  describe('listPersons with preferred_name', () => {
    it('returns preferred_name from primary name', () => {
      const person = createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Karlsson' });
      const nameId = getPersonNames(db, person.id)[0].id;
      updatePersonName(db, nameId, { preferred_name: 'Linda' });
      const list = listPersons(db);
      const found = list.find(p => p.id === person.id);
      expect(found!.preferred_name).toBe('Linda');
    });
  });

  describe('searchPersons with preferred_name', () => {
    it('finds person by preferred_name', () => {
      const person = createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Karlsson' });
      const nameId = getPersonNames(db, person.id)[0].id;
      updatePersonName(db, nameId, { preferred_name: 'Linda' });
      const results = searchPersons(db, 'Linda');
      expect(results.some(p => p.id === person.id)).toBe(true);
    });
  });
});

describe('getDisplayGivenName', () => {
  it('returns preferred_name when set', () => {
    expect(getDisplayGivenName({ given_name: 'Eva Linda Marie', preferred_name: 'Linda' })).toBe('Linda');
  });

  it('returns first token of given_name when no preferred_name', () => {
    expect(getDisplayGivenName({ given_name: 'Eva Linda Marie', preferred_name: null })).toBe('Eva');
  });

  it('returns empty string when both are null', () => {
    expect(getDisplayGivenName({ given_name: null, preferred_name: null })).toBe('');
  });
});

describe('person identifiers', () => {
  it('adds and retrieves an identifier', () => {
    const person = createPerson(db, {});
    const ident = addPersonIdentifier(db, person.id, { identifier_type: 'familysearch', identifier_value: 'L123-XYZ' });
    expect(ident.identifier_type).toBe('familysearch');
    const list = getPersonIdentifiers(db, person.id);
    expect(list).toHaveLength(1);
  });

  it('deletes an identifier', () => {
    const person = createPerson(db, {});
    const ident = addPersonIdentifier(db, person.id, { identifier_type: 'ancestry', identifier_value: 'A456' });
    expect(deletePersonIdentifier(db, ident.id)).toBe(true);
    expect(getPersonIdentifiers(db, person.id)).toHaveLength(0);
  });

  it('enforces uniqueness per person/type/value', () => {
    const person = createPerson(db, {});
    addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' });
    expect(() => addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' })).toThrow();
  });

  it('returns false for nonexistent id', () => {
    expect(deletePersonIdentifier(db, 'nonexistent-id')).toBe(false);
  });
});

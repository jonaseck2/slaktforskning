import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
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
  parsePreferredName,
  listPersonsPage,
  countPersons,
  listUnsourcedPersonsPage,
  countUnsourcedPersons,
  searchPersonsWithDetails,
  getPersonDisplayNames,
} from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createSource, createCitation } from '../../src/api/sources';
import { createPlace } from '../../src/api/places';
import { createTestDb } from './helpers';

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
    // No date_from on either name → tie broken by highest sort_order. The
    // married entry was inserted second so it has the higher sort_order and
    // becomes the displayed name.
    expect(results[0].surname).toBe('Ahnstedt');
  });

  it('finds person by preferred_name on a non-primary name record', () => {
    const person = createPerson(db, { given_name: 'Eva Anna-Greta', surname: 'Nord' });
    addPersonName(db, person.id, { given_name: 'Eva Anna-Greta', surname: 'Ahnstedt', name_type: 'married', preferred_name: 'Anna-Greta' });
    const results = searchPersons(db, 'Anna-Greta');
    expect(results.some(p => p.id === person.id)).toBe(true);
  });

  it('multi-token search matches given_name + surname across tokens', () => {
    createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Ahnstedt' });
    createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    const results = searchPersons(db, 'Linda Ahnstedt');
    expect(results).toHaveLength(1);
    expect(results[0].surname).toBe('Ahnstedt');
  });

  it('multi-token search requires all tokens to match', () => {
    createPerson(db, { given_name: 'Eva Linda', surname: 'Ahnstedt' });
    createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    const results = searchPersons(db, 'Linda Andersson');
    expect(results).toHaveLength(0);
  });

  it('multi-token search with three tokens', () => {
    createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Ahnstedt' });
    const results = searchPersons(db, 'Eva Linda Ahnstedt');
    expect(results).toHaveLength(1);
  });

  it('empty search returns empty array', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Test' });
    expect(searchPersons(db, '')).toHaveLength(0);
    expect(searchPersons(db, '   ')).toHaveLength(0);
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

    it('stores and retrieves nickname', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Susanna', surname: 'Johansson', nickname: 'Sanna' });
      expect(name.nickname).toBe('Sanna');
    });

    it('nickname defaults to null when not provided', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson' });
      expect(name.nickname).toBeNull();
    });
  });

  describe('updatePersonName with sort_order', () => {
    it('updates sort_order so the names table reorder pattern works', () => {
      const p = createPerson(db, { given_name: 'Anna', surname: 'A' });
      const second = addPersonName(db, p.id, { given_name: 'Anna', surname: 'B' });
      // Bump the second name's sort_order above the birth name's
      const updated = updatePersonName(db, second.id, { sort_order: 99 });
      expect(updated!.sort_order).toBe(99);
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

    it('sets nickname', () => {
      const person = createPerson(db, { given_name: 'Susanna', surname: 'Johansson' });
      const nameId = getPersonNames(db, person.id)[0].id;
      const updated = updatePersonName(db, nameId, { nickname: 'Sanna' });
      expect(updated!.nickname).toBe('Sanna');
    });

    it('clears nickname with null', () => {
      const person = createPerson(db, {});
      const name = addPersonName(db, person.id, { given_name: 'Susanna', surname: 'Test', nickname: 'Sanna' });
      const updated = updatePersonName(db, name.id, { nickname: null });
      expect(updated!.nickname).toBeNull();
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

describe('listPersonsPage / countPersons / searchPersonsWithDetails', () => {
  it('returns basic PersonListItem shape', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const result = listPersonsPage(db, 100, 0);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(p.id);
    expect(result[0].sex).toBe('M');
    expect(result[0].given_name).toBe('Erik');
    expect(result[0].surname).toBe('Andersson');
    expect(result[0].birth_date).toBeNull();
    expect(result[0].birth_place).toBeNull();
    expect(result[0].death_date).toBeNull();
    expect(result[0].death_place).toBeNull();
  });

  it('joins birth and death date', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Berg', sex: 'F' });
    const birth = createEvent(db, { event_type: 'birth', date_original: '1 JAN 1900' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const death = createEvent(db, { event_type: 'death', date_original: '15 MAR 1980' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const result = listPersonsPage(db, 100, 0);
    const row = result.find(r => r.id === p.id)!;
    expect(row.birth_date).toBe('1 JAN 1900');
    expect(row.death_date).toBe('15 MAR 1980');
    expect(row.birth_place).toBeNull();
  });

  it('respects LIMIT and OFFSET', () => {
    for (let i = 0; i < 5; i++) {
      createPerson(db, { given_name: `Person${i}`, surname: 'Test' });
    }
    const page1 = listPersonsPage(db, 3, 0);
    const page2 = listPersonsPage(db, 3, 3);
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
    const ids1 = page1.map(r => r.id);
    const ids2 = page2.map(r => r.id);
    expect(ids1.some(id => ids2.includes(id))).toBe(false);
  });

  it('countPersons returns total', () => {
    createPerson(db, { given_name: 'A', surname: 'A' });
    createPerson(db, { given_name: 'B', surname: 'B' });
    expect(countPersons(db)).toBe(2);
  });

  it('listPersonsPage filters by query across given_name, surname, preferred_name, nickname', () => {
    const a = createPerson(db, { given_name: 'Karl', surname: 'Andersson' });
    createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    addPersonName(db, a.id, { given_name: 'Karl', surname: 'Andersson', name_type: 'birth', nickname: 'Kalle' });

    const byGiven = listPersonsPage(db, 100, 0, 'surname', 'asc', 'Karl');
    expect(byGiven.map(p => p.given_name)).toContain('Karl');
    expect(byGiven.map(p => p.given_name)).not.toContain('Anna');

    const bySurname = listPersonsPage(db, 100, 0, 'surname', 'asc', 'Svensson');
    expect(bySurname.map(p => p.surname)).toContain('Svensson');
    expect(bySurname.map(p => p.surname)).not.toContain('Andersson');

    const byNickname = listPersonsPage(db, 100, 0, 'surname', 'asc', 'Kalle');
    expect(byNickname.map(p => p.given_name)).toContain('Karl');
  });

  it('countPersons reflects filter when query is provided', () => {
    createPerson(db, { given_name: 'Karl', surname: 'Andersson' });
    createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    expect(countPersons(db)).toBe(2);
    expect(countPersons(db, 'Karl')).toBe(1);
    expect(countPersons(db, 'zzz')).toBe(0);
  });

  it('listPersonsPage AND-combines multiple tokens', () => {
    createPerson(db, { given_name: 'Karl Erik', surname: 'Andersson' });
    createPerson(db, { given_name: 'Karl', surname: 'Svensson' });
    const both = listPersonsPage(db, 100, 0, 'surname', 'asc', 'Karl Erik');
    expect(both).toHaveLength(1);
    expect(both[0].surname).toBe('Andersson');
  });

  it('searchPersonsWithDetails matches by name and includes birth data', () => {
    const p = createPerson(db, { given_name: 'Karl', surname: 'Johansson', sex: 'M' });
    const birth = createEvent(db, { event_type: 'birth', date_original: '5 MAJ 1850' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    const results = searchPersonsWithDetails(db, 'Karl');
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Karl');
    expect(results[0].birth_date).toBe('5 MAJ 1850');
  });

  it('searchPersonsWithDetails multi-token matches given + surname', () => {
    createPerson(db, { given_name: 'Karl Erik', surname: 'Johansson' });
    createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    const results = searchPersonsWithDetails(db, 'Erik Johansson');
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Karl Erik');
  });

  it('searchPersonsWithDetails empty query returns empty', () => {
    createPerson(db, { given_name: 'Test', surname: 'Person' });
    expect(searchPersonsWithDetails(db, '')).toHaveLength(0);
  });
});

describe('listUnsourcedPersonsPage / countUnsourcedPersons', () => {
  it('returns persons without any citations', () => {
    const p1 = createPerson(db, { given_name: 'Unsourced', surname: 'Person' });
    const p2 = createPerson(db, { given_name: 'Sourced', surname: 'Person' });

    // Give p2 an event with a citation
    const event = createEvent(db, { event_type: 'birth', date_type: 'exact' });
    addEventParticipant(db, { event_id: event.id, person_id: p2.id, role: 'primary' });
    const source = createSource(db, { title: 'Test Source' });
    createCitation(db, { source_id: source.id, event_id: event.id });

    const unsourced = listUnsourcedPersonsPage(db, 100, 0);
    expect(unsourced).toHaveLength(1);
    expect(unsourced[0].id).toBe(p1.id);
    expect(countUnsourcedPersons(db)).toBe(1);
  });

  it('returns empty when all persons are sourced', () => {
    const p = createPerson(db, { given_name: 'A', surname: 'B' });
    const source = createSource(db, { title: 'S' });
    createCitation(db, { source_id: source.id, person_id: p.id });

    expect(listUnsourcedPersonsPage(db, 100, 0)).toHaveLength(0);
    expect(countUnsourcedPersons(db)).toBe(0);
  });
});

describe('parsePreferredName', () => {
  it('extracts preferred name with * marker', () => {
    expect(parsePreferredName('Johan Erik*')).toEqual({ given_name: 'Johan Erik', preferred_name: 'Erik' });
  });

  it('extracts preferred name with ! marker', () => {
    expect(parsePreferredName('Johan Erik!')).toEqual({ given_name: 'Johan Erik', preferred_name: 'Erik' });
  });

  it('handles marker on first name', () => {
    expect(parsePreferredName('Erik* Johan')).toEqual({ given_name: 'Erik Johan', preferred_name: 'Erik' });
  });

  it('handles marker on middle name', () => {
    expect(parsePreferredName('Anna Lisa* Maria')).toEqual({ given_name: 'Anna Lisa Maria', preferred_name: 'Lisa' });
  });

  it('returns null preferred_name when no marker', () => {
    expect(parsePreferredName('Johan Erik')).toEqual({ given_name: 'Johan Erik', preferred_name: null });
  });

  it('handles null input', () => {
    expect(parsePreferredName(null)).toEqual({ given_name: null, preferred_name: null });
  });

  it('handles undefined input', () => {
    expect(parsePreferredName(undefined)).toEqual({ given_name: null, preferred_name: null });
  });

  it('handles single name with marker', () => {
    expect(parsePreferredName('Erik*')).toEqual({ given_name: 'Erik', preferred_name: 'Erik' });
  });
});

describe('preferred name marker integration', () => {
  it('createPerson parses * marker into preferred_name', () => {
    const person = createPerson(db, { given_name: 'Johan Erik*', surname: 'Svensson' });
    const names = getPersonNames(db, person.id);
    expect(names[0].given_name).toBe('Johan Erik');
    expect(names[0].preferred_name).toBe('Erik');
  });

  it('addPersonName parses * marker into preferred_name', () => {
    const person = createPerson(db, { given_name: 'A', surname: 'B' });
    const name = addPersonName(db, person.id, { given_name: 'Anna Lisa*', surname: 'Karlsson' });
    expect(name.given_name).toBe('Anna Lisa');
    expect(name.preferred_name).toBe('Lisa');
  });

  it('addPersonName respects explicit preferred_name over marker', () => {
    const person = createPerson(db, { given_name: 'A', surname: 'B' });
    const name = addPersonName(db, person.id, { given_name: 'Anna Lisa*', surname: 'K', preferred_name: 'Anna' });
    expect(name.given_name).toBe('Anna Lisa');
    expect(name.preferred_name).toBe('Anna');
  });

  it('updatePersonName parses * marker into preferred_name', () => {
    const person = createPerson(db, { given_name: 'Johan', surname: 'S' });
    const names = getPersonNames(db, person.id);
    const updated = updatePersonName(db, names[0].id, { given_name: 'Johan Erik*' });
    expect(updated!.given_name).toBe('Johan Erik');
    expect(updated!.preferred_name).toBe('Erik');
  });
});

describe('getPersonDisplayNames', () => {
  it('returns empty map for empty ids', () => {
    const map = getPersonDisplayNames(db, []);
    expect(map.size).toBe(0);
  });

  it('returns display names for multiple persons', () => {
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const p2 = createPerson(db, { given_name: 'Anna', surname: 'Berg' });

    const map = getPersonDisplayNames(db, [p1.id, p2.id]);
    expect(map.size).toBe(2);
    expect(map.get(p1.id)).toBe('Erik Svensson');
    expect(map.get(p2.id)).toBe('Anna Berg');
  });

  it('returns ? for person with no name', () => {
    const p = createPerson(db, {});
    const map = getPersonDisplayNames(db, [p.id]);
    // Person has no names, so not in query result
    expect(map.has(p.id)).toBe(false);
  });

  it('uses displayed name (newest by date / highest sort_order)', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });

    // Newest (highest sort_order) wins when no dates are set.
    const map = getPersonDisplayNames(db, [p.id]);
    expect(map.get(p.id)).toBe('Anna Ahnstedt');
  });
});

describe('displayed name rule (Bengt 2026-04-29)', () => {
  it('birth-only person → birth name displayed', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    const list = listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Andersson');
  });

  it('birth + later married → married displayed (newest sort_order wins ties)', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });
    const list = listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Ahnstedt');
  });

  it('birth + married + name_change → name_change displayed', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Berg', name_type: 'name_change' });
    const list = listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Berg');
  });

  it('explicit date_from on married overrides sort_order', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Older', name_type: 'married', date_from: '1850-01-01' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Newer', name_type: 'married', date_from: '1900-01-01' });
    // Insert a third (no date) with the highest sort_order — should NOT win
    // because dated entries always rank above undated ones.
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Undated', name_type: 'name_change' });
    const list = listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Newer');
  });

  it('birth name effective date = birth event date_value (overrides stored date_from)', () => {
    const p = createPerson(db, { given_name: 'Karl', surname: 'Birth' });
    // Birth event sets effective date_from on the birth name
    const birth = createEvent(db, { event_type: 'birth', date_value: '1900-05-01', date_type: 'exact' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    // Married name dated AFTER birth → should win
    addPersonName(db, p.id, { given_name: 'Karl', surname: 'AfterBirth', name_type: 'married', date_from: '1925-01-01' });
    const list = listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('AfterBirth');
  });

  it('name dated BEFORE birth event → birth still displayed', () => {
    const p = createPerson(db, { given_name: 'Karl', surname: 'Birth' });
    const birth = createEvent(db, { event_type: 'birth', date_value: '1900-05-01', date_type: 'exact' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    addPersonName(db, p.id, { given_name: 'Karl', surname: 'Pre1900', name_type: 'married', date_from: '1850-01-01' });
    const list = listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Birth');
  });

  it('reordering with date inversions — dated names always rank by date, not sort_order', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    // Add name with high sort_order but earlier date
    const older = addPersonName(db, p.id, { given_name: 'Anna', surname: 'Older', name_type: 'married', date_from: '1850-01-01' });
    const newer = addPersonName(db, p.id, { given_name: 'Anna', surname: 'Newer', name_type: 'married', date_from: '1900-01-01' });
    // Manually invert sort_order so 'Older' has higher sort_order than 'Newer'
    updatePersonName(db, older.id, {});  // no-op — but we want to swap sort_orders
    db.prepare('UPDATE person_names SET sort_order = ? WHERE id = ?').run([99, older.id]);
    db.prepare('UPDATE person_names SET sort_order = ? WHERE id = ?').run([1, newer.id]);
    // 'Newer' still wins because date_from beats sort_order
    const list = listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Newer');
  });
});

describe('listPersonsPage with places', () => {
  it('includes birth and death place names', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
    const birthPlace = createPlace(db, { name: 'Stockholm' });
    const deathPlace = createPlace(db, { name: 'Göteborg' });
    const birth = createEvent(db, { event_type: 'birth', date_original: '1900-01-01', place_id: birthPlace.id });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const death = createEvent(db, { event_type: 'death', date_original: '1980-06-15', place_id: deathPlace.id });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const result = listPersonsPage(db, 100, 0);
    const row = result.find(r => r.id === p.id)!;
    expect(row.birth_place).toBe('Stockholm');
    expect(row.death_place).toBe('Göteborg');
    expect(row.birth_date).toBe('1900-01-01');
    expect(row.death_date).toBe('1980-06-15');
  });

  it('listUnsourcedPersonsPage includes birth/death place names', () => {
    const p = createPerson(db, { given_name: 'Unsourced', surname: 'WithPlace' });
    const place = createPlace(db, { name: 'Malmö' });
    const birth = createEvent(db, { event_type: 'birth', date_original: '1850-03-20', place_id: place.id });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });

    const result = listUnsourcedPersonsPage(db, 100, 0);
    const row = result.find(r => r.id === p.id)!;
    expect(row.birth_place).toBe('Malmö');
    expect(row.birth_date).toBe('1850-03-20');
  });
});

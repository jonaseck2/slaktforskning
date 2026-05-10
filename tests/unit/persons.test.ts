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

beforeEach(async () => {
  db = await createTestDb();
});

describe('persons', async () => {
  it('creates a person with a name', async () => {
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    expect(person.id).toBeDefined();
    expect(person.sex).toBe('M');

    const names = await getPersonNames(db, person.id);
    expect(names).toHaveLength(1);
    expect(names[0].given_name).toBe('Erik');
    expect(names[0].surname).toBe('Andersson');
  });

  it('creates a person without a name', async () => {
    const person = await createPerson(db, { sex: 'U' }, { allowNameless: true });
    expect(person.id).toBeDefined();
    const names = await getPersonNames(db, person.id);
    expect(names).toHaveLength(0);
  });

  describe('createPerson nameless guard (plan 2026-05-04-new-person-dialog-hardening)', async () => {
    it('throws when both given_name and surname are missing', async () => {
      await expect(async () => await createPerson(db, { sex: 'U' })).rejects.toThrow(/without a name/i);
    });

    it('throws when given_name is whitespace-only and surname is empty', async () => {
      await expect(async () => await createPerson(db, { given_name: '   ', surname: '' })).rejects.toThrow(/without a name/i);
    });

    it('throws when both names are blank strings', async () => {
      await expect(async () => await createPerson(db, { given_name: '', surname: '' })).rejects.toThrow(/without a name/i);
    });

    it('succeeds with only given_name', async () => {
      const person = await createPerson(db, { given_name: 'A' });
      const names = await getPersonNames(db, person.id);
      expect(names).toHaveLength(1);
      expect(names[0].given_name).toBe('A');
    });

    it('succeeds with only surname', async () => {
      const person = await createPerson(db, { surname: 'B' });
      const names = await getPersonNames(db, person.id);
      expect(names).toHaveLength(1);
      expect(names[0].surname).toBe('B');
    });

    it('importer escape hatch: allowNameless lets a nameless person through', async () => {
      const person = await createPerson(db, { sex: 'U' }, { allowNameless: true });
      expect(person.id).toBeDefined();
      // No name row written when source had no name.
      expect(await getPersonNames(db, person.id)).toHaveLength(0);
    });

    it('importer escape hatch with whitespace-only names also creates no name row', async () => {
      const person = await createPerson(db, { given_name: '   ', surname: '' }, { allowNameless: true });
      expect(await getPersonNames(db, person.id)).toHaveLength(0);
    });
  });

  it('gets a person by id', async () => {
    const created = await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    const fetched = await getPerson(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('returns null for nonexistent person', async () => {
    expect(await getPerson(db, 'nonexistent')).toBeNull();
  });

  it('lists persons with names', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Bergström' });
    const list = await listPersons(db);
    expect(list).toHaveLength(2);
    expect(list[0].surname).toBe('Andersson');
    expect(list[1].surname).toBe('Bergström');
  });

  it('updates a person', async () => {
    const person = await createPerson(db, { sex: 'U' }, { allowNameless: true });
    const updated = await updatePerson(db, person.id, { sex: 'F', notes: 'updated' });
    expect(updated!.sex).toBe('F');
    expect(updated!.notes).toBe('updated');
  });

  it('deletes a person', async () => {
    const person = await createPerson(db, { given_name: 'Temp', surname: 'Person' });
    expect(await deletePerson(db, person.id)).toBe(true);
    expect(await getPerson(db, person.id)).toBeNull();
    expect(await deletePerson(db, person.id)).toBe(false);
  });

  it('searches persons by name', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Bergström' });
    const results = await searchPersons(db, 'Erik');
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Erik');
  });

  it('finds person by married surname', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    await addPersonName(db, person.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });
    const results = await searchPersons(db, 'Ahnstedt');
    expect(results).toHaveLength(1);
    // No date_from on either name → tie broken by highest sort_order. The
    // married entry was inserted second so it has the higher sort_order and
    // becomes the displayed name.
    expect(results[0].surname).toBe('Ahnstedt');
  });

  it('finds person by preferred_name on a non-primary name record', async () => {
    const person = await createPerson(db, { given_name: 'Eva Anna-Greta', surname: 'Nord' });
    await addPersonName(db, person.id, { given_name: 'Eva Anna-Greta', surname: 'Ahnstedt', name_type: 'married', preferred_name: 'Anna-Greta' });
    const results = await searchPersons(db, 'Anna-Greta');
    expect(results.some(p => p.id === person.id)).toBe(true);
  });

  it('multi-token search matches given_name + surname across tokens', async () => {
    await createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Ahnstedt' });
    await createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    const results = await searchPersons(db, 'Linda Ahnstedt');
    expect(results).toHaveLength(1);
    expect(results[0].surname).toBe('Ahnstedt');
  });

  it('multi-token search requires all tokens to match', async () => {
    await createPerson(db, { given_name: 'Eva Linda', surname: 'Ahnstedt' });
    await createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    const results = await searchPersons(db, 'Linda Andersson');
    expect(results).toHaveLength(0);
  });

  it('multi-token search with three tokens', async () => {
    await createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Ahnstedt' });
    const results = await searchPersons(db, 'Eva Linda Ahnstedt');
    expect(results).toHaveLength(1);
  });

  it('empty search returns empty array', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Test' });
    expect(await searchPersons(db, '')).toHaveLength(0);
    expect(await searchPersons(db, '   ')).toHaveLength(0);
  });

  it('adds multiple names to a person', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    await addPersonName(db, person.id, { given_name: 'Anna', surname: 'Bergström', name_type: 'married' });
    const names = await getPersonNames(db, person.id);
    expect(names).toHaveLength(2);
    expect(names[0].name_type).toBe('birth');
    expect(names[1].name_type).toBe('married');
    expect(names[1].sort_order).toBe(1);
  });

  it('updates a person name', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    const nameId = (await getPersonNames(db, person.id))[0].id;
    const updated = await updatePersonName(db, nameId, { given_name: 'Anne', surname: 'Johansson', name_type: 'alias' });
    expect(updated).not.toBeNull();
    expect(updated!.given_name).toBe('Anne');
    expect(updated!.surname).toBe('Johansson');
    expect(updated!.name_type).toBe('alias');
  });

  it('updatePersonName with no fields returns existing name unchanged', async () => {
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Karlsson' });
    const nameId = (await getPersonNames(db, person.id))[0].id;
    const result = await updatePersonName(db, nameId, {});
    expect(result!.given_name).toBe('Erik');
    expect(result!.surname).toBe('Karlsson');
  });

  it('updatePersonName returns null for nonexistent id', async () => {
    expect(await updatePersonName(db, 'nonexistent', { given_name: 'X' })).toBeNull();
  });

  it('deletes a non-primary name', async () => {
    const person = await createPerson(db, {}, { allowNameless: true });
    const name = await addPersonName(db, person.id, { given_name: 'Alias', name_type: 'alias' });
    expect(await deletePersonName(db, name.id)).toBe(true);
    const names = await getPersonNames(db, person.id);
    expect(names.find(n => n.id === name.id)).toBeUndefined();
  });

  describe('addPersonName with extended fields', async () => {
    it('stores name_prefix and name_suffix', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Carl', surname: 'Linné', name_prefix: 'von' });
      expect(name.name_prefix).toBe('von');
      expect(name.name_suffix).toBeNull();
    });

    it('stores patronymic_base and name_qualifier', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Lars', surname: 'Eriksson', patronymic_base: 'Erik', name_qualifier: 'patronymic' });
      expect(name.patronymic_base).toBe('Erik');
      expect(name.name_qualifier).toBe('patronymic');
    });

    it('stores and retrieves preferred_name', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Eva Linda Marie', surname: 'Karlsson', preferred_name: 'Linda' });
      expect(name.preferred_name).toBe('Linda');
    });

    it('preferred_name defaults to null when not provided', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson' });
      expect(name.preferred_name).toBeNull();
    });

    it('stores and retrieves nickname', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Susanna', surname: 'Johansson', nickname: 'Sanna' });
      expect(name.nickname).toBe('Sanna');
    });

    it('nickname defaults to null when not provided', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson' });
      expect(name.nickname).toBeNull();
    });
  });

  describe('updatePersonName with sort_order', async () => {
    it('updates sort_order so the names table reorder pattern works', async () => {
      const p = await createPerson(db, { given_name: 'Anna', surname: 'A' });
      const second = await addPersonName(db, p.id, { given_name: 'Anna', surname: 'B' });
      // Bump the second name's sort_order above the birth name's
      const updated = await updatePersonName(db, second.id, { sort_order: 99 });
      expect(updated!.sort_order).toBe(99);
    });
  });

  describe('updatePersonName with preferred_name', async () => {
    it('sets preferred_name', async () => {
      const person = await createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Karlsson' });
      const nameId = (await getPersonNames(db, person.id))[0].id;
      const updated = await updatePersonName(db, nameId, { preferred_name: 'Linda' });
      expect(updated!.preferred_name).toBe('Linda');
    });

    it('clears preferred_name with null', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Eva Linda Marie', surname: 'Test', preferred_name: 'Linda' });
      const updated = await updatePersonName(db, name.id, { preferred_name: null });
      expect(updated!.preferred_name).toBeNull();
    });

    it('sets nickname', async () => {
      const person = await createPerson(db, { given_name: 'Susanna', surname: 'Johansson' });
      const nameId = (await getPersonNames(db, person.id))[0].id;
      const updated = await updatePersonName(db, nameId, { nickname: 'Sanna' });
      expect(updated!.nickname).toBe('Sanna');
    });

    it('clears nickname with null', async () => {
      const person = await createPerson(db, {}, { allowNameless: true });
      const name = await addPersonName(db, person.id, { given_name: 'Susanna', surname: 'Test', nickname: 'Sanna' });
      const updated = await updatePersonName(db, name.id, { nickname: null });
      expect(updated!.nickname).toBeNull();
    });
  });

  describe('listPersons with preferred_name', async () => {
    it('returns preferred_name from primary name', async () => {
      const person = await createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Karlsson' });
      const nameId = (await getPersonNames(db, person.id))[0].id;
      await updatePersonName(db, nameId, { preferred_name: 'Linda' });
      const list = await listPersons(db);
      const found = list.find(p => p.id === person.id);
      expect(found!.preferred_name).toBe('Linda');
    });
  });

  describe('searchPersons with preferred_name', async () => {
    it('finds person by preferred_name', async () => {
      const person = await createPerson(db, { given_name: 'Eva Linda Marie', surname: 'Karlsson' });
      const nameId = (await getPersonNames(db, person.id))[0].id;
      await updatePersonName(db, nameId, { preferred_name: 'Linda' });
      const results = await searchPersons(db, 'Linda');
      expect(results.some(p => p.id === person.id)).toBe(true);
    });
  });
});

describe('getDisplayGivenName', async () => {
  it('returns preferred_name when set', async () => {
    expect(getDisplayGivenName({ given_name: 'Eva Linda Marie', preferred_name: 'Linda' })).toBe('Linda');
  });

  it('returns first token of given_name when no preferred_name', async () => {
    expect(getDisplayGivenName({ given_name: 'Eva Linda Marie', preferred_name: null })).toBe('Eva');
  });

  it('returns empty string when both are null', async () => {
    expect(getDisplayGivenName({ given_name: null, preferred_name: null })).toBe('');
  });
});

describe('person identifiers', async () => {
  it('adds and retrieves an identifier', async () => {
    const person = await createPerson(db, {}, { allowNameless: true });
    const ident = await addPersonIdentifier(db, person.id, { identifier_type: 'familysearch', identifier_value: 'L123-XYZ' });
    expect(ident.identifier_type).toBe('familysearch');
    const list = await getPersonIdentifiers(db, person.id);
    expect(list).toHaveLength(1);
  });

  it('deletes an identifier', async () => {
    const person = await createPerson(db, {}, { allowNameless: true });
    const ident = await addPersonIdentifier(db, person.id, { identifier_type: 'ancestry', identifier_value: 'A456' });
    expect(await deletePersonIdentifier(db, ident.id)).toBe(true);
    expect(await getPersonIdentifiers(db, person.id)).toHaveLength(0);
  });

  it('enforces uniqueness per person/type/value', async () => {
    const person = await createPerson(db, {}, { allowNameless: true });
    await addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' });
    await expect(async () => await addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' })).rejects.toThrow();
  });

  it('returns false for nonexistent id', async () => {
    expect(await deletePersonIdentifier(db, 'nonexistent-id')).toBe(false);
  });
});

describe('listPersonsPage / countPersons / searchPersonsWithDetails', async () => {
  it('returns basic PersonListItem shape', async () => {
    const p = await createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const result = await listPersonsPage(db, 100, 0);
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

  it('joins birth and death date', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Berg', sex: 'F' });
    const birth = await createEvent(db, { event_type: 'birth', date_original: '1 JAN 1900' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const death = await createEvent(db, { event_type: 'death', date_original: '15 MAR 1980' });
    await addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const result = await listPersonsPage(db, 100, 0);
    const row = result.find(r => r.id === p.id)!;
    expect(row.birth_date).toBe('1 JAN 1900');
    expect(row.death_date).toBe('15 MAR 1980');
    expect(row.birth_place).toBeNull();
  });

  it('respects LIMIT and OFFSET', async () => {
    for (let i = 0; i < 5; i++) {
      await createPerson(db, { given_name: `Person${i}`, surname: 'Test' });
    }
    const page1 = await listPersonsPage(db, 3, 0);
    const page2 = await listPersonsPage(db, 3, 3);
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
    const ids1 = page1.map(r => r.id);
    const ids2 = page2.map(r => r.id);
    expect(ids1.some(id => ids2.includes(id))).toBe(false);
  });

  it('countPersons returns total', async () => {
    await createPerson(db, { given_name: 'A', surname: 'A' });
    await createPerson(db, { given_name: 'B', surname: 'B' });
    expect(await countPersons(db)).toBe(2);
  });

  it('listPersonsPage filters by query across given_name, surname, preferred_name, nickname', async () => {
    const a = await createPerson(db, { given_name: 'Karl', surname: 'Andersson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    await addPersonName(db, a.id, { given_name: 'Karl', surname: 'Andersson', name_type: 'birth', nickname: 'Kalle' });

    const byGiven = await listPersonsPage(db, 100, 0, 'surname', 'asc', 'Karl');
    expect(byGiven.map(p => p.given_name)).toContain('Karl');
    expect(byGiven.map(p => p.given_name)).not.toContain('Anna');

    const bySurname = await listPersonsPage(db, 100, 0, 'surname', 'asc', 'Svensson');
    expect(bySurname.map(p => p.surname)).toContain('Svensson');
    expect(bySurname.map(p => p.surname)).not.toContain('Andersson');

    const byNickname = await listPersonsPage(db, 100, 0, 'surname', 'asc', 'Kalle');
    expect(byNickname.map(p => p.given_name)).toContain('Karl');
  });

  it('countPersons reflects filter when query is provided', async () => {
    await createPerson(db, { given_name: 'Karl', surname: 'Andersson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    expect(await countPersons(db)).toBe(2);
    expect(await countPersons(db, 'Karl')).toBe(1);
    expect(await countPersons(db, 'zzz')).toBe(0);
  });

  it('listPersonsPage AND-combines multiple tokens', async () => {
    await createPerson(db, { given_name: 'Karl Erik', surname: 'Andersson' });
    await createPerson(db, { given_name: 'Karl', surname: 'Svensson' });
    const both = await listPersonsPage(db, 100, 0, 'surname', 'asc', 'Karl Erik');
    expect(both).toHaveLength(1);
    expect(both[0].surname).toBe('Andersson');
  });

  it('searchPersonsWithDetails matches by name and includes birth data', async () => {
    const p = await createPerson(db, { given_name: 'Karl', surname: 'Johansson', sex: 'M' });
    const birth = await createEvent(db, { event_type: 'birth', date_original: '5 MAJ 1850' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    const results = await searchPersonsWithDetails(db, 'Karl');
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Karl');
    expect(results[0].birth_date).toBe('5 MAJ 1850');
  });

  it('searchPersonsWithDetails multi-token matches given + surname', async () => {
    await createPerson(db, { given_name: 'Karl Erik', surname: 'Johansson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    const results = await searchPersonsWithDetails(db, 'Erik Johansson');
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Karl Erik');
  });

  it('searchPersonsWithDetails empty query returns empty', async () => {
    await createPerson(db, { given_name: 'Test', surname: 'Person' });
    expect(await searchPersonsWithDetails(db, '')).toHaveLength(0);
  });

  describe('listPersonsPage given_name sort uses preferred_name when set', async () => {
    // The "Förnamn" column in the persons list shows preferred_name (tilltalsnamn)
    // when set, otherwise the full given_name. Sort key must match what's shown
    // so rows don't appear under the wrong letter. Fixtures are constructed so
    // that the OLD `pn.given_name` sort produces the opposite order from the
    // NEW `COALESCE(NULLIF(TRIM(preferred_name), ''), given_name)` sort.
    it('uses preferred_name over the full given_name as the sort key', async () => {
      // Old sort key: 'Anders Zorro' < 'Bo' → Zorro-row first.
      // New sort key: 'Zorro' > 'Bo' → Bo-row first (matches displayed names).
      const zorroPerson = await createPerson(db, { given_name: 'Anders Zorro', surname: 'X' });
      const zorroName = (await getPersonNames(db, zorroPerson.id))[0];
      await updatePersonName(db, zorroName.id, { preferred_name: 'Zorro' });
      const boPerson = await createPerson(db, { given_name: 'Bo', surname: 'Y' });

      const rows = await listPersonsPage(db, 100, 0, 'given_name', 'asc');
      const order = rows.map(r => r.id);
      expect(order.indexOf(boPerson.id)).toBeLessThan(order.indexOf(zorroPerson.id));
    });

    it('falls back to given_name when no preferred_name is set on either', async () => {
      const bertil = await createPerson(db, { given_name: 'Bertil', surname: 'X' });
      const anna = await createPerson(db, { given_name: 'Anna', surname: 'Y' });

      const rows = await listPersonsPage(db, 100, 0, 'given_name', 'asc');
      const order = rows.map(r => r.id);
      expect(order.indexOf(anna.id)).toBeLessThan(order.indexOf(bertil.id));
    });

    it('mixes preferred + non-preferred rows in the displayed order', async () => {
      // Old sort key: 'Anna' < 'Karl Bertil' → Anna first (matches new).
      // To force divergence, give the non-preferred row a name that is
      // alphabetically *before* the preferred-row's full given_name but
      // *after* its preferred_name. Old: 'Carl' < 'Karl Bertil' → Carl
      // first. New: 'Bertil' < 'Carl' → Bertil first.
      const bertilPerson = await createPerson(db, { given_name: 'Karl Bertil', surname: 'X' });
      const bertilName = (await getPersonNames(db, bertilPerson.id))[0];
      await updatePersonName(db, bertilName.id, { preferred_name: 'Bertil' });
      const carlPerson = await createPerson(db, { given_name: 'Carl', surname: 'Y' });

      const rows = await listPersonsPage(db, 100, 0, 'given_name', 'asc');
      const order = rows.map(r => r.id);
      expect(order.indexOf(bertilPerson.id)).toBeLessThan(order.indexOf(carlPerson.id));
    });
  });
});

describe('listUnsourcedPersonsPage / countUnsourcedPersons', async () => {
  it('returns persons without any citations', async () => {
    const p1 = await createPerson(db, { given_name: 'Unsourced', surname: 'Person' });
    const p2 = await createPerson(db, { given_name: 'Sourced', surname: 'Person' });

    // Give p2 an event with a citation
    const event = await createEvent(db, { event_type: 'birth', date_type: 'exact' });
    await addEventParticipant(db, { event_id: event.id, person_id: p2.id, role: 'primary' });
    const source = await createSource(db, { title: 'Test Source' });
    await createCitation(db, { source_id: source.id, event_id: event.id });

    const unsourced = await listUnsourcedPersonsPage(db, 100, 0);
    expect(unsourced).toHaveLength(1);
    expect(unsourced[0].id).toBe(p1.id);
    expect(await countUnsourcedPersons(db)).toBe(1);
  });

  it('returns empty when all persons are sourced', async () => {
    const p = await createPerson(db, { given_name: 'A', surname: 'B' });
    const source = await createSource(db, { title: 'S' });
    await createCitation(db, { source_id: source.id, person_id: p.id });

    expect(await listUnsourcedPersonsPage(db, 100, 0)).toHaveLength(0);
    expect(await countUnsourcedPersons(db)).toBe(0);
  });
});

describe('parsePreferredName', async () => {
  it('extracts preferred name with * marker', async () => {
    expect(parsePreferredName('Johan Erik*')).toEqual({ given_name: 'Johan Erik', preferred_name: 'Erik' });
  });

  it('extracts preferred name with ! marker', async () => {
    expect(parsePreferredName('Johan Erik!')).toEqual({ given_name: 'Johan Erik', preferred_name: 'Erik' });
  });

  it('handles marker on first name', async () => {
    expect(parsePreferredName('Erik* Johan')).toEqual({ given_name: 'Erik Johan', preferred_name: 'Erik' });
  });

  it('handles marker on middle name', async () => {
    expect(parsePreferredName('Anna Lisa* Maria')).toEqual({ given_name: 'Anna Lisa Maria', preferred_name: 'Lisa' });
  });

  it('returns null preferred_name when no marker', async () => {
    expect(parsePreferredName('Johan Erik')).toEqual({ given_name: 'Johan Erik', preferred_name: null });
  });

  it('handles null input', async () => {
    expect(parsePreferredName(null)).toEqual({ given_name: null, preferred_name: null });
  });

  it('handles undefined input', async () => {
    expect(parsePreferredName(undefined)).toEqual({ given_name: null, preferred_name: null });
  });

  it('handles single name with marker', async () => {
    expect(parsePreferredName('Erik*')).toEqual({ given_name: 'Erik', preferred_name: 'Erik' });
  });
});

describe('preferred name marker integration', async () => {
  it('createPerson parses * marker into preferred_name', async () => {
    const person = await createPerson(db, { given_name: 'Johan Erik*', surname: 'Svensson' });
    const names = await getPersonNames(db, person.id);
    expect(names[0].given_name).toBe('Johan Erik');
    expect(names[0].preferred_name).toBe('Erik');
  });

  it('addPersonName parses * marker into preferred_name', async () => {
    const person = await createPerson(db, { given_name: 'A', surname: 'B' });
    const name = await addPersonName(db, person.id, { given_name: 'Anna Lisa*', surname: 'Karlsson' });
    expect(name.given_name).toBe('Anna Lisa');
    expect(name.preferred_name).toBe('Lisa');
  });

  it('addPersonName respects explicit preferred_name over marker', async () => {
    const person = await createPerson(db, { given_name: 'A', surname: 'B' });
    const name = await addPersonName(db, person.id, { given_name: 'Anna Lisa*', surname: 'K', preferred_name: 'Anna' });
    expect(name.given_name).toBe('Anna Lisa');
    expect(name.preferred_name).toBe('Anna');
  });

  it('updatePersonName parses * marker into preferred_name', async () => {
    const person = await createPerson(db, { given_name: 'Johan', surname: 'S' });
    const names = await getPersonNames(db, person.id);
    const updated = await updatePersonName(db, names[0].id, { given_name: 'Johan Erik*' });
    expect(updated!.given_name).toBe('Johan Erik');
    expect(updated!.preferred_name).toBe('Erik');
  });
});

describe('getPersonDisplayNames', async () => {
  it('returns empty map for empty ids', async () => {
    const map = await getPersonDisplayNames(db, []);
    expect(map.size).toBe(0);
  });

  it('returns display names for multiple persons', async () => {
    const p1 = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const p2 = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });

    const map = await getPersonDisplayNames(db, [p1.id, p2.id]);
    expect(map.size).toBe(2);
    expect(map.get(p1.id)).toBe('Erik Svensson');
    expect(map.get(p2.id)).toBe('Anna Berg');
  });

  it('returns ? for person with no name', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const map = await getPersonDisplayNames(db, [p.id]);
    // Person has no names, so not in query result
    expect(map.has(p.id)).toBe(false);
  });

  it('uses displayed name (newest by date / highest sort_order)', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });

    // Newest (highest sort_order) wins when no dates are set.
    const map = await getPersonDisplayNames(db, [p.id]);
    expect(map.get(p.id)).toBe('Anna Ahnstedt');
  });
});

describe('displayed name rule (Bengt 2026-04-29)', async () => {
  it('birth-only person → birth name displayed', async () => {
    const p = await createPerson(db, { given_name: 'Erik', surname: 'Andersson' });
    const list = await listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Andersson');
  });

  it('birth + later married → married displayed (newest sort_order wins ties)', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });
    const list = await listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Ahnstedt');
  });

  it('birth + married + name_change → name_change displayed', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Ahnstedt', name_type: 'married' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Berg', name_type: 'name_change' });
    const list = await listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Berg');
  });

  it('explicit date_from on married overrides sort_order', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Older', name_type: 'married', date_from: '1850-01-01' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Newer', name_type: 'married', date_from: '1900-01-01' });
    // Insert a third (no date) with the highest sort_order — should NOT win
    // because dated entries always rank above undated ones.
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Undated', name_type: 'name_change' });
    const list = await listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Newer');
  });

  it('birth name effective date = birth event date_value (overrides stored date_from)', async () => {
    const p = await createPerson(db, { given_name: 'Karl', surname: 'Birth' });
    // Birth event sets effective date_from on the birth name
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1900-05-01', date_type: 'exact' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    // Married name dated AFTER birth → should win
    await addPersonName(db, p.id, { given_name: 'Karl', surname: 'AfterBirth', name_type: 'married', date_from: '1925-01-01' });
    const list = await listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('AfterBirth');
  });

  it('name dated BEFORE birth event → birth still displayed', async () => {
    const p = await createPerson(db, { given_name: 'Karl', surname: 'Birth' });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1900-05-01', date_type: 'exact' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    await addPersonName(db, p.id, { given_name: 'Karl', surname: 'Pre1900', name_type: 'married', date_from: '1850-01-01' });
    const list = await listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Birth');
  });

  it('reordering with date inversions — dated names always rank by date, not sort_order', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Nord' });
    // Add name with high sort_order but earlier date
    const older = await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Older', name_type: 'married', date_from: '1850-01-01' });
    const newer = await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Newer', name_type: 'married', date_from: '1900-01-01' });
    // Manually invert sort_order so 'Older' has higher sort_order than 'Newer'
    await updatePersonName(db, older.id, {});  // no-op — but we want to swap sort_orders
    db.prepare('UPDATE person_names SET sort_order = ? WHERE id = ?').run([99, older.id]);
    db.prepare('UPDATE person_names SET sort_order = ? WHERE id = ?').run([1, newer.id]);
    // 'Newer' still wins because date_from beats sort_order
    const list = await listPersons(db);
    const found = list.find(r => r.id === p.id)!;
    expect(found.surname).toBe('Newer');
  });
});

describe('listPersonsPage with places', async () => {
  it('includes birth and death place names', async () => {
    const p = await createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
    const birthPlace = await createPlace(db, { name: 'Stockholm' });
    const deathPlace = await createPlace(db, { name: 'Göteborg' });
    const birth = await createEvent(db, { event_type: 'birth', date_original: '1900-01-01', place_id: birthPlace.id });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const death = await createEvent(db, { event_type: 'death', date_original: '1980-06-15', place_id: deathPlace.id });
    await addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const result = await listPersonsPage(db, 100, 0);
    const row = result.find(r => r.id === p.id)!;
    expect(row.birth_place).toBe('Stockholm');
    expect(row.death_place).toBe('Göteborg');
    expect(row.birth_date).toBe('1900-01-01');
    expect(row.death_date).toBe('1980-06-15');
  });

  it('listUnsourcedPersonsPage includes birth/death place names', async () => {
    const p = await createPerson(db, { given_name: 'Unsourced', surname: 'WithPlace' });
    const place = await createPlace(db, { name: 'Malmö' });
    const birth = await createEvent(db, { event_type: 'birth', date_original: '1850-03-20', place_id: place.id });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });

    const result = await listUnsourcedPersonsPage(db, 100, 0);
    const row = result.find(r => r.id === p.id)!;
    expect(row.birth_place).toBe('Malmö');
    expect(row.birth_date).toBe('1850-03-20');
  });
});

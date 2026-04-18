import { describe, it, expect, beforeEach } from 'vitest';
import { seedFamilyWorkflow, clearTestData } from '../../src/mcp/tools/dev/seed';
import * as groupApi from '../../src/api/groups';
import * as personApi from '../../src/api/persons';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

describe('seedFamilyWorkflow', () => {
  it('creates expected number of persons with default args (generations=2, children=2)', () => {
    // default: focal + spouse + 2 children + father + mother = 6
    const result = seedFamilyWorkflow(db);
    expect(result.focal_person_id).toBeTruthy();
    expect(result.person_ids).toHaveLength(6);
  });

  it('creates correct person count for generations=1', () => {
    // focal + spouse + 2 children = 4
    const result = seedFamilyWorkflow(db, { generations: 1, children_per_family: 2 });
    expect(result.person_ids).toHaveLength(4);
  });

  it('creates correct person count for generations=3', () => {
    // focal + spouse + 2 children + father + mother + 4 grandparents = 10
    const result = seedFamilyWorkflow(db, { generations: 3, children_per_family: 2 });
    expect(result.person_ids).toHaveLength(10);
  });

  it('respects children_per_family', () => {
    // focal + spouse + 3 children + father + mother = 7
    const result = seedFamilyWorkflow(db, { generations: 2, children_per_family: 3 });
    expect(result.person_ids).toHaveLength(7);
  });

  it('adds all seeded persons to __test__ group', () => {
    const result = seedFamilyWorkflow(db);
    const groups = groupApi.listGroups(db);
    const testGroup = groups.find(g => g.name === '__test__');
    expect(testGroup).toBeTruthy();
    const members = groupApi.getGroupMembers(db, testGroup!.id);
    const memberIds = members.map(m => m.person_id);
    for (const id of result.person_ids) {
      expect(memberIds).toContain(id);
    }
  });

  it('creates __test__ group only once when called twice', () => {
    seedFamilyWorkflow(db, { generations: 1, children_per_family: 1 });
    seedFamilyWorkflow(db, { generations: 1, children_per_family: 1 });
    const groups = groupApi.listGroups(db);
    const testGroups = groups.filter(g => g.name === '__test__');
    expect(testGroups).toHaveLength(1);
  });

  it('focal person has a name', () => {
    const result = seedFamilyWorkflow(db);
    const names = personApi.getPersonNames(db, result.focal_person_id);
    expect(names.length).toBeGreaterThan(0);
    expect(names[0].given_name).toBeTruthy();
    expect(names[0].surname).toBeTruthy();
  });
});

describe('clearTestData', () => {
  it('removes all seeded persons and the group', () => {
    seedFamilyWorkflow(db);
    const beforePersons = personApi.listPersons(db);
    expect(beforePersons.length).toBeGreaterThan(0);

    const result = clearTestData(db);
    expect(result.deleted_count).toBe(beforePersons.length);

    const afterPersons = personApi.listPersons(db);
    expect(afterPersons).toHaveLength(0);

    const groups = groupApi.listGroups(db);
    expect(groups.find(g => g.name === '__test__')).toBeUndefined();
  });

  it('returns deleted_count=0 when no __test__ group exists', () => {
    const result = clearTestData(db);
    expect(result.deleted_count).toBe(0);
  });

  it('only deletes persons in __test__ group, not others', () => {
    // Create a non-test person
    personApi.createPerson(db, { given_name: 'Olle', surname: 'Testsson' });
    seedFamilyWorkflow(db, { generations: 1, children_per_family: 1 });

    clearTestData(db);

    const remaining = personApi.listPersons(db);
    // Only Olle should remain
    expect(remaining).toHaveLength(1);
    expect(remaining[0].given_name).toBe('Olle');
  });
});

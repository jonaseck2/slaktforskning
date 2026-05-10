import { describe, it, expect, beforeEach } from 'vitest';
import { seedFamilyWorkflow, clearTestData } from '../../src/mcp/tools/dev/seed';
import * as groupApi from '../../src/api/groups';
import * as personApi from '../../src/api/persons';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  db = await createTestDb();
});

describe('seedFamilyWorkflow', async () => {
  it('creates expected number of persons with default args (generations=2, children=2)', async () => {
    // default: focal + spouse + 2 children + father + mother = 6
    const result = await seedFamilyWorkflow(db);
    expect(result.focal_person_id).toBeTruthy();
    expect(result.person_ids).toHaveLength(6);
  });

  it('creates correct person count for generations=1', async () => {
    // focal + spouse + 2 children = 4
    const result = await seedFamilyWorkflow(db, { generations: 1, children_per_family: 2 });
    expect(result.person_ids).toHaveLength(4);
  });

  it('creates correct person count for generations=3', async () => {
    // focal + spouse + 2 children + father + mother + 4 grandparents = 10
    const result = await seedFamilyWorkflow(db, { generations: 3, children_per_family: 2 });
    expect(result.person_ids).toHaveLength(10);
  });

  it('respects children_per_family', async () => {
    // focal + spouse + 3 children + father + mother = 7
    const result = await seedFamilyWorkflow(db, { generations: 2, children_per_family: 3 });
    expect(result.person_ids).toHaveLength(7);
  });

  it('adds all seeded persons to __test__ group', async () => {
    const result = await seedFamilyWorkflow(db);
    const groups = await groupApi.listGroups(db);
    const testGroup = groups.find(g => g.name === '__test__');
    expect(testGroup).toBeTruthy();
    const links = await groupApi.getGroupLinks(db, testGroup!.id);
    const memberIds = links.filter(l => l.entity_type === 'person').map(l => l.entity_id);
    for (const id of result.person_ids) {
      expect(memberIds).toContain(id);
    }
  });

  it('creates __test__ group only once when called twice', async () => {
    await seedFamilyWorkflow(db, { generations: 1, children_per_family: 1 });
    await seedFamilyWorkflow(db, { generations: 1, children_per_family: 1 });
    const groups = await groupApi.listGroups(db);
    const testGroups = groups.filter(g => g.name === '__test__');
    expect(testGroups).toHaveLength(1);
  });

  it('focal person has a name', async () => {
    const result = await seedFamilyWorkflow(db);
    const names = await personApi.getPersonNames(db, result.focal_person_id);
    expect(names.length).toBeGreaterThan(0);
    expect(names[0].given_name).toBeTruthy();
    expect(names[0].surname).toBeTruthy();
  });
});

describe('clearTestData', async () => {
  it('removes all seeded persons and the group', async () => {
    await seedFamilyWorkflow(db);
    const beforePersons = await personApi.listPersons(db);
    expect(beforePersons.length).toBeGreaterThan(0);

    const result = await clearTestData(db);
    expect(result.deleted_count).toBe(beforePersons.length);

    const afterPersons = await personApi.listPersons(db);
    expect(afterPersons).toHaveLength(0);

    const groups = await groupApi.listGroups(db);
    expect(groups.find(g => g.name === '__test__')).toBeUndefined();
  });

  it('returns deleted_count=0 when no __test__ group exists', async () => {
    const result = await clearTestData(db);
    expect(result.deleted_count).toBe(0);
  });

  it('only deletes persons in __test__ group, not others', async () => {
    // Create a non-test person
    await personApi.createPerson(db, { given_name: 'Olle', surname: 'Testsson' });
    await seedFamilyWorkflow(db, { generations: 1, children_per_family: 1 });

    await clearTestData(db);

    const remaining = await personApi.listPersons(db);
    // Only Olle should remain
    expect(remaining).toHaveLength(1);
    expect(remaining[0].given_name).toBe('Olle');
  });
});

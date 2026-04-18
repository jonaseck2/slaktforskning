import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import {
  createGroup,
  getGroup,
  listGroups,
  updateGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  getGroupMembers,
  getGroupsForPerson,
} from '../../src/api/groups';
import { createTestDb } from './helpers';

let db: any;

beforeEach(() => {
  db = createTestDb();
});

describe('groups', () => {
  it('creates and retrieves a group', () => {
    const group = createGroup(db, { name: 'Emigrated to America' });
    expect(group.id).toBeDefined();
    expect(group.name).toBe('Emigrated to America');
    expect(group.notes).toBe('');

    const fetched = getGroup(db, group.id);
    expect(fetched?.name).toBe('Emigrated to America');
  });

  it('creates a group with notes', () => {
    const group = createGroup(db, { name: "I'm here", notes: 'Currently researching' });
    expect(group.notes).toBe('Currently researching');
  });

  it('lists groups ordered by name', () => {
    createGroup(db, { name: 'Zymurgy' });
    createGroup(db, { name: 'Alpha' });
    createGroup(db, { name: 'Middle' });
    const groups = listGroups(db);
    expect(groups.map(g => g.name)).toEqual(['Alpha', 'Middle', 'Zymurgy']);
  });

  it('updates a group', () => {
    const group = createGroup(db, { name: 'Old Name' });
    const updated = updateGroup(db, group.id, { name: 'New Name', notes: 'Updated' });
    expect(updated?.name).toBe('New Name');
    expect(updated?.notes).toBe('Updated');
  });

  it('update with no fields returns the group unchanged', () => {
    const group = createGroup(db, { name: 'Unchanged' });
    const result = updateGroup(db, group.id, {});
    expect(result?.name).toBe('Unchanged');
  });

  it('deletes a group', () => {
    const group = createGroup(db, { name: 'To Delete' });
    expect(deleteGroup(db, group.id)).toBe(true);
    expect(getGroup(db, group.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', () => {
    expect(deleteGroup(db, 'nonexistent')).toBe(false);
  });

  it('get returns null for nonexistent id', () => {
    expect(getGroup(db, 'nonexistent')).toBeNull();
  });
});

describe('group members', () => {
  it('adds and retrieves group members', () => {
    const group = createGroup(db, { name: 'Test Group' });
    const person = createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });

    const member = addGroupMember(db, group.id, person.id);
    expect(member.group_id).toBe(group.id);
    expect(member.person_id).toBe(person.id);

    const members = getGroupMembers(db, group.id);
    expect(members).toHaveLength(1);
    expect(members[0].person_id).toBe(person.id);
  });

  it('addGroupMember is idempotent (INSERT OR IGNORE)', () => {
    const group = createGroup(db, { name: 'Test Group' });
    const person = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    addGroupMember(db, group.id, person.id);
    addGroupMember(db, group.id, person.id); // duplicate — should not throw
    expect(getGroupMembers(db, group.id)).toHaveLength(1);
  });

  it('removes a group member', () => {
    const group = createGroup(db, { name: 'Test Group' });
    const person = createPerson(db, { given_name: 'Lars', surname: 'Larsson' });
    addGroupMember(db, group.id, person.id);

    expect(removeGroupMember(db, group.id, person.id)).toBe(true);
    expect(getGroupMembers(db, group.id)).toHaveLength(0);
  });

  it('removeGroupMember returns false for nonexistent link', () => {
    const group = createGroup(db, { name: 'Test Group' });
    expect(removeGroupMember(db, group.id, 'nonexistent')).toBe(false);
  });

  it('gets all groups for a person', () => {
    const g1 = createGroup(db, { name: 'Group A' });
    const g2 = createGroup(db, { name: 'Group B' });
    const person = createPerson(db, { given_name: 'Maja', surname: 'Johansson' });
    addGroupMember(db, g1.id, person.id);
    addGroupMember(db, g2.id, person.id);

    const groups = getGroupsForPerson(db, person.id);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.name).sort()).toEqual(['Group A', 'Group B']);
  });

  it('returns empty array for person with no groups', () => {
    const person = createPerson(db, { given_name: 'Solo', surname: 'Person' });
    expect(getGroupsForPerson(db, person.id)).toHaveLength(0);
  });

  it('cascades delete: removing group removes its members', () => {
    const group = createGroup(db, { name: 'Cascade Test' });
    const person = createPerson(db, { given_name: 'Karin', surname: 'Berg' });
    addGroupMember(db, group.id, person.id);

    deleteGroup(db, group.id);
    expect(getGroupMembers(db, group.id)).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createPlace } from '../../src/api/places';
import { createMedia } from '../../src/api/media';
import {
  createGroup,
  getGroup,
  listGroups,
  updateGroup,
  deleteGroup,
  addGroupLink,
  removeGroupLink,
  removeGroupLinkByEntity,
  getGroupLinks,
  getGroupsForPerson,
  getGroupsForPlace,
  getGroupsForMedia,
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

describe('group links', () => {
  it('adds and retrieves a person link', () => {
    const group = createGroup(db, { name: 'Test Group' });
    const person = createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });

    const link = addGroupLink(db, group.id, 'person', person.id);
    expect(link.group_id).toBe(group.id);
    expect(link.entity_type).toBe('person');
    expect(link.entity_id).toBe(person.id);

    const links = getGroupLinks(db, group.id);
    expect(links).toHaveLength(1);
    expect(links[0].entity_id).toBe(person.id);
  });

  it('addGroupLink is idempotent (INSERT OR IGNORE)', () => {
    const group = createGroup(db, { name: 'Test Group' });
    const person = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    addGroupLink(db, group.id, 'person', person.id);
    addGroupLink(db, group.id, 'person', person.id);
    expect(getGroupLinks(db, group.id)).toHaveLength(1);
  });

  it('supports persons, places, and media in the same group', () => {
    const group = createGroup(db, { name: 'Project Sundsvall' });
    const person = createPerson(db, { given_name: 'Lars', surname: 'Larsson' });
    const place = createPlace(db, { name: 'Sundsvall' });
    const media = createMedia(db, { title: 'Photo album cover' });

    addGroupLink(db, group.id, 'person', person.id);
    addGroupLink(db, group.id, 'place', place.id);
    addGroupLink(db, group.id, 'media', media.id);

    const links = getGroupLinks(db, group.id);
    expect(links).toHaveLength(3);
    expect(new Set(links.map(l => l.entity_type))).toEqual(new Set(['person', 'place', 'media']));
  });

  it('removes a group link by id', () => {
    const group = createGroup(db, { name: 'Test Group' });
    const person = createPerson(db, { given_name: 'Lars', surname: 'Larsson' });
    const link = addGroupLink(db, group.id, 'person', person.id);

    expect(removeGroupLink(db, link.id)).toBe(true);
    expect(getGroupLinks(db, group.id)).toHaveLength(0);
  });

  it('removes a group link by entity', () => {
    const group = createGroup(db, { name: 'Test Group' });
    const person = createPerson(db, { given_name: 'Lars', surname: 'Larsson' });
    addGroupLink(db, group.id, 'person', person.id);

    expect(removeGroupLinkByEntity(db, group.id, 'person', person.id)).toBe(true);
    expect(getGroupLinks(db, group.id)).toHaveLength(0);
  });

  it('removeGroupLinkByEntity returns false when no link exists', () => {
    const group = createGroup(db, { name: 'Test Group' });
    expect(removeGroupLinkByEntity(db, group.id, 'person', 'nonexistent')).toBe(false);
  });

  it('gets all groups for a person', () => {
    const g1 = createGroup(db, { name: 'Group A' });
    const g2 = createGroup(db, { name: 'Group B' });
    const person = createPerson(db, { given_name: 'Maja', surname: 'Johansson' });
    addGroupLink(db, g1.id, 'person', person.id);
    addGroupLink(db, g2.id, 'person', person.id);

    const groups = getGroupsForPerson(db, person.id);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.name).sort()).toEqual(['Group A', 'Group B']);
  });

  it('gets all groups for a place', () => {
    const g = createGroup(db, { name: 'Norrland sites' });
    const place = createPlace(db, { name: 'Härnösand' });
    addGroupLink(db, g.id, 'place', place.id);

    const groups = getGroupsForPlace(db, place.id);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Norrland sites');
  });

  it('gets all groups for a media item', () => {
    const g = createGroup(db, { name: 'Family album' });
    const m = createMedia(db, { title: 'Wedding photo' });
    addGroupLink(db, g.id, 'media', m.id);

    const groups = getGroupsForMedia(db, m.id);
    expect(groups).toHaveLength(1);
  });

  it('returns empty array for person with no groups', () => {
    const person = createPerson(db, { given_name: 'Solo', surname: 'Person' });
    expect(getGroupsForPerson(db, person.id)).toHaveLength(0);
  });

  it('cascades delete: removing group removes its links', () => {
    const group = createGroup(db, { name: 'Cascade Test' });
    const person = createPerson(db, { given_name: 'Karin', surname: 'Berg' });
    addGroupLink(db, group.id, 'person', person.id);

    deleteGroup(db, group.id);
    expect(getGroupLinks(db, group.id)).toHaveLength(0);
  });
});

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

beforeEach(async () => {
  db = await createTestDb();
});

describe('groups', async () => {
  it('creates and retrieves a group', async () => {
    const group = await createGroup(db, { name: 'Emigrated to America' });
    expect(group.id).toBeDefined();
    expect(group.name).toBe('Emigrated to America');
    expect(group.notes).toBe('');

    const fetched = await getGroup(db, group.id);
    expect(fetched?.name).toBe('Emigrated to America');
  });

  it('creates a group with notes', async () => {
    const group = await createGroup(db, { name: "I'm here", notes: 'Currently researching' });
    expect(group.notes).toBe('Currently researching');
  });

  it('lists groups ordered by name', async () => {
    await createGroup(db, { name: 'Zymurgy' });
    await createGroup(db, { name: 'Alpha' });
    await createGroup(db, { name: 'Middle' });
    const groups = await listGroups(db);
    expect(groups.map(g => g.name)).toEqual(['Alpha', 'Middle', 'Zymurgy']);
  });

  it('updates a group', async () => {
    const group = await createGroup(db, { name: 'Old Name' });
    const updated = await updateGroup(db, group.id, { name: 'New Name', notes: 'Updated' });
    expect(updated?.name).toBe('New Name');
    expect(updated?.notes).toBe('Updated');
  });

  it('update with no fields returns the group unchanged', async () => {
    const group = await createGroup(db, { name: 'Unchanged' });
    const result = await updateGroup(db, group.id, {});
    expect(result?.name).toBe('Unchanged');
  });

  it('deletes a group', async () => {
    const group = await createGroup(db, { name: 'To Delete' });
    expect(await deleteGroup(db, group.id)).toBe(true);
    expect(await getGroup(db, group.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    expect(await deleteGroup(db, 'nonexistent')).toBe(false);
  });

  it('get returns null for nonexistent id', async () => {
    expect(await getGroup(db, 'nonexistent')).toBeNull();
  });
});

describe('group links', async () => {
  it('adds and retrieves a person link', async () => {
    const group = await createGroup(db, { name: 'Test Group' });
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });

    const link = await addGroupLink(db, group.id, 'person', person.id);
    expect(link.group_id).toBe(group.id);
    expect(link.entity_type).toBe('person');
    expect(link.entity_id).toBe(person.id);

    const links = await getGroupLinks(db, group.id);
    expect(links).toHaveLength(1);
    expect(links[0].entity_id).toBe(person.id);
  });

  it('addGroupLink is idempotent (INSERT OR IGNORE)', async () => {
    const group = await createGroup(db, { name: 'Test Group' });
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    await addGroupLink(db, group.id, 'person', person.id);
    await addGroupLink(db, group.id, 'person', person.id);
    expect(await getGroupLinks(db, group.id)).toHaveLength(1);
  });

  it('supports persons, places, and media in the same group', async () => {
    const group = await createGroup(db, { name: 'Project Sundsvall' });
    const person = await createPerson(db, { given_name: 'Lars', surname: 'Larsson' });
    const place = await createPlace(db, { name: 'Sundsvall' });
    const media = await createMedia(db, { title: 'Photo album cover' });

    await addGroupLink(db, group.id, 'person', person.id);
    await addGroupLink(db, group.id, 'place', place.id);
    await addGroupLink(db, group.id, 'media', media.id);

    const links = await getGroupLinks(db, group.id);
    expect(links).toHaveLength(3);
    expect(new Set(links.map(l => l.entity_type))).toEqual(new Set(['person', 'place', 'media']));
  });

  it('removes a group link by id', async () => {
    const group = await createGroup(db, { name: 'Test Group' });
    const person = await createPerson(db, { given_name: 'Lars', surname: 'Larsson' });
    const link = await addGroupLink(db, group.id, 'person', person.id);

    expect(await removeGroupLink(db, link.id)).toBe(true);
    expect(await getGroupLinks(db, group.id)).toHaveLength(0);
  });

  it('removes a group link by entity', async () => {
    const group = await createGroup(db, { name: 'Test Group' });
    const person = await createPerson(db, { given_name: 'Lars', surname: 'Larsson' });
    await addGroupLink(db, group.id, 'person', person.id);

    expect(await removeGroupLinkByEntity(db, group.id, 'person', person.id)).toBe(true);
    expect(await getGroupLinks(db, group.id)).toHaveLength(0);
  });

  it('removeGroupLinkByEntity returns false when no link exists', async () => {
    const group = await createGroup(db, { name: 'Test Group' });
    expect(await removeGroupLinkByEntity(db, group.id, 'person', 'nonexistent')).toBe(false);
  });

  it('gets all groups for a person', async () => {
    const g1 = await createGroup(db, { name: 'Group A' });
    const g2 = await createGroup(db, { name: 'Group B' });
    const person = await createPerson(db, { given_name: 'Maja', surname: 'Johansson' });
    await addGroupLink(db, g1.id, 'person', person.id);
    await addGroupLink(db, g2.id, 'person', person.id);

    const groups = await getGroupsForPerson(db, person.id);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.name).sort()).toEqual(['Group A', 'Group B']);
  });

  it('gets all groups for a place', async () => {
    const g = await createGroup(db, { name: 'Norrland sites' });
    const place = await createPlace(db, { name: 'Härnösand' });
    await addGroupLink(db, g.id, 'place', place.id);

    const groups = await getGroupsForPlace(db, place.id);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Norrland sites');
  });

  it('gets all groups for a media item', async () => {
    const g = await createGroup(db, { name: 'Family album' });
    const m = await createMedia(db, { title: 'Wedding photo' });
    await addGroupLink(db, g.id, 'media', m.id);

    const groups = await getGroupsForMedia(db, m.id);
    expect(groups).toHaveLength(1);
  });

  it('returns empty array for person with no groups', async () => {
    const person = await createPerson(db, { given_name: 'Solo', surname: 'Person' });
    expect(await getGroupsForPerson(db, person.id)).toHaveLength(0);
  });

  it('cascades delete: removing group removes its links', async () => {
    const group = await createGroup(db, { name: 'Cascade Test' });
    const person = await createPerson(db, { given_name: 'Karin', surname: 'Berg' });
    await addGroupLink(db, group.id, 'person', person.id);

    await deleteGroup(db, group.id);
    expect(await getGroupLinks(db, group.id)).toHaveLength(0);
  });
});

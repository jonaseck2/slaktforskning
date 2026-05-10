import * as groups from '../../api/groups';
import { defineChannel } from './registry';

defineChannel({
  name: 'groups:list',
  thread: 'worker',
  handler: async (db) => await groups.listGroups(db),
});

defineChannel({
  name: 'groups:get',
  thread: 'worker',
  handler: async (db, id: string) => await groups.getGroup(db, id),
});

defineChannel({
  name: 'groups:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof groups.createGroup>[1]) => await groups.createGroup(db, data),
});

defineChannel({
  name: 'groups:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof groups.updateGroup>[2]) => await groups.updateGroup(db, id, data),
});

defineChannel({
  name: 'groups:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => await groups.deleteGroup(db, id),
});

defineChannel({
  name: 'groups:addLink',
  thread: 'worker',
  mutating: true,
  handler: async (db, groupId: string, entityType: Parameters<typeof groups.addGroupLink>[2], entityId: string) =>
    await groups.addGroupLink(db, groupId, entityType, entityId),
});

defineChannel({
  name: 'groups:removeLink',
  thread: 'worker',
  mutating: true,
  handler: async (db, linkId: string) => await groups.removeGroupLink(db, linkId),
});

defineChannel({
  name: 'groups:removeLinkByEntity',
  thread: 'worker',
  mutating: true,
  handler: async (db, groupId: string, entityType: Parameters<typeof groups.removeGroupLinkByEntity>[2], entityId: string) =>
    await groups.removeGroupLinkByEntity(db, groupId, entityType, entityId),
});

defineChannel({
  name: 'groups:getLinks',
  thread: 'worker',
  handler: async (db, groupId: string) => await groups.getGroupLinks(db, groupId),
});

defineChannel({
  name: 'groups:forPerson',
  thread: 'worker',
  handler: async (db, personId: string) => await groups.getGroupsForPerson(db, personId),
});

defineChannel({
  name: 'groups:forPlace',
  thread: 'worker',
  handler: async (db, placeId: string) => await groups.getGroupsForPlace(db, placeId),
});

defineChannel({
  name: 'groups:forMedia',
  thread: 'worker',
  handler: async (db, mediaId: string) => await groups.getGroupsForMedia(db, mediaId),
});

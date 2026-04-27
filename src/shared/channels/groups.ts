import * as groups from '../../api/groups';
import { defineChannel } from './registry';

defineChannel({
  name: 'groups:list',
  thread: 'worker',
  handler: (db) => groups.listGroups(db),
});

defineChannel({
  name: 'groups:get',
  thread: 'worker',
  handler: (db, id: string) => groups.getGroup(db, id),
});

defineChannel({
  name: 'groups:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof groups.createGroup>[1]) => groups.createGroup(db, data),
});

defineChannel({
  name: 'groups:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof groups.updateGroup>[2]) => groups.updateGroup(db, id, data),
});

defineChannel({
  name: 'groups:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => groups.deleteGroup(db, id),
});

defineChannel({
  name: 'groups:addLink',
  thread: 'worker',
  mutating: true,
  handler: (db, groupId: string, entityType: Parameters<typeof groups.addGroupLink>[2], entityId: string) =>
    groups.addGroupLink(db, groupId, entityType, entityId),
});

defineChannel({
  name: 'groups:removeLink',
  thread: 'worker',
  mutating: true,
  handler: (db, linkId: string) => groups.removeGroupLink(db, linkId),
});

defineChannel({
  name: 'groups:removeLinkByEntity',
  thread: 'worker',
  mutating: true,
  handler: (db, groupId: string, entityType: Parameters<typeof groups.removeGroupLinkByEntity>[2], entityId: string) =>
    groups.removeGroupLinkByEntity(db, groupId, entityType, entityId),
});

defineChannel({
  name: 'groups:getLinks',
  thread: 'worker',
  handler: (db, groupId: string) => groups.getGroupLinks(db, groupId),
});

defineChannel({
  name: 'groups:forPerson',
  thread: 'worker',
  handler: (db, personId: string) => groups.getGroupsForPerson(db, personId),
});

defineChannel({
  name: 'groups:forPlace',
  thread: 'worker',
  handler: (db, placeId: string) => groups.getGroupsForPlace(db, placeId),
});

defineChannel({
  name: 'groups:forMedia',
  thread: 'worker',
  handler: (db, mediaId: string) => groups.getGroupsForMedia(db, mediaId),
});

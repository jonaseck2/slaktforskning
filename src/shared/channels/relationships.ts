import * as relationships from '../../api/relationships';
import * as uw from '../../api/undo_wrappers';
import { defineChannel } from './registry';

defineChannel({
  name: 'relationships:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof relationships.createRelationship>[1]) =>
    uw.createRelationshipUndo(db, data),
});

defineChannel({
  name: 'relationships:get',
  thread: 'worker',
  handler: (db, id: string) => relationships.getRelationship(db, id),
});

defineChannel({
  name: 'relationships:list',
  thread: 'worker',
  handler: (db) => relationships.listRelationships(db),
});

defineChannel({
  name: 'relationships:listPage',
  thread: 'worker',
  handler: (db, limit: number, offset: number) => ({
    relationships: relationships.listRelationshipsPage(db, limit, offset),
    total: relationships.countRelationships(db),
  }),
});

defineChannel({
  name: 'relationships:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof relationships.updateRelationship>[2]) =>
    uw.updateRelationshipUndo(db, id, data),
});

defineChannel({
  name: 'relationships:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => uw.deleteRelationshipUndo(db, id),
});

defineChannel({
  name: 'relationships:getForPerson',
  thread: 'worker',
  handler: (db, personId: string) => relationships.getRelationshipsOfPerson(db, personId),
});

defineChannel({
  name: 'relationships:search',
  thread: 'worker',
  handler: (db, query: string) => relationships.searchRelationships(db, query),
});

defineChannel({
  name: 'eventParticipants:add',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof relationships.addEventParticipant>[1]) =>
    uw.addEventParticipantUndo(db, data),
});

defineChannel({
  name: 'eventParticipants:getForEvent',
  thread: 'worker',
  handler: (db, eventId: string) => relationships.getEventParticipants(db, eventId),
});

defineChannel({
  name: 'eventParticipants:remove',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => uw.removeEventParticipantUndo(db, id),
});

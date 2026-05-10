import * as relationships from '../../api/relationships';
import * as uw from '../../api/undo_wrappers';
import { defineChannel } from './registry';

defineChannel({
  name: 'relationships:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof relationships.createRelationship>[1]) =>
    uw.createRelationshipUndo(db, data),
});

defineChannel({
  name: 'relationships:get',
  thread: 'worker',
  handler: async (db, id: string) => await relationships.getRelationship(db, id),
});

defineChannel({
  name: 'relationships:list',
  thread: 'worker',
  handler: async (db) => await relationships.listRelationships(db),
});

defineChannel({
  name: 'relationships:listPage',
  thread: 'worker',
  handler: async (db, limit: number, offset: number) => ({
    relationships: await relationships.listRelationshipsPage(db, limit, offset),
    total: await relationships.countRelationships(db),
  }),
});

defineChannel({
  name: 'relationships:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof relationships.updateRelationship>[2]) =>
    uw.updateRelationshipUndo(db, id, data),
});

defineChannel({
  name: 'relationships:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => uw.deleteRelationshipUndo(db, id),
});

defineChannel({
  name: 'relationships:getForPerson',
  thread: 'worker',
  handler: async (db, personId: string) => await relationships.getRelationshipsOfPerson(db, personId),
});

defineChannel({
  name: 'relationships:search',
  thread: 'worker',
  handler: async (db, query: string) => await relationships.searchRelationships(db, query),
});

defineChannel({
  name: 'eventParticipants:add',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof relationships.addEventParticipant>[1]) =>
    uw.addEventParticipantUndo(db, data),
});

defineChannel({
  name: 'eventParticipants:getForEvent',
  thread: 'worker',
  handler: async (db, eventId: string) => await relationships.getEventParticipants(db, eventId),
});

defineChannel({
  name: 'eventParticipants:remove',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => uw.removeEventParticipantUndo(db, id),
});

import * as events from '../../api/events';
import * as uw from '../../api/undo_wrappers';
import { defineChannel } from './registry';

defineChannel({
  name: 'events:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof events.createEvent>[1]) =>
    uw.createEventUndo(db, data),
});

defineChannel({
  name: 'events:get',
  thread: 'worker',
  handler: async (db, id: string) => await events.getEvent(db, id),
});

defineChannel({
  name: 'events:forPerson',
  thread: 'worker',
  handler: async (db, personId: string) => await events.getEventsForPerson(db, personId),
});

defineChannel({
  name: 'events:forRelationship',
  thread: 'worker',
  handler: async (db, relationshipId: string) => await events.getEventsForRelationship(db, relationshipId),
});

defineChannel({
  name: 'events:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof events.updateEvent>[2]) =>
    uw.updateEventUndo(db, id, data),
});

defineChannel({
  name: 'events:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => uw.deleteEventUndo(db, id),
});

defineChannel({
  name: 'events:forPlace',
  thread: 'worker',
  handler: async (db, placeId: string) => await events.getEventsForPlace(db, placeId),
});

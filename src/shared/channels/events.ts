import * as events from '../../api/events';
import * as uw from '../../api/undo_wrappers';
import { defineChannel } from './registry';

defineChannel({
  name: 'events:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof events.createEvent>[1]) =>
    uw.createEventUndo(db, data),
});

defineChannel({
  name: 'events:get',
  thread: 'worker',
  handler: (db, id: string) => events.getEvent(db, id),
});

defineChannel({
  name: 'events:forPerson',
  thread: 'worker',
  handler: (db, personId: string) => events.getEventsForPerson(db, personId),
});

defineChannel({
  name: 'events:forRelationship',
  thread: 'worker',
  handler: (db, relationshipId: string) => events.getEventsForRelationship(db, relationshipId),
});

defineChannel({
  name: 'events:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof events.updateEvent>[2]) =>
    uw.updateEventUndo(db, id, data),
});

defineChannel({
  name: 'events:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => uw.deleteEventUndo(db, id),
});

defineChannel({
  name: 'events:forPlace',
  thread: 'worker',
  handler: (db, placeId: string) => events.getEventsForPlace(db, placeId),
});

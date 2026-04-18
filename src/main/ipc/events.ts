import * as events from '../../api/events';
import * as uw from '../../api/undo_wrappers';
import type { WrapHandlerFn } from './wrap-handler';

export function registerEventHandlers(getDb: () => ReturnType<typeof import('../database').getDatabase>, wrapHandler: WrapHandlerFn) {
  // Events (undo-wrapped)
  wrapHandler('events:create', (data) => uw.createEventUndo(getDb(), data as Parameters<typeof events.createEvent>[1]));
  wrapHandler('events:get', (id) => events.getEvent(getDb(), id as string));
  wrapHandler('events:forPerson', (personId) => events.getEventsForPerson(getDb(), personId as string));
  wrapHandler('events:forRelationship', (relationshipId) => events.getEventsForRelationship(getDb(), relationshipId as string));
  wrapHandler('events:update', (id, data) => uw.updateEventUndo(getDb(), id as string, data as Parameters<typeof events.updateEvent>[2]));
  wrapHandler('events:delete', (id) => uw.deleteEventUndo(getDb(), id as string));
  wrapHandler('events:forPlace', (placeId) => events.getEventsForPlace(getDb(), placeId as string));
}

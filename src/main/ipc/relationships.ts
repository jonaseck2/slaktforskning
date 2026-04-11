import type { WrapHandlerFn } from './wrap-handler';
import * as relationships from '../../api/relationships';
import * as uw from '../../api/undo_wrappers';

export function registerRelationshipHandlers(getDb: () => ReturnType<typeof import('../database').getDatabase>, wrapHandler: WrapHandlerFn) {
  // Relationships (undo-wrapped)
  wrapHandler('relationships:create', (data) => uw.createRelationshipUndo(getDb(), data as Parameters<typeof relationships.createRelationship>[1]));
  wrapHandler('relationships:get', (id) => relationships.getRelationship(getDb(), id as string));
  wrapHandler('relationships:list', () => relationships.listRelationships(getDb()));
  wrapHandler('relationships:listPage', (limit, offset) => {
    const db = getDb();
    return {
      relationships: relationships.listRelationshipsPage(db, limit as number, offset as number),
      total: relationships.countRelationships(db),
    };
  });
  wrapHandler('relationships:update', (id, data) => uw.updateRelationshipUndo(getDb(), id as string, data as Parameters<typeof relationships.updateRelationship>[2]));
  wrapHandler('relationships:delete', (id) => uw.deleteRelationshipUndo(getDb(), id as string));
  wrapHandler('relationships:getForPerson', (personId) => relationships.getRelationshipsOfPerson(getDb(), personId as string));
  wrapHandler('relationships:search', (query) => relationships.searchRelationships(getDb(), query as string));

  // Event Participants (undo-wrapped)
  wrapHandler('eventParticipants:add', (data) => uw.addEventParticipantUndo(getDb(), data as Parameters<typeof relationships.addEventParticipant>[1]));
  wrapHandler('eventParticipants:getForEvent', (eventId) => relationships.getEventParticipants(getDb(), eventId as string));
  wrapHandler('eventParticipants:remove', (id) => uw.removeEventParticipantUndo(getDb(), id as string));
}

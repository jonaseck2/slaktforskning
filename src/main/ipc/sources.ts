import type { WrapHandlerFn } from './wrap-handler';
import * as sources from '../../api/sources';
import * as uw from '../../api/undo_wrappers';

export function registerSourceHandlers(getDb: () => ReturnType<typeof import('../database').getDatabase>, wrapHandler: WrapHandlerFn) {
  // Sources (undo-wrapped)
  wrapHandler('sources:create', (data) => uw.createSourceUndo(getDb(), data as Parameters<typeof sources.createSource>[1]));
  wrapHandler('sources:get', (id) => sources.getSource(getDb(), id as string));
  wrapHandler('sources:list', () => sources.listSources(getDb()));
  wrapHandler('sources:update', (id, data) => uw.updateSourceUndo(getDb(), id as string, data as Parameters<typeof sources.updateSource>[2]));
  wrapHandler('sources:delete', (id) => uw.deleteSourceUndo(getDb(), id as string));
  wrapHandler('sources:search', (query) => sources.searchSources(getDb(), query as string));

  // Citations (undo-wrapped)
  wrapHandler('citations:create', (data) => uw.createCitationUndo(getDb(), data as Parameters<typeof sources.createCitation>[1]));
  wrapHandler('citations:get', (id) => sources.getCitation(getDb(), id as string));
  wrapHandler('citations:forSource', (sourceId) => sources.getCitationsForSource(getDb(), sourceId as string));
  wrapHandler('citations:forEvent', (eventId) => sources.getCitationsForEvent(getDb(), eventId as string));
  wrapHandler('citations:forPerson', (personId) => sources.getCitationsForPerson(getDb(), personId as string));
  wrapHandler('citations:forRelationship', (relationshipId) => sources.getCitationsForRelationship(getDb(), relationshipId as string));
  wrapHandler('citations:forPlace', (placeId) => sources.getCitationsForPlace(getDb(), placeId as string));
  wrapHandler('citations:delete', (id) => uw.deleteCitationUndo(getDb(), id as string));
  wrapHandler('citations:update', (id, updates) =>
    uw.updateCitationUndo(getDb(), id as string, updates as Parameters<typeof sources.updateCitation>[2])
  );
}

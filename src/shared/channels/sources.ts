import * as sources from '../../api/sources';
import * as uw from '../../api/undo_wrappers';
import { defineChannel } from './registry';

defineChannel({
  name: 'sources:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof sources.createSource>[1]) =>
    uw.createSourceUndo(db, data),
});

defineChannel({
  name: 'sources:get',
  thread: 'worker',
  handler: async (db, id: string) => await sources.getSource(db, id),
});

defineChannel({
  name: 'sources:list',
  thread: 'worker',
  handler: async (db) => await sources.listSources(db),
});

defineChannel({
  name: 'sources:listPage',
  thread: 'worker',
  handler: async (db, limit: number, offset: number, sortBy: sources.ListSourcesSortBy, sortDir: sources.ListSourcesSortDir, query?: string) => ({
    items: await sources.listSourcesPage(db, limit, offset, sortBy, sortDir, query),
    total: await sources.countSources(db, query),
  }),
});

defineChannel({
  name: 'sources:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof sources.updateSource>[2]) =>
    uw.updateSourceUndo(db, id, data),
});

defineChannel({
  name: 'sources:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => uw.deleteSourceUndo(db, id),
});

defineChannel({
  name: 'sources:search',
  thread: 'worker',
  handler: async (db, query: string) => await sources.searchSources(db, query),
});

defineChannel({
  name: 'citations:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof sources.createCitation>[1]) =>
    uw.createCitationUndo(db, data),
});

defineChannel({
  name: 'citations:get',
  thread: 'worker',
  handler: async (db, id: string) => await sources.getCitation(db, id),
});

defineChannel({
  name: 'citations:forSource',
  thread: 'worker',
  handler: async (db, sourceId: string) => await sources.getCitationsForSource(db, sourceId),
});

defineChannel({
  name: 'citations:forEvent',
  thread: 'worker',
  handler: async (db, eventId: string) => await sources.getCitationsForEvent(db, eventId),
});

defineChannel({
  name: 'citations:forPerson',
  thread: 'worker',
  handler: async (db, personId: string) => await sources.getCitationsForPerson(db, personId),
});

defineChannel({
  name: 'citations:forRelationship',
  thread: 'worker',
  handler: async (db, relationshipId: string) => await sources.getCitationsForRelationship(db, relationshipId),
});

defineChannel({
  name: 'citations:forPlace',
  thread: 'worker',
  handler: async (db, placeId: string) => await sources.getCitationsForPlace(db, placeId),
});

defineChannel({
  name: 'citations:forPersonName',
  thread: 'worker',
  handler: async (db, personNameId: string) => await sources.getCitationsForPersonName(db, personNameId),
});

defineChannel({
  name: 'citations:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => uw.deleteCitationUndo(db, id),
});

defineChannel({
  name: 'citations:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof sources.updateCitation>[2]) =>
    uw.updateCitationUndo(db, id, data),
});

import * as places from '../../api/places';
import { defineChannel } from './registry';

defineChannel({
  name: 'places:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof places.createPlace>[1]) =>
    await places.createPlace(db, data),
});

defineChannel({
  name: 'places:get',
  thread: 'worker',
  handler: async (db, id: string) => await places.getPlace(db, id),
});

defineChannel({
  name: 'places:list',
  thread: 'worker',
  handler: async (db) => await places.listPlaces(db),
});

defineChannel({
  name: 'places:listPage',
  thread: 'worker',
  handler: async (db, limit: number, offset: number, sortBy: places.ListPlacesSortBy, sortDir: places.ListPlacesSortDir, query?: string) => ({
    items: await places.listPlacesPage(db, limit, offset, sortBy, sortDir, query),
    total: await places.countPlaces(db, query),
  }),
});

defineChannel({
  name: 'places:search',
  thread: 'worker',
  handler: async (db, query: string) => await places.searchPlaces(db, query),
});

defineChannel({
  name: 'places:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof places.updatePlace>[2]) =>
    await places.updatePlace(db, id, data),
});

defineChannel({
  name: 'places:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => await places.deletePlace(db, id),
});

defineChannel({
  name: 'places:findOrCreate',
  thread: 'worker',
  mutating: true,
  handler: async (db, name: string) => await places.findOrCreatePlace(db, name),
});

defineChannel({
  name: 'places:findOrCreateWithChain',
  thread: 'worker',
  mutating: true,
  handler: async (
    db,
    name: string,
    chain: Parameters<typeof places.findOrCreatePlaceWithChain>[2],
  ) => await places.findOrCreatePlaceWithChain(db, name, chain),
});

defineChannel({
  name: 'places:getPath',
  thread: 'worker',
  handler: async (db, id: string) => await places.getPlacePath(db, id),
});

defineChannel({
  name: 'places:getPersons',
  thread: 'worker',
  handler: async (db, placeId: string) => await places.getPersonsForPlace(db, placeId),
});

defineChannel({
  name: 'places:listChildren',
  thread: 'worker',
  handler: async (db, parentId: string | null) => await places.listPlaceChildren(db, parentId),
});

defineChannel({
  name: 'places:getAncestors',
  thread: 'worker',
  handler: async (db, id: string) => await places.getPlaceAncestors(db, id),
});

import * as places from '../../api/places';
import { defineChannel } from './registry';

defineChannel({
  name: 'places:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof places.createPlace>[1]) =>
    places.createPlace(db, data),
});

defineChannel({
  name: 'places:get',
  thread: 'worker',
  handler: (db, id: string) => places.getPlace(db, id),
});

defineChannel({
  name: 'places:list',
  thread: 'worker',
  handler: (db) => places.listPlaces(db),
});

defineChannel({
  name: 'places:listPage',
  thread: 'worker',
  handler: (db, limit: number, offset: number, sortBy: places.ListPlacesSortBy, sortDir: places.ListPlacesSortDir, query?: string) => ({
    items: places.listPlacesPage(db, limit, offset, sortBy, sortDir, query),
    total: places.countPlaces(db, query),
  }),
});

defineChannel({
  name: 'places:search',
  thread: 'worker',
  handler: (db, query: string) => places.searchPlaces(db, query),
});

defineChannel({
  name: 'places:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof places.updatePlace>[2]) =>
    places.updatePlace(db, id, data),
});

defineChannel({
  name: 'places:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => places.deletePlace(db, id),
});

defineChannel({
  name: 'places:findOrCreate',
  thread: 'worker',
  mutating: true,
  handler: (db, name: string) => places.findOrCreatePlace(db, name),
});

defineChannel({
  name: 'places:findOrCreateWithChain',
  thread: 'worker',
  mutating: true,
  handler: (
    db,
    name: string,
    chain: Parameters<typeof places.findOrCreatePlaceWithChain>[2],
  ) => places.findOrCreatePlaceWithChain(db, name, chain),
});

defineChannel({
  name: 'places:getPath',
  thread: 'worker',
  handler: (db, id: string) => places.getPlacePath(db, id),
});

defineChannel({
  name: 'places:getPersons',
  thread: 'worker',
  handler: (db, placeId: string) => places.getPersonsForPlace(db, placeId),
});

defineChannel({
  name: 'places:listChildren',
  thread: 'worker',
  handler: (db, parentId: string | null) => places.listPlaceChildren(db, parentId),
});

defineChannel({
  name: 'places:getAncestors',
  thread: 'worker',
  handler: (db, id: string) => places.getPlaceAncestors(db, id),
});

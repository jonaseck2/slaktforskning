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
  name: 'places:getPath',
  thread: 'worker',
  handler: (db, id: string) => places.getPlacePath(db, id),
});

defineChannel({
  name: 'places:getPersons',
  thread: 'worker',
  handler: (db, placeId: string) => places.getPersonsForPlace(db, placeId),
});

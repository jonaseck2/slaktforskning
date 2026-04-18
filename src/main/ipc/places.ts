import * as places from '../../api/places';
import type { WrapHandlerFn } from './wrap-handler';

export function registerPlaceHandlers(getDb: () => ReturnType<typeof import('../database').getDatabase>, wrapHandler: WrapHandlerFn) {
  wrapHandler('places:create', (data) => places.createPlace(getDb(), data as Parameters<typeof places.createPlace>[1]));
  wrapHandler('places:get', (id) => places.getPlace(getDb(), id as string));
  wrapHandler('places:list', () => places.listPlaces(getDb()));
  wrapHandler('places:search', (query) => places.searchPlaces(getDb(), query as string));
  wrapHandler('places:update', (id, data) => places.updatePlace(getDb(), id as string, data as Parameters<typeof places.updatePlace>[2]));
  wrapHandler('places:delete', (id) => places.deletePlace(getDb(), id as string));
  wrapHandler('places:findOrCreate', (name) => places.findOrCreatePlace(getDb(), name as string));
  wrapHandler('places:getPath', (id) => places.getPlacePath(getDb(), id as string));
  wrapHandler('places:getPersons', (placeId) => places.getPersonsForPlace(getDb(), placeId as string));
}

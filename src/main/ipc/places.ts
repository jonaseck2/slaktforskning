import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

export function registerPlaceHandlers(_getDb: unknown, wrapHandler: WrapHandlerFn) {
  wrapHandler('places:create', (...args) => callWorker('places:create', ...args));
  wrapHandler('places:get', (...args) => callWorker('places:get', ...args));
  wrapHandler('places:list', () => callWorker('places:list'));
  wrapHandler('places:search', (...args) => callWorker('places:search', ...args));
  wrapHandler('places:update', (...args) => callWorker('places:update', ...args));
  wrapHandler('places:delete', (...args) => callWorker('places:delete', ...args));
  wrapHandler('places:findOrCreate', (...args) => callWorker('places:findOrCreate', ...args));
  wrapHandler('places:getPath', (...args) => callWorker('places:getPath', ...args));
  wrapHandler('places:getPersons', (...args) => callWorker('places:getPersons', ...args));
}

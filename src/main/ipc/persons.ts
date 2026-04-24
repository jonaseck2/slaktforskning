import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

export function registerPersonHandlers(_getDb: unknown, wrapHandler: WrapHandlerFn) {
  wrapHandler('persons:create', (...args) => callWorker('persons:create', ...args));
  wrapHandler('persons:createWithEvent', (...args) => callWorker('persons:createWithEvent', ...args));
  wrapHandler('persons:get', (...args) => callWorker('persons:get', ...args));
  wrapHandler('persons:list', () => callWorker('persons:list'));
  wrapHandler('persons:update', (...args) => callWorker('persons:update', ...args));
  wrapHandler('persons:delete', (...args) => callWorker('persons:delete', ...args));
  wrapHandler('persons:search', (...args) => callWorker('persons:search', ...args));
  wrapHandler('persons:addName', (...args) => callWorker('persons:addName', ...args));
  wrapHandler('persons:getNames', (...args) => callWorker('persons:getNames', ...args));
  wrapHandler('persons:updateName', (...args) => callWorker('persons:updateName', ...args));
  wrapHandler('persons:deleteName', (...args) => callWorker('persons:deleteName', ...args));
  wrapHandler('persons:addIdentifier', (...args) => callWorker('persons:addIdentifier', ...args));
  wrapHandler('persons:getIdentifiers', (...args) => callWorker('persons:getIdentifiers', ...args));
  wrapHandler('persons:deleteIdentifier', (...args) => callWorker('persons:deleteIdentifier', ...args));
  wrapHandler('persons:listPage', (...args) => callWorker('persons:listPage', ...args));
  wrapHandler('persons:searchWithDetails', (...args) => callWorker('persons:searchWithDetails', ...args));
  wrapHandler('persons:listUnsourcedPage', (...args) => callWorker('persons:listUnsourcedPage', ...args));
}

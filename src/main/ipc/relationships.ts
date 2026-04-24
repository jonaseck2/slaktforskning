import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

export function registerRelationshipHandlers(_getDb: unknown, wrapHandler: WrapHandlerFn) {
  wrapHandler('relationships:create', (...args) => callWorker('relationships:create', ...args));
  wrapHandler('relationships:get', (...args) => callWorker('relationships:get', ...args));
  wrapHandler('relationships:list', () => callWorker('relationships:list'));
  wrapHandler('relationships:listPage', (...args) => callWorker('relationships:listPage', ...args));
  wrapHandler('relationships:update', (...args) => callWorker('relationships:update', ...args));
  wrapHandler('relationships:delete', (...args) => callWorker('relationships:delete', ...args));
  wrapHandler('relationships:getForPerson', (...args) => callWorker('relationships:getForPerson', ...args));
  wrapHandler('relationships:search', (...args) => callWorker('relationships:search', ...args));
  wrapHandler('eventParticipants:add', (...args) => callWorker('eventParticipants:add', ...args));
  wrapHandler('eventParticipants:getForEvent', (...args) => callWorker('eventParticipants:getForEvent', ...args));
  wrapHandler('eventParticipants:remove', (...args) => callWorker('eventParticipants:remove', ...args));
}

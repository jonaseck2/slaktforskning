import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

export function registerEventHandlers(_getDb: unknown, wrapHandler: WrapHandlerFn) {
  wrapHandler('events:create', (...args) => callWorker('events:create', ...args));
  wrapHandler('events:get', (...args) => callWorker('events:get', ...args));
  wrapHandler('events:forPerson', (...args) => callWorker('events:forPerson', ...args));
  wrapHandler('events:forRelationship', (...args) => callWorker('events:forRelationship', ...args));
  wrapHandler('events:update', (...args) => callWorker('events:update', ...args));
  wrapHandler('events:delete', (...args) => callWorker('events:delete', ...args));
  wrapHandler('events:forPlace', (...args) => callWorker('events:forPlace', ...args));
}

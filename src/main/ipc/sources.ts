import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

export function registerSourceHandlers(_getDb: unknown, wrapHandler: WrapHandlerFn) {
  wrapHandler('sources:create', (...args) => callWorker('sources:create', ...args));
  wrapHandler('sources:get', (...args) => callWorker('sources:get', ...args));
  wrapHandler('sources:list', () => callWorker('sources:list'));
  wrapHandler('sources:update', (...args) => callWorker('sources:update', ...args));
  wrapHandler('sources:delete', (...args) => callWorker('sources:delete', ...args));
  wrapHandler('sources:search', (...args) => callWorker('sources:search', ...args));
  wrapHandler('citations:create', (...args) => callWorker('citations:create', ...args));
  wrapHandler('citations:get', (...args) => callWorker('citations:get', ...args));
  wrapHandler('citations:forSource', (...args) => callWorker('citations:forSource', ...args));
  wrapHandler('citations:forEvent', (...args) => callWorker('citations:forEvent', ...args));
  wrapHandler('citations:forPerson', (...args) => callWorker('citations:forPerson', ...args));
  wrapHandler('citations:forRelationship', (...args) => callWorker('citations:forRelationship', ...args));
  wrapHandler('citations:forPlace', (...args) => callWorker('citations:forPlace', ...args));
  wrapHandler('citations:delete', (...args) => callWorker('citations:delete', ...args));
  wrapHandler('citations:update', (...args) => callWorker('citations:update', ...args));
}

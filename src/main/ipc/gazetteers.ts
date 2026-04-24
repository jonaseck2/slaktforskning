import { getAllGazetteers } from '../../api/place-gazetteers/bundled';
import * as gazetteers from '../../api/gazetteers';
import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

export function registerGazetteerHandlers(
  _getDb: unknown,
  wrapHandler: WrapHandlerFn,
) {
  // DB-backed imported gazetteers → worker
  wrapHandler('gazetteers:list', () => callWorker('gazetteers:list'));
  wrapHandler('gazetteers:import', (...args) => callWorker('gazetteers:import', ...args));
  wrapHandler('gazetteers:export', (...args) => callWorker('gazetteers:export', ...args));
  wrapHandler('gazetteers:delete', (...args) => callWorker('gazetteers:delete', ...args));
  wrapHandler('gazetteers:getImported', () => callWorker('gazetteers:getImported'));

  // Pure functions — no DB, stay on main thread
  wrapHandler('gazetteers:getSchema', () => gazetteers.getGazetteerSchema());
  wrapHandler('gazetteers:getBundled', () => getAllGazetteers());
}

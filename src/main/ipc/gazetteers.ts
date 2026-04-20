import * as gazetteers from '../../api/gazetteers';
import { getAllGazetteers } from '../../api/place-gazetteers/bundled';
import type { WrapHandlerFn } from './wrap-handler';

export function registerGazetteerHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  wrapHandler: WrapHandlerFn,
) {
  wrapHandler('gazetteers:list', () => gazetteers.listGazetteers(getDb()));
  wrapHandler('gazetteers:import', (json) => gazetteers.importGazetteer(getDb(), json as string));
  wrapHandler('gazetteers:export', (id) => gazetteers.exportGazetteer(getDb(), id as string));
  wrapHandler('gazetteers:delete', (id) => gazetteers.deleteGazetteer(getDb(), id as string));
  wrapHandler('gazetteers:getImported', () => gazetteers.getImportedGazetteers(getDb()));
  wrapHandler('gazetteers:getSchema', () => gazetteers.getGazetteerSchema());
  wrapHandler('gazetteers:getBundled', () => getAllGazetteers());
}

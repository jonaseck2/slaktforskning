import { wrapHandler } from './wrap-handler';
import { getDatabase, getCurrentDatabasePath, switchDatabase } from '../database';
import { loadSettings } from '../settings';
import { registerPersonHandlers } from './persons';
import { registerRelationshipHandlers } from './relationships';
import { registerEventHandlers } from './events';
import { registerSourceHandlers } from './sources';
import { registerPlaceHandlers } from './places';
import { registerImportHandlers } from './import';
import { registerDatabaseHandlers } from './database';
import { registerMediaHandlers } from './media';
import { registerUtilityHandlers } from './utility';
import { registerGazetteerHandlers } from './gazetteers';

export function registerIpcHandlers(): void {
  const getDb = () => getDatabase();

  registerPersonHandlers(getDb, wrapHandler);
  registerRelationshipHandlers(getDb, wrapHandler);
  registerEventHandlers(getDb, wrapHandler);
  registerSourceHandlers(getDb, wrapHandler);
  registerPlaceHandlers(getDb, wrapHandler);
  registerImportHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerDatabaseHandlers(getDb, getCurrentDatabasePath, switchDatabase, loadSettings, wrapHandler);
  registerMediaHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerUtilityHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerGazetteerHandlers(getDb, wrapHandler);
}

import { getDatabase, getCurrentDatabasePath, switchDatabase } from '../database';
import { loadSettings } from '../settings';
import { wrapHandler } from './wrap-handler';
import { startWorker } from './worker-client';
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
import { registerWebsiteExportHandlers } from './website-export';

export function registerIpcHandlers(): void {
  // Start the DB worker — fires and forgets; callWorker queues until worker signals ready
  const dbPath = getCurrentDatabasePath();
  startWorker(dbPath);

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
  registerWebsiteExportHandlers();
}

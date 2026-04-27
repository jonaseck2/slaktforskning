import { getDatabase, getCurrentDatabasePath, switchDatabase } from '../database';
import { loadSettings } from '../settings';
import { channelRegistry } from '../../shared/channels';
import { wrapHandler } from './wrap-handler';
import { startWorker, callWorker } from './worker-client';
import { registerRelationshipHandlers } from './relationships';
import { registerSourceHandlers } from './sources';
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

  // Register channels from the registry (migrated domains)
  for (const ch of Object.values(channelRegistry)) {
    if (ch.thread === 'worker') {
      wrapHandler(ch.name, (...args: unknown[]) => callWorker(ch.name, ...args));
    } else {
      wrapHandler(ch.name, (...args: unknown[]) => ch.handler(...args));
    }
  }

  registerRelationshipHandlers(getDb, wrapHandler);
  registerSourceHandlers(getDb, wrapHandler);
  registerImportHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerDatabaseHandlers(getDb, getCurrentDatabasePath, switchDatabase, loadSettings, wrapHandler);
  registerMediaHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerUtilityHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerGazetteerHandlers(getDb, wrapHandler);
  registerWebsiteExportHandlers();
}

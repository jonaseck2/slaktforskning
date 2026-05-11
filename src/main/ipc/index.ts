import { getDatabase, getCurrentDatabasePath, switchDatabase } from '../database';
import { loadSettings } from '../settings';
import { channelRegistry } from '../../shared/channels';
import { wrapHandler } from './wrap-handler';
import { startWorker, callWorker } from './worker-client';
import { registerImportHandlers } from './import';
import { registerDatabaseHandlers } from './database';
import { registerMediaHandlers } from './media';
import { registerDuplicatesHandlers } from './duplicates';
import { registerUtilityHandlers } from './main-only';
import { registerWebsiteExportHandlers } from './website-export';
import { registerOnboardingHandlers } from './onboarding';

export async function registerIpcHandlers(): Promise<void> {
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

  registerImportHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerDatabaseHandlers(getDb, getCurrentDatabasePath, switchDatabase, loadSettings, wrapHandler);
  registerMediaHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerDuplicatesHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerUtilityHandlers(getDb, getCurrentDatabasePath, wrapHandler);
  registerWebsiteExportHandlers();
  registerOnboardingHandlers(wrapHandler);
}

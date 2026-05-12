import * as gazetteers from '../../api/gazetteers';
import { getAllGazetteers } from '../../api/place-gazetteers/bundled';
import { defineChannel } from './registry';

// ── DB-backed imported gazetteers (worker) ────────────────────────────────────

defineChannel({
  name: 'gazetteers:list',
  thread: 'worker',
  handler: async (db) => await gazetteers.listGazetteers(db),
});

defineChannel({
  name: 'gazetteers:import',
  thread: 'worker',
  mutating: true,
  handler: async (db, json: string) => await gazetteers.importGazetteer(db, json),
});

defineChannel({
  name: 'gazetteers:export',
  thread: 'worker',
  handler: async (db, id: string) => await gazetteers.exportGazetteer(db, id),
});

defineChannel({
  name: 'gazetteers:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => await gazetteers.deleteGazetteer(db, id),
});

defineChannel({
  name: 'gazetteers:getImported',
  thread: 'worker',
  handler: async (db) => await gazetteers.getImportedGazetteers(db),
});

// ── Pure functions — no DB, main thread ───────────────────────────────────────

defineChannel({
  name: 'gazetteers:getSchema',
  thread: 'main',
  handler: async () => await gazetteers.getGazetteerSchema(),
});

defineChannel({
  name: 'gazetteers:getBundled',
  thread: 'main',
  handler: async () => await getAllGazetteers(),
});

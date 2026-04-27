import * as gazetteers from '../../api/gazetteers';
import { getAllGazetteers } from '../../api/place-gazetteers/bundled';
import { defineChannel } from './registry';

// ── DB-backed imported gazetteers (worker) ────────────────────────────────────

defineChannel({
  name: 'gazetteers:list',
  thread: 'worker',
  handler: (db) => gazetteers.listGazetteers(db),
});

defineChannel({
  name: 'gazetteers:import',
  thread: 'worker',
  mutating: true,
  handler: (db, json: string) => gazetteers.importGazetteer(db, json),
});

defineChannel({
  name: 'gazetteers:export',
  thread: 'worker',
  handler: (db, id: string) => gazetteers.exportGazetteer(db, id),
});

defineChannel({
  name: 'gazetteers:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => gazetteers.deleteGazetteer(db, id),
});

defineChannel({
  name: 'gazetteers:getImported',
  thread: 'worker',
  handler: (db) => gazetteers.getImportedGazetteers(db),
});

// ── Pure functions — no DB, main thread ───────────────────────────────────────

defineChannel({
  name: 'gazetteers:getSchema',
  thread: 'main',
  handler: () => gazetteers.getGazetteerSchema(),
});

defineChannel({
  name: 'gazetteers:getBundled',
  thread: 'main',
  handler: () => getAllGazetteers(),
});

import { describe, it, expect } from 'vitest';
import { getChannel } from '../../src/shared/channels';

/**
 * Locks in the user-observable outcome of the long-running-ipc-off-main plan:
 * the importers/exporters that previously blocked the main thread for tens of
 * seconds (Holger 25s on 22k persons) MUST stay registered as worker channels.
 *
 * The plan's user goal is "the genealogist can scroll, click, watch progress
 * messages flush in real time during import/export/publish". That property is
 * enforced architecturally by the channel registry: a channel registered with
 * `thread: 'worker'` is wrapped in `callWorker(...)` by `src/main/ipc/index.ts`
 * and runs in the dedicated DB worker thread. A future refactor that demotes
 * one of these back to `thread: 'main'` (or to a synchronous `wrapHandler`
 * shim) puts the heavy work back on the Electron main thread and re-freezes
 * the UI — exactly the regression this test guards against.
 *
 * Adding a new heavy channel that walks the DB or does long file I/O? Add it
 * to this list. Demoting an existing entry from worker to main? You will fail
 * this test, and you should: it is a user-goal regression.
 */
const HEAVY_WORKER_CHANNELS = [
  'import:holgerRun',
  'import:genneyRun',
  'import:genneyDiscover',
  'gedcom:import',
  'gedcom:preview',
  'archive:_importRun',
  'archive:_exportRun',
  'gedcom:_exportRun',
  'csv:_exportRun',
  'website:previewSnapshot',
];

describe('main thread stays responsive during long-running operations', async () => {
  for (const name of HEAVY_WORKER_CHANNELS) {
    it(`${name} is registered as a worker channel`, async () => {
      const ch = getChannel(name);
      expect(ch, `${name} must be registered`).toBeDefined();
      expect(ch!.thread, `${name} must run on the worker thread`).toBe('worker');
    });
  }
});

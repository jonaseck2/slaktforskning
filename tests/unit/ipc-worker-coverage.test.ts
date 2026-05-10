/**
 * Asserts that every channel registered via wrapHandler() is either:
 *   (a) handled in the DB worker dispatch table, OR
 *   (b) registered in the shared channel registry (migrated domains), OR
 *   (c) explicitly listed in MAIN_THREAD_ONLY_CHANNELS.
 *
 * Also asserts:
 *   (d) every channel in the shared registry has a handler function
 *       (guards against defineChannel() with a missing handler), AND
 *   (e) every legacy wrapHandler channel that is NOT in the registry is either
 *       in MAIN_THREAD_ONLY_CHANNELS or in the legacy db-worker dispatch table.
 *
 * If a channel is added to an ipc/*.ts file but forgotten in the worker
 * dispatch table AND not listed here, this test fails immediately.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
// Registry imports — each domain module registers its channels as a side effect
import { listChannels, channelRegistry } from '../../src/shared/channels';

// Channels that intentionally stay on the main thread (Electron APIs, dialog, shell, BrowserWindow, imports)
// Note: channels that are now registered via the channel registry with thread:'main' are NOT listed here —
// they appear in the registry's listChannels() result and are dispatched via the registry loop in index.ts.
const MAIN_THREAD_ONLY_CHANNELS = new Set([
  'media:attach', 'media:createFromFile', 'media:openFile', 'media:thumbnailDataUrl',
  'db:getCurrent', 'db:getRecent',
  // db:createNew, db:switchTo, db:openExisting use ipcMain.handle directly — not caught by wrapHandler regex
  'backup:backup', 'backup:restore',
  'shell:open-external',
  'export:openFolder',
  'app:getVersion', 'app:openExternal', 'app:readThirdPartyLicenses',
  'website:export', 'website:buildPreviewHtml',
  // website:previewSnapshot migrated to the registry as a worker channel.
  'print:print', 'print:exportPdf',
  'chart:saveSvg', 'chart:savePdf',
  'csv:export',
  // gazetteers:getSchema and gazetteers:getBundled migrated to registry with thread:'main'
  // gedcom:preview and gedcom:import migrated to the registry as worker channels.
  'gedcom:selectFile', 'gedcom:export',
  'import:genneyCheckDocker', 'import:genneySelectDerby', 'import:genneySelectArchive',
  'import:genneySelectMedia',
  // import:genneyRun and import:genneyDiscover migrated to the registry as worker channels.
  'import:holgerSelectFile', 'import:holgerSelectMedia',
  // import:holgerRun migrated to the registry as a worker channel.
  'import:rootsmagicSelectFile',
  // import:rootsmagicRun migrated to the registry as a worker channel.
  'import:grampsSelectFile',
  // import:grampsRun migrated to the registry as a worker channel.
  'archive:export', 'archive:import',
  // Onboarding state lives in user settings.json (loadSettings / saveSettings need Electron),
  // so these channels are registered via wrapHandler on the main thread.
  'onboarding:getSeen', 'onboarding:markSeen', 'onboarding:reset',
]);

function extractWrapHandlerChannels(dir: string): string[] {
  const channels: string[] = [];
  const skip = new Set(['wrap-handler.ts', 'worker-client.ts']);
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !skip.has(f));
  for (const file of files) {
    const src = readFileSync(resolve(dir, file), 'utf-8');
    const re = /wrapHandler\(\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) channels.push(m[1]);
  }
  return channels;
}

function extractWorkerChannels(): Set<string> {
  const src = readFileSync(resolve(__dirname, '../../src/main/db-worker.ts'), 'utf-8');
  const channels = new Set<string>();
  // Matches legacy dispatch-table keys like:  'events:get':
  const re = /^\s+['"]([a-zA-Z]+:[a-zA-Z]+)['"]\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) channels.add(m[1]);
  // Also include channels from the shared registry (migrated domains like persons)
  for (const name of listChannels()) channels.add(name);
  return channels;
}

describe('IPC worker coverage', () => {
  it('every wrapHandler channel is in WORKER_CHANNELS or MAIN_THREAD_ONLY_CHANNELS', () => {
    const ipcDir = resolve(__dirname, '../../src/main/ipc');
    const registered = extractWrapHandlerChannels(ipcDir);
    const worker = extractWorkerChannels();

    const missing = registered.filter(c => !worker.has(c) && !MAIN_THREAD_ONLY_CHANNELS.has(c));

    if (missing.length > 0) {
      throw new Error(
        'The following IPC channels lack a worker handler and are not in MAIN_THREAD_ONLY_CHANNELS.\n' +
        'Add them to db-worker.ts or MAIN_THREAD_ONLY_CHANNELS:\n\n  ' + missing.join('\n  ')
      );
    }

    // No channel should be in both sets
    const overlap = [...worker].filter(c => MAIN_THREAD_ONLY_CHANNELS.has(c));
    expect(overlap, `channels in both sets: ${overlap.join(', ')}`).toEqual([]);

    // Threshold decreases as channels migrate to the registry — update when adding domains.
    // After all Task 6 migrations, only ~25–30 legacy wrapHandler calls remain.
    expect(registered.length).toBeGreaterThan(20);
  });

  it('critical hot-path channels are in the worker', () => {
    const worker = extractWorkerChannels();
    const mustBeInWorker = [
      // checks stay in legacy dispatch table (need getDbDir() worker-local state)
      'checks:runAll', 'checks:forPerson', 'checks:forPlace',
      // persons, events, reports are now in the registry (resolved via listChannels())
      'persons:get', 'persons:list', 'events:forPerson',
      'reports:personSummary', 'reports:ancestorTree',
      // undo:undo / undo:redo stay in legacy wrapHandler (need BrowserWindow broadcast)
      'undo:undo', 'undo:redo',
    ];
    for (const ch of mustBeInWorker) {
      expect(worker.has(ch), `${ch} missing from worker dispatch table`).toBe(true);
    }
  });

  it('every channel in the registry has a handler function', () => {
    // Guards against defineChannel({ name, thread }) with a missing handler —
    // that would silently register a channel that throws at runtime.
    const noHandler: string[] = [];
    for (const [name, def] of Object.entries(channelRegistry)) {
      if (typeof (def as { handler?: unknown }).handler !== 'function') {
        noHandler.push(name);
      }
    }
    expect(
      noHandler,
      'These registry channels are missing a handler function — add one or remove the defineChannel call:\n  ' +
        noHandler.join('\n  '),
    ).toEqual([]);
  });

  it('every legacy wrapHandler channel not in the registry is in MAIN_THREAD_ONLY_CHANNELS or the worker dispatch table', () => {
    // Re-checks the invariant from the first test, but scoped to only the
    // channels that are NOT yet migrated to the registry.  This makes it
    // explicit: if a channel was migrated, it no longer needs to appear in
    // the legacy worker dispatch table or MAIN_THREAD_ONLY_CHANNELS.
    const ipcDir = resolve(__dirname, '../../src/main/ipc');
    const registered = extractWrapHandlerChannels(ipcDir);
    const registrySet = new Set(listChannels());
    const legacyOnly = registered.filter(c => !registrySet.has(c));

    // Extract only the legacy db-worker dispatch table (not registry additions)
    const src = readFileSync(resolve(__dirname, '../../src/main/db-worker.ts'), 'utf-8');
    const legacyWorkerChannels = new Set<string>();
    const re = /^\s+['"]([a-zA-Z]+:[a-zA-Z]+)['"]\s*:/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) legacyWorkerChannels.add(m[1]);

    const unaccounted = legacyOnly.filter(
      c => !legacyWorkerChannels.has(c) && !MAIN_THREAD_ONLY_CHANNELS.has(c),
    );

    if (unaccounted.length > 0) {
      throw new Error(
        'The following legacy wrapHandler channels (not in the registry) have no worker handler ' +
          'and are not in MAIN_THREAD_ONLY_CHANNELS.\n' +
          'Either migrate them to the registry, add them to the worker dispatch table, ' +
          'or add them to MAIN_THREAD_ONLY_CHANNELS:\n\n  ' +
          unaccounted.join('\n  '),
      );
    }
  });
});

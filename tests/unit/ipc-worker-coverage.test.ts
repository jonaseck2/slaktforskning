/**
 * Asserts that every channel registered via wrapHandler() is either:
 *   (a) handled in the DB worker dispatch table, OR
 *   (b) registered in the shared channel registry (migrated domains), OR
 *   (c) explicitly listed in MAIN_THREAD_ONLY_CHANNELS.
 *
 * If a channel is added to an ipc/*.ts file but forgotten in the worker
 * dispatch table AND not listed here, this test fails immediately.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
// Registry imports — each domain module registers its channels as a side effect
import { listChannels } from '../../src/shared/channels';

// Channels that intentionally stay on the main thread (Electron APIs, dialog, shell, BrowserWindow, imports)
const MAIN_THREAD_ONLY_CHANNELS = new Set([
  'media:attach', 'media:openFile',
  'db:getCurrent', 'db:getRecent',
  // db:createNew, db:switchTo, db:openExisting use ipcMain.handle directly — not caught by wrapHandler regex
  'backup:backup', 'backup:restore',
  'shell:open-external',
  'export:openFolder',
  'website:export', 'website:previewSnapshot', 'website:setPreviewSnapshot',
  'print:print', 'print:exportPdf',
  'chart:saveSvg', 'chart:savePdf',
  'csv:export',
  'gazetteers:getSchema', 'gazetteers:getBundled',
  'gedcom:selectFile', 'gedcom:preview', 'gedcom:import', 'gedcom:export',
  'import:genneyCheckDocker', 'import:genneySelectDerby', 'import:genneySelectArchive',
  'import:genneySelectMedia', 'import:genneyDiscover', 'import:genneyRun',
  'import:holgerSelectFile', 'import:holgerSelectMedia', 'import:holgerRun',
  'archive:export', 'archive:import',
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

    expect(registered.length).toBeGreaterThan(50);
  });

  it('critical hot-path channels are in the worker', () => {
    const worker = extractWorkerChannels();
    const mustBeInWorker = [
      'checks:runAll', 'checks:forPerson', 'checks:forPlace',
      'persons:get', 'persons:list', 'events:forPerson',
      'reports:personSummary', 'reports:ancestorTree',
      'undo:undo', 'undo:redo',
    ];
    for (const ch of mustBeInWorker) {
      expect(worker.has(ch), `${ch} missing from worker dispatch table`).toBe(true);
    }
  });
});

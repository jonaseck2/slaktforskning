/**
 * Asserts that the static SPA api stub (src/static/static-api.ts) stays in
 * sync with the IPC channel set.  Two layers are checked:
 *
 *   1. Every channel in the shared registry has a corresponding stub in the
 *      static api (auto-derived — catches newly added channels).
 *   2. Every legacy / Electron-only channel that the renderer can call via
 *      window.api still has a stub (hand-maintained list).
 *
 * Checks are structural only (method exists); return-shape correctness is
 * not tested here.
 */
import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';
import { channelRegistry } from '../../src/shared/channels/registry';
import { buildStaticApi } from '../../src/static/static-api';
import type { Snapshot } from '../../src/api/html_site/snapshot';

// Minimal empty snapshot — just enough for buildStaticApi to construct the
// api object without throwing.  None of the stubs use the snapshot data.
const emptySnapshot: Snapshot = {
  meta: { siteTitle: '', focusPersonId: '', generatedAt: '' },
  persons: [],
  personNames: [],
  personIds: [],
  relationships: [],
  events: [],
  eventParticipants: [],
  places: [],
  sources: [],
  citations: [],
  media: [],
  mediaLinks: [],
  mediaRegions: [],
  settings: {},
};

const staticApi = buildStaticApi(emptySnapshot);

describe('static API parity', () => {
  it('every registry channel has a stub in the static api', () => {
    const missing: string[] = [];
    for (const name of Object.keys(channelRegistry)) {
      // Internal worker-only channels (names containing ':_') are dispatched
      // from main-thread shims via callWorker(...) and are not part of the
      // renderer-facing surface, so the static SPA does not stub them.
      if (name.includes(':_')) continue;
      const colonIdx = name.indexOf(':');
      if (colonIdx === -1) continue;
      const domain = name.slice(0, colonIdx);
      const method = name.slice(colonIdx + 1);
      const block = (staticApi as Record<string, Record<string, unknown> | undefined>)[domain];
      if (!block || !(method in block)) {
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        'src/static/static-api.ts is missing stubs for the following registry channels.\n' +
        'Add a noop stub for each missing entry:\n\n  ' + missing.join('\n  '),
      );
    }
  });

  it('every registry channel handler is a function', () => {
    // Guards against someone writing defineChannel({ name, thread }) and
    // forgetting the handler property.
    const noHandler: string[] = [];
    for (const [name, def] of Object.entries(channelRegistry)) {
      if (typeof (def as { handler?: unknown }).handler !== 'function') {
        noHandler.push(name);
      }
    }
    expect(
      noHandler,
      'These registry channels are missing a handler function:\n  ' + noHandler.join('\n  '),
    ).toEqual([]);
  });

  it('legacy renderer-callable channels have stubs in the static api', () => {
    // These channels intentionally stay outside the registry (Electron-only
    // operations, BrowserWindow broadcasts, dialog, fs) but are exposed via
    // the preload as window.api.domain.method and therefore need a stub in
    // the static SPA.  Derived from the inline blocks in src/preload/index.ts.
    const legacyExposed: string[] = [
      // db — non-setting db management stays on main thread
      'db:getCurrent', 'db:getRecent', 'db:createNew', 'db:openExisting', 'db:switchTo',
      // undo — undo/redo need BrowserWindow broadcasts, onChanged/onPerformed are event listeners
      'undo:undo', 'undo:redo',
      // shell / export / print / csv / backup
      'shell:open-external',
      'export:openFolder',
      'print:print', 'print:exportPdf',
      'csv:export',
      'backup:backup', 'backup:restore',
      // gedcom import/export
      'gedcom:selectFile', 'gedcom:preview', 'gedcom:import', 'gedcom:export',
      // genney + holger import
      'import:genneyCheckDocker', 'import:genneySelectDerby', 'import:genneySelectArchive',
      'import:genneySelectMedia', 'import:genneyDiscover', 'import:genneyRun',
      'import:holgerSelectFile', 'import:holgerSelectMedia',
      // import:holgerRun is now a registry worker channel — checked by the
      // 'every registry channel has a stub in the static api' test above.
      // archive
      'archive:export', 'archive:import',
      // website
      'website:export',
      // chart
      'chart:saveSvg', 'chart:savePdf',
      // media — Electron-side file-system/dialog channels
      'media:attach', 'media:openFile',
    ];

    const missing: string[] = [];
    for (const name of legacyExposed) {
      const colonIdx = name.indexOf(':');
      if (colonIdx === -1) continue;
      const domain = name.slice(0, colonIdx);
      const method = name.slice(colonIdx + 1);
      const block = (staticApi as Record<string, Record<string, unknown> | undefined>)[domain];
      if (!block || !(method in block)) {
        missing.push(name);
      }
    }
    expect(
      missing,
      'src/static/static-api.ts is missing stubs for these legacy channels:\n  ' + missing.join('\n  '),
    ).toEqual([]);
  });
});

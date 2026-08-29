/**
 * Asserts that the static SPA api stub (src/static/static-api.ts) keeps a
 * stub for every legacy / Electron-only channel that the renderer can call
 * via window.api.
 *
 * SLIMMED IN THE SPECTA MIGRATION (2026-05-14): the previous version of this
 * test also cross-checked the channel registry in `src/shared/channels/`.
 * That registry was deleted along with the Electron worker dispatch model.
 * The Specta-generated `src/renderer/bindings.ts` is now the source of truth
 * for IPC commands, and the renderer-local handler bindings live inline in
 * `src/renderer/tauri-window-api.ts`.
 *
 * What remains here is the hand-maintained list of legacy channels (dialog,
 * fs, shell, BrowserWindow broadcasts) that the renderer surfaces on
 * `window.api` and that the static SPA must stub for the website-export
 * bundle to load without runtime errors.
 *
 * Checks are structural only (method exists); return-shape correctness is
 * not tested here.
 */
import { describe, it, expect } from 'vitest';
import { buildStaticApi } from '../../src/static/static-api';
import type { Snapshot } from '../../src/api/html_site/snapshot';

// Minimal empty snapshot — just enough for buildStaticApi to construct the
// api object without throwing. None of the stubs use the snapshot data.
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
  it('legacy renderer-callable channels have stubs in the static api', () => {
    // These channels intentionally stay outside the Specta-generated bindings
    // (Electron-only fs/dialog/shell operations, BrowserWindow broadcasts) but
    // are exposed via the renderer-local polyfills in tauri-window-api.ts as
    // window.api.<domain>.<method> and therefore need a stub in the static SPA.
    const legacyExposed: string[] = [
      // db — non-setting db management stays on main thread
      'db:getCurrent', 'db:getRecent', 'db:createNew', 'db:openExisting', 'db:switchTo',
      // undo — undo/redo need cross-window broadcasts
      'undo:undo', 'undo:redo',
      // shell / export / print / csv / backup
      'shell:open-external',
      'export:openFolder',
      'print:print', 'print:exportPdf',
      'csv:export',
      'backup:backup', 'backup:restore',
      // gedcom dialog + export
      'gedcom:selectFile', 'gedcom:selectFiles', 'gedcom:export',
      // genney + holger import file pickers
      'import:genneyCheckDocker', 'import:genneySelectDerby', 'import:genneySelectArchive',
      'import:genneySelectMedia',
      'import:holgerSelectFile', 'import:holgerSelectMedia',
      // multi-select pickers — a researcher with four exports picks them once
      'import:genneySelectArchives', 'import:holgerSelectFiles',
      'import:rootsmagicSelectFiles', 'import:grampsSelectFiles',
      // archive
      'archive:export', 'archive:import', 'archive:selectFiles',
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

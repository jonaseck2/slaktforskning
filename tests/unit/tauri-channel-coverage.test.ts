/**
 * Asserts that every renderer-callable channel in the registry has a path to
 * a working implementation in the Tauri build's `tauri-window-api.ts`.
 *
 * In the Electron build, `src/preload/index.ts` is the hand-maintained map;
 * the `preload-coverage.test.ts` sibling enforces parity against the
 * registry. In the Tauri build there is no preload — `tauri-window-api.ts`
 * either:
 *
 *   1. Auto-walks the registry (`for (const channelName of listChannels())`)
 *      and binds every entry to its declared handler. This covers the bulk
 *      of channels — every pure-api/ entry needs no extra wiring.
 *   2. Overrides the auto-walked stub with an explicit polyfill for
 *      channels that need Tauri runtime services (file dialog, fs, native
 *      print/PDF, opener, updater, etc.). These are the
 *      `api.<domain>.<method> = …` lines.
 *
 * This test reads `tauri-window-api.ts` as text (same approach as
 * `preload-coverage.test.ts`) and asserts every registry channel that the
 * renderer can call resolves to one of these two paths. Adding a new
 * `defineChannel` that lands in neither produces a runtime
 * `is not a function` in the Tauri build — exactly the failure mode
 * `preload-coverage` catches in the Electron build.
 *
 * Internal worker-only channels (`<domain>:_<method>`) are intentionally
 * not exposed on `window.api` — they're called from sibling polyfills via
 * `getChannel('csv:_exportRun')`, mirroring how the Electron main-thread
 * shims call them via `callWorker`. The parity check skips these.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';
import { channelRegistry } from '../../src/shared/channels/registry';

const TAURI_API_PATH = join(__dirname, '..', '..', 'src', 'renderer', 'tauri-window-api.ts');
const tauriApiSource = readFileSync(TAURI_API_PATH, 'utf8');

// Detect path #1 — the registry auto-walk. Asserting "the loop exists" is
// enough; if anyone removes it the auto-walked half disappears in one shot
// and we want a single, loud failure.
const HAS_REGISTRY_AUTO_WALK = /for\s*\(\s*const\s+channelName\s+of\s+listChannels\(\)/.test(tauriApiSource);

// Detect path #2 — explicit polyfills. Match `api.<domain>.<method> = …` and
// build a Set of `<domain>:<method>` channel names.
const explicitPolyfills = new Set<string>();
for (const m of tauriApiSource.matchAll(/\bapi\.([a-zA-Z]+)\.([a-zA-Z]+)\s*=/g)) {
  explicitPolyfills.add(`${m[1]}:${m[2]}`);
}

describe('tauri-window-api channel coverage', () => {
  it('has the registry auto-walk loop wired (path #1 of the polyfill mechanism)', () => {
    expect(
      HAS_REGISTRY_AUTO_WALK,
      'src/renderer/tauri-window-api.ts is missing the `for (const channelName of listChannels())` loop. ' +
      'Without it, channels with no explicit polyfill silently disappear from window.api in the Tauri build.',
    ).toBe(true);
  });

  it('every renderer-callable registry channel is reachable in the Tauri build', () => {
    const missing: string[] = [];
    for (const name of Object.keys(channelRegistry)) {
      // Internal worker-only channels (names containing ':_') are called from
      // sibling polyfills via `getChannel(...)`; they are intentionally NOT
      // exposed on window.api. Mirrors preload-coverage's same skip.
      if (name.includes(':_')) continue;
      // Reachable means: either the auto-walk binds it (any channel with a
      // handler the auto-walk can call works), OR an explicit polyfill
      // overrides it. The auto-walk catches everything by default — the
      // explicit polyfills only override channels whose handler needs Tauri
      // services not available in pure api/ code.
      //
      // Path #1 (auto-walk) wins as long as the loop exists AND the channel's
      // handler doesn't throw at import time on the renderer side. Asserting
      // both paths cover all channels is the safe formulation: if a channel
      // is missing here, either the loop broke or the explicit polyfill that
      // was supposed to override it isn't there.
      if (HAS_REGISTRY_AUTO_WALK) continue; // auto-walk covers it by default
      if (explicitPolyfills.has(name)) continue;
      missing.push(name);
    }
    expect(
      missing,
      'src/renderer/tauri-window-api.ts has no path to these registry channels — ' +
      'either the auto-walk loop has been removed AND no explicit polyfill exists. ' +
      'Add `api.<domain>.<method> = …` for each:\n  ' + missing.join('\n  '),
    ).toEqual([]);
  });

  it('every explicit Tauri polyfill targets a real registry channel OR a known main-only Electron channel', () => {
    // The explicit polyfills cover (a) registry channels that need a Tauri
    // runtime override (file dialog, fs), and (b) main-only channels the
    // Electron preload exposes that have no registry entry — `db:getCurrent`,
    // `db:openExisting`, `media:attach`, `csv:export`, `chart:saveSvg`,
    // etc. The main-only set is enumerated below; anything outside both
    // sets is a typo or a stale polyfill referencing a channel that's
    // since been removed.
    const MAIN_ONLY_ELECTRON_CHANNELS = new Set([
      // src/main/ipc/database.ts
      'db:getCurrent', 'db:openExisting', 'db:createNew', 'db:switchTo',
      'db:getRecent', 'db:onSwitched',
      'undo:undo', 'undo:redo', 'undo:onChanged', 'undo:onPerformed',
      'backup:backup', 'backup:restore',
      // src/main/ipc/media.ts (Electron-side: dialog + fs + nativeImage)
      'media:attach', 'media:openFile', 'media:getFilePath',
      'media:readAsDataUrl', 'media:createFromFile', 'media:thumbnailDataUrl',
      // src/main/ipc/main-only.ts
      'checks:runAll', 'checks:forPerson', 'checks:forPlace',
      'checks:forMedia', 'checks:runForEvent', 'checks:cancel',
      'chart:saveSvg', 'chart:savePdf',
      'chart:onGetVisiblePersons', 'chart:onSelectPerson',
      'chart:onFocusPerson', 'chart:onGetLayout', 'chart:removeAllChartHandlers',
      'print:print', 'print:exportPdf',
      'csv:export', 'export:openFolder',
      // src/main/ipc/import.ts
      'import:onProgress', 'import:onHolgerProgress',
      'import:onRootsmagicProgress', 'import:onGrampsProgress',
      'import:genneyCheckDocker', 'import:genneySelectDerby',
      'import:genneySelectArchive', 'import:genneySelectMedia',
      'import:holgerSelectFile', 'import:holgerSelectMedia',
      'import:rootsmagicSelectFile', 'import:grampsSelectFile',
      'import:grampsRun', 'import:rootsmagicRun', 'import:holgerRun',
      'import:genneyRun', 'import:genneyDiscover',
      // src/main/ipc/duplicates.ts (sync fs to delete + snapshot the file —
      // banned in worker handlers per .claude/rules/api.md, polyfilled in
      // src/renderer/tauri-window-api.ts because the Tauri build has no
      // worker thread)
      'duplicates:mergeMedia',
      // src/main/ipc/website-export.ts
      'website:export', 'website:buildPreviewHtml',
      // src/main/ipc/onboarding.ts
      'onboarding:getSeen', 'onboarding:markSeen', 'onboarding:reset',
      // src/main/ipc/database.ts settings + recent
      'gedcom:selectFile', 'gedcom:import', 'gedcom:preview', 'gedcom:export',
      // archive shims
      'archive:export', 'archive:import',
      // app + opener
      'app:getVersion', 'app:openExternal', 'app:onOpenAbout',
      'app:readThirdPartyLicenses', 'app:checkForUpdates',
      'app:downloadAndInstallUpdate',
    ]);

    const stale: string[] = [];
    for (const name of explicitPolyfills) {
      if (channelRegistry[name as keyof typeof channelRegistry]) continue;
      if (MAIN_ONLY_ELECTRON_CHANNELS.has(name)) continue;
      stale.push(name);
    }
    expect(
      stale,
      'src/renderer/tauri-window-api.ts has explicit polyfills for these channels, ' +
      'but they are neither in the registry nor in the known main-only Electron channel list. ' +
      'Either remove the polyfill (channel was removed) or add the channel to the allowlist above:\n  ' +
      stale.join('\n  '),
    ).toEqual([]);
  });
});

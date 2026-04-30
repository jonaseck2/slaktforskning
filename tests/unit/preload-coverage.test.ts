/**
 * Asserts that every channel registered via `defineChannel` is exposed on
 * the preload's `window.api` surface. The preload is hand-maintained
 * (because it imports Electron primitives), so a `defineChannel` call in
 * src/shared/channels/* without a matching `ipcRenderer.invoke('domain:method', ...)`
 * line in src/preload/index.ts silently produces a runtime
 * `is not a function` error in the renderer.
 *
 * The test scans preload source as text — it cannot import the preload
 * module directly because that pulls in `electron`, which is not available
 * in vitest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import '../../src/shared/channels';
import { channelRegistry } from '../../src/shared/channels/registry';

const PRELOAD_PATH = join(__dirname, '..', '..', 'src', 'preload', 'index.ts');
const preloadSource = readFileSync(PRELOAD_PATH, 'utf8');

// Match every ipcRenderer.invoke('channel:name', ...) and ipcRenderer.on('channel:name', ...).
// The registry's static-api-coverage test already covers the static surface;
// here we only need to confirm the preload exposes each registry channel.
const exposedChannels = new Set<string>();
for (const m of preloadSource.matchAll(/ipcRenderer\.(?:invoke|on)\(['"]([\w-]+:[\w-]+)['"]/g)) {
  exposedChannels.add(m[1]);
}

describe('preload coverage', () => {
  it('every registry channel is exposed on window.api', () => {
    const missing: string[] = [];
    for (const name of Object.keys(channelRegistry)) {
      if (!exposedChannels.has(name)) missing.push(name);
    }
    expect(
      missing,
      'src/preload/index.ts does not expose these registered channels — adding a defineChannel does NOT auto-add it to the preload. Add an `ipcRenderer.invoke(\'<name>\', ...)` line under the matching domain block:\n  ' + missing.join('\n  '),
    ).toEqual([]);
  });
});

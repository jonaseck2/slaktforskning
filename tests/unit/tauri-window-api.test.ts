/**
 * Verifies that the explicit polyfills in `src/renderer/tauri-window-api.ts`
 * dispatch to the right `invoke()` Rust commands with the right shape, and
 * that `mountWindowApi(db)` produces a `window.api.<domain>.<method>` map
 * that matches the renderer's expected surface.
 *
 * Mocks `@tauri-apps/api/core` (mirroring `db-shim.test.ts`) so we can
 * assert (cmd, args) without a Tauri runtime. Mocks `@tauri-apps/api/event`
 * the same way so the cross-window emit/listen wires don't crash at module
 * import time.
 *
 * This is the structural counterpart of `tauri-channel-coverage.test.ts`:
 * coverage proves the channel *exists* on window.api; this test proves it
 * *does the right thing*. Together they catch both classes of polyfill
 * drift: missing wiring (channel missing) and incorrect wiring (channel
 * present but talking to the wrong Rust command).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeSpy = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: unknown) => invokeSpy(cmd, args),
}));

// Mock @tauri-apps/api/event — the polyfill imports it dynamically inside
// fireDataChanged/listen wires, so we just supply no-op `emit`/`listen`.
vi.mock('@tauri-apps/api/event', () => ({
  emit: () => Promise.resolve(),
  listen: () => Promise.resolve(() => { /* unsubscribe */ }),
}));

// Stub `window` early — the polyfill assigns `window.__chartBridge = {…}`
// at the end of `mountWindowApi`. The Vitest 'node' env has no window
// global; happy-dom would, but loading happy-dom for one assertion is
// overkill (it costs ~150 ms per test file). We provide just what the
// polyfill touches: an empty object, a print() spy reused below, and
// (assigned later by mountWindowApi) `window.api`.
type WindowShape = {
  __chartBridge?: unknown;
  api?: unknown;
  print?: () => void;
};
const stubWindow: WindowShape = { print: vi.fn() };
(globalThis as unknown as { window: WindowShape }).window = stubWindow;

// Stub the Database the polyfill expects. The auto-walk passes it as the
// first arg of every worker channel's handler — for these tests we only
// assert what invoke() was called with, so a placeholder object is fine.
const stubDb = {} as unknown as import('node-sqlite3-wasm').Database;

// IMPORT after mocks so the polyfill module picks up the mocked invoke.
import { mountWindowApi } from '../../src/renderer/tauri-window-api';

describe('tauri-window-api mountWindowApi shape', () => {
  beforeEach(() => {
    invokeSpy.mockReset();
    invokeSpy.mockResolvedValue(undefined);
  });

  it('mountWindowApi exposes the expected top-level domains', () => {
    const { api } = mountWindowApi(stubDb);
    // Every domain that any explicit polyfill assigns to is reachable.
    for (const dom of [
      'db', 'media', 'checks', 'gedcom', 'import', 'archive',
      'website', 'export', 'csv', 'backup', 'undo', 'chart',
      'print', 'app', 'onboarding',
    ]) {
      expect(api[dom], `api.${dom} is missing`).toBeDefined();
    }
  });

  it('mounts a non-empty surface (auto-walk + explicit polyfills both fire)', () => {
    const { api } = mountWindowApi(stubDb);
    // Spot-check a representative renderer-local binding (persons.list, bound
    // directly to src/api/persons.ts) and the explicit-polyfill half
    // (db.getCurrent which calls a Rust command via Specta bindings).
    expect(typeof api.persons?.list).toBe('function');
    expect(typeof api.db?.getCurrent).toBe('function');
  });

  it('exposes onDataChanged + offDataChanged on the top-level api object', () => {
    const { api } = mountWindowApi(stubDb);
    const top = api as unknown as {
      onDataChanged?: unknown;
      offDataChanged?: unknown;
    };
    expect(typeof top.onDataChanged).toBe('function');
    expect(typeof top.offDataChanged).toBe('function');
  });
});

describe('tauri-window-api Rust command dispatch', () => {
  beforeEach(() => {
    invokeSpy.mockReset();
    invokeSpy.mockResolvedValue(undefined);
  });

  it('db.getCurrent invokes db_current_path and shapes the result', async () => {
    invokeSpy.mockResolvedValueOnce('/tmp/example.db');
    const { api } = mountWindowApi(stubDb);
    const result = (await api.db.getCurrent()) as { path: string; name: string } | null;
    expect(invokeSpy).toHaveBeenCalledWith('db_current_path', undefined);
    expect(result).toEqual({ path: '/tmp/example.db', name: 'example' });
  });

  it('db.getCurrent returns null when no db is open', async () => {
    invokeSpy.mockResolvedValueOnce(null);
    const { api } = mountWindowApi(stubDb);
    const result = await api.db.getCurrent();
    expect(result).toBeNull();
  });

  it('app.getVersion invokes app_version (and gracefully falls back)', async () => {
    invokeSpy.mockResolvedValueOnce('1.2.3');
    const { api } = mountWindowApi(stubDb);
    const v = await api.app.getVersion();
    expect(invokeSpy).toHaveBeenCalledWith('app_version', undefined);
    expect(v).toBe('1.2.3');
  });

  it('app.openExternal forwards URL to plugin:opener|open_url', async () => {
    const { api } = mountWindowApi(stubDb);
    await api.app.openExternal('https://example.org/foo');
    expect(invokeSpy).toHaveBeenCalledWith('plugin:opener|open_url', { url: 'https://example.org/foo' });
  });

  it('app.checkForUpdates invokes plugin:updater|check and returns { available }', async () => {
    invokeSpy.mockResolvedValueOnce({ available: false });
    const { api } = mountWindowApi(stubDb);
    const r = await api.app.checkForUpdates();
    expect(invokeSpy).toHaveBeenCalledWith('plugin:updater|check', undefined);
    expect(r).toEqual({ available: false });
  });

  it('app.checkForUpdates surfaces a real update payload', async () => {
    invokeSpy.mockResolvedValueOnce({ available: true, version: '0.250.1', body: 'fixes' });
    const { api } = mountWindowApi(stubDb);
    const r = (await api.app.checkForUpdates()) as { available: boolean; version: string; body: string };
    expect(r.available).toBe(true);
    expect(r.version).toBe('0.250.1');
    expect(r.body).toBe('fixes');
  });

  it('print.print and print.exportPdf both call window.print() (no invoke)', async () => {
    // Re-stub print on the shared stubWindow.
    const printSpy = vi.fn();
    stubWindow.print = printSpy;
    const { api } = mountWindowApi(stubDb);
    await api.print.print();
    await api.print.exportPdf();
    expect(printSpy).toHaveBeenCalledTimes(2);
  });

  it('export.openFolder invokes shell_reveal with the path', async () => {
    const { api } = mountWindowApi(stubDb);
    const r = (await api.export.openFolder('/some/folder')) as { ok: boolean };
    expect(invokeSpy).toHaveBeenCalledWith('shell_reveal', { path: '/some/folder' });
    expect(r.ok).toBe(true);
  });

  it('export.openFolder rejects non-string input without invoking', async () => {
    const { api } = mountWindowApi(stubDb);
    const r = (await api.export.openFolder(undefined as unknown as string)) as { ok: boolean };
    expect(r.ok).toBe(false);
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it('chart.saveSvg writes via fs_write_text after the user picks a destination', async () => {
    invokeSpy.mockResolvedValueOnce({ canceled: false, path: '/tmp/chart.svg' }); // dialog_pick
    invokeSpy.mockResolvedValueOnce(undefined);                                    // fs_write_text
    const { api } = mountWindowApi(stubDb);
    const r = (await (api.chart as unknown as { saveSvg: (svg: string, hint: string) => Promise<{ success: boolean; path?: string }> }).saveSvg(
      '<svg></svg>',
      'family.svg',
    ));
    // First call is the save dialog; second is the actual write.
    expect(invokeSpy.mock.calls[0][0]).toBe('dialog_pick');
    expect(invokeSpy.mock.calls[1]).toEqual([
      'fs_write_text',
      { path: '/tmp/chart.svg', contents: '<svg></svg>' },
    ]);
    expect(r.success).toBe(true);
    expect(r.path).toBe('/tmp/chart.svg');
  });

  it('chart.saveSvg returns a cancelled result when the user dismisses the dialog', async () => {
    invokeSpy.mockResolvedValueOnce({ canceled: true });
    const { api } = mountWindowApi(stubDb);
    const r = (await (api.chart as unknown as { saveSvg: (svg: string, hint: string) => Promise<{ success: boolean; error?: string }> }).saveSvg(
      '<svg></svg>',
      'family.svg',
    ));
    expect(r.success).toBe(false);
    // Only the dialog was called; no fs_write_text.
    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });

  it('media.thumbnailDataUrl forwards fileRef + maxWidth to media_thumbnail', async () => {
    invokeSpy.mockResolvedValueOnce('data:image/jpeg;base64,xxx');
    const { api } = mountWindowApi(stubDb);
    const result = await api.media.thumbnailDataUrl('foo-media/x.jpg', 256);
    // Specta builds the wire payload from positional args, so `maxWidth: null`
    // appears explicitly when the renderer-side wrapper passes `null` for the
    // optional arg. The Rust command sees `Option<u32>` either way.
    expect(invokeSpy).toHaveBeenCalledWith('media_thumbnail', { fileRef: 'foo-media/x.jpg', maxWidth: 256 });
    expect(result).toBe('data:image/jpeg;base64,xxx');
  });

  it('media.thumbnailDataUrl returns null for non-string fileRef without invoking', async () => {
    const { api } = mountWindowApi(stubDb);
    const result = await api.media.thumbnailDataUrl(null as unknown as string);
    expect(result).toBeNull();
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it('gedcom.selectFile opens the dialog with the right extensions', async () => {
    invokeSpy.mockResolvedValueOnce({ canceled: true });
    const { api } = mountWindowApi(stubDb);
    await api.gedcom.selectFile();
    // Specta-generated binding always includes every positional arg in the
    // wire payload, including the unused `defaultName` slot — Rust sees the
    // same `Option<String>::None` either way.
    expect(invokeSpy).toHaveBeenCalledWith('dialog_pick', {
      kind: 'openFile',
      title: 'Select GEDCOM File',
      extensions: ['ged', 'gedcom', 'zip'],
      extensionLabel: 'GEDCOM Files',
      defaultName: null,
    });
  });

  it('import.holgerSelectFile opens dialog with .ged + .zip', async () => {
    invokeSpy.mockResolvedValueOnce({ canceled: true });
    const { api } = mountWindowApi(stubDb);
    await (api.import as unknown as { holgerSelectFile: () => Promise<unknown> }).holgerSelectFile();
    expect(invokeSpy).toHaveBeenCalledWith('dialog_pick', {
      kind: 'openFile',
      title: 'Select Holger GEDCOM export',
      extensions: ['ged', 'zip'],
      extensionLabel: 'GEDCOM / Zip',
      defaultName: null,
    });
  });

  it('app.readThirdPartyLicenses reads bundled resource and falls back to ""', async () => {
    invokeSpy.mockResolvedValueOnce('LICENSE BODY');
    const { api } = mountWindowApi(stubDb);
    const txt = await api.app.readThirdPartyLicenses();
    expect(invokeSpy).toHaveBeenCalledWith('read_bundled_resource', { name: 'THIRD_PARTY_LICENSES.txt' });
    expect(txt).toBe('LICENSE BODY');

    invokeSpy.mockReset();
    invokeSpy.mockRejectedValueOnce(new Error('not bundled (dev)'));
    const empty = await api.app.readThirdPartyLicenses();
    expect(empty).toBe('');
  });

  it('app.downloadAndInstallUpdate forwards to plugin:updater', async () => {
    const { api } = mountWindowApi(stubDb);
    const r = (await api.app.downloadAndInstallUpdate()) as { ok: boolean };
    expect(invokeSpy).toHaveBeenCalledWith('plugin:updater|download_and_install', undefined);
    expect(r.ok).toBe(true);
  });

  it('website.export skips the dialog when _outputDir is provided and writes index.html', async () => {
    // Mock the snapshot loader so buildSnapshot doesn't poke at the stub DB.
    vi.doMock('../../src/api/html_site/snapshot', () => ({
      buildSnapshot: vi.fn().mockResolvedValue({
        meta: {},
        media: [],
        mediaLinks: [],
        mediaRegions: [],
        settings: {},
      }),
    }));
    // The polyfill loads the static index.html via Rust, then writes the
    // injected version back. Stub both calls.
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === 'website_load_static_index_html') {
        return Promise.resolve('<html><head></head><body></body></html>');
      }
      if (cmd === 'fs_write_text') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    const { api } = mountWindowApi(stubDb);
    const r = (await (api.website as unknown as {
      export: (opts: unknown) => Promise<{ outputDir?: string; canceled?: boolean }>;
    }).export({
      siteTitle: 'Test',
      focusPersonId: null,
      scope: { everyone: true },
      options: { includeMedia: false, excludeLiving: false, redactLiving: false, mediaPersonOnly: false },
      _outputDir: '/tmp/site',
    }));
    // Should NOT have called dialog_pick — _outputDir bypassed it.
    const cmds = invokeSpy.mock.calls.map(c => c[0]);
    expect(cmds).not.toContain('dialog_pick');
    expect(cmds).toContain('website_load_static_index_html');
    expect(cmds).toContain('fs_write_text');
    // The fs_write_text call must target <outputDir>/index.html with an
    // injected __SNAPSHOT_GZ__ tag.
    const writeCall = invokeSpy.mock.calls.find(c => c[0] === 'fs_write_text');
    expect(writeCall).toBeDefined();
    const writeArgs = writeCall![1] as { path: string; contents: string };
    expect(writeArgs.path).toBe('/tmp/site/index.html');
    expect(writeArgs.contents).toContain('window.__SNAPSHOT_GZ__=');
    expect(r.outputDir).toBe('/tmp/site');
    vi.doUnmock('../../src/api/html_site/snapshot');
  });

  it('website.export reports bundleMissing when the static index.html is absent', async () => {
    vi.doMock('../../src/api/html_site/snapshot', () => ({
      buildSnapshot: vi.fn().mockResolvedValue({
        meta: {},
        media: [],
        mediaLinks: [],
        mediaRegions: [],
        settings: {},
      }),
    }));
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === 'website_load_static_index_html') {
        return Promise.reject(new Error('dist-static/index.html not found. Tried: …'));
      }
      return Promise.resolve(undefined);
    });
    const { api } = mountWindowApi(stubDb);
    const r = (await (api.website as unknown as {
      export: (opts: unknown) => Promise<{ bundleMissing?: boolean }>;
    }).export({
      siteTitle: 'Test',
      focusPersonId: null,
      scope: { everyone: true },
      options: { includeMedia: false, excludeLiving: false, redactLiving: false, mediaPersonOnly: false },
      _outputDir: '/tmp/site',
    }));
    expect(r.bundleMissing).toBe(true);
    vi.doUnmock('../../src/api/html_site/snapshot');
  });
});

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
 * This is the structural counterpart of `static-api-coverage.test.ts`:
 * coverage proves the binding *exists* on window.api; this test proves it
 * *does the right thing*. Together they catch both classes of binding
 * drift: missing wiring (binding missing) and incorrect wiring (binding
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
import { createTestDb } from './helpers';

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

  // Auto-update is wired in src/renderer/composables/useAppUpdater.ts via
  // @tauri-apps/plugin-updater directly — no window.api.app.* surface.

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
  // ---------------------------------------------------------------------
  // GEDCOM preview / import envelopes.
  //
  // The renderer component (GedcomImportSection.vue) reads
  // `{ canceled, filePath, preview }` from preview and
  // `{ success, report, error }` from import — the envelopes the Electron
  // worker channels returned. The Tauri port returned the bare
  // `ImportPreview` / `ValidationReport` instead, so both of the component's
  // guards fell through to a silent `return`: no modal, no status line, no
  // console error. These two tests pin the envelope on the binding side.
  // ---------------------------------------------------------------------

  const TINY_GED = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME Karin /Karlsson/',
    '1 SEX F',
    '0 TRLR',
    '',
  ].join('\n');

  function mockGedRead(text = TINY_GED) {
    const b64 = Buffer.from(text, 'utf-8').toString('base64');
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === 'fs_read_bytes_base64') return Promise.resolve(b64);
      return Promise.resolve(undefined);
    });
  }

  it('gedcom.preview returns the { canceled, filePath, preview } envelope', async () => {
    mockGedRead();
    const { api } = mountWindowApi(stubDb);
    const r = (await api.gedcom.preview({ filePath: '/tmp/tree.ged' })) as {
      canceled?: boolean;
      filePath?: string;
      preview?: { personCount: number };
    };
    expect(r.canceled).toBe(false);
    expect(r.filePath).toBe('/tmp/tree.ged');
    expect(r.preview?.personCount).toBe(1);
  });

  it('gedcom.preview unwraps a .zip and previews the .ged inside', async () => {
    // `gedcom.selectFile` offers .zip, so both bindings must unwrap one. The
    // Electron worker extracted it to a tmp dir with node fs; the renderer has
    // the bytes already and unzips in memory.
    const { zipSync, strToU8 } = await import('fflate');
    const zipped = zipSync({
      'readme.txt': strToU8('not a gedcom'),
      'tree.ged': strToU8(TINY_GED),
    });
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === 'fs_read_bytes_base64') {
        return Promise.resolve(Buffer.from(zipped).toString('base64'));
      }
      return Promise.resolve(undefined);
    });
    const { api } = mountWindowApi(stubDb);
    const r = (await api.gedcom.preview({ filePath: '/tmp/tree.zip' })) as {
      canceled?: boolean;
      preview?: { personCount: number };
    };
    expect(r.canceled).toBe(false);
    expect(r.preview?.personCount).toBe(1);
  });

  it('gedcom.import returns the { success, report } envelope', async () => {
    mockGedRead();
    const db = await createTestDb();
    const { api } = mountWindowApi(db as unknown as import('node-sqlite3-wasm').Database);
    const r = (await api.gedcom.import({ filePath: '/tmp/tree.ged' })) as {
      success?: boolean;
      error?: string;
      report?: { persons: number };
    };
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
    expect(r.report?.persons).toBe(1);
  });
  // ---------------------------------------------------------------------
  // Cancel is not failure.
  //
  // Every dialog-fronted binding must distinguish three outcomes: the user
  // dismissed the dialog, the operation succeeded, the operation failed.
  // `api.backup.backup` / `.restore` encoded a dismissed dialog as
  // `{ success: false, error: 'Cancelled' }`, so the only way to tell it from
  // a real failure was to match that string. Consumers guarded on `success`
  // alone and therefore swallowed genuine errors rather than speak on every
  // cancel. These assert the `canceled` flag those consumers now branch on.
  // ---------------------------------------------------------------------

  it('backup.backup reports a dismissed dialog as canceled, not a bare failure', async () => {
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === 'db_current_path') return Promise.resolve('/tmp/family.db');
      if (cmd === 'dialog_pick') return Promise.resolve({ canceled: true });
      return Promise.resolve(undefined);
    });
    const { api } = mountWindowApi(stubDb);
    const r = (await (api.backup as unknown as {
      backup: () => Promise<{ canceled?: boolean; success?: boolean }>;
    }).backup());
    expect(r.canceled).toBe(true);
    expect(r.success).toBe(false);
  });

  it('backup.restore reports a dismissed dialog as canceled, not a bare failure', async () => {
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === 'dialog_pick') return Promise.resolve({ canceled: true });
      return Promise.resolve(undefined);
    });
    const { api } = mountWindowApi(stubDb);
    const r = (await (api.backup as unknown as {
      restore: () => Promise<{ canceled?: boolean; success?: boolean }>;
    }).restore());
    expect(r.canceled).toBe(true);
    expect(r.success).toBe(false);
  });
});

// useAppUpdater gates on `__TAURI_INTERNALS__`. In the test env (no
// Tauri), every action no-ops. We also exercise the progress accumulator
// directly by stubbing the dynamic-import target.
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useAppUpdater (non-Tauri env)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Ensure no Tauri internals are present.
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });

  it('supported is false; checkNow / installNow no-op safely', async () => {
    const { useAppUpdater } = await import('../../../../src/renderer/composables/useAppUpdater');
    const u = useAppUpdater();
    expect(u.supported.value).toBe(false);
    expect(u.available.value).toBeNull();
    expect(await u.checkNow()).toBeNull();
    const res = await u.installNow();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('updater_unavailable');
  });
});

describe('useAppUpdater (Tauri env, mocked wrapper)', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    }
  });

  it('checkNow populates `available` from the wrapper Update object', async () => {
    vi.doMock('@tauri-apps/plugin-updater', () => ({
      check: vi.fn(async () => ({
        version: '1.2.3',
        body: 'release notes',
        date: '2026-05-31',
        downloadAndInstall: vi.fn(),
      })),
    }));
    const { useAppUpdater } = await import('../../../../src/renderer/composables/useAppUpdater');
    const u = useAppUpdater();
    const result = await u.checkNow();
    expect(result).toEqual({ version: '1.2.3', body: 'release notes', date: '2026-05-31' });
    expect(u.available.value).toEqual({ version: '1.2.3', body: 'release notes', date: '2026-05-31' });
  });

  it('installNow streams progress and sets installed on completion', async () => {
    const downloadAndInstall = vi.fn(async (cb: (event: { event: string; data?: Record<string, number> }) => void) => {
      cb({ event: 'Started', data: { contentLength: 100 } });
      cb({ event: 'Progress', data: { chunkLength: 30 } });
      cb({ event: 'Progress', data: { chunkLength: 70 } });
      cb({ event: 'Finished' });
    });
    vi.doMock('@tauri-apps/plugin-updater', () => ({
      check: vi.fn(async () => ({ version: '1.0.0', body: '', downloadAndInstall })),
    }));
    const { useAppUpdater } = await import('../../../../src/renderer/composables/useAppUpdater');
    const u = useAppUpdater();
    await u.checkNow();
    const res = await u.installNow();
    expect(res.ok).toBe(true);
    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(u.progress.value).toEqual({ downloaded: 100, total: 100 });
    expect(u.installed.value).toBe(true);
  });

  it('installNow surfaces wrapper errors', async () => {
    vi.doMock('@tauri-apps/plugin-updater', () => ({
      check: vi.fn(async () => ({
        version: '1.0.0',
        body: '',
        downloadAndInstall: vi.fn(async () => { throw new Error('network unreachable'); }),
      })),
    }));
    const { useAppUpdater } = await import('../../../../src/renderer/composables/useAppUpdater');
    const u = useAppUpdater();
    await u.checkNow();
    const res = await u.installNow();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/network unreachable/);
    expect(u.installed.value).toBe(false);
  });
});

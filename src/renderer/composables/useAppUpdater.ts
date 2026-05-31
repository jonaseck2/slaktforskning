// src/renderer/composables/useAppUpdater.ts
//
// Auto-updater state shared across the app. Wraps the official Tauri
// `@tauri-apps/plugin-updater` JS API so we get the standard surface:
// `check()` returns an Update object, and `update.downloadAndInstall(cb)`
// streams progress events while the bytes flow.
//
// Tauri-only: the JS wrapper calls `invoke(...)` which only works inside
// the Tauri webview. In the static SPA build (no Tauri internals), every
// public action no-ops.
import { ref, readonly, computed } from 'vue';
import type { Ref } from 'vue';

export interface AvailableUpdate {
  version: string;
  body: string;
  date?: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

// Tauri-plugin-updater's `Update` shape — typed loosely to keep this file
// free of a hard import of `@tauri-apps/plugin-updater` (which would pull
// the wrapper into the static SPA bundle).
interface TauriUpdate {
  version: string;
  body?: string;
  date?: string;
  downloadAndInstall: (cb?: (event: TauriDownloadEvent) => void) => Promise<void>;
}
type TauriDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

const available = ref<AvailableUpdate | null>(null);
const checking = ref(false);
const installing = ref(false);
const progress = ref<DownloadProgress | null>(null);
const installed = ref(false); // flips to true after a successful install
let bootCheckStarted = false;
let cachedUpdate: TauriUpdate | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function checkNow(): Promise<AvailableUpdate | null> {
  if (!isTauri()) return null;
  checking.value = true;
  try {
    // Dynamic import keeps the wrapper out of the static SPA bundle.
    const { check } = (await import('@tauri-apps/plugin-updater')) as {
      check: () => Promise<TauriUpdate | null>;
    };
    const update = await check();
    if (!update) {
      cachedUpdate = null;
      available.value = null;
      return null;
    }
    cachedUpdate = update;
    available.value = {
      version: update.version,
      body: update.body ?? '',
      date: update.date,
    };
    return available.value;
  } catch (e) {
    // Common in `tauri dev` (manifest unreachable / dev pubkey) or when
    // offline. Treat all errors as "no update" — the UI never blames the
    // user for the updater's network problems.
    console.warn('[updater] check failed:', e);
    cachedUpdate = null;
    available.value = null;
    return null;
  } finally {
    checking.value = false;
  }
}

function checkOnBoot(delayMs = 5000): void {
  if (bootCheckStarted) return;
  if (!isTauri()) return;
  bootCheckStarted = true;
  setTimeout(() => {
    checkNow().catch((e) => {
      console.warn('[updater] boot check threw:', e);
    });
  }, delayMs);
}

async function installNow(): Promise<{ ok: boolean; error?: string }> {
  if (!isTauri()) return { ok: false, error: 'updater_unavailable' };
  // If `available` is set but we don't have the Update reference (e.g. the
  // composable's module state got reset by HMR), re-run check to recover it.
  if (!cachedUpdate) {
    await checkNow();
    if (!cachedUpdate) return { ok: false, error: 'no_update_available' };
  }
  installing.value = true;
  progress.value = { downloaded: 0, total: null };
  try {
    await cachedUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          progress.value = {
            downloaded: 0,
            total: typeof event.data.contentLength === 'number' ? event.data.contentLength : null,
          };
          break;
        case 'Progress':
          if (progress.value) {
            progress.value = {
              downloaded: progress.value.downloaded + event.data.chunkLength,
              total: progress.value.total,
            };
          }
          break;
        case 'Finished':
          if (progress.value && progress.value.total !== null) {
            progress.value = { downloaded: progress.value.total, total: progress.value.total };
          }
          break;
      }
    });
    installed.value = true;
    return { ok: true };
  } catch (e) {
    console.error('[updater] install failed:', e);
    return { ok: false, error: String(e) };
  } finally {
    installing.value = false;
  }
}

export function useAppUpdater() {
  return {
    available: readonly(available) as Readonly<Ref<AvailableUpdate | null>>,
    checking: readonly(checking) as Readonly<Ref<boolean>>,
    installing: readonly(installing) as Readonly<Ref<boolean>>,
    progress: readonly(progress) as Readonly<Ref<DownloadProgress | null>>,
    installed: readonly(installed) as Readonly<Ref<boolean>>,
    supported: computed(() => isTauri()),
    checkOnBoot,
    checkNow,
    installNow,
  };
}

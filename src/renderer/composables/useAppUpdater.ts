// src/renderer/composables/useAppUpdater.ts
//
// Auto-updater state shared across the app. Wraps the `window.api.app`
// updater polyfill (which talks to tauri-plugin-updater) and exposes a
// single reactive `available` ref so AboutModal can render the install
// affordance once App.vue's boot check (or a manual re-check) detects an
// update.
//
// Tauri-only. In the static SPA and the renderer dev server outside
// Tauri, `window.api.app.checkForUpdates` is absent and every action
// resolves to a no-op result.
import { ref, readonly } from 'vue';

export interface AvailableUpdate {
  version: string;
  body: string;
}

const available = ref<AvailableUpdate | null>(null);
const checking = ref(false);
const installing = ref(false);
let bootCheckStarted = false;

function getChecker(): (() => Promise<{ available: false } | { available: true; version: string; body: string }>) | null {
  const fn = window.api?.app?.checkForUpdates;
  return typeof fn === 'function' ? fn : null;
}

function getInstaller(): (() => Promise<{ ok: true } | { ok: false; error: string }>) | null {
  const fn = window.api?.app?.downloadAndInstallUpdate;
  return typeof fn === 'function' ? fn : null;
}

async function checkNow(): Promise<AvailableUpdate | null> {
  const checker = getChecker();
  if (!checker) return null;
  checking.value = true;
  try {
    const res = await checker();
    if (res.available) {
      available.value = { version: res.version, body: res.body };
      return available.value;
    }
    available.value = null;
    return null;
  } finally {
    checking.value = false;
  }
}

function checkOnBoot(delayMs = 5000): void {
  if (bootCheckStarted) return;
  if (!('__TAURI_INTERNALS__' in window)) return;
  bootCheckStarted = true;
  setTimeout(() => {
    checkNow().catch((e) => {
      // Polyfill already swallows errors and returns { available: false };
      // anything thrown here is unexpected. Don't surface to the user.
      console.warn('[updater] boot check threw:', e);
    });
  }, delayMs);
}

async function installNow(): Promise<{ ok: boolean; error?: string }> {
  const installer = getInstaller();
  if (!installer) return { ok: false, error: 'updater_unavailable' };
  installing.value = true;
  try {
    const res = await installer();
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } finally {
    installing.value = false;
  }
}

export function useAppUpdater() {
  return {
    available: readonly(available),
    checking: readonly(checking),
    installing: readonly(installing),
    checkOnBoot,
    checkNow,
    installNow,
  };
}

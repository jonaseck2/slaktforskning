// Per-database display options for person names.
//
// Backed by the `db_settings` row `display_birth_name_parenthetical`
// (`'1'` / `'0'`, treated as boolean). Default is ON — when the row is
// absent, the parenthetical is shown. The Settings UI writes via
// `setShowBirthNameParenthetical`. Every name-rendering surface in the app
// reads this store; no other code path may touch the underlying setting.
//
// Static-SPA gotcha: `window.api` may be undefined when this store is first
// instantiated outside the Electron renderer (the bundled views run in the
// website-export SPA too). Guard every access — see `.claude/rules/renderer.md`.

import { defineStore } from 'pinia';
import { ref } from 'vue';

interface WindowApi {
  api?: {
    db?: {
      getSetting?: (key: string) => Promise<string | null>;
      setSetting?: (key: string, value: string) => Promise<void>;
    };
  };
}

function getWindowApi(): WindowApi['api'] | undefined {
  // Use globalThis to stay safe in node test environments where `window` is undefined.
  return (globalThis as unknown as WindowApi).api;
}

const SETTING_KEY = 'display_birth_name_parenthetical';

export const usePersonNameOptions = defineStore('personNameOptions', () => {
  const showBirthNameParenthetical = ref<boolean>(true);

  async function init(): Promise<void> {
    const getSetting = getWindowApi()?.db?.getSetting;
    if (!getSetting) {
      // Static SPA / preload not yet wired — keep default-on.
      showBirthNameParenthetical.value = true;
      return;
    }
    try {
      const raw = await getSetting(SETTING_KEY);
      // Only an explicit '0' disables. '1', null, '' all map to true.
      showBirthNameParenthetical.value = raw !== '0';
    } catch {
      showBirthNameParenthetical.value = true;
    }
  }

  async function setShowBirthNameParenthetical(value: boolean): Promise<void> {
    // Update the ref synchronously so the UI re-renders immediately;
    // persistence happens in the background.
    showBirthNameParenthetical.value = value;
    const setSetting = getWindowApi()?.db?.setSetting;
    if (!setSetting) return;
    try {
      await setSetting(SETTING_KEY, value ? '1' : '0');
    } catch {
      // Failure to persist doesn't roll back the ref — user sees the change
      // they asked for; next app launch will fall back to default-on.
    }
  }

  return {
    showBirthNameParenthetical,
    init,
    setShowBirthNameParenthetical,
  };
});

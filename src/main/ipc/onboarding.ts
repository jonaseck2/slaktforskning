import { loadSettings, saveSettings } from '../settings';
import type { WrapHandlerFn } from './wrap-handler';

// Onboarding "seen" state lives in the per-user settings.json (read/written via
// loadSettings / saveSettings, both of which require Electron's `app.getPath`).
// Because the main → settings → electron import chain cannot run inside the DB
// worker, these channels are registered via wrapHandler on the main thread and
// listed in MAIN_THREAD_ONLY_CHANNELS — same shape as db:getCurrent / db:getRecent.

export function handleOnboardingGetSeen(): Record<string, true> {
  return loadSettings().onboarding.seen;
}

export function handleOnboardingMarkSeen({ key }: { key: string }): void {
  const s = loadSettings();
  s.onboarding.seen[key] = true;
  saveSettings(s);
}

export function handleOnboardingReset(): void {
  const s = loadSettings();
  s.onboarding.seen = {};
  saveSettings(s);
}

export function registerOnboardingHandlers(wrapHandler: WrapHandlerFn): void {
  wrapHandler('onboarding:getSeen', () => handleOnboardingGetSeen());
  wrapHandler('onboarding:markSeen', (payload) => {
    handleOnboardingMarkSeen(payload as { key: string });
  });
  wrapHandler('onboarding:reset', () => handleOnboardingReset());
}

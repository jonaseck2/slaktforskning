import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface OnboardingState {
  seen: Record<string, true>;
}

export interface AppSettings {
  lastDatabase?: string;
  recentDatabases: string[];
  onboarding: OnboardingState;
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const defaultOnboarding = (): OnboardingState => ({ seen: {} });

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const onboarding = parsed.onboarding && typeof parsed.onboarding === 'object'
      ? { seen: { ...((parsed.onboarding as OnboardingState).seen ?? {}) } }
      : defaultOnboarding();
    return {
      lastDatabase: parsed.lastDatabase,
      recentDatabases: Array.isArray(parsed.recentDatabases) ? parsed.recentDatabases : [],
      onboarding,
    };
  } catch {
    return { recentDatabases: [], onboarding: defaultOnboarding() };
  }
}

export function saveSettings(s: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8');
}

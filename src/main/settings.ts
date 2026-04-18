import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface AppSettings {
  lastDatabase?: string;
  recentDatabases: string[];
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      lastDatabase: parsed.lastDatabase,
      recentDatabases: Array.isArray(parsed.recentDatabases) ? parsed.recentDatabases : [],
    };
  } catch {
    return { recentDatabases: [] };
  }
}

export function saveSettings(s: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8');
}

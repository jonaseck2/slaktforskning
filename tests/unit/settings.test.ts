import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/sf-test-settings' },
}));

import { loadSettings, saveSettings, type AppSettings } from '../../src/main/settings';

const dir = '/tmp/sf-test-settings';

beforeEach(async () => {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
});

describe('AppSettings onboarding', async () => {
  it('returns empty onboarding.seen on first load', async () => {
    const s = loadSettings();
    expect(s.onboarding).toEqual({ seen: {} });
  });

  it('round-trips onboarding.seen via save + load', async () => {
    const original: AppSettings = {
      recentDatabases: [],
      onboarding: { seen: { 'coach.hourglass.focus': true } },
    };
    saveSettings(original);
    const loaded = loadSettings();
    expect(loaded.onboarding.seen['coach.hourglass.focus']).toBe(true);
  });

  it('tolerates a settings file with no onboarding key (forward-compat)', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ recentDatabases: [] }));
    const s = loadSettings();
    expect(s.onboarding).toEqual({ seen: {} });
  });
});

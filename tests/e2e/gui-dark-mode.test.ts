/**
 * E2E: Dark mode theme identity — each theme has distinct dark surfaces.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19249;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'dark-mode');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

test.describe('Dark mode theme identity', () => {
  const themes = ['forest', 'nordic', 'twilight'] as const;

  for (const theme of themes) {
    test(`${theme} dark mode has theme-tinted surface`, async () => {
      // Set theme and dark mode via evaluate
      await app.executeJs(`
        document.documentElement.className = 'theme-${theme} dark';
      `);
      await app.settle(100);

      // Read computed surface-bg
      const surfaceBg = await app.executeJs<string>(`
        getComputedStyle(document.documentElement).getPropertyValue('--surface-bg').trim()
      `);

      // Each theme should have a DIFFERENT surface-bg in dark mode
      // Forest: #1a2a1e, Nordic: #1a2030, Twilight: #1e1a28
      expect(surfaceBg).not.toBe('#1f2937'); // old shared gray
      expect(surfaceBg.length).toBeGreaterThan(0);
    });
  }

  test('all three themes have distinct dark surface colors', async () => {
    const surfaces: string[] = [];
    for (const theme of themes) {
      await app.executeJs(`
        document.documentElement.className = 'theme-${theme} dark';
      `);
      await app.settle(50);
      const bg = await app.executeJs<string>(`
        getComputedStyle(document.documentElement).getPropertyValue('--surface-bg').trim()
      `);
      surfaces.push(bg);
    }
    // All three must be different
    expect(new Set(surfaces).size).toBe(3);
  });
});

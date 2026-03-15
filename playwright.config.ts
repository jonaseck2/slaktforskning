import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: 'app.test.ts',
      timeout: 60000,
    },
    {
      name: 'gui',
      testMatch: 'gui.test.ts',
      timeout: 120000,
    },
  ],
});

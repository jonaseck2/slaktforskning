import { defineConfig } from '@playwright/test';

/**
 * E2E config — lean by design.
 *
 * What e2e covers (and only this):
 *   • app boot + Vue mount (smoke)
 *   • MCP prod + dev server stdio handshake
 *   • renderer → preload → main → worker → SQLite IPC round-trip (CRUD)
 *   • website export filesystem round-trip
 *
 * Everything else (UI state, filtering, status cycling, search, charts,
 * theming, modals, validation) is covered by tests/unit/ and tests/components/.
 *
 * Tests run against the packaged binary built by `npm run package`.
 * The pretest:e2e script handles this automatically.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  // Parallel-safe: each project owns a distinct UI port and a temp DB.
  workers: 2,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: 'app.test.ts',
      timeout: 60_000,
    },
    {
      name: 'crud',
      testMatch: 'crud-roundtrip.test.ts',
      timeout: 60_000,
      retries: 1,
    },
    {
      name: 'website-export',
      testMatch: 'website-export.test.ts',
      timeout: 60_000,
      retries: 1,
    },
  ],
});

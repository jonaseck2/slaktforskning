import { defineConfig } from '@playwright/test';

/**
 * E2E config — two tiers.
 *
 * Tier 1 (CI, `npm run test:e2e`):
 *   • boot              — app boot + Vue mount + MCP stdio handshake
 *   • crud              — renderer → window.api → rusqlite IPC round-trip
 *   • website-export    — website export filesystem round-trip
 *   • duplicates        — duplicates + merge round-trip
 *
 * Tier 2 (local + nightly once OSS, `npm run test:e2e:full`):
 *   • repositories      — Repositories entity CRUD + source-link round-trip
 *   • panels            — Surface Contract checks across every *Panel.vue
 *   • reactivity        — cross-view refresh (left list + center view + right panel)
 *   • imports           — importer regression coverage (GEDCOM, Holger, Genney, …)
 *
 * Tier 1 (boot/crud/website-export/duplicates) runs in CI; Tier 2
 * (repositories/panels/reactivity/imports) is `npm run test:e2e:full` only —
 * it stays out of PR CI until this repo has free OSS build minutes, at which
 * point it gets wired to a nightly workflow.
 *
 * Tests run against the packaged binary built by `npm run build:e2e`.
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
      name: 'boot',
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
    {
      name: 'duplicates',
      testMatch: 'duplicates.spec.ts',
      timeout: 60_000,
      retries: 1,
    },
    {
      name: 'repositories',
      testMatch: 'repositories.spec.ts',
      timeout: 60_000,
      retries: 1,
    },
    {
      name: 'panels',
      testMatch: 'panel-surface.spec.ts',
      timeout: 60_000,
      retries: 1,
    },
    {
      name: 'reactivity',
      testMatch: 'reactivity.spec.ts',
      timeout: 60_000,
      retries: 1,
    },
    {
      name: 'imports',
      testMatch: 'imports.spec.ts',
      timeout: 120_000,
      retries: 1,
    },
  ],
});

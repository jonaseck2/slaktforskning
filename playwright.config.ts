import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  retries: 0,
  // Match CI parallelism (--workers=2) so local runs reflect the same constraints.
  workers: 2,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Smoke: app launch (90s cold build) + MCP handshake. No GUI.
      name: 'smoke',
      testMatch: 'app.test.ts',
      timeout: 120000,
    },
    {
      // Persons CRUD, Navigation, Search, Citation Badges, Add Related Person
      name: 'gui-persons',
      testMatch: 'gui-persons.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Sources CRUD, Relationships CRUD, Global Search
      name: 'gui-sources-rels',
      testMatch: 'gui-sources-rels.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Places CRUD, Place Detail, Address fields, Place hierarchy
      name: 'gui-places',
      testMatch: 'gui-places.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Visualization: empty state, person selection, tab switching, SVG rendering
      name: 'gui-viz',
      testMatch: 'gui-viz.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // ARIA accessibility verification
      name: 'gui-a11y',
      testMatch: 'gui-a11y.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Quality checks: run, filter, ignore/restore
      name: 'gui-quality',
      testMatch: 'gui-quality.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Media library: gallery/list toggle, search, inline edit, delete
      name: 'gui-media',
      testMatch: 'gui-media.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Settings: database tab, tree subject, tabs navigation, import/export
      name: 'gui-settings',
      testMatch: 'gui-settings.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Research Tasks: CRUD, status cycling, inline edit, filter chips
      name: 'gui-research-tasks',
      testMatch: 'gui-research-tasks.test.ts',
      timeout: 120000,
      retries: 1,
    },
    {
      // Dark mode: per-theme distinct surfaces (Forest/Nordic/Twilight)
      name: 'gui-dark-mode',
      testMatch: 'gui-dark-mode.test.ts',
      timeout: 60000,
      retries: 1,
    },
    {
      // Reports view: smoke-test all seven keepsake tabs render a preview
      name: 'gui-reports',
      testMatch: 'gui-reports.test.ts',
      timeout: 120000,
      retries: 1,
    },
  ],
});

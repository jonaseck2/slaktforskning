import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  retries: 0,
  // Run projects in parallel — each gui-* project has its own Electron instance and port
  workers: 4,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Fast smoke tests: app launch + MCP server handshake. No GUI.
      name: 'smoke',
      testMatch: 'app.test.ts',
      timeout: 60000,
    },
    {
      // Persons CRUD, Navigation, Search, Citation Badges, Add Related Person
      name: 'gui-persons',
      testMatch: 'gui-persons.test.ts',
      timeout: 120000,
    },
    {
      // Sources CRUD, Relationships CRUD, Global Search
      name: 'gui-sources-rels',
      testMatch: 'gui-sources-rels.test.ts',
      timeout: 120000,
    },
    {
      // Places CRUD, Place Detail, Address fields, Place hierarchy
      name: 'gui-places',
      testMatch: 'gui-places.test.ts',
      timeout: 120000,
    },
    {
      // Visualization: empty state, person selection, tab switching, SVG rendering
      name: 'gui-viz',
      testMatch: 'gui-viz.test.ts',
      timeout: 120000,
    },
  ],
});

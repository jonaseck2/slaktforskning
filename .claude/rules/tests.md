---
paths:
  - "tests/**/*.ts"
  - "playwright.config.ts"
  - "vitest.config.mts"
---

# Test Rules

Loads when working in `tests/` or test config. The `/test` skill has the full template + AppDriver API + every E2E pitfall.

## Unit Tests (Vitest)

Tests live in `tests/unit/` and test `src/api/` directly with an in-memory SQLite database. Config: `vitest.config.mts`.

```typescript
import { createTestDb } from './helpers';
let db: any;
beforeEach(() => { db = createTestDb(); }); // Fresh DB per test
```

Coverage threshold: **80% lines and functions on `src/api/`** (enforced by `vitest.config.mts`). Build fails if coverage drops below.

**Critical rule:** for any feature involving transforms or imports, tests must assert the actual database state — not just the return value of the function. Return-value-only tests can silently pass while the feature is broken (the EVENT_PLACE column-name bug shows why fixture-mirrored assertions silently pass on broken transforms).

## E2E Tests (Playwright)

Tests live in `tests/e2e/` and run against the **packaged Electron binary**, not `electron-forge start`. `npm run test:e2e` calls `npm run package` first via `pretest:e2e`, then runs Playwright. This avoids Vite-dev contention and matches what users actually run.

11 test projects, each with its own port (19242–19251). Full run: ~1.5 min wall clock × 10 workers in parallel.

- `app.test.ts` — packaged app boot, prod MCP, dev MCP (3 cases)
- `gui-persons.test.ts` — Persons CRUD, navigation, search, add related person
- `gui-sources-rels.test.ts` — Sources CRUD, relationships CRUD, global search
- `gui-places.test.ts` — Places CRUD, detail, address fields, hierarchy
- `gui-viz.test.ts` — Visualization: empty state, tabs, SVG rendering
- `gui-a11y.test.ts` — ARIA accessibility verification
- `gui-quality.test.ts` — Quality checks: run, filter, ignore/restore
- `gui-media.test.ts` — Media library: gallery/list, search, panel title edit, delete
- `gui-settings.test.ts` — Settings: database tab, tree subject, tab navigation
- `gui-research-tasks.test.ts` — Research tasks: CRUD, status cycling, inline edit, filters
- `gui-dark-mode.test.ts` — Per-theme dark mode surface distinctness
- `crud-roundtrip.test.ts` — One IPC round-trip across persons/places/sources/relationships/events/citations
- `website-export.test.ts` — Filesystem export round-trip

Each test uses `startApp(port, tag)` from `fixture.ts`, which spawns the packaged binary with a temp DB and waits for HTTP + Vue mount. UI control via the in-app `ui-server` on `SLAKTFORSKNING_UI_PORT`.

**Port must be unique per test file.** Two files sharing a port cause one Electron instance to kill the other mid-run, producing confusing "Vue did not initialize in time" errors. Allocate the next free port when adding a suite.

**What e2e does NOT cover** (and shouldn't): UI rendering, modals, filter chips, status cycling, search filtering, badge rendering, theming, form validation, route config — these are in `tests/components/` and `tests/unit/`. The api/ layer is exhaustively unit-tested against in-memory SQLite. E2e exists only for things that can only diverge at runtime (real packaging, real IPC chain, real filesystem).

The `/test` skill has the full E2E pitfall list — CSS selector mismatches with AppButton/FilterChips, executeJs IIFE wrapping, getDom() including `<style>` blocks, the navigate-away-then-back data seeding pattern, the Vue `:value` + `@blur` inline-edit pattern, localStorage retry leaks, port allocation, route `/` redirect, and the no-back-buttons rule.

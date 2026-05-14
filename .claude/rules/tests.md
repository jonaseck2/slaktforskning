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

Tests live in `tests/e2e/` and run against the **packaged Tauri binary**, not `npm start`. The `pretest:e2e` script chains `prebuild:e2e` (`build:static`) → `build:e2e` (`tauri build --no-bundle`). The packaged binary is then driven by the dev MCP HTTP bridge on `SLAKTFORSKNING_UI_PORT` (the `POST /eval` + `POST /screenshot` surface inside the running app). Headless via `SLAKTFORSKNING_HEADLESS=1` (off-screen window + macOS Accessory activation policy + Windows skip_taskbar — no Dock icon, no focus theft).

Two tiers, two npm scripts:

### Tier 1 — `npm run test:e2e` (runs in CI on every PR; gates merge; <5 min wall clock)

- `boot` (app.test.ts) — packaged app launches, Vue mounts, prod MCP + dev MCP respond
- `crud` (crud-roundtrip.test.ts) — one IPC round-trip across persons / places / sources / relationships / events / citations
- `website-export` (website-export.test.ts) — filesystem export round-trip
- `duplicates` (duplicates.spec.ts) — four-tab duplicates panel: seed, switch tab, merge, gone

### Tier 2 — `npm run test:e2e:full` (runs locally during plan close-out; nightly on `main` once public OSS)

- `panels` (panel-surface.spec.ts) — data-driven Surface Contract checks across all 8 right-side panels (PersonPanel, PlacePanel, SourcePanel, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel). 4 checks per applicable section: host-flows-in, fulfills-label, lifecycle-parity, no-degradation. ExportOptionsPanel excluded — it's an embedded options card, not a paneled-route panel.
- `reactivity` (reactivity.spec.ts) — every consumer surface refreshes after MCP-side mutations within ~2s without view-switch. ~14 triples covering the 6 host-having panels + 7 list views + chart.
- `imports` (imports.spec.ts) — each native importer round-trips a tiny fixture (GEDCOM 5.5.1, GEDCOM 7.0, plus per-dialect GEDCOMs for Holger / RootsMagic / Gramps / Family Tree Maker). Native binary formats (.gpkg, .rmtree, .gramps) TODO'd until tiny fixtures exist.

Each project owns a distinct port (19242 + project index). The `pretest:e2e` / `pretest:e2e:full` scripts handle the Tauri bundle build.

**Adding a new panel:** append a `PanelDescriptor` to `tests/e2e/fixtures/panels.ts` — no new spec file.
**Adding a new importer:** drop a fixture into `tests/e2e/fixtures/imports/` (or `tests/fixtures/gedcom/dialects/`) and append a case to `tests/e2e/imports.spec.ts`'s `CASES` array.
**Adding a new consumer:** append a `ReactivityTriple` to `tests/e2e/fixtures/reactivity-triples.ts`.

Each test uses `startApp(port, tag)` from `fixture.ts`, which spawns the packaged binary with a temp DB and waits for HTTP + Vue mount. UI control via the dev MCP bridge.

**Port must be unique per project.** Two projects sharing a port cause one instance to kill the other mid-run.

**What e2e does NOT cover** (and shouldn't): pixel-perfect rendering, filter chips, status cycling, search filtering, badge rendering, theming, form validation, route config — these are in `tests/components/` and `tests/unit/`. The api/ layer is exhaustively unit-tested against in-memory SQLite. E2e exists only for things that can only diverge at runtime (real packaging, real IPC chain, real filesystem, real `data-changed` propagation, real Surface Contract violations).

The `/test` skill has the full E2E pitfall list — CSS selector mismatches with AppButton/FilterChips, executeJs IIFE wrapping, getDom() including `<style>` blocks, the navigate-away-then-back data seeding pattern, the Vue `:value` + `@blur` inline-edit pattern, localStorage retry leaks, port allocation, route `/` redirect, and the no-back-buttons rule.

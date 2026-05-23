---
name: test
description: Run tests, write new tests, and verify code changes. Use when implementing features, fixing bugs, or before committing.
---

# Test Skill

Three layers: Vitest unit + component tests, Playwright e2e against the packaged Tauri binary, and manual/MCP-driven UI verification for changes the test suite can't see.

## Running tests

```bash
npm test                # Vitest unit + component (~4000 tests, 80% coverage threshold on src/api/)
npm test -- --coverage  # Coverage report (v8, src/api/ only)
npm run test:watch      # Watch mode

npm run test:e2e        # Tier 1 Playwright: boot, crud, website-export, duplicates (gates CI/merge, <5 min)
npm run test:e2e:full   # Tier 1 + Tier 2: panels, reactivity, imports (plan close-out)
npx playwright test --project=boot     # One project (the `pretest:e2e` script builds the bundle for you)

npm run lint            # ESLint (must pass 0 errors)
```

Full verify before commit: `npm run lint && npm test`. E2E runs in CI on PRs; for direct-to-main pushes the executor runs the appropriate tier locally and captures the summary in the commit message (see `e2e-evidence` skill).

## Writing unit tests

`tests/unit/<entity>.test.ts` mirrors `src/api/<entity>.ts`. Fresh in-memory SQLite per test via `createTestDb()`.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createThing, getThing, listThings } from '../../src/api/things';

let db: any;
beforeEach(() => { db = createTestDb(); });

describe('things', () => {
  it('creates a thing', () => {
    const thing = createThing(db, { name: 'test' });
    expect(thing.id).toBeDefined();
    expect(thing.name).toBe('test');
  });
});
```

Rules:
- Test `src/api/` functions directly; never IPC, never Vue components, never mocks.
- Use the actual api functions to seed data — never hand-rolled SQL inserts.
- `db.get()` returns `undefined` not `null`; parameter binding via arrays (see `rules/api.md`).
- Coverage thresholds (80% lines + functions on `src/api/`) are enforced by `vitest.config.mts`.

### Per-CRUD-function checklist (don't skip the negatives)

1. **Create** — returns entity with UUID id, fields match input, defaults work
2. **Get by ID** — returns entity; **returns null for missing ID** (not undefined — api/ uses `?? null`)
3. **List** — returns array, respects ordering
4. **Update** — changes specified fields, leaves others untouched, returns updated entity
5. **Delete** — returns true on success; **returns false for missing ID**; cascades correctly (verify child rows are gone)

### Import/transform tests — assert DB state, not just return values

```typescript
const report = importGedcom(db, gedcomString);
expect(listPersons(db)).toHaveLength(3);          // query the DB
expect(listPlaces(db)).toHaveLength(2);
expect(getEventsForPerson(db, id)).toHaveLength(1);
```

Why: when the transform and the fixture share the same wrong assumption (e.g. a misnamed column), a fixture-only comparison silently passes while the bug exists. DB-level assertions catch this — the EVENT_PLACE column-name bug is the canonical case.

### Design-token tests — WCAG contrast

Any change to color tokens in `tokens.css` or `shared.css` is guarded by `tests/unit/wcagContrast.test.ts`. Parses both CSS files, builds the effective palette for every (theme × appearance) combination (Forest/Nordic/Twilight × light/dark/high-contrast), asserts every text-on-bg pair against its WCAG threshold:
- High-contrast → AAA (≥7:1 body, ≥4.5:1 large)
- Light/dark → AA (≥4.5:1 body, ≥3:1 large)
- Non-text UI (borders on surfaces) → ≥3:1

Run `npx vitest run tests/unit/wcag*` after any color-token edit.

### Design-token tests — export colour invariance

`tests/components/exportTextColorInvariance.test.ts` proves PDF/SVG/print render identically regardless of current theme. Inlines `tokens.css` + `shared.css` with `@media print` unwrapped, wraps text in `.export-scope`, toggles `html` classes across all theme × appearance combos, asserts `getComputedStyle(el).color` identical everywhere. Includes a sanity test that bare elements outside the scope *do* drift. Run after any edit to `tokens.css`, `shared.css`, or `useChartColors.ts`.

## Component tests

`tests/components/` — Vue components with Happy DOM (no real browser). Use for components with significant interaction logic.

**Worth component-testing:** form components with validation/debounce (DateInput, PersonPicker, PlacePicker); modal workflows (EventModal, CitationModal, PersonModal with relatedTo); chart/layout components; keyboard/a11y logic.

**Not worth:** presentational components (AppBadge, AppAvatar, AppButton) — e2e covers them; simple list/table views — e2e covers CRUD flows.

## E2E tests

`tests/e2e/` runs Playwright against the packaged Tauri binary, driven by the dev MCP HTTP bridge inside the running app. **`rules/tests.md` is canonical** — it lists every project, the two tiers, fixture-driven shapes (`panels.ts`, `reactivity-triples.ts`, `imports.spec.ts CASES`), and adding-a-new-X guidance. **`e2e-evidence` skill** decides which tier to run and what to capture for plan close-out.

When writing e2e specs, follow the existing fixture-driven shape — append a `PanelDescriptor` / `ReactivityTriple` / `CASES` entry rather than creating new spec files for one-off scenarios.

## UI verification (required for UI changes)

Unit and component tests don't cover the rendering stack, modal lifecycle, Vue Router behavior, or visual correctness. Verify in the running app via the `slaktforskning-dev` MCP before committing UI changes.

```
ui_navigate { path: '/your-route' }
ui_screenshot { selector: '.your-target' }    # crops to the element; <1 KB PNG if scoped
ui_query_styles { selector: '.your-target' }  # computed styles + bounding rect
ui_get_dom { selector: '.your-target' }       # outerHTML of one element
ui_click { selector: 'button.btn-add' }
ui_fill { selector: 'input.name', value: 'X' }
ui_aria_audit                                 # ARIA findings against WCAG
```

See `tauri-dev` for launching the app under the dev MCP, `dom-first-debugging` for the read-DOM-before-reasoning discipline. The Chrome DevTools MCPs are **not** the right tool here — Tauri uses the system WebView, not Chromium with CDP; `chrome-devtools list_pages` returns only `about:blank`.

**Use UI verification:** after any Vue component / modal / routing change; when reproducing a reported bug visually; to confirm an IPC binding wires end-to-end; to validate a fix before committing.

## When tests fail

- Read the error message; don't blindly re-run.
- Decide whether it's a test bug or a code bug — the test may have wrong expectations after a legitimate code change.
- For SQLite errors: `db.get()` returns `undefined`, parameter binding uses arrays.
- For e2e timeouts: a previous app instance may still be holding the port — kill and retry; CSS selectors may not match the rendered class (grep the component source for the actual classes used by AppButton / FilterChips / etc.); localStorage state from a previous retry may need clearing.

## When to run tests

- Edited `src/api/*.ts` → `npm test`
- Added a new API function → `npm test -- --coverage` (thresholds must still pass)
- Edited a Rust command, db-shim, or `tauri-window-api.ts` → `npm run test:e2e` (boot + crud)
- Edited a panel, modal, list view, importer, or data-changed consumer → `npm run test:e2e:full`
- Before commit → `npm run lint && npm test`

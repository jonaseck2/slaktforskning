---
name: test
description: Run tests, write new tests, and verify code changes. Use when implementing features, fixing bugs, or before committing.
---

# Test Skill

## Running Tests

### Unit tests (API layer)
```bash
npm test                   # Run all unit + component tests (Vitest)
npm test -- --coverage     # Run with coverage report (v8, src/api/ only)
npm run test:watch         # Watch mode for active development
```

### E2E tests (Electron GUI + MCP server)
```bash
npx playwright test                              # All 10 projects in parallel
npx playwright test --project=gui-persons        # Single project
npx playwright test --project=gui-quality --project=gui-media  # Multiple projects
npx playwright test -g 'create a person'         # Filter by test name
```

### Lint
```bash
npm run lint                # Run ESLint (must pass with 0 errors)
```

### Full verification before committing
```bash
npm run lint && npm test && npx playwright test
```

### Coverage thresholds
`vitest.config.mts` enforces **80% lines and functions** on `src/api/`. The build fails if coverage drops below. Current baseline: ~90% statements, 100% lines, 100% functions.

## Writing Unit Tests

Unit tests live in `tests/unit/` and test the `src/api/` layer with an in-memory SQLite database.

### Pattern — always follow this structure:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
// Import the api functions you're testing:
import { createThing, getThing, listThings } from '../../src/api/things';

let db: any;

beforeEach(() => {
  db = createTestDb();  // Fresh in-memory DB with full schema
});

describe('things', () => {
  it('creates a thing', () => {
    const thing = createThing(db, { name: 'test' });
    expect(thing.id).toBeDefined();
    expect(thing.name).toBe('test');
  });

  it('lists things', () => {
    createThing(db, { name: 'a' });
    createThing(db, { name: 'b' });
    const list = listThings(db);
    expect(list).toHaveLength(2);
  });
});
```

### Key rules:
- **Test the `src/api/` functions directly** — not IPC, not Vue components
- **Use `createTestDb()`** from `tests/unit/helpers.ts` — gives you a fresh `:memory:` SQLite with full schema
- **Each `beforeEach` creates a fresh DB** — tests are isolated
- **node-sqlite3-wasm quirk**: `db.get()` returns `undefined` not `null`. The api/ functions handle this with `?? null`, but be aware in raw assertions.
- **Parameter binding uses arrays**: `stmt.run([a, b])` not `stmt.run(a, b)`

### Test file naming:
- `tests/unit/persons.test.ts` — tests `src/api/persons.ts`
- `tests/unit/families.test.ts` — tests `src/api/families.ts`
- `tests/unit/events.test.ts` — tests `src/api/events.ts`
- `tests/unit/sources.test.ts` — tests `src/api/sources.ts`

### What to test for each CRUD function:
1. **Create** — returns entity with UUID id, fields match input, defaults work
2. **Get by ID** — returns entity; **returns null for missing ID** (not undefined — api/ uses `?? null`)
3. **List** — returns array, respects ordering
4. **Update** — changes specified fields, leaves others untouched, returns updated entity
5. **Delete** — returns true on success; **returns false for missing ID**; cascades correctly (verify child rows are gone)

Negative cases (null returns, false returns) are easy to skip and frequently missed. Always include them.

### Import/transform tests — assert DB outcomes, not just fixtures

When testing import transforms (GEDCOM, Genney, etc.), **always query the DB and assert actual row counts/values** after running the import — don't only compare the transform output against a fixture.

```typescript
const report = importGedcom(db, gedcomString);
// Assert DB state, not just the report object:
expect(listPersons(db)).toHaveLength(3);
expect(listPlaces(db)).toHaveLength(2);
expect(getEventsForPerson(db, id)).toHaveLength(1);
```

Why: if both the transform code and the test fixture share the same wrong assumption (e.g. a misnamed column), a fixture-only comparison will silently pass while the bug exists. DB-level assertions catch this.

## Component Tests

Component tests live in `tests/components/` and test Vue components with Happy DOM (no real browser). Use for components with significant interaction logic.

### Good candidates for component tests:
- Form components with validation/debounce (DateInput, PersonPicker, PlacePicker)
- Modal components with multi-step workflows (EventForm, CitationForm, AddRelatedPersonModal)
- Chart/layout components (PedigreeChart, VisualizationView)
- Components with keyboard navigation or accessibility logic

### Not worth component-testing:
- Presentational components (AppBadge, AppAvatar, AppButton) — E2E covers them
- Simple list/table views — E2E covers CRUD flows

## E2E Tests

E2E tests live in `tests/e2e/` and use the `AppDriver` class to control a live Electron app via the UI HTTP bridge. Each test file spawns its own Electron instance on a unique port.

### Architecture

```
tests/e2e/
├── fixture.ts                  # AppDriver class + startApp/teardownApp helpers
├── app.test.ts                 # Smoke: app launch + MCP server handshake
├── gui-persons.test.ts         # Persons CRUD, navigation, search, add related person (port 19242)
├── gui-sources-rels.test.ts    # Sources CRUD, relationships CRUD, global search (port 19243)
├── gui-places.test.ts          # Places CRUD, detail, address fields, hierarchy (port 19244)
├── gui-viz.test.ts             # Visualization: empty state, tabs, SVG rendering (port 19245)
├── gui-a11y.test.ts            # ARIA accessibility verification (port 19246)
├── gui-quality.test.ts         # Quality checks: run, filter, ignore/restore (port 19247)
├── gui-media.test.ts           # Media library: gallery/list, search, inline edit, delete (port 19248)
├── gui-settings.test.ts        # Settings: database tab, tree subject, tab navigation (port 19249)
└── gui-research-tasks.test.ts  # Research tasks: CRUD, status cycling, inline edit, filters (port 19250)
```

All 10 projects run in parallel. Each gets a fresh temp DB via `SLAKTFORSKNING_DB` env var. Windows use `SLAKTFORSKNING_NO_FOCUS=1` to avoid stealing focus during tests.

### Writing a new E2E test file

```typescript
import { test, expect } from '@playwright/test';
import { AppDriver, AppInstance, startApp, teardownApp } from './fixture';

const UI_PORT = 192XX; // Unique port — check existing files!
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'tag-for-db-filename');
  await app.settle(150);
  await app.setLocale('en');
  await app.settle(300); // Extra settle for locale to take effect
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);
```

Then add the test file to `playwright.config.ts` as a new project:
```typescript
{
  name: 'gui-xxx',
  testMatch: 'gui-xxx.test.ts',
  timeout: 120000,
  retries: 1,
},
```

### AppDriver API

**Navigation & DOM:**
- `app.navigate(path)` — Vue Router push
- `app.getDom()` — full rendered HTML (includes `<style>` blocks!)
- `app.waitForText(text, timeoutMs?)` — poll DOM until text appears
- `app.expectText(text)` / `app.expectNoText(text)` — assert DOM content
- `app.settle(ms?)` — wait for Vue to re-render (requestAnimationFrame + delay)

**Interaction:**
- `app.click(selector)` — click element
- `app.fillInput(selector, value)` — set value via native setter + `input` event
- `app.waitAndFill(selector, value)` — wait for element to exist, then fill
- `app.executeJs<T>(code)` — run JS in renderer, return serialized result

**Data seeding** (call `window.api.*` in the renderer):
- `app.createPerson({ given_name, surname, sex? })`
- `app.createEvent({ event_type, date_original?, relationship_id? })`
- `app.addEventParticipant({ event_id, person_id, role })`
- `app.createSource({ title, author? })`
- `app.createCitation({ source_id, event_id?, person_id?, confidence? })`
- `app.createPlace({ name, place_type?, street?, postal_code?, city?, country? })`
- `app.createRelationship({ type, person1_id?, person2_id?, subtype? })`
- `app.createResearchTask({ task, person_id?, priority?, status?, notes? })`
- `app.createMedia({ title, file_ref?, format?, notes? })`
- `app.addMediaLink({ media_id, entity_type, entity_id, sort_order? })`
- `app.createGroup({ name, notes? })`
- `app.addGroupMember(groupId, personId)`

### Critical E2E patterns and pitfalls

#### 1. CSS selector mismatches — the #1 source of failures

**Always check the actual rendered class names.** Vue scoped styles and component abstractions mean the class you see in the template may not match what you expect:

| Component | Template usage | Rendered class | Common mistake |
|-----------|---------------|----------------|----------------|
| `AppButton variant="soft"` | `<AppButton variant="soft">` | `.app-btn.app-btn--soft` | Using `.btn-add` |
| `AppButton variant="primary"` | `<AppButton variant="primary" type="submit">` | `.app-btn.app-btn--primary` | Using `button[type="submit"]` alone |
| `FilterChips` | `<FilterChips :options="..." />` | `.chip-btn`, `.chip-btn--active` | Using `.chip`, `.tab-btn` |
| Settings tabs | `<FilterChips>` for tabs | `.chip-btn` | Using `.tab-btn` (doesn't exist) |

**shared.css also defines `.btn-add`, `.btn-delete`, `.btn-cancel`** — these are used directly in some components (ResearchTasksTable, MediaLightbox) but NOT in views that use AppButton.

Before writing selectors, grep the component source to see what classes are actually used:
```bash
# Check what class AppButton renders
grep 'class.*btn\|:class' src/renderer/components/ui/AppButton.vue
# Check what a view uses for its "add" button
grep 'btn-add\|AppButton' src/renderer/views/ResearchTasksView.vue
```

#### 2. executeJs must use IIFEs for multi-statement code

The `execute_js` endpoint evaluates code in the renderer context. Multi-statement code with `return` will fail unless wrapped. **Always wrap in an IIFE:**

```typescript
// WRONG — throws "return not in function"
const count = await app.executeJs<number>(`
  const rows = document.querySelectorAll('.row');
  return rows.length;
`);

// RIGHT — IIFE
const count = await app.executeJs<number>(`
  (() => {
    const rows = document.querySelectorAll('.row');
    return rows.length;
  })()
`);

// ALSO RIGHT — single expression (no return needed)
const count = await app.executeJs<number>(`
  document.querySelectorAll('.row').length
`);
```

#### 3. getDom() includes `<style>` blocks

`getDom()` returns the full HTML including `<style>` tags. If you check `dom.includes('row-ignored')`, it will match the CSS class definition in the stylesheet, not actual DOM elements.

```typescript
// WRONG — matches CSS definition ".row-ignored { opacity: 0.5 }"
const dom = await app.getDom();
expect(dom).not.toContain('row-ignored');

// RIGHT — check actual DOM elements
const hasIgnored = await app.executeJs<boolean>(`
  !!document.querySelector('.quality-table .row-ignored')
`);
expect(hasIgnored).toBe(false);
```

Use `getDom()` + `toContain()` only for **text content** (person names, labels, etc.), never for CSS class names.

#### 4. Data seeding requires navigate-away-then-back

After seeding data via `window.api.*`, the current view may not reload. Force a fresh mount:

```typescript
await app.createResearchTask({ task: 'New Task' });
// WRONG — view may show stale data
await app.navigate('/research-tasks');

// RIGHT — force remount
await app.navigate('/');
await app.navigate('/research-tasks');
await app.waitForText('New Task');
```

#### 5. Vue `:value` + `@blur` pattern (inline edit fields)

Some inputs use `:value` + `@blur` instead of `v-model`. The native setter trick doesn't update Vue state — only the `blur` handler saves:

```typescript
// For :value + @blur inputs (e.g., MediaView inline-edit)
await app.executeJs(`
  new Promise(resolve => {
    const input = document.querySelector('.inline-edit');
    if (input) {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
      ).set;
      setter.call(input, 'New Value');
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    }
    setTimeout(resolve, 200);
  })
`);
```

#### 6. localStorage persists across Playwright retries

The same Electron process runs for all retries. If your test writes to localStorage (e.g., quality ignore state), clear it at the start:

```typescript
await app.executeJs(`localStorage.removeItem('quality:ignored')`);
await app.navigate('/');
await app.navigate('/quality');
```

#### 7. setLocale timing

`setLocale('en')` updates Vue reactivity but views need time to re-render:

```typescript
await app.setLocale('en');
await app.settle(300); // Must settle before navigating
```

#### 8. Port allocation

Each E2E file needs a unique port. Current assignments: 19242–19250. Check with:
```bash
grep 'UI_PORT = ' tests/e2e/gui-*.test.ts
```

#### 9. Clicking buttons by text content

When AppButton or FilterChips make simple CSS selectors unreliable, match by text:

```typescript
await app.executeJs(`
  (() => {
    const btns = document.querySelectorAll('.view-toggle button');
    for (const btn of btns) {
      if (btn.textContent.trim() === 'List') { btn.click(); return; }
    }
  })()
`);
```

#### 10. Confirm dialogs in delete operations

Delete buttons often use `window.confirm()`. Override it before clicking:

```typescript
await app.executeJs(`
  (() => {
    window.confirm = () => true;
    const rows = document.querySelectorAll('.clickable-row');
    for (const row of rows) {
      if (row.textContent.includes('Target Item')) {
        const delBtn = row.querySelector('.btn-delete');
        if (delBtn) { delBtn.click(); return; }
      }
    }
  })()
`);
```

### What to E2E test vs. not

**Good E2E candidates:**
- CRUD flows (create via modal, list, detail, delete)
- Filter/search interactions
- State management visible in UI (ignore/restore, status cycling)
- Cross-view navigation (list → detail → back)
- Form validation visible to user

**Not worth E2E testing:**
- Map/canvas rendering (flaky viewport-dependent tests)
- File dialog operations (OS-level, can't automate)
- Multi-window behavior (fragile Electron window management)
- AI-generated content (non-deterministic)

## UI Verification (REQUIRED for UI changes)

**Unit tests alone are not sufficient for UI changes.** They don't cover the rendering stack, modal lifecycle, Vue Router behavior, or visual correctness. Always verify in the running app before committing.

### Setup

Ask the user to launch the app with debugging enabled:
```bash
./scripts/dev-debug.sh   # CDP port 9222, UI server port 19241
```

Verify the connection:
```bash
./scripts/verify-cdp.sh                              # check CDP
curl -s http://127.0.0.1:19241/status                # check UI server
```

**Cannot launch Electron from Claude Code's shell** — it needs macOS window server access. Always ask the user to run the script from their terminal.

### Verification via UI server (always available when app is running)

```bash
# Navigate to the view you changed
curl -s -X POST http://127.0.0.1:19241/navigate -d '{"path":"/your-route"}'

# Take a screenshot and inspect visually
curl -s -X POST http://127.0.0.1:19241/screenshot | python3 -c "
import sys,json,base64; d=json.load(sys.stdin)
open('/tmp/verify.png','wb').write(base64.b64decode(d['data']))"

# Read the file to see it
# Read /tmp/verify.png

# Click elements
curl -s -X POST http://127.0.0.1:19241/click -d '{"selector":"button.btn-add"}'

# Execute JS to check state
curl -s -X POST http://127.0.0.1:19241/execute_js -d '{"code":"document.querySelector(\".modal\") !== null"}'
```

### Verification via Chrome DevTools MCP (when CDP is active)

```
list_pages()          → find the Släktforskning page (not DevTools)
select_page(id)       → select it
take_snapshot()       → accessibility tree with uid's
click(uid)            → click elements reliably
fill(uid, value)      → fill form inputs (triggers Vue reactivity)
take_screenshot()     → capture current state
```

### When to use it

- **ALWAYS** after changing Vue components, modals, or routing behavior
- When a UI bug is reported — reproduce it visually before fixing
- To confirm IPC wiring is correct end-to-end
- After fixing a bug — verify the fix visually, then commit

### Common pitfalls caught by UI verification

- Modal opens but immediately closes (route key change destroys component)
- Form fields not pre-filled (ref timing issues)
- Click handlers on wrong element (event bubbling)
- Autocomplete dropdowns not appearing (gazetteer not loaded)

### Notes

- MCP data tools work without the Electron app — they go straight to SQLite
- UI server tools require the app to be running
- The MCP server and the running app share the same SQLite DB

## When Tests Fail

- **Read the error message first** — don't blindly re-run or change code.
- **Check if it's a test bug or a code bug** — the test may have wrong expectations after a legitimate code change.
- **For SQLite errors** — remember `db.get()` returns `undefined` not `null`, and parameter binding uses arrays.
- **For E2E timeouts** — check if a previous Electron process is still running (`pkill -f "electron-forge"`).
- **For E2E flaky tests** — common causes: timing (add `settle()`), stale data (navigate away/back), localStorage from previous retry (clear it), CSS selector matching wrong element.

## When to Run Tests

- **After changing any `src/api/*.ts` file** → `npm test`
- **After adding a new API function** → `npm test -- --coverage` to verify thresholds still pass
- **After changing IPC, preload, or main process** → `npx playwright test`
- **After changing a Vue view or component** → `npx playwright test --project=gui-xxx` (the relevant project)
- **Before every commit** → `npm run lint && npm test && npx playwright test`
- **When adding a new feature** → write unit tests for the api/ functions FIRST, then implement

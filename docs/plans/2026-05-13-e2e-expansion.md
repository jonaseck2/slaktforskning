# E2E Expansion — Implementation Plan

> Design spec: [2026-05-13-e2e-expansion-design.md](2026-05-13-e2e-expansion-design.md). Read it first — it owns the **why**, the bug-class inventory, and the user-observable verification criteria.

## User goal

When I introduce a panel CTA that lies about what it does, a button wired to the wrong handler, a panel that doesn't refresh after a save, an importer regression, or a missing host-entity link, **a test fails before I see the bug in the running app**.

I do not pay for this in PR CI minutes. The expanded suite (Tier 2) runs locally during plan close-out. CI keeps running the existing 4-project Tier 1 only, **until this repo is public OSS with free build minutes** — at which point Tier 2 gets wired to a nightly workflow.

## Scope

Two tiers, two npm scripts. **The tier separation is the design.**

- **Tier 1** (existing, unchanged): `boot`, `crud`, `website-export`, `duplicates`. `npm run test:e2e`. <5 min. Gates PR merge.
- **Tier 2** (new, this plan): `panels` (10 right-side panels), `reactivity` (~20 consumer-surface × mutator triples), `imports` (6 importer fixtures). `npm run test:e2e:full`. Local-only until public OSS.

Full scope (all six tasks): plumbing → 2-panel pilot → fan out to remaining 8 → reactivity → imports → close-out integration. **No scope deviations** at plan authoring time; the pilot (Task 2) measures cost-per-panel and a deviation block lands here if it materialises.

## Verification (matches design §Verification)

The plan is done when **all five** are true:

1. **Tier 1 wired into CI and gating PR merge.** `npm run test:e2e` finishes in <5 min on `ubuntu-latest`. Evidence: PR run summary line + duration from the new `e2e` job. (Today's CI runs only lint + unit — this plan adds the e2e job in Task 0.)
1a. **Headless verification.** Local: `SLAKTFORSKNING_HEADLESS=1 ./src-tauri/target/release/slaktforskning &` produces no visible window, no Dock icon (macOS), no taskbar entry (Windows). `curl http://localhost:19241/` responds 200. Evidence: paste curl response + the process-visibility command output.
2. **Tier 2 green locally.** `npm run test:e2e:full` exits 0 on the executor's machine. Evidence: paste the Playwright summary line (`N passed (Mmin Ms)`) into the close-out commit message.
3. **Deliberate Surface Contract break fails.** Verification commit on a throwaway branch breaks one CTA per check (4 breaks total). Each break produces a red `panels` test whose error message names the panel and the violated check. Captured in the close-out commit message, then reverted.
4. **Deliberate `data-changed` break fails.** Same shape, one break to one consumer's subscription → red `reactivity` test → captured → reverted.
5. **Deliberate importer break fails.** Same shape, one regex over-correction in [src/import/holger/](../../src/import/holger/) (or equivalent) → red `imports` test → captured → reverted.

Verification §1 is observed at PR open (CI). §2–5 are observed at close-out (executor on local machine). All five must be evidenced in the archive commit per [.claude/rules/plans.md](../../.claude/rules/plans.md) verification discipline.

## Failure modes / RCA reference

- **Tier 1 over-coverage trap.** The temptation will be to push new tests into Tier 1 because "that's what runs in CI." Tier 1's contract is <5 min and gates PR. Anything added there must respect that budget. New `panels`/`reactivity`/`imports` tests go into Tier 2 only.
- **"Smoke" terminology** is forbidden per [.claude/rules/plans.md](../../.claude/rules/plans.md) L3. Project names below are behavior-named (`panels`, `reactivity`, `imports`). The legacy `[smoke]` Playwright project referenced in older plans no longer exists in [playwright.config.ts](../../playwright.config.ts) — verified at plan authoring.
- **Stale [.claude/rules/tests.md](../../.claude/rules/tests.md)** still describes the 11-project Electron-era e2e layout. That doc is updated as part of Task 6.
- **Pilot vs. all-at-once.** Default per [.claude/rules/plans.md](../../.claude/rules/plans.md) scope rule would be "all 10 panels in one wave." Pilot is chosen because cost-per-panel is unknown and the Tauri speedup is extrapolated. Task 2 measures it; Task 3 fans out only after the measurement clears.

---

## File map

**New:**
- `tests/e2e/helpers/headless.ts` — env-var helper, used by `fixture.ts::startApp` to set `SLAKTFORSKNING_HEADLESS=1` on every spawn.
- `tests/e2e/helpers/mutate-via-mcp.ts` — `mutateViaMcp(toolName, args)` calling the dev MCP HTTP bridge ([src-tauri/src/ui_server.rs](../../src-tauri/src/ui_server.rs) at `POST /eval`) to invoke an MCP tool against the running app's DB and await `data-changed`.
- `tests/e2e/helpers/seed-host-entity.ts` — `seedHostEntity(kind, fixture?)` returning `{ id, route }` for each panel's host entity type.
- `tests/e2e/helpers/panel-descriptor.ts` — `PanelDescriptor` + `PanelSectionCheck` types.
- `tests/e2e/fixtures/panels.ts` — 10 `PanelDescriptor` entries, one per `*Panel.vue`.
- `tests/e2e/fixtures/imports/` — 6 tiny importer fixtures (gedcom-551.ged, gedcom-70.ged, holger.zip, genney.gcc, genney.backup, rootsmagic.rmt, gramps.gramps). Synthetic, 3–5 persons each.
- `tests/e2e/panel-surface.spec.ts` — data-driven `panels` project; iterates `fixtures/panels.ts`.
- `tests/e2e/reactivity.spec.ts` — data-driven `reactivity` project; iterates `(consumer, mutator)` triples.
- `tests/e2e/imports.spec.ts` — data-driven `imports` project; iterates `fixtures/imports/`.

**Modified:**
- [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs) — honour `SLAKTFORSKNING_HEADLESS=1` at startup: `WindowBuilder::visible(false)` everywhere; on macOS also `NSApp.setActivationPolicy(.accessory)`; on Windows also `skip_taskbar(true)`.
- [tests/e2e/fixture.ts](../../tests/e2e/fixture.ts) — `startApp` sets `SLAKTFORSKNING_HEADLESS=1` in the spawn's env.
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — add a Tier 1 e2e job on `ubuntu-latest` with Xvfb.
- [playwright.config.ts](../../playwright.config.ts) — add 3 new projects (`panels`, `reactivity`, `imports`).
- `package.json` — add `test:e2e:full` script.
- [CLAUDE.md](../../CLAUDE.md) — close-out checklist gains Tier 2 evidence requirement for UI/import-touching plans.
- [.claude/rules/tests.md](../../.claude/rules/tests.md) — replace the stale 11-project Electron-era description with the current 4 + 3 tier layout.

---

## Task 0 — Headless mode + CI wiring

**Without this task, Tier 2 is unusable during close-out** (60+ window pops on macOS) **and the "Tier 1 gates PR" verification gate is fiction** (today's CI runs only lint + unit).

**Files:**
- Modify: [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs) (window setup)
- Modify: [tests/e2e/fixture.ts](../../tests/e2e/fixture.ts) (env in spawn)
- Modify: [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (new e2e job)

### Steps

- [ ] **0.1 — Honour `SLAKTFORSKNING_HEADLESS=1` in Rust.** Find the `tauri::Builder::default()` setup in [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs). The main window is built somewhere in `.setup(|app| { ... })` (or auto-built from `tauri.conf.json::windows[]`). Locate the window creation; wrap it with:

```rust
let headless = std::env::var("SLAKTFORSKNING_HEADLESS").as_deref() == Ok("1");

// Build the main window programmatically when headless, so we can apply .visible(false).
// (Or: read tauri.conf.json's windows[] config, but flip the visible flag.)
let mut window_builder = tauri::WebviewWindowBuilder::new(
    app,
    "main",
    tauri::WebviewUrl::App("index.html".into()),
)
.title("Släktforskning")
.inner_size(1280.0, 800.0);

if headless {
    window_builder = window_builder.visible(false);
    #[cfg(target_os = "windows")]
    {
        window_builder = window_builder.skip_taskbar(true);
    }
}

let _window = window_builder.build()?;

#[cfg(target_os = "macos")]
if headless {
    use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy};
    unsafe {
        let app: cocoa::base::id = NSApp();
        app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyAccessory);
    }
}
```

The `cocoa` crate is already a transitive dep of Tauri on macOS; if not directly available, add `cocoa = "0.25"` to `[target.'cfg(target_os = "macos")'.dependencies]` in [src-tauri/Cargo.toml](../../src-tauri/Cargo.toml).

The window in `tauri.conf.json` may already be auto-built. If so, change the config to `"windows": []` so Rust owns the window construction entirely — otherwise Tauri builds a visible window first and we'd be too late.

- [ ] **0.2 — Compile and verify headless locally.** Build the binary in release mode (matches what e2e uses):

```bash
npm run build:e2e
```

Then run it headless:

```bash
SLAKTFORSKNING_HEADLESS=1 ./src-tauri/target/release/slaktforskning &
SLAKTFORSKNING_PID=$!
sleep 3
curl -fsS http://localhost:19241/ && echo "OK: bridge responds"
osascript -e 'tell application "System Events" to get name of every process whose visible is true' | grep -i slaktforskning && echo "FAIL: visible process" || echo "OK: not visible"
kill $SLAKTFORSKNING_PID
```

Expected: "OK: bridge responds" and "OK: not visible". On Linux substitute the visibility check for an xdotool / wmctrl query; on Windows for a PowerShell `Get-Process` filter.

- [ ] **0.3 — Update `startApp` to spawn with `SLAKTFORSKNING_HEADLESS=1`.** In [tests/e2e/fixture.ts](../../tests/e2e/fixture.ts), find the `spawn(...)` call that launches the binary. Add to its options:

```ts
env: {
  ...process.env,
  SLAKTFORSKNING_HEADLESS: '1',
  SLAKTFORSKNING_UI_PORT: String(port),
  SLAKTFORSKNING_DB: dbPath,
},
```

(Two of those three env vars already exist on the spawn — just add `SLAKTFORSKNING_HEADLESS`.)

- [ ] **0.4 — Verify Tier 1 still passes, now headless.**

```bash
npm run test:e2e
```

Expected: 4 projects pass, no windows appear during the run. Local wall clock <5 min.

- [ ] **0.5 — Wire Tier 1 into CI.** Edit [.github/workflows/ci.yml](../../.github/workflows/ci.yml). Add a second job after `test`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: test  # don't burn e2e minutes if lint/unit failed
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target
      - name: Install Linux deps for Tauri + Xvfb
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf \
            xvfb
      - run: npm ci
      - name: Run e2e (Tier 1, headless via Xvfb + SLAKTFORSKNING_HEADLESS)
        run: xvfb-run -a npm run test:e2e
        env:
          SLAKTFORSKNING_HEADLESS: '1'
```

- [ ] **0.6 — Commit.**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml tests/e2e/fixture.ts .github/workflows/ci.yml src-tauri/tauri.conf.json
git commit -m "test(e2e): headless mode + Tier 1 in CI

Adds SLAKTFORSKNING_HEADLESS=1 env: visible(false) everywhere; macOS
.setActivationPolicy(.accessory); Windows skip_taskbar(true).

CI now runs Tier 1 e2e on ubuntu-latest via xvfb-run."
```

### Verification

1. `SLAKTFORSKNING_HEADLESS=1` produces no visible window, no Dock icon (macOS), no taskbar entry (Windows). Bridge responds on `http://localhost:19241/`.
2. `npm run test:e2e` exits 0 locally with no window pops.
3. The PR adding this task lands a green `e2e` job in GitHub Actions; total CI wall clock <10 min (lint+unit ~2 min + e2e ~5 min + container setup).

---

## Task 1 — Plumbing (no tests yet)

**Files:**
- Modify: [playwright.config.ts](../../playwright.config.ts)
- Modify: `package.json` (scripts)
- Create: `tests/e2e/helpers/mutate-via-mcp.ts`
- Create: `tests/e2e/helpers/seed-host-entity.ts`
- Create: `tests/e2e/helpers/panel-descriptor.ts`

### Steps

- [ ] **1.1 — Add 3 empty Playwright projects.** Edit [playwright.config.ts](../../playwright.config.ts). Append after the `duplicates` project:

```ts
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
```

Update the leading comment block: list the 7 projects and note "Tier 1 (boot/crud/website-export/duplicates) runs in CI; Tier 2 (panels/reactivity/imports) is `npm run test:e2e:full` only."

- [ ] **1.2 — Add `test:e2e:full` script.** Edit `package.json` `scripts`:

```json
"test:e2e:full": "npm run pretest:e2e && playwright test --project=boot --project=crud --project=website-export --project=duplicates --project=panels --project=reactivity --project=imports"
```

Keep `test:e2e` unchanged (still runs all projects by default — Playwright runs whatever's in the config). Actually: `test:e2e` should be restricted to Tier 1 explicitly. Replace with:

```json
"test:e2e": "playwright test --project=boot --project=crud --project=website-export --project=duplicates"
```

This way Tier 1 stays Tier 1 even after Tier 2 projects are added to the config.

- [ ] **1.3 — Verify Tier 1 still passes.** Run:

```bash
npm run test:e2e
```

Expected: 4 passed (one per project), <5 min wall clock.

- [ ] **1.4 — Write `PanelDescriptor` types.** Create `tests/e2e/helpers/panel-descriptor.ts`:

```ts
import type { AppDriver } from '../fixture';

export type SurfaceCheck =
  | 'host-flows-in'
  | 'fulfills-label'
  | 'lifecycle-parity'
  | 'no-degradation';

export interface PanelSectionCheck {
  /** Visible section title (English; Swedish UI text resolved via setLocale('en')). */
  title: string;
  /** Primary CTA button visible label. */
  primaryCtaLabel: string;
  /** Which Surface Contract checks this section participates in. */
  checks: SurfaceCheck[];
}

export interface PanelDescriptor {
  /** Display name in test reports — matches the `*Panel.vue` filename. */
  name: string;
  /** Route to navigate to after seeding host. Receives the seeded entity id. */
  route: (id: string) => string;
  /** Seed the host entity via MCP and return its id. */
  seed: (driver: AppDriver) => Promise<{ id: string }>;
  /** Sections to verify. ReadOnly panels (Report/Website/Export) may pass []. */
  sections: PanelSectionCheck[];
  /** Whether the panel itself must offer a Danger-zone delete affordance. */
  hostDeletable: boolean;
}
```

- [ ] **1.5 — Write `mutateViaMcp` helper.** Create `tests/e2e/helpers/mutate-via-mcp.ts`. The Tauri dev bridge exposes `POST /eval` (see [src-tauri/src/ui_server.rs](../../src-tauri/src/ui_server.rs)). MCP tools are reachable via `window.api.<tool>` in the renderer — `mutateViaMcp` ships a JS expression through `/eval` that calls the tool and then awaits the next `data-changed` event:

```ts
import type { AppDriver } from '../fixture';

/**
 * Invoke an MCP-shaped api/ tool against the running app's DB, then wait for
 * the renderer's data-changed event to fire. Returns whatever the tool
 * returned (parsed JSON).
 */
export async function mutateViaMcp<T = unknown>(
  driver: AppDriver,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const script = `
    (async () => {
      const tool = window.api.${toolName};
      if (typeof tool !== 'function') throw new Error('no such tool: ${toolName}');
      const pDataChanged = new Promise((resolve) => {
        const off = window.api.onDataChanged?.(() => { off?.(); resolve(null); });
        setTimeout(() => resolve(null), 1500); // fallback if no listener exists
      });
      const result = await tool(${JSON.stringify(args)});
      await pDataChanged;
      return result;
    })()
  `;
  return driver.executeJs<T>(script);
}
```

- [ ] **1.6 — Write `seedHostEntity` helper.** Create `tests/e2e/helpers/seed-host-entity.ts`. Each host type maps to the `create_X` / `add_X` api call needed to seed it:

```ts
import type { AppDriver } from '../fixture';
import { mutateViaMcp } from './mutate-via-mcp';

export type HostKind = 'person' | 'place' | 'source' | 'relationship' | 'group' | 'research-task' | 'media';

export async function seedHostEntity(driver: AppDriver, kind: HostKind): Promise<{ id: string; route: string }> {
  switch (kind) {
    case 'person': {
      const p = await mutateViaMcp<{ id: string }>(driver, 'createPerson', {
        primary_name: { given: 'Test', surname: 'Person' },
        sex: 'unknown',
      });
      return { id: p.id, route: `/persons/${p.id}` };
    }
    case 'place': {
      const p = await mutateViaMcp<{ id: string }>(driver, 'addPlace', {
        name: 'Testplace',
        type: 'city',
      });
      return { id: p.id, route: `/places/${p.id}` };
    }
    case 'source': {
      const s = await mutateViaMcp<{ id: string }>(driver, 'addSource', {
        title: 'Test Source',
      });
      return { id: s.id, route: `/sources/${s.id}` };
    }
    case 'relationship': {
      const a = await mutateViaMcp<{ id: string }>(driver, 'createPerson', { primary_name: { given: 'A' } });
      const b = await mutateViaMcp<{ id: string }>(driver, 'createPerson', { primary_name: { given: 'B' } });
      const r = await mutateViaMcp<{ id: string }>(driver, 'addRelationship', {
        person_a_id: a.id, person_b_id: b.id, type: 'partner',
      });
      return { id: r.id, route: `/relationships/${r.id}` };
    }
    case 'group': {
      const g = await mutateViaMcp<{ id: string }>(driver, 'addGroup', { name: 'Test Group' });
      return { id: g.id, route: `/groups/${g.id}` };
    }
    case 'research-task': {
      const t = await mutateViaMcp<{ id: string }>(driver, 'addResearchTask', { title: 'Test Task' });
      return { id: t.id, route: `/research-tasks/${t.id}` };
    }
    case 'media': {
      // Media requires an actual file; for e2e we use a 1×1 PNG fixture.
      const m = await mutateViaMcp<{ id: string }>(driver, 'attachMedia', {
        file_ref: 'tests/e2e/fixtures/imports/pixel.png',
        title: 'Test Media',
      });
      return { id: m.id, route: `/media/${m.id}` };
    }
  }
}
```

- [ ] **1.7 — Commit plumbing.**

```bash
git add playwright.config.ts package.json tests/e2e/helpers/
git commit -m "test(e2e): add Tier 2 plumbing (panels/reactivity/imports projects + helpers)"
```

### Verification

`npm run test:e2e` still passes in <5 min (no new tests yet, plumbing only). The 3 new projects exist in [playwright.config.ts](../../playwright.config.ts) but have no spec files — Playwright will report them as "no tests found" in `--project=panels` runs, which is expected.

---

## Task 2 — Pilot: PersonPanel + PlacePanel

**Files:**
- Create: `tests/e2e/panel-surface.spec.ts`
- Create: `tests/e2e/fixtures/panels.ts`

### Steps

- [ ] **2.1 — Write `fixtures/panels.ts` with two descriptors.**

```ts
import type { PanelDescriptor } from '../helpers/panel-descriptor';
import { seedHostEntity } from '../helpers/seed-host-entity';

export const PANELS: PanelDescriptor[] = [
  {
    name: 'PersonPanel',
    route: (id) => `/persons/${id}`,
    seed: (d) => seedHostEntity(d, 'person').then(({ id }) => ({ id })),
    hostDeletable: true,
    sections: [
      {
        title: 'Events',
        primaryCtaLabel: '+ Event',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity'],
      },
      {
        title: 'Names',
        primaryCtaLabel: '+ Name',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity'],
      },
      {
        title: 'Identifiers',
        primaryCtaLabel: '+ Identifier',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity'],
      },
      {
        title: 'Relations',
        primaryCtaLabel: '+ Father',  // header role-buttons; pick one
        checks: ['host-flows-in', 'fulfills-label'],
      },
      {
        title: 'Groups',
        primaryCtaLabel: '+ Group',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity'],
      },
      {
        title: 'Research tasks',
        primaryCtaLabel: '+ Task',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity'],
      },
      {
        title: 'Media',
        primaryCtaLabel: '+ Media',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity', 'no-degradation'],
      },
    ],
  },
  {
    name: 'PlacePanel',
    route: (id) => `/places/${id}`,
    seed: (d) => seedHostEntity(d, 'place').then(({ id }) => ({ id })),
    hostDeletable: true,
    sections: [
      {
        title: 'Events',
        primaryCtaLabel: '+ Event',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity'],
      },
      {
        title: 'Persons',
        primaryCtaLabel: '+ Event', // derived view; CTA truthfully says Event
        checks: ['host-flows-in', 'fulfills-label'],
      },
      {
        title: 'Research tasks',
        primaryCtaLabel: '+ Task',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity'],
      },
      {
        title: 'Media',
        primaryCtaLabel: '+ Media',
        checks: ['host-flows-in', 'fulfills-label', 'lifecycle-parity', 'no-degradation'],
      },
    ],
  },
];
```

Confirm the exact CTA labels by reading the panel source files before committing — if a label is wrong, the test fails at first run with a useful error.

- [ ] **2.2 — Write the data-driven spec.**

Create `tests/e2e/panel-surface.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { startApp, killProcessGroup, AppDriver } from './fixture';
import { PANELS } from './fixtures/panels';

const PORT = 19252;

for (const desc of PANELS) {
  test.describe(`panel-surface: ${desc.name}`, () => {
    let app: Awaited<ReturnType<typeof startApp>>;
    let driver: AppDriver;
    let hostId: string;

    test.beforeAll(async () => {
      app = await startApp(PORT, `panel-${desc.name}`);
      driver = new AppDriver(PORT);
      await driver.setLocale('en');
      const { id } = await desc.seed(driver);
      hostId = id;
      await driver.navigate(desc.route(hostId));
    });

    test.afterAll(async () => {
      await killProcessGroup(app.proc);
    });

    for (const section of desc.sections) {
      if (section.checks.includes('host-flows-in')) {
        test(`§ ${section.title} — host flows into "${section.primaryCtaLabel}" modal`, async () => {
          await driver.click(`button:has-text("${section.primaryCtaLabel}")`);
          // Modal opens; assert the host entity is prefilled.
          // For PersonPanel: a person-typed input/select shows the host's name.
          // For PlacePanel: a place-typed input shows the host's name.
          const modalText = await driver.executeJs<string>(
            `document.querySelector('[role=dialog]')?.textContent ?? ''`
          );
          // Host name was 'Test Person' / 'Testplace' from seedHostEntity.
          expect(modalText).toMatch(/Test (Person|place)/);
          // Close modal — Escape or Cancel.
          await driver.executeJs(`document.querySelector('[role=dialog] button[aria-label=Close], [role=dialog] .modal-close')?.click()`);
        });
      }

      if (section.checks.includes('fulfills-label')) {
        test(`§ ${section.title} — "${section.primaryCtaLabel}" creates the primitive its label names`, async () => {
          // Click CTA, fill the modal's required fields with a marker, save.
          // Then assert the marker appears in the section's table.
          // (Implementation detail per primitive — see helper below.)
          const beforeCount = await sectionRowCount(driver, section.title);
          await fulfillsLabelInteraction(driver, desc.name, section);
          const afterCount = await sectionRowCount(driver, section.title);
          expect(afterCount).toBe(beforeCount + 1);
        });
      }

      if (section.checks.includes('lifecycle-parity')) {
        test(`§ ${section.title} — items added here are editable and deletable from here`, async () => {
          // Find the row added by the previous test (or seed a fresh one),
          // assert hover/click reveals edit + trash affordances reachable on this surface.
          const row = await driver.executeJs<{ hasEdit: boolean; hasDelete: boolean }>(`
            (() => {
              const section = [...document.querySelectorAll('section, .panel-section')]
                .find(s => s.textContent?.includes(${JSON.stringify(section.title)}));
              const row = section?.querySelector('tbody tr');
              return {
                hasEdit: !!row?.querySelector('[aria-label*=Edit], [title*=Edit], .icon-edit'),
                hasDelete: !!row?.querySelector('[aria-label*=Delete], [title*=Delete], [aria-label*=Unlink], .icon-trash, .icon-unlink'),
              };
            })()
          `);
          expect(row.hasEdit, `Section "${section.title}" has no edit affordance on rows`).toBe(true);
          expect(row.hasDelete, `Section "${section.title}" has no delete/unlink affordance on rows`).toBe(true);
        });
      }

      if (section.checks.includes('no-degradation')) {
        test(`§ ${section.title} — CTA still works when section is collapsed`, async () => {
          await driver.executeJs(`
            const section = [...document.querySelectorAll('section, .panel-section')]
              .find(s => s.textContent?.includes(${JSON.stringify(section.title)}));
            section?.querySelector('.section-toggle, [aria-label*=Collapse]')?.click();
          `);
          // CTA should still be clickable; should auto-expand the section before opening modal.
          await driver.click(`button:has-text("${section.primaryCtaLabel}")`);
          const modalVisible = await driver.executeJs<boolean>(
            `!!document.querySelector('[role=dialog]')`
          );
          expect(modalVisible, `Collapsed-section CTA "${section.primaryCtaLabel}" silently no-op'd`).toBe(true);
        });
      }
    }

    if (desc.hostDeletable) {
      test(`host-level lifecycle — Danger-zone delete reachable from ${desc.name}`, async () => {
        const hasDelete = await driver.executeJs<boolean>(`
          !!document.querySelector('.panel-danger-zone button, [data-test=delete-host], button:has-text("Delete ${desc.name.replace('Panel', '')}")')
        `);
        expect(hasDelete, `${desc.name} has no host-level delete affordance`).toBe(true);
      });
    }
  });
}

// --- Helpers ----------------------------------------------------------------

async function sectionRowCount(driver: AppDriver, sectionTitle: string): Promise<number> {
  return driver.executeJs<number>(`
    (() => {
      const section = [...document.querySelectorAll('section, .panel-section')]
        .find(s => s.textContent?.includes(${JSON.stringify(sectionTitle)}));
      return section?.querySelectorAll('tbody tr').length ?? 0;
    })()
  `);
}

async function fulfillsLabelInteraction(driver: AppDriver, panelName: string, section: { title: string; primaryCtaLabel: string }): Promise<void> {
  await driver.click(`button:has-text("${section.primaryCtaLabel}")`);
  // Per-primitive minimal save: fill the first required text input with a unique marker, save.
  const marker = `e2e-${Date.now()}`;
  await driver.executeJs(`
    const dlg = document.querySelector('[role=dialog]');
    const input = dlg?.querySelector('input[type=text], input:not([type])');
    if (input) {
      input.value = ${JSON.stringify(marker)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    dlg?.querySelector('button[type=submit], button:has-text("Save"), .modal-save')?.click();
  `);
  // Brief wait for data-changed.
  await new Promise(r => setTimeout(r, 800));
}
```

Note: the helpers (`sectionRowCount`, `fulfillsLabelInteraction`) are deliberately *forgiving* — different sections use different DOM shapes. As Task 3 fans out, sections that don't match these heuristics get a per-section override hook on the descriptor. Don't over-engineer in Task 2; observe what breaks and adapt.

- [ ] **2.3 — Run the pilot.**

```bash
npm run pretest:e2e  # builds the Tauri bundle (one-time per session)
npx playwright test --project=panels
```

Expected outcome: **most checks pass, some fail.** The failures will be diagnostically useful — wrong CTA label, modal selector mismatch, section title localization mismatch. Iterate on the spec + descriptors until the pilot is green. Time-box this loop to one focused session; if more than 5 sections need ad-hoc overrides, that's a signal the data-driven shape needs richer per-section hooks.

- [ ] **2.4 — Capture wall-clock.**

Note the duration in the commit message. Expected: ~5–15 min for 2 panels on a local M-series Mac.

- [ ] **2.5 — Deviation check.**

If average cost-per-panel >2 min wall clock, **stop and edit this plan**. Add a "Scope deviations" subsection under §Scope above, naming which panels (if any) get a slimmer check set. Default action remains: continue to Task 3 with full check set.

- [ ] **2.6 — Commit.**

```bash
git add tests/e2e/panel-surface.spec.ts tests/e2e/fixtures/panels.ts
git commit -m "test(e2e): pilot panel-surface coverage for PersonPanel + PlacePanel

Wall clock: <paste from 2.4>. Cost-per-panel: <calculated>.
$(if any deviation needed: name it here)"
```

### Verification

`npx playwright test --project=panels` exits 0. Output names each section × check combination as a separate test. The 4 Surface Contract checks each have at least one passing instance across the 2 panels.

---

## Task 3 — Fan out: remaining 8 panels

**Files:**
- Modify: `tests/e2e/fixtures/panels.ts` (append 8 descriptors)

### Steps

- [ ] **3.1 — Add SourcePanel descriptor.** Sections per [src/renderer/components/SourcePanel.vue](../../src/renderer/components/SourcePanel.vue): Citations, Repositories, Media, Research tasks (verify by reading the file). Each section gets host-flows-in + fulfills-label + lifecycle-parity. `hostDeletable: true`.

- [ ] **3.2 — Add RelationshipPanel descriptor.** Sections: Events, Citations, Media. `hostDeletable: true`.

- [ ] **3.3 — Add GroupPanel descriptor.** Sections: Members (persons), Media, Research tasks. `hostDeletable: true`.

- [ ] **3.4 — Add ResearchTaskPanel descriptor.** Sections: Linked entities, Media, Notes. `hostDeletable: true`.

- [ ] **3.5 — Add MediaPanel descriptor.** Sections: Linked persons, Linked places, Linked events, Face tags. The known historical bug — unlink ✕ vs delete trash — is captured by `lifecycle-parity` check naturally (assertion accepts either trash *or* unlink icon as "delete-able affordance"; the per-section choice is enforced by the existing `tests/components/panel-cta-conventions.test.ts`, not this layer). `hostDeletable: true`.

- [ ] **3.6 — Add ReportPanel descriptor.** Read-only panel — `sections: []`. Add a single floor assertion: opening the panel route renders the report's host entity name visibly. `hostDeletable: false` (reports aren't a stored entity in this sense).

- [ ] **3.7 — Add WebsitePanel descriptor.** Same shape as ReportPanel — `sections: []`, floor assertion that the export action button is visible and clickable. `hostDeletable: false`.

- [ ] **3.8 — Add ExportOptionsPanel descriptor.** Same shape — `sections: []`, floor assertion that the panel renders with format toggles visible. `hostDeletable: false`.

- [ ] **3.9 — Run the full `panels` project.**

```bash
npx playwright test --project=panels
```

Expected: all 10 panel describes pass. Section count × check count drives the assertion count — likely ~60–80 individual tests.

- [ ] **3.10 — Commit.**

```bash
git add tests/e2e/fixtures/panels.ts
git commit -m "test(e2e): fan out panel-surface coverage to all 10 right-side panels"
```

### Verification

Every `*Panel.vue` in [src/renderer/components/](../../src/renderer/components/) has a descriptor entry. `npx playwright test --project=panels` exits 0. Total wall clock for `panels` project is logged in the commit.

---

## Task 4 — Reactivity project

**Files:**
- Create: `tests/e2e/reactivity.spec.ts`
- Create: `tests/e2e/fixtures/reactivity-triples.ts`

### Steps

- [ ] **4.1 — Catalog consumers.** List every consumer surface that must react to `data-changed`:
  - 10 panels (already enumerated in `fixtures/panels.ts`).
  - List views: `PersonsView`, `PlacesView`, `SourcesView`, `RelationshipsView`, `GroupsView`, `ResearchTasksView`, `MediaView`, `DuplicatesView`. Verify by running `ls src/renderer/views/*.vue`.
  - Chart: `ChartView`.

- [ ] **4.2 — Define `reactivity-triples.ts`.**

```ts
import { mutateViaMcp } from '../helpers/mutate-via-mcp';
import type { AppDriver } from '../fixture';

export interface ReactivityTriple {
  consumer: string;           // human-readable, e.g. 'PersonsView'
  route: string;              // route to navigate to before mutating
  mutate: (driver: AppDriver, hostId: string) => Promise<void>;
  /** JS expression evaluated in the renderer; must return true after the mutation propagates. */
  assert: string;
  /** Seed any entity the consumer/mutator depends on; returns its id. Optional. */
  seed?: (driver: AppDriver) => Promise<string>;
}

export const TRIPLES: ReactivityTriple[] = [
  {
    consumer: 'PersonsView',
    route: '/persons',
    seed: async (d) => (await mutateViaMcp<{ id: string }>(d, 'createPerson', { primary_name: { given: 'Seed' } })).id,
    mutate: async (d, hostId) => {
      await mutateViaMcp(d, 'updatePerson', { id: hostId, primary_name: { given: 'Renamed' } });
    },
    assert: `[...document.querySelectorAll('table tbody tr')].some(r => r.textContent.includes('Renamed'))`,
  },
  // ... one entry per (consumer, mutation) pair — minimum one per consumer.
];
```

Write at least one triple per consumer (10 panels + 8 list views + chart = 19). For panels, the mutation is "rename the host entity"; the assertion is "the panel's header text reflects the new name."

- [ ] **4.3 — Write the data-driven spec.**

```ts
import { test, expect } from '@playwright/test';
import { startApp, killProcessGroup, AppDriver } from './fixture';
import { TRIPLES } from './fixtures/reactivity-triples';

const PORT = 19253;

for (const triple of TRIPLES) {
  test(`reactivity: ${triple.consumer} updates after mutation without view-switch`, async () => {
    const app = await startApp(PORT, `react-${triple.consumer}`);
    const driver = new AppDriver(PORT);
    try {
      await driver.setLocale('en');
      const hostId = triple.seed ? await triple.seed(driver) : '';
      await driver.navigate(triple.route.replace(':id', hostId));
      await triple.mutate(driver, hostId);
      // The data-changed wait already happened inside mutateViaMcp; give one rAF for DOM.
      await new Promise(r => setTimeout(r, 200));
      const ok = await driver.executeJs<boolean>(triple.assert);
      expect(ok, `${triple.consumer} did not react to mutation within 500ms`).toBe(true);
    } finally {
      await killProcessGroup(app.proc);
    }
  });
}
```

- [ ] **4.4 — Run the project.**

```bash
npx playwright test --project=reactivity
```

- [ ] **4.5 — Commit.**

```bash
git add tests/e2e/reactivity.spec.ts tests/e2e/fixtures/reactivity-triples.ts
git commit -m "test(e2e): reactivity project — N consumers react to data-changed"
```

### Verification

`npx playwright test --project=reactivity` exits 0. Every paneled view + list view + the chart has at least one triple.

---

## Task 5 — Imports project

**Files:**
- Create: `tests/e2e/imports.spec.ts`
- Create: `tests/e2e/fixtures/imports/gedcom-551.ged`
- Create: `tests/e2e/fixtures/imports/gedcom-70.ged`
- Create: `tests/e2e/fixtures/imports/holger.zip` (binary; generate via existing test helper if available)
- Create: `tests/e2e/fixtures/imports/genney.gcc`
- Create: `tests/e2e/fixtures/imports/genney.backup`
- Create: `tests/e2e/fixtures/imports/rootsmagic.rmt`
- Create: `tests/e2e/fixtures/imports/gramps.gramps`

### Steps

- [ ] **5.1 — Generate tiny GEDCOM 5.5.1 fixture.**

```
0 HEAD
1 SOUR e2e-fixture
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Anna /Andersson/
1 SEX F
1 BIRT
2 DATE 1 JAN 1900
2 PLAC Stockholm, Sweden
0 @I2@ INDI
1 NAME Bo /Bengtsson/
1 SEX M
0 @I3@ INDI
1 NAME Cecilia /Andersson/
1 SEX F
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
0 TRLR
```

Save as `tests/e2e/fixtures/imports/gedcom-551.ged`.

- [ ] **5.2 — Generate GEDCOM 7.0 fixture.** Same shape with `2 VERS 7.0`. Save as `gedcom-70.ged`.

- [ ] **5.3 — Source Holger/Genney/RootsMagic/Gramps fixtures.** Look in `tests/unit/import/` or `tests/fixtures/` for existing tiny fixtures. **Copy, do not re-author.** If a format has no tiny fixture yet, generate one using the format's own export (e.g. run `npm start`, build a 3-person tree, export to that format).

- [ ] **5.4 — Write the imports spec.**

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { startApp, killProcessGroup, AppDriver, PROJECT_ROOT } from './fixture';

const PORT = 19254;

interface ImportCase {
  format: string;
  fixture: string;
  expectedPersons: number;
  spotCheckName: string;
}

const CASES: ImportCase[] = [
  { format: 'gedcom-551', fixture: 'gedcom-551.ged', expectedPersons: 3, spotCheckName: 'Anna Andersson' },
  { format: 'gedcom-70',  fixture: 'gedcom-70.ged',  expectedPersons: 3, spotCheckName: 'Anna Andersson' },
  { format: 'holger',     fixture: 'holger.zip',     expectedPersons: 3, spotCheckName: 'Anna Andersson' },
  { format: 'genney-gcc', fixture: 'genney.gcc',     expectedPersons: 3, spotCheckName: 'Anna Andersson' },
  { format: 'genney-backup', fixture: 'genney.backup', expectedPersons: 3, spotCheckName: 'Anna Andersson' },
  { format: 'rootsmagic', fixture: 'rootsmagic.rmt', expectedPersons: 3, spotCheckName: 'Anna Andersson' },
  { format: 'gramps',     fixture: 'gramps.gramps',  expectedPersons: 3, spotCheckName: 'Anna Andersson' },
];

for (const c of CASES) {
  test(`imports: ${c.format} fixture imports cleanly and persons are visible`, async () => {
    const app = await startApp(PORT, `import-${c.format}`);
    const driver = new AppDriver(PORT);
    try {
      await driver.setLocale('en');
      const absPath = path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures', 'imports', c.fixture);
      // Use the existing import IPC via window.api — same path the UI's import button takes.
      // Each format has its own api function: importGedcom, importHolger, importGenney, importRootsmagic, importGramps.
      const apiName = c.format.startsWith('gedcom') ? 'importGedcom'
        : c.format === 'holger' ? 'importHolger'
        : c.format.startsWith('genney') ? 'importGenney'
        : c.format === 'rootsmagic' ? 'importRootsmagic'
        : 'importGramps';
      await driver.executeJs(`window.api.${apiName}(${JSON.stringify({ path: absPath })})`);
      // Wait for import to settle (data-changed fires).
      await new Promise(r => setTimeout(r, 2000));
      await driver.navigate('/persons');
      const rowCount = await driver.executeJs<number>(
        `document.querySelectorAll('table tbody tr').length`
      );
      expect(rowCount, `${c.format}: expected ${c.expectedPersons} persons, got ${rowCount}`).toBe(c.expectedPersons);
      const text = await driver.executeJs<string>(`document.body.innerText`);
      expect(text).toContain(c.spotCheckName);
    } finally {
      await killProcessGroup(app.proc);
    }
  });
}
```

If a format's api function name is different from the guess above, fix it inline — the spec must call the real `window.api.<fn>` name.

- [ ] **5.5 — Run the project.**

```bash
npx playwright test --project=imports
```

- [ ] **5.6 — Commit.**

```bash
git add tests/e2e/imports.spec.ts tests/e2e/fixtures/imports/
git commit -m "test(e2e): imports project — round-trip every native importer"
```

### Verification

`npx playwright test --project=imports` exits 0. Every importer in [src/import/](../../src/import/) has a fixture and a test case.

---

## Task 6 — Close-out integration

**Files:**
- Modify: [CLAUDE.md](../../CLAUDE.md) (close-out checklist)
- Modify: [.claude/rules/tests.md](../../.claude/rules/tests.md) (replace stale 11-project description)

### Steps

- [ ] **6.1 — Update [CLAUDE.md](../../CLAUDE.md) close-out checklist.** Locate the "Finishing a plan" section. Step 0's evidence template currently lists `npm test`, `npm run build`, `npx playwright test`. Add a Tier 2 evidence line:

> - `npm run test:e2e:full` → `N passed (Mmin Ms)` across the 7 projects (`boot`, `crud`, `website-export`, `duplicates`, `panels`, `reactivity`, `imports`) — **required for any plan whose user goal touches a panel, modal, list-view, or import path. Non-UI plans (Rust-side, schema-only, doc-only) are exempt.**

- [ ] **6.2 — Replace stale e2e section in [.claude/rules/tests.md](../../.claude/rules/tests.md).** The current text describes 11 Electron-era projects with ports 19242–19251. Replace with:

```markdown
## E2E Tests (Playwright)

Tests live in `tests/e2e/` and run against the **packaged Tauri binary**, not `npm start`. Two tiers, two npm scripts:

**Tier 1 — `npm run test:e2e`** (runs in CI on every PR; gates merge; <5 min):
- `boot` — packaged app boot + Vue mount + MCP handshake
- `crud` — one IPC round-trip across persons/places/sources/relationships/events/citations
- `website-export` — filesystem export round-trip
- `duplicates` — duplicates panel surface

**Tier 2 — `npm run test:e2e:full`** (runs locally during plan close-out; nightly on `main` once public OSS):
- `panels` — Surface Contract checks across all 10 `*Panel.vue` (data-driven from `fixtures/panels.ts`)
- `reactivity` — every paneled view + list view + chart updates after MCP-side mutations
- `imports` — every native importer round-trips a tiny fixture

Each project owns a distinct port (19242 + project index) and a temp DB. Workers: 2.
The `pretest:e2e` script handles the Tauri bundle build.

**Adding a new panel:** append a `PanelDescriptor` to `tests/e2e/fixtures/panels.ts` — no new spec file.
**Adding a new importer:** drop a fixture into `tests/e2e/fixtures/imports/` and append a case to `tests/e2e/imports.spec.ts`'s `CASES` array.
**Adding a new consumer:** append a `ReactivityTriple` to `tests/e2e/fixtures/reactivity-triples.ts`.

The `/test` skill has the full pitfall list — CSS selector mismatches, executeJs IIFE wrapping, getDom() including `<style>` blocks, navigate-away-then-back data seeding, localStorage retry leaks, no-back-buttons rule.
```

- [ ] **6.3 — Commit.**

```bash
git add CLAUDE.md .claude/rules/tests.md
git commit -m "docs: wire Tier 2 e2e into close-out checklist + refresh tests rule"
```

### Verification

`grep -nE "Tier 2|test:e2e:full" CLAUDE.md .claude/rules/tests.md` returns hits in both files. The stale "11 test projects" text is gone from `tests.md`.

---

## Task 7 — Verification of verification (deliberate-break demonstration)

This is the close-out evidence step for §Verification §3–5 above. Do not commit any of these breaks; capture the failure output and revert.

**Files:** none committed; all changes are reverted at the end.

### Steps

- [ ] **7.1 — Branch.**

```bash
git switch -c throwaway/e2e-verify
```

- [ ] **7.2 — Break a CTA label (Surface Contract check 2).** Edit one panel's `+ Event` button to call the wrong handler — e.g. in [src/renderer/components/PersonPanel.vue](../../src/renderer/components/PersonPanel.vue), change the `@action` on the Events section to a no-op. Run:

```bash
npx playwright test --project=panels --grep "Events.*creates the primitive"
```

Capture the failed-test name and error message. Revert the edit.

- [ ] **7.3 — Break a host-flows-in.** Edit one modal so the host id is not prefilled. Run the same project; capture the failed-test name. Revert.

- [ ] **7.4 — Break lifecycle-parity.** Remove the trash icon from one panel section's row template. Run; capture. Revert.

- [ ] **7.5 — Break no-degradation.** Make `+ Media` on the Media section short-circuit when collapsed. Run; capture. Revert.

- [ ] **7.6 — Break `data-changed`.** In one consumer (e.g. `PersonsView`), comment out the `onDataChanged` subscription. Run `--project=reactivity`; capture. Revert.

- [ ] **7.7 — Break an importer.** Introduce a typo in [src/import/holger/](../../src/import/holger/) that causes the importer to drop persons. Run `--project=imports`; capture. Revert.

- [ ] **7.8 — Assemble close-out evidence.** Paste each of the 6 captured failure messages into a `close-out-evidence.md` scratch file (NOT committed) for use in the archive commit message (Task 8).

- [ ] **7.9 — Discard the branch.**

```bash
git switch <main-or-worktree-branch>
git branch -D throwaway/e2e-verify
```

### Verification

6 distinct deliberate breaks each produce a red Playwright test naming the affected panel/consumer/importer and the violated check. All evidence captured. Branch discarded.

---

## Task 8 — Archive

**Files:**
- Modify: `package.json` (version bump)
- Modify: `CHANGELOG.md` (Unreleased entry)
- Modify: [docs/PLAN.md](../PLAN.md) (remove this plan's planned/in-progress block)
- Append: [docs/plans/archive/PLAN.md](archive/PLAN.md) (one-paragraph entry)
- Move: this plan file → `docs/plans/archive/`
- Move: design spec → `docs/plans/archive/`

### Steps

- [ ] **8.1 — Verify all checkboxes above are `[x]`.**

- [ ] **8.2 — Run all five verification gates and paste evidence.**

```bash
npm run test:e2e      # Tier 1 — paste summary line
npm run test:e2e:full # Tier 2 — paste summary line
```

Plus the 6 deliberate-break captures from Task 7.

- [ ] **8.3 — Bump version.** This is a test-infrastructure feature → minor bump per [feedback_version_bump.md](../../.claude/projects/-Users-jonasahnstedt-git-slaktforskning/memory/feedback_version_bump.md). Edit `package.json` `version`.

- [ ] **8.4 — `CHANGELOG.md`.** Add under `## Unreleased`:

> - **E2E expansion.** Two-tier Playwright setup: `npm run test:e2e` (4-project lean, runs in CI) + `npm run test:e2e:full` (7-project thorough, runs locally + nightly once public OSS). New projects: `panels` (10 right-side panels × 4 Surface Contract checks), `reactivity` (every consumer reacts to `data-changed`), `imports` (every native importer round-trips a fixture).

- [ ] **8.5 — Update [docs/PLAN.md](../PLAN.md) + archive entry.** Remove the planned block; append a one-paragraph done entry to [docs/plans/archive/PLAN.md](archive/PLAN.md).

- [ ] **8.6 — Move plan + spec.**

```bash
git mv docs/plans/2026-05-13-e2e-expansion.md docs/plans/archive/
git mv docs/plans/2026-05-13-e2e-expansion-design.md docs/plans/archive/
```

- [ ] **8.7 — Commit and merge.**

```bash
git add -A
git commit -m "chore: archive completed e2e-expansion (v<bump>)

Tier 1 evidence: <paste summary line + duration>
Tier 2 evidence: <paste summary line + duration>
Deliberate-break verification:
  - host-flows-in:     <test name + error>
  - fulfills-label:    <test name + error>
  - lifecycle-parity:  <test name + error>
  - no-degradation:    <test name + error>
  - data-changed:      <test name + error>
  - importer:          <test name + error>"
```

Plan-driven work → land via PR (per [.claude/rules/plans.md](../../.claude/rules/plans.md) L6 "CI catches PRs, the executor catches direct-to-main pushes"). Open the PR, wait for Tier 1 CI green, merge.

### Verification

Plan is archived. Version bumped. CHANGELOG updated. CI green on the merge commit. All five §Verification gates have pasted evidence in the archive commit.

---

## Self-review checklist

- [ ] Every section/requirement in the design spec maps to a task here.
  - Headless mode + CI wiring → **Task 0** (added 2026-05-13 after RCA: design originally claimed Tier 1 gates PR, which CI did not do).
  - Tier 1 explicit project restriction → Task 1 (step 1.2).
  - Tier 2 panels project → Tasks 2 + 3.
  - Tier 2 reactivity project → Task 4.
  - Tier 2 imports project → Task 5.
  - Close-out integration → Task 6.
  - Deliberate-break verification → Task 7.
  - Archive workflow → Task 8.
- [ ] No placeholders (TBD/TODO/"similar to"). The CTA-label specifics in Task 2 are explicitly "verify by reading the file before committing" — that's a directed action, not a placeholder.
- [ ] Type consistency: `PanelDescriptor`, `PanelSectionCheck`, `SurfaceCheck`, `ReactivityTriple` defined once in helper files, referenced consistently.
- [ ] All file paths absolute or repo-relative; no `~` or session-specific paths.
- [ ] User-goal-falsifiability: if all 5 verification gates pass, the user goal cannot still be unmet. A panel CTA that lies → caught by `fulfills-label`. A panel that doesn't refresh → caught by `reactivity`. An importer regression → caught by `imports`. A Tier 1 breakage → caught by PR CI.

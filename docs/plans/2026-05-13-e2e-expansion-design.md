# E2E Expansion — Design Spec

**Date:** 2026-05-13
**Status:** Approved by user 2026-05-13.

## User goal

When I introduce a panel CTA that lies about what it does, a button wired to the wrong handler, a panel that doesn't refresh after a save, an importer regression, or a missing host-entity link, **a test fails before I see the bug in the running app**. The class of "ships past lint + unit + component tests, found by the user clicking" should shrink to near-zero for right-side panels, list/panel reactivity, and importer round-trips.

I do not pay for this in PR CI minutes. The expanded suite runs locally during plan close-out and nightly on `main` once we have free CI minutes (public OSS).

**Headless / no-focus is a hard requirement.** Running 60+ panel tests during close-out cannot mean 60+ window pops stealing focus on macOS. The test binary must run with no visible window, no Dock icon, and no focus theft on all three platforms before Tier 2 is usable.

**CI status today (correction).** [.github/workflows/ci.yml](../../.github/workflows/ci.yml) currently runs `npm ci && npm run lint && npm test` — **no e2e at all**. The "Tier 1 gates PR merge" outcome in this plan is therefore not status quo; it is wired into CI as part of this plan's first task. Tier 2 stays out of CI until public OSS.

## Why now

Tauri's ~1 s boot + low RAM made the cost-per-Playwright-spec drop ~5–10× vs the Electron era. The original [playwright.config.ts](../../playwright.config.ts) comment ("lean by design") was written when each spec was expensive enough that "everything else lives in unit/component" was correct. It no longer is.

Two months of `fix(panel|ux|panels|persons|places|sources|relationships|media|groups|research-tasks|view)` commits + the open items in [UX_INVENTORY.md](../UX_INVENTORY.md) point to a consistent escape pattern: **the broken behavior was reachable by clicking the running app but invisible to vitest**. Surface Contract (in [CLAUDE.md](../../CLAUDE.md)) codified the failure shape; e2e is the missing enforcement surface for it.

## Bug classes this plan exists to catch

Synthesised from `git log --oneline` 2026-03-01 → 2026-05-13 and the open findings in [UX_INVENTORY.md](../UX_INVENTORY.md):

1. **Panel CTAs that lie or orphan.** Section "Persons" with `+ Event`; `+ Add person` that creates an orphan; `+ Add relationship` silently routing to spouse; `+ Hänvisning` missing styling; ✕ icons meaning unlink in one section and delete in another. (Surface Contract checks 1–2.)
2. **Lifecycle gaps.** Panels that add but cannot delete (5/6 panels pre-2026-05-03); `places.delete` with no UI path at all. (Surface Contract check 3.)
3. **Silent state degradation.** Place picker dropping gazetteer suggestions when the user types; `+ Media` on a collapsed section silently no-op-ing because it depends on a `v-if`-ed child. (Surface Contract check 4.)
4. **Reactivity after mutations.** "List views + panel sections refresh after MCP-side mutations" (two fix commits); "research tasks refresh after save/delete"; `ResearchTasks` reactivity. The user-visible shape: save in a modal, panel keeps showing old data until the user navigates away and back.
5. **Modal save-validity & error surfacing.** `RelationshipModal` had no visible save-disabled state and swallowed save errors; `MediaPicker` focus broken.
6. **Importer + build-system regressions.** Holger async/await sweeps; gazetteer inlining OOM in `npm run build`; sidecar pkg breakage; NSIS path-with-spaces; Node 26 incompatibility. Every one was a "user runs the app and it doesn't work" failure that no unit test could reach.

The first three are Surface Contract violations; the fourth is the `data-changed` fan-out contract; the fifth is modal interaction shape; the sixth is full-stack build + import.

## Scope

Two tiers, two npm commands. **The tier separation is the design.**

### Tier 1 — Lean (existing, no change to CI behavior)

The 4 projects already in [playwright.config.ts](../../playwright.config.ts): `boot`, `crud`, `website-export`, `duplicates`. Time budget <5 min. **Runs in CI on every PR push and gates merge** (status quo).

`npm run test:e2e` invokes Tier 1.

### Tier 2 — Thorough (new, local + on-demand only until public OSS)

Three new Playwright projects added alongside the existing four:

#### `panels`
One spec per right-side panel. **Full scope: all 10 `*Panel.vue` in [src/renderer/components/](../../src/renderer/components/)**:
PersonPanel, PlacePanel, SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel, ExportOptionsPanel.

**Scope deviations:** none planned. ReportPanel / WebsitePanel / ExportOptionsPanel are read-only or output-flow panels; their "Surface Contract" check set degrades naturally (no add CTAs to verify), but they still get a spec asserting (a) host entity flows in, (b) host-level lifecycle is reachable if the panel hosts a delete-able entity, (c) the panel's primary output button (Export, Render, etc.) runs without error against a seeded host. If a panel turns out to have zero applicable checks, the spec exists and asserts "panel mounts with host entity X visible" — a non-zero floor.

Each spec exercises the 4 [CLAUDE.md](../../CLAUDE.md) Surface Contract checks:
- **Check 1 — host flows in.** Open every section's primary CTA modal; assert the host entity's ID is prefilled.
- **Check 2 — CTA fulfills label.** A `+ X` button on a section titled "Xs" creates an X linked to the host (and the new X appears in the same section without view-switch).
- **Check 3 — lifecycle parity.** Every primitive a section adds is editable and deletable from this surface. The panel itself has a Danger-zone delete affordance.
- **Check 4 — no silent degradation.** Filter inputs narrow display, not query. Collapsed-section CTAs still work (auto-expand if needed). Empty → typed state preserves data sources.

Implementation: data-driven — a single `panel-surface.spec.ts` parameterised over `PanelDescriptor[]` in [tests/e2e/fixtures/panels.ts](../../tests/e2e/fixtures/panels.ts). Each descriptor: panel name, route, host-entity factory (function that seeds the DB and returns the entity ID), sections to verify. Adding a new panel = appending a descriptor.

#### `reactivity`
Mutate via MCP tool call (using the dev MCP HTTP bridge that already exists for `ui_screenshot` / `ui_eval`), assert every paneled view + list view + chart updates within 500 ms without a view switch. One spec, parameterised over `(consumer-surface, mutator-tool, assertion)` triples.

Consumers covered: every `*Panel.vue` (10), every `*View.vue` list view (~8), the chart view. ~20 triples. Catches the recurring "refresh after MCP-side mutations" class.

#### `imports`
Boot, import a small fixture for each native importer:
- GEDCOM 5.5.1 + 7.0
- Holger
- Genney `.gcc` + `.backup`
- RootsMagic
- Gramps

Assert: import completes without error toast, expected person count visible in PersonsView, one specific person's name resolves on click → PersonPanel. Catches build-system regressions (gazetteer inlining, sidecar pkg, NSIS, async/await holes) and importer regressions in one pass.

Fixtures: tiny synthetic files (3–5 persons each) committed to `tests/e2e/fixtures/imports/`. Not real user data.

Time budget for Tier 2: ~15–25 min on a local M-series Mac; expected ~30–45 min on GitHub Actions Ubuntu. Acceptable because it does not run on PRs.

`npm run test:e2e:full` invokes Tier 1 + Tier 2.

### Headless / no-focus mode (cross-platform)

The test binary must run with no visible window, no Dock icon (macOS), no taskbar entry (Windows), and no focus theft. Implementation:

- **Env-var gate.** A new `SLAKTFORSKNING_HEADLESS=1` env var, read by the Rust startup in [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs). The e2e fixture's `startApp` sets it for every spawn.
- **Linux.** Xvfb already works via [.devcontainer/xvfb-start.sh](../../.devcontainer/xvfb-start.sh). No new code; the env var on Linux is a no-op as long as `DISPLAY` is set to an Xvfb instance.
- **macOS.** When the env var is set: (a) apply `.visible(false)` to the main `WindowBuilder`, (b) call `NSApp.setActivationPolicy(.accessory)` so the app is "background-only" — no Dock icon, no menu bar takeover, no Cmd+Tab entry. The dev-MCP HTTP bridge (`POST /eval`) keeps working against the invisible window; this is the same pattern `ui_screenshot` already relies on.
- **Windows.** When the env var is set: apply `.visible(false)` + `.skip_taskbar(true)` to the `WindowBuilder`. WebView2 stays attached to the hidden window handle. No focus theft because no foreground activation.

This is **one-way for the test binary** — the env var is only set by the e2e fixture, never by `npm start` or `npm run tauri:dev`. The end-user binary is unchanged.

### Tier 2 invocation contract

- **Locally:** `npm run test:e2e:full` runs the full set. Used during plan close-out and ad-hoc. Headless by default — no window pops, no focus theft.
- **CI:**
  - **Tier 1 wired into [.github/workflows/ci.yml](../../.github/workflows/ci.yml) as part of this plan's first task.** New job runs `npm run test:e2e` on `ubuntu-latest` with Xvfb. <5 min wall clock. Gates PR merge.
  - **Tier 2 stays out of CI until the repo is public OSS with free builds.** When that change lands, add a nightly GitHub Actions workflow `.github/workflows/e2e-full.yml` triggered by `schedule: cron` + `workflow_dispatch`. PR runs stay Tier 1.
- **Plan close-out:** Per [.claude/rules/plans.md](../../.claude/rules/plans.md) "Verification discipline at close-out," any plan whose user goal touches a panel, modal, list-view, or import path must paste the `npm run test:e2e:full` summary line into the close-out commit message before archiving. This becomes a checklist item in [CLAUDE.md](../../CLAUDE.md). Non-UI plans (Rust-side, schema migrations that don't touch UI, doc-only) are exempt — same shape as today's Tier 1 evidence rule.

## Test infrastructure

Reuse the existing [AppDriver](../../tests/e2e/fixture.ts) for app boot + UI interaction. Add:

- **`MutateViaMcp(toolName, args)` helper** — calls the dev MCP HTTP bridge (Tauri `ui_server.rs`, port from `SLAKTFORSKNING_DEV_BRIDGE_PORT`) to invoke an MCP tool against the running app's DB. Returns when the mutation has propagated through the `data-changed` event. Used in `reactivity` to drive the mutation half without UI clicks.
- **`SeedHostEntity(kind, fixture?)` helper** — calls the appropriate MCP `add_X` / `create_X` tool to seed an entity and returns its ID + a stable handle for re-fetching. Backing for `panels` descriptors.
- **`PanelDescriptor` type** — the data-driven shape behind `panels`:
  ```ts
  type PanelDescriptor = {
    name: string;                          // 'PersonPanel'
    route: (id: string) => string;         // (id) => `/persons/${id}`
    seed: () => Promise<{ id: string }>;   // seeds a host entity via MCP
    sections: PanelSectionCheck[];
  };
  type PanelSectionCheck = {
    title: string;                          // 'Events'
    primaryCta: { label: string; check1?: 'host-flows-in'; check2?: 'fulfills-label'; check3?: 'lifecycle-parity'; check4?: 'no-degradation' };
  };
  ```

All assertions go through `getByRole` / visible text — no testid sprinkling, no internal-state peeks.

## Sequencing (mechanical, in order)

Plan tasks:

- **0 — Headless mode + CI wiring.** Add `SLAKTFORSKNING_HEADLESS=1` honouring in [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs) (visible/dock/taskbar suppression per platform). Update [tests/e2e/fixture.ts](../../tests/e2e/fixture.ts) `startApp` to set it. Wire Tier 1 (`npm run test:e2e`) into [.github/workflows/ci.yml](../../.github/workflows/ci.yml) on `ubuntu-latest` with Xvfb. **Without Task 0, Tier 2 is unusable during close-out and the "Tier 1 gates PR" outcome is fiction.**
- **A — Plumbing.** Add `panels` / `reactivity` / `imports` empty Playwright projects to [playwright.config.ts](../../playwright.config.ts); add `npm run test:e2e:full` script; add `MutateViaMcp` + `SeedHostEntity` + `PanelDescriptor` helpers. No tests yet.
- **B — Pilot: PersonPanel + PlacePanel.** Write descriptors for the two highest-violation panels; run `npm run test:e2e:full`; capture wall-clock per panel. If >2 min/panel, write a deviation block in this spec before continuing.
- **C — Fan out: remaining 8 panels.** Source, Relationship, Group, ResearchTask, Media, Report, Website, ExportOptions. Each gets a descriptor.
- **D — `reactivity` project.** ~20 triples covering panels + list views + chart.
- **E — `imports` project.** Six tiny fixture files + the six spec triples.
- **F — Close-out integration.** Update [CLAUDE.md](../../CLAUDE.md) close-out checklist to require `npm run test:e2e:full` evidence for UI-touching plans.

After Task B, the plan executor may pause for a scope check if cost-per-panel is materially worse than expected. **Default is continue.**

## Verification (user-observable outcome)

The plan is done when **all five** are true:

1. `npm run test:e2e` (Tier 1) is wired into CI and finishes in <5 min, gating PR merge. Evidence: the GitHub Actions workflow run on the PR that merges this plan shows the new `test:e2e` job green + <5 min total. (Today's CI runs only lint + unit; this plan adds the e2e job.)
1a. **Headless verification.** Running `SLAKTFORSKNING_HEADLESS=1 ./target/release/slaktforskning &` on macOS produces no visible window, no Dock icon, no Cmd+Tab entry; `curl http://localhost:19241/` responds 200. Same on Linux (with Xvfb) and Windows (no taskbar entry). Evidence: paste the curl response + a screenshot or `osascript -e 'tell application "System Events" to get name of every process'` output showing no Slaktforskning process visible to the user.
2. `npm run test:e2e:full` (Tier 1 + Tier 2) finishes locally on the executor's machine. Evidence: paste the Playwright summary line (`N passed (Mmin)`) into the close-out commit message of the plan that ships Task F.
3. **A deliberate violation of each Surface Contract check produces a red test** with an error message naming the panel and the check. Evidence: a verification commit on a throwaway branch that breaks one CTA per check (4 breaks total), runs Tier 2, captures the 4 failed-test names + messages, then reverts.
4. **A deliberate "panel doesn't refresh after MCP mutation"** produces a red `reactivity` test. Evidence: same shape — break one consumer's `data-changed` subscription, run Tier 2, capture the failure, revert.
5. **A deliberate importer break** (e.g. a regex over-correction in [src/import/holger/](../../src/import/holger/)) produces a red `imports` test. Same evidence shape.

The user-goal-falsifiability gate: if all five are green, can a panel CTA still lie about what it does? No — Task B/C asserts on the host-link + label-truth. Can a panel still fail to refresh? No — Task D asserts. Can the build still ship with a broken importer? No — Task E asserts on a real boot + import.

## Failure modes / RCA reference

The patterns this plan is shaped against:

- **Process drift,** [.claude/rules/plans.md](../../.claude/rules/plans.md) RCA 2026-05-12 L1–L3. "Smoke" is forbidden as a name; verification must observe user goal, not structure; cleanup that lives between the user and the user goal is in-scope. Applied: project names are behavior-named (`panels`, `reactivity`, `imports`); verification §3–5 require failing tests against deliberate violations, not just "tests exist."
- **Tier 1 over-coverage trap.** The temptation will be to push every new test into Tier 1 because "that's what runs in CI." Resist: Tier 1's contract is <5 min and gates PR. Adding a `panels` project to Tier 1 breaks the contract. This plan ships Tier 2 separately *because* CI minutes are scarce until public OSS — that scarcity is a deliberate constraint, not a temporary one to work around.
- **Pilot-then-fan-out vs. all-at-once.** Default would be "all 10 panels in one wave" per the [.claude/rules/plans.md](../../.claude/rules/plans.md) scope rule. Pilot is chosen here because cost-per-panel is unknown and the 5×–10× Tauri-vs-Electron speedup is an extrapolation, not a measurement. Task B *measures* it. If the pilot reveals it's faster than expected, Task C is mechanical. If slower, the deviation block lands before continuing.

## Non-goals

- **Visual regression / pixel-diff tests.** Out of scope; different problem class.
- **Cross-platform CI matrix for Tier 2.** Local-only initially; cross-platform can be added when public OSS minutes exist.
- **Migrating existing unit/component tests to e2e.** They keep their job; e2e adds a layer.
- **`*.gpkg` / new importer formats.** This plan covers what ships today; new importers add a descriptor when they land.

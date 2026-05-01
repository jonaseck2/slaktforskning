# Design: Coverage push to ≥80%

## Goal

Bring line coverage to ≥80% on every `src/` file currently below it. Prioritize in tiers so each phase is a clean stopping point and each tier ships as its own patch-bumped commit.

## Current state (baseline at v0.179.0)

`npx vitest run --coverage` summary:

- Statements: 78.59%
- Branches: 69.86%
- Functions: 73.92%
- Lines: 81.14%

The `src/api/` core is at 91–94% (well above the 80% threshold enforced by `vitest.config.mts`). All shortfalls live outside `src/api/`.

The runner currently emits `ERROR: Coverage for functions (73.92%) does not meet global threshold (80%)` — but this is the report tool's *global* threshold; the config only enforces 80% on `src/api/`. The error does not gate `npm test` (which runs without `--coverage`). Closing this gap is the spec's secondary goal — primary goal is per-file coverage.

## Approach

**One plan, four tiers, each tier = one commit + patch bump.** Each tier's commit message states the new floor (e.g. "test: tier 1 — utils & MCP wrappers ≥80%"). Stopping after any tier still leaves the codebase improved.

Test style follows existing conventions:

- `tests/unit/` — Vitest against in-memory SQLite via `createTestDb()`; no Electron, no IPC, no mocks. Asserts DB state, not just return values.
- `tests/components/` — Vue `@vue/test-utils` mounted in a JSDOM-ish harness (same shape as the existing `usePagedList.test.ts`).

No new infrastructure. No new mocking layer.

## Tier 1 — Trivial wins (~half a day; ~6 test files)

Pure functions and thin wrappers. No fixtures, no Vue mounting. Highest ROI per hour.

| File | Current | Target | Approach |
|------|---------|--------|----------|
| `src/mcp/tools/prod/media.ts` | 22% | 80% | Each MCP tool wraps `src/api/media.ts`. Drive every tool through the prod MCP harness with an in-memory DB and assert DB mutations. |
| `src/mcp/tools/prod/research.ts` | 25% | 80% | Same pattern: wraps `src/api/research_tasks.ts`. |
| `src/mcp/tools/prod/places.ts` | 45% | 80% | Same pattern: wraps `src/api/places.ts`. Use the existing place-resolution test scaffolding. |
| `src/renderer/utils/qualityIgnore.ts` | 45% | 80% | Pure predicate over check results. Direct unit test. |
| `src/renderer/utils/cropImage.ts` | 42% | 80% | Geometry math is pure — extract or unit-test directly. Skip the canvas-only branches; use a stub `HTMLCanvasElement` if needed. |
| `src/api/html_site/preview.ts` | 0% | 80% | Render-time exporter. Mirror `tests/unit/snapshot.test.ts` and `tests/unit/scope.test.ts` patterns: build a tiny DB graph with `createPerson`/`createEvent`/`createRelationship`, call `buildPreview(...)`, assert shape. |

## Tier 2 — Importer orchestrators (~half a day; ~2 test files)

File-IO branches in importer entry points. Fixtures synthesized at runtime in `os.tmpdir()` — no checked-in binaries.

| File | Current | Target | Approach |
|------|---------|--------|----------|
| `src/import/holger/index.ts` | 2% | 80% | Branches to cover: `.ged` direct path; `.zip` path (build with `fflate.zipSync`); folder scan (`fs.mkdtempSync` + write `.ged` files); missing-file error (`HOLGER_EXPORT_INSTRUCTIONS`); `mediaDir` remapping; multi-`.ged` zip → pick largest. |
| `src/import/genney/index.ts` | 31% | 80% | Orchestrator branches around `transform.ts`. Reuse the existing `genney.test.ts` GEDCOM strings + a synthesized archive layout. |

The transforms themselves (`src/import/genney/transform.ts` at 73.93%) are already close — top up only if branch coverage of the orchestrator naturally pulls them up.

## Tier 3 — Chart layouts (~1 day; ~3 test files + 1 component test)

Pure layout functions over a synthetic person tree. Assert position invariants (parent above child, sibling spacing, connector endpoints), **not** pixel-perfect snapshots — golden-snapshot tests for layout will rot every time we tune spacing.

| File | Current | Target | Approach |
|------|---------|--------|----------|
| `src/renderer/utils/chart-layout/hourglass-tree.ts` | 25% | 80% | Build a 3-generation hourglass via in-memory DB, run layout, assert ancestor/descendant lane separation and node ordering. |
| `src/renderer/utils/chart-layout/descendant.ts` | 48% | 80% | Same pattern, descendant-only. Cover the spacing pass and the wrap-deep-trees branch. |
| `src/renderer/utils/chart-layout/pedigree.ts` | 60% | 80% | Cover both orientation modes and the empty-slot branch. |
| `src/renderer/utils/useChartZoom.ts` | 13% | 80% | DOM event handler. Component test under `tests/components/`, mount a host component, dispatch wheel/pointer events, assert reactive zoom state. |

## Tier 4 — Vue composables & utils (~1 day; ~5–6 component test files)

Need `@vue/test-utils` mounting. Follow `tests/components/usePagedList.test.ts` exactly: a tiny host `<script setup>` component that calls the composable and exposes its return value via template, mount with `mount(...)`, assert via `wrapper.vm`.

| File | Current | Target |
|------|---------|--------|
| `src/renderer/composables/usePanelSections.ts` | 0% | 80% |
| `src/renderer/composables/useProfilePic.ts` | 0% | 80% |
| `src/renderer/utils/mediaProfile.ts` | 0% | 80% |
| `src/renderer/composables/useDeleteConfirm.ts` | 27% | 80% |
| `src/renderer/composables/useStatusBarParentInfo.ts` | 21% | 80% |
| `src/renderer/composables/usePanelResize.ts` | 49% | 80% |

## Out of scope

| File | Reason |
|------|--------|
| `src/api/html_site/snapshot.ts` (66%) | Uncovered lines are media-with-thumbnails branches that need real image fixtures. Follow-up plan. |
| `src/shared/channels/*` (50% noise) | Per-channel `register()` only runs inside the IPC worker; parity is enforced by the existing `tests/unit/registry.test.ts`. **Action:** add `src/shared/channels/**` to the `coverage.exclude` list in `vitest.config.mts` with an inline comment explaining why. |
| `media_ai.ts`, `personLiving.ts`, `undo_wrappers.ts` (73–79%) | Already close. Top up only if other tier work touches them. |
| `src/renderer/utils/chart-layout/hourglass-tree.ts` legacy paths (lines 13–183) | Verify with the user whether these are dead code from before `hourglass.ts` replaced it; if so, delete rather than test. |

## Verification gate per tier

Each tier's commit must:

1. Add tests under `tests/unit/` or `tests/components/` per convention.
2. `npm run lint` clean.
3. `npm test` passes (full suite, no flake).
4. `npx vitest run --coverage 2>&1 | grep <file>` confirms every newly-targeted file at ≥80% lines.
5. CHANGELOG entry under `## Unreleased`: `- test: <tier name> — <files> at ≥80% coverage`.
6. Patch-bump version.

## Stretch (after Tier 4)

If global function coverage still hasn't crossed 80% (currently 74%):

- Identify the largest remaining sub-80% files via a fresh `--coverage` run.
- For each: either add tests or carve out of the threshold via `coverage.exclude` in `vitest.config.mts` with a justifying comment.
- Once global ≥80%: bump the `vitest.config.mts` `coverage.thresholds.global` from per-`src/api/` to a true global floor, so future regressions block CI.

## Files this plan creates / modifies

**New tests:**

- `tests/unit/mcp-prod-media.test.ts`
- `tests/unit/mcp-prod-research.test.ts`
- `tests/unit/mcp-prod-places.test.ts`
- `tests/unit/qualityIgnore.test.ts`
- `tests/unit/cropImage.test.ts`
- `tests/unit/html_site-preview.test.ts`
- `tests/unit/import-holger-orchestrator.test.ts`
- `tests/unit/import-genney-orchestrator.test.ts`
- `tests/unit/chart-layout-hourglass-tree.test.ts`
- `tests/unit/chart-layout-descendant.test.ts`
- `tests/unit/chart-layout-pedigree.test.ts`
- `tests/components/useChartZoom.test.ts`
- `tests/components/usePanelSections.test.ts`
- `tests/components/useProfilePic.test.ts`
- `tests/components/mediaProfile.test.ts`
- `tests/components/useDeleteConfirm.test.ts`
- `tests/components/useStatusBarParentInfo.test.ts`
- `tests/components/usePanelResize.test.ts`

**Config changes:**

- `vitest.config.mts` — add `src/shared/channels/**` to `coverage.exclude`.

**Doc updates:**

- `CHANGELOG.md` — one entry per tier under `## Unreleased`.
- `package.json` — patch bump per tier.

No production code changes are expected. If a test exposes a real bug, the fix lives in a separate commit (not folded into the test commit).

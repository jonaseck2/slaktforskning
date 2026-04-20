# Export colour invariance tests

## Problem

Text colours in exports (SVG/PDF wall charts) keep drifting whenever theme tokens are touched. The author has stopped adjusting theme text colours because every change risks silently altering exported output. We need regression tests that fail loudly if any theme switch (theme-forest / theme-nordic / theme-twilight, light / dark / high-contrast) leaks into the export pipeline.

## Scope

Test-only change. No production code is modified. One new test file:

- `tests/unit/exportColorInvariance.test.ts`

## Architecture

Exports today go through two surfaces:

1. `src/api/wall-charts.ts` — pure SVG generation used by the SVG and tiled-PDF export paths. Colours come from the `options` argument (`colorMode`, optional `themeColors` fallbacks). No CSS-var or `document` reads.
2. `src/renderer/composables/useChartColors.ts` — exposes `useChartColors(themed)`. `themed=false` is documented as the "export" palette and must return the hardcoded `EXPORT_COLORS` constant regardless of DOM/theme state.

## Tests

### T1 — `wall-charts.ts` SVG is byte-identical across theme states

- Capture baseline SVGs for `generatePedigreeWallChart` and `generateDescendantWallChart` using a small fixed tree and the three `colorMode` values (`themed`, `bw`, `sex-colored`). For `colorMode: 'themed'` no `themeColors` is supplied — we're testing the library's hardcoded fallback path, which exporters rely on.
- Then mutate the jsdom document to simulate each theme: set `--text-primary`, `--text-secondary`, `--text-muted`, `--surface-bg`, `--surface-border` and related chart tokens to a sentinel colour (`magenta`), and toggle `html.classList`: `theme-forest`, `theme-nordic`, `theme-twilight`, each with and without `dark` + `high-contrast`.
- Re-run the generators. Assert output is strictly equal to the baseline.
- This will fail the moment someone introduces a `getComputedStyle` / CSS-var read inside the export generators.

### T2 — `useChartColors(false)` returns `EXPORT_COLORS` under any theme

- Import `useChartColors` and `EXPORT_COLORS`.
- For each theme/appearance combination from T1, mutate `:root` tokens and class list, then evaluate `useChartColors(false).value`.
- Assert deep equality with `EXPORT_COLORS` every time.
- Also assert referential equality (`=== EXPORT_COLORS`) since the composable returns the constant directly — guards against someone copying the object through a transform that could pick up live theme values.

## What the tests do NOT cover

- The pinned-values approach (explicit `expect(EXPORT_COLORS.text).toBe('#333333')`) was considered and deliberately left out per request. Maintainers can freely retune `EXPORT_COLORS` without touching tests, as long as the value is a hardcoded constant.
- Tests do not assert anything about on-screen charts (which use `useChartColors(true)` and are expected to follow theme).

## Success criteria

- New tests run under `npm test` in the existing Vitest jsdom environment.
- Both tests pass against current code.
- Introducing a CSS-var read into `wall-charts.ts`, or wiring `useChartColors(true)` into an export path, makes the relevant test fail.
